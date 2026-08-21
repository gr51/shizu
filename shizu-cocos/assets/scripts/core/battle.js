// ===== core/battle.js · 实时割草战斗（引擎无关）=====
// 来源：《噬祖-整体策划》2.3 操作规格 / 2.4 胜负 / 3.2 时间轴；9.3 同屏上限
//
// 这一层取代原型期的回合交锋（combatModel.js）：
//   · 单摇杆移动 + 自动索敌攻击（2.3）
//   · 敌人按 dungeon 时间轴持续涌来 + 涌潮（3.2）
//   · 接触伤害 + 无敌帧（2.3 闪避 0.25s 无敌）
//   · 基因尸体掉落 → 靠近自动吸取（吸取半径 40pt）
//   · 阶段收尾单位击杀即过阶段（2.4）
//
// **零渲染依赖**：只算位置与状态，画什么由 web/ 或 Cocos 各自决定。
// RealtimeRun 继承 Run，复用它的三选一 / 掉落 / 基因锁充能 / 结算 ——
// 那些逻辑与「回合还是实时」无关，不该有第二份。

import { Run, RunState } from './run.js';
import { MAX_ONSCREEN } from './dungeon.js';
import { calcDamage } from './balance.js';
import { rollKillDrop } from './drop.js';
import { findSkill } from '../data/skills.js';
import { findHiddenSkill } from '../data/hiddenSkills.js';
import { currentWeapon, currentSkin, currentRouteMech } from '../data/weaponAttack.js';
import { rollEliteAffix } from '../data/eliteAffixes.js';

/** 相机视野尺寸（逻辑坐标）：不是边界，而是「屏幕上能看见多大」。世界无限，玩家自由移动。 */
export const ARENA = { w: 960, h: 560 };

/** 基础数值（整体策划 2.3） */
export const SUCK_RADIUS = 40;        // 基因吸取半径 40pt
export const ATTACK_RANGE = 150;      // 自动索敌基础射程
/** 基础攻击频率（次/秒）。割草要「不停地砍」，1.6 太慢，清不动怪潮 */
export const ATTACK_RATE = 3.0;
export const WINDUP = 0.12;             // 攻击抬手前摇（秒）：抬手 → 命中
export const INVULN_ON_HIT = 0.6;     // 受击后无敌帧（秒）

/** 闪避翻滚（整体策划 2.3：触发后 0.25s 无敌帧，可穿怪） */
export const DODGE_INVULN = 0.25;
export const DODGE_CD = 1.6;
export const DODGE_DIST = 190;

/** 吞噬爆发（2.3：长按 0.4s 触发，范围吸取 + 回血 + 狂暴 3s，CD 30s） */
export const DEVOUR_CD = 30;
export const DEVOUR_RADIUS = 260;
export const DEVOUR_HEAL_PCT = 0.18;
export const DEVOUR_BERSERK = 3;
export const BERSERK_MUL = 1.8;
/**
 * 接触伤害系数：被怪蹭到时按敌人攻击力的这个比例结算一次。
 * 割草里伤害来自「被围」，单次必须很轻，靠数量累积成压力 ——
 * 标定方式：用 tools/probe-battle.mjs 的**盲走机器人**（原地绕圈、不会闪避）扫参数：
 *   0.30 → 通关 100%（太软）  0.55 → 88%  0.65 → 见下  0.80 → 50%  1.10 → 13%
 * 取 0.65 ——机器人打到第 4 阶段左右，真人会明显更好；
 * 剩下的由 dynFactor（每局 ±5~15%）与难度等级自动收敛。
 */
export const CONTACT_DPS_SCALE = 1.1;

/**
 * 小怪变体（关卡策划二章：各位面都写明了「远程弹幕 / 冲撞 / 混合敌群」）。
 *
 * 只有一种「同速追击的近战」时，玩家的清场半径一旦压过敌人接近速度就**永远无敌** ——
 * 实测 1 分钟后 HP 恒定 100%，压力曲线全平，割草最要命的问题。
 * 三种变体各自制造一种压不住的威胁：
 *   walker  基础追击，构成怪海本体
 *   charger 高速冲撞，能穿过清场圈贴到脸上
 *   spitter 远程吐射，站在射程外打你 —— 逼玩家主动近身，不能龟在原地
 */
export const MINION_VARIANTS = {
  walker: { speedMul: 1.0, weight: 54, hpMul: 1 },
  charger: { speedMul: 1.9, weight: 22, hpMul: 0.75 },
  spitter: { speedMul: 0.55, weight: 10, hpMul: 0.85, ranged: true },
  tank: { speedMul: 0.55, weight: 8, hpMul: 1.6 },          // 肉盾：慢而略硬
  bomber: { speedMul: 1.6, weight: 6, hpMul: 0.5, bomber: true }, // 自爆：快而脆，死了炸你
};

/** 每阶段刷的小怪 sprite（每阶段一对，5 阶段各不同） */
export const MINION_SPRITE_BY_STAGE = {
  wuxia: [['maozei', 'jiutu'], ['shanzei', 'biaoshi'], ['quanshi', 'gunseng'], ['anqi', 'gongshou'], ['hanfei', 'shashou']],
  aofa: [['yuan_jingling', 'huo_bing'], ['huo_bing', 'bing_yuansu'], ['bing_yuansu', 'aoshu_shicong'], ['aoshu_shicong', 'huo_yao'], ['huo_yao', 'yuan_jingling']],
  qiqiao: [['jiguan_shou', 'fashu_jiguan'], ['fashu_jiguan', 'jing_ling'], ['jing_ling', 'chilun_shou'], ['chilun_shou', 'jiguan_qishi'], ['jiguan_qishi', 'jiguan_shou']],
  dujie: [['lei_jing', 'jianxiu_kuilei'], ['jianxiu_kuilei', 'lei_shou'], ['lei_shou', 'tianlei_zi'], ['tianlei_zi', 'leijie_kuilei'], ['leijie_kuilei', 'lei_jing']],
  gongde: [['jinlian_shicong', 'luohan_wuseng'], ['luohan_wuseng', 'jinlian_wushi'], ['jinlian_wushi', 'chifan_seng'], ['chifan_seng', 'jinjia_lishi'], ['jinjia_lishi', 'jinlian_shicong']],
  shihai: [['sangshi', 'bianyi_quan'], ['bianyi_quan', 'bianyi_shi'], ['bianyi_shi', 'shi_wu'], ['shi_wu', 'fenghe_guai'], ['fenghe_guai', 'sangshi']],
  gongshengchao: [['jishengchong', 'fuhua_chong'], ['fuhua_chong', 'jisheng_zhu'], ['jisheng_zhu', 'fuhua_muti'], ['fuhua_muti', 'gongsheng_jushou'], ['gongsheng_jushou', 'jishengchong']],
  shanhai: [['huangshou', 'jujiao_shou'], ['jujiao_shou', 'huo_shou'], ['huo_shou', 'bing_shou'], ['bing_shou', 'shanyue_shou'], ['shanyue_shou', 'huangshou']],
  jijia: [['shaojie', 'zizou_pao'], ['zizou_pao', 'wuren_ji'], ['wuren_ji', 'zhongzhuang_jijia'], ['zhongzhuang_jijia', 'guidao_paotai'], ['guidao_paotai', 'shaojie']],
  jushen: [['ju_ying', 'shi_juren'], ['shi_juren', 'shuang_juren'], ['shuang_juren', 'duyan_juren'], ['duyan_juren', 'shanling_juren'], ['shanling_juren', 'ju_ying']],
  zhutian: [['weimian_canying', 'ziwo_jingxiang'], ['ziwo_jingxiang', 'benghuai_suipian'], ['benghuai_suipian', 'weimian_jingxiang'], ['weimian_jingxiang', 'xukong_jiti'], ['xukong_jiti', 'weimian_canying']],
};

/** Boss sprite 映射（位面 → boss 名） */
export const BOSS_BY_PLANE = {
  wuxia: 'jiansheng', aofa: 'aofa_boss', qiqiao: 'qiqiao_boss', dujie: 'dujie_boss',
  gongde: 'gongde_boss', shihai: 'shihai_boss', gongshengchao: 'gongshengchao_boss',
  shanhai: 'shanhai_boss', jijia: 'jijia_boss', jushen: 'jushen_boss', zhutian: 'zhutian_boss',
};

/** 远程小怪散集：这些 sprite 用远程弹体，其余一律近战 */
const RANGED_SPRITES = new Set(['anqi', 'gongshou', 'yuan_jingling', 'huo_bing', 'bing_yuansu', 'aoshu_shicong', 'fashu_jiguan', 'jing_ling', 'lei_jing', 'tianlei_zi', 'shi_wu', 'wuren_ji', 'guidao_paotai', 'shaojie', 'zizou_pao', 'benghuai_suipian', 'weimian_canying', 'xukong_jiti']);

/** 远程小怪的射击参数 */
export const SPIT_RANGE = 300;
export const SPIT_CD = 2.6;
export const SPIT_SPEED = 190;

// ===== 位面主题机制（关卡策划二章 / planes.js 的 theme 列）=====
// 每个位面一种独特机制，数据驱动，都挂在 battle 主循环 / 击杀回调上。
export const PLANE_MECHANICS = {
  jiguan:       { type: 'laser',        interval: 12 },        // 机关城：激光横扫
  aofa:         { type: 'bulletHell',   interval: 10, count: 3 }, // 奥法：弹幕法阵
  qiqiao:       { type: 'laser',        interval: 10 },        // 奇巧迷宫：镜面激光
  dujie:        { type: 'lightning',    interval: 10 },        // 渡劫：随机落雷
  gongde:       { type: 'armor',        factor: 0.3 },        // 功德：金身减伤
  shihai:       { type: 'corpseBlast',  radius: 55, mul: 1.3 }, // 尸海：尸爆连锁
  gongshengchao:{ type: 'parasite',     chance: 0.12, duration: 5 }, // 共生：寄生反水
  wuxia:        { type: 'combo',        mul: 1.2 },           // 武侠：连招增伤
  shanhai:      { type: 'stomp',        interval: 18, radius: 100 }, // 山海：巨型践踏
  jijia:        { type: 'missile',      interval: 14 },        // 机甲：炮台导弹
  jushen:       { type: 'stomp',        interval: 16, radius: 100 }, // 巨神：震地
  zhutian:      { type: 'mix',          interval: 10 },        // 诸天之心：全机制融合
};


export class RealtimeRun extends Run {
  constructor(save, dungeon, seed) {
    super(save, dungeon, seed);

    this.player = {
      x: ARENA.w / 2,
      y: ARENA.h / 2,
      vx: 0,
      vy: 0,
      r: 14,
      facing: 1,
      invuln: 0,
      hitFlash: 0,
      attackCd: 0,
      dodgeCd: 0,
      devourCd: 0,
      berserk: 0,      // 狂暴剩余秒数
      state: 'idle',   // idle | walk | attack | dodge
      anim: 0,
      windup: 0,         // 攻击前摇剩余（抬手）
      pendingTarget: null, // 前摇结束后要结算的目标
      dmgTimer: 0,        // 受击伤害飘字的累积（不用于逻辑）
    };

    /** 主动槽技能的冷却表：skillId → 剩余秒数 */
    this.skillCd = new Map();

    this.enemies = [];        // 覆盖父类的数组，元素带 x/y
    this.orbs = [];           // 基因尸体
    this.shots = [];          // 远程小怪的弹幕
    this.hits = [];           // 特效请求（渲染层消费后清空）
    this.time = 0;            // 本局已过秒数（父类 elapsed 同步）
    this.spawnCarry = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.stageElapsed = 0;
    this.nextId = 1;
    this.mech = PLANE_MECHANICS[this.dungeon.plane.id] ?? null;
    this.mechTimer = 0;
    this.mechAllies = [];        // 寄生反水：友军单位
    this.mechProjectiles = [];   // 弹幕 / 导弹
    this.deaths = [];            // 死亡特效（渲染层播放死亡帧用）
    this.playerShots = [];       // 玩家刀波/剑气（纯视觉飞行弹）
    this.damageNums = [];        // 伤害飘字
    this.hitStop = 0;            // 命中停顿（慢动作计时，秒）

    // 路线流派机制：从已学技能聚合「连击/连招/暴击」等特殊战斗规则
    let comboEvery = 0, comboDmgPct = 0, rampMax = 0;
    for (const id of this.learnedSkills) {
      const e = findSkill(id)?.eff;
      if (e?.comboEvery) comboEvery = e.comboEvery;
      if (e?.comboDmgPct) comboDmgPct = e.comboDmgPct;
      if (e?.rampMax) rampMax = e.rampMax;
    }
    this.combo = {
      every: Math.max(1, comboEvery + (this.mechLvl.every ?? 0)),
      dmgPct: comboDmgPct + (this.mechLvl.dmg ?? 0),
      rampMax,
      hits: 0,
    };

    // 玩家武器：由基因锁等级最高的路线决定（剑=剑气、枪=子弹、雷=雷电……）
    this.weapon = currentWeapon(this.save.player.geneLocks);
    // 玩家进化形态皮肤：由基因锁等级最高的路线决定（无则基础形态）
    this.skin = currentSkin(this.save.player.geneLocks);
    // 玩家路线机制：每条路线一种独特玩法（雷链/尸爆/导弹/弹幕/寄生/反击/践踏/激光/连击）
    this.routeMech = currentRouteMech(this.save.player.geneLocks);
    this.routeMechCd = 0;
    this.lastProjCount = 0;      // 武器进化档位（用于进化瞬间庆祝）
    this.bossWarnedStage = -1;   // 已预警 Boss 降临的阶段（张弛节奏）
    this.diffKey = this.save.player.difficultyLevel ?? 'normal';
    this.miniRushCd = 45;        // 周期性小波急袭（完成挑战后才结算基因雨奖励）
    this.ambushTimer = 15;       // 精英伏击事件倒计时（阶段中段高价值风险点）
    this.ambushDoneStage = -1;   // 已触发伏击的阶段（每阶段一次）
  }

  /** 难度对应的时间坡分母（困难更快变强，简单更慢） */
  get timeScaleDenom() { return this.diffKey === 'hard' ? 150 : this.diffKey === 'easy' ? 360 : 240; }
  /** 难度对应的刷怪速率系数（困难更多怪，简单更少） */
  get diffSpawnMul() { return this.diffKey === 'hard' ? 1.25 : this.diffKey === 'easy' ? 0.85 : 1; }
  /** 当前武器弹体数（进化可视化） */
  get projCount() {
    return 1 + Math.floor(this.geneStep / 6) + (this.routeMech === 'multishot' ? 1 + (this.mechLvl.count ?? 0) : 0);
  }

  get onScreen() { return this.enemies.length; }
  /** 当前急袭挑战剩余目标数（HUD 可读性） */
  get miniRushRemaining() { return this.enemies.filter((e) => !e.dead && e.eventTag === 'miniRush').length; }

  /** 渲染层取完特效就清空，避免无限增长 */
  drainEffects() {
    const fx = this.hits;
    this.hits = [];
    return fx;
  }

  emitFx(type, x, y) {
    if (this.hits.length < 40) this.hits.push({ type, x, y });
  }

  // ===== 主循环 =====

  /**
   * @param {number} dt 秒
   * @param {{mx:number, my:number}} input 摇杆方向（已归一化，-1..1）
   */
  update(dt, input) {
    if (this.state !== RunState.FIGHTING) return;
    const rawDt = dt;
    dt = Math.min(dt, 1 / 20);          // 防止切后台后一帧跳太多
    // 命中停顿：击杀精英/Boss 短暂慢动作，制造「压实」打击感
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - rawDt);
      dt *= 0.15;
    }
    this.time += dt;
    this.elapsed = Math.round(this.time);
    this.stageElapsed += dt;

    this.updatePlayer(dt, input);
    this.spawnTick(dt);
    this.updateEnemies(dt);
    this.updateDeaths(dt);
    this.updateAttack(dt);
    this.updatePlayerShots(dt);
    this.updateDamageNums(dt);
    this.routeMechTick(dt);
    this.updateActiveSkills(dt);
    this.updateShots(dt);
    if (this.state !== RunState.FIGHTING) return;
    this.updateOrbs(dt);
    this.mechanicsTick(dt);
    this.miniRushTick(dt);
    this.ambushTick(dt);

    if (this.stats.regen > 0) {
      this.heal(this.stats.maxHp * this.stats.regen * dt, '再生', true);
    }
  }

  /** 急袭完成奖励：击破整波后才洒落基因，形成风险→胜利→奖励闭环 */
  rewardMiniRush() {
    const p = this.player;
    const n = this.diffKey === 'hard' ? 10 : 8;
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 45 + this.rng() * 80;
      this.orbs.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, genes: 2, bob: this.rng() * 6 });
    }
    this.emit('🍃 急袭肃清，基因雨洒落！', 'gene');
    this.emitFx('gene', p.x, p.y);
  }

  /** 精英伏击：阶段 2-4 中段各一次，刷出一只高价值精英，掉落走 stageBoss；未击杀跨阶段消失 */
  ambushTick(dt) {
    if (this.stageNo < 2 || this.stageNo > 4 || this.closerSpawned) return;
    if (this.ambushDoneStage === this.stageNo) return;
    this.ambushTimer -= dt;
    if (this.ambushTimer > 0) return;
    this.ambushDoneStage = this.stageNo;
    if (this.enemies.length >= MAX_ONSCREEN) return;   // 满屏让位，不硬塞
    const st = this.stage;
    this.spawnEnemy({ ...st.closer, name: `${st.closer.name}·伏击`, kind: 'elite', ambush: true }, false);
    this.emit('⚠ 一只伏击精英现身！击杀它获得丰厚回报', 'death');
    this.emitFx('elite', this.player.x, this.player.y);
  }

  /** 小波急袭：阶段 2 后每 45~60 秒出现，严格服从同屏上限，只制造短时压力峰 */
  miniRushTick(dt) {
    if (this.stageNo < 2 || this.closerSpawned) return;
    this.miniRushCd -= dt;
    if (this.miniRushCd > 0) return;
    this.miniRushCd = 45 + this.rng() * 15;
    const room = Math.max(0, MAX_ONSCREEN - this.enemies.length);
    const count = Math.min(this.diffKey === 'hard' ? 4 : 2, room);
    if (count <= 0) return;
    const st = this.stage;
    this.spawnSurge({ name: st.minionName, hp: st.minion.hp, atk: st.minion.atk }, count, 'miniRush');
    this.emit('⚠ 快怪急袭，从四周切入！肃清它们可获得基因雨', 'wave');
    this.emitFx('surge', this.player.x, this.player.y);
  }

  updatePlayer(dt, input) {
    const p = this.player;
    const speed = this.stats.speed;
    const len = Math.hypot(input.mx, input.my);
    const nx = len > 1 ? input.mx / len : input.mx;
    const ny = len > 1 ? input.my / len : input.my;

    p.vx = nx * speed;
    p.vy = ny * speed;
    // 无限画布：玩家不受边界约束，自由漫游
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (Math.abs(nx) > 0.01) p.facing = nx > 0 ? 1 : -1;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.devourCd = Math.max(0, p.devourCd - dt);
    p.berserk = Math.max(0, p.berserk - dt);

    const moving = len > 0.05;
    if (p.attackCd > 0.18) p.state = 'attack';
    else p.state = moving ? 'walk' : 'idle';
    p.anim += dt * (moving ? 10 : 6);
  }

  /** 按 dungeon 时间轴刷怪（持续流 + 涌潮 + 阶段收尾单位） */
  spawnTick(dt) {
    const st = this.stage;

    this.spawnCarry += st.spawnRate * this.diffSpawnMul * dt;
    let n = Math.floor(this.spawnCarry);
    this.spawnCarry -= n;

    while (this.surgeDone < st.surges.length && this.stageElapsed >= st.surges[this.surgeDone].atSec) {
      const surge = st.surges[this.surgeDone];
      this.surgeDone += 1;
      // 严格守 60 上限（整体策划 9.3 是**性能**约束，不能为手感突破）。
      // 屏幕已满时涌潮自然被削减 —— 满屏本身就是压力，不需要再堆。
      const room = Math.max(0, MAX_ONSCREEN - this.enemies.length);
      this.spawnSurge(
        { name: st.minionName, hp: st.minion.hp, atk: st.minion.atk },
        Math.min(surge.count, room),
      );
      this.emit(`⚠ 涌潮！${surge.count} 只 ${st.minionName} 从四面围上来`, 'wave');
      this.emitFx('surge', this.player.x, this.player.y);
    }

    if (!this.closerSpawned && this.stageElapsed >= st.closerAt) {
      this.closerSpawned = true;
      this.spawnEnemy(st.closer, true);
      if (st.extraElite) this.spawnEnemy({ ...st.closer, name: `${st.closer.name}·其二` }, true);
      this.emitFx(st.closer.kind === 'boss' ? 'boss' : 'elite', this.player.x, this.player.y);
      this.emit(
        st.closer.kind === 'boss'
          ? `【位面之主】${st.closer.name} 降临`
          : `【${st.closer.name}】出现`,
        'death',
      );
    }

    // 张弛节奏：Boss/精英降临前 4 秒预警，制造压迫感（每阶段一次）
    if (!this.closerSpawned && this.bossWarnedStage !== this.stageNo && this.stageElapsed >= st.closerAt - 4) {
      this.bossWarnedStage = this.stageNo;
      this.emit('⚠ 一股强大的气息正在逼近……', 'death');
      this.emitFx('boss', this.player.x, this.player.y);
    }

    const room = MAX_ONSCREEN - this.enemies.length;
    for (let i = 0; i < Math.min(n, room); i++) {
      this.spawnEnemy({
        kind: 'minion', name: st.minionName, hp: st.minion.hp, atk: st.minion.atk,
      }, false);
    }
  }

  /** 从相机视野边缘外侧刷入（割草的怪从四面涌来，不凭空出现在脸上）。
   *  无限画布下以玩家为锚点，但把距离拉大到约一个视野，让怪有足够的「追击路程」——
   *  距离太近会让怪贴着玩家刷、密度失控（实测通关率崩），必须留出追击缓冲。 */
  spawnEnemy(tpl, isCloser) {
    const p = this.player;
    const edge = Math.floor(this.rng() * 4);
    const m = 24;
    const hw = ARENA.w;
    const hh = ARENA.h;
    let x; let y;
    if (edge === 0) { x = p.x + (this.rng() * 2 - 1) * hw; y = p.y - hh - m; }
    else if (edge === 1) { x = p.x + hw + m; y = p.y + (this.rng() * 2 - 1) * hh; }
    else if (edge === 2) { x = p.x + (this.rng() * 2 - 1) * hw; y = p.y + hh + m; }
    else { x = p.x - hw - m; y = p.y + (this.rng() * 2 - 1) * hh; }

    const isBig = tpl.kind !== 'minion';
    const sprite = isBig
      ? (tpl.kind === 'boss' ? (BOSS_BY_PLANE[this.dungeon.plane.id] ?? null) : null)
      : this.stageMinionSprite();
    // 武侠位面（已配齐 10 小怪、近战/远程分明）：远程造型→spitter，近战→walker/charger，不串味；
    // 其余位面（每面才 2 小怪、未配齐近战/远程比例）：维持旧的权重随机（守平衡测试，串味待补图后修）
    const variant = isBig ? null
      : (this.dungeon.plane.id === 'wuxia'
        ? (RANGED_SPRITES.has(sprite) ? 'spitter' : (this.rng() < 0.7 ? 'walker' : 'charger'))
        : this.rollVariant());
    const v = variant ? MINION_VARIANTS[variant] : null;
    // 阶段越后敌人越快（整体策划 3.2「数量 → **速度** → 复杂度 → 精度」的第二项）
    const stageSpeed = 1 + (this.stageNo - 1) * 0.09;
    // 难度随时间坡：每 4 分钟敌人血量/攻击 +1 倍（吸血鬼幸存者式难度曲线）
    const timeScale = 1 + this.time / this.timeScaleDenom;
    // 精英词缀：同一只精英换词缀就换打法（不改精英基准数值，只改行为与乘区）
    const affix = tpl.kind === 'elite' ? rollEliteAffix(this.rng) : null;
    const affixHp = affix?.eff.hpMul ?? 1;
    const affixSpeed = affix?.eff.speedMul ?? 1;

    this.enemies.push({
      id: this.nextId++,
      kind: tpl.kind,
      variant,
      sprite,
      ambush: tpl.ambush ?? false,
      affix,
      name: affix ? `${affix.name}·${tpl.name}` : tpl.name,
      hp: Math.max(1, Math.round(tpl.hp * (v?.hpMul ?? 1) * timeScale * affixHp)),
      maxHp: Math.max(1, Math.round(tpl.hp * (v?.hpMul ?? 1) * timeScale * affixHp)),
      atk: Math.round(tpl.atk * timeScale),
      x, y,
      r: isBig ? (tpl.kind === 'boss' ? 40 : 24) : 12,
      speed: (isBig ? (tpl.kind === 'boss' ? 135 : 150) : 95 + this.rng() * 25)
        * (v?.speedMul ?? 1) * stageSpeed * affixSpeed,
      spitCd: v?.ranged ? this.rng() * SPIT_CD : 0,
      hitFlash: 0,
      attackT: 0,
      bossSkillCd: isBig ? 2.5 : 0,   // 精英/Boss 技能首秀CD
      telegraphT: 0,             // 技能预警倒计时（抬手可躲）
      phase: 1,                  // Boss 狂暴阶段（1/2/3，血量越低越凶）
      anim: this.rng() * 10,
      isCloser,
    });
  }

  rollVariant() {
    const total = Object.values(MINION_VARIANTS).reduce((a, b) => a + b.weight, 0);
    let r = this.rng() * total;
    for (const [k, v] of Object.entries(MINION_VARIANTS)) {
      r -= v.weight;
      if (r <= 0) return k;
    }
    return 'walker';
  }

  /** 当前阶段刷的小怪 sprite（每阶段 2 种轮换），未配表则返回 null 走变体兜底 */
  stageMinionSprite() {
    const pairs = MINION_SPRITE_BY_STAGE[this.dungeon.plane.id];
    if (!pairs?.length) return null;
    const pair = pairs[Math.min(this.stageNo - 1, pairs.length - 1)];
    return pair[this.nextId % pair.length];
  }

  /**
   * 涌潮：**围着玩家一圈刷**，而不是从场地边缘慢慢走过来。
   * 边缘刷的涌潮会被清场圈在半路吃掉，玩家根本感觉不到「潮」；
   * 环形包围才是割草里那个「屏幕一下子红了」的压力瞬间。
   */
  spawnSurge(tpl, count, eventTag = null) {
    const p = this.player;
    const ringR = 210 + this.rng() * 60;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng() * 0.3;
      const x = p.x + Math.cos(a) * ringR;
      const y = p.y + Math.sin(a) * ringR;
      const variant = this.rollVariant();
      const v = MINION_VARIANTS[variant];
      const stageSpeed = 1 + (this.stageNo - 1) * 0.09;
      const timeScale = 1 + this.time / this.timeScaleDenom;
      this.enemies.push({
        id: this.nextId++, kind: 'minion', variant, name: tpl.name,
        hp: Math.max(1, Math.round(tpl.hp * (v.hpMul ?? 1) * timeScale)),
        maxHp: Math.max(1, Math.round(tpl.hp * (v.hpMul ?? 1) * timeScale)),
        atk: Math.round(tpl.atk * timeScale), x, y, r: 12,
        speed: (95 + this.rng() * 25) * v.speedMul * stageSpeed,
        spitCd: v.ranged ? this.rng() * SPIT_CD : 0,
        hitFlash: 0, attackT: 0, anim: this.rng() * 10, isCloser: false, eventTag,
      });
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      const prevAttackT = e.attackT;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.attackT = Math.max(0, e.attackT - dt);
      e.anim += dt * 8;

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      // 无限画布：被甩开太远的小怪静默回收，压力始终集中在玩家附近。
      // 阈值给足余量（2.5 倍视野），正常战斗绝不回收，只有刻意跑路许久才触发。
      if (e.kind === 'minion' && d > ARENA.w * 2.5) { e.dead = true; continue; }

      if (e.variant === 'spitter') {
        // 远程：停在射程边缘，逼玩家主动上前，不能龟在安全圈里
        const want = d > SPIT_RANGE ? 1 : d < SPIT_RANGE * 0.7 ? -1 : 0;
        e.x += (dx / d) * e.speed * want * dt;
        e.y += (dy / d) * e.speed * want * dt;
        // 瞄准抬手 → 发射（与近战预警一致：有 0.4s 可躲）
        if (e.attackT <= 0) {
          e.spitCd -= dt;
          if (e.spitCd <= 0 && d <= SPIT_RANGE) {
            e.attackT = 0.4;   // 瞄准
            e.spitCd = SPIT_CD;
          }
        }
        if (prevAttackT > 0.2 && e.attackT <= 0.2 && d <= SPIT_RANGE + 40) {
          this.shots.push({
            x: e.x, y: e.y, vx: (dx / d) * SPIT_SPEED, vy: (dy / d) * SPIT_SPEED,
            atk: e.atk, life: 3,
            sprite: e.sprite === 'gongshou' ? 'arrow' : 'projectile',   // 弓手=箭，其余=飞镖
          });
          this.emitFx('spit', e.x, e.y);
        }
      } else {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }

      // 精英/Boss 技能：预警抬手 → 释放（弹幕/剑域等，不是只会追着撞）
      if (e.kind !== 'minion') {
        // Boss 狂暴阶段：血量越少越凶（阶段 1→2→3）
        if (e.kind === 'boss') {
          const pct = e.hp / Math.max(1, e.maxHp);
          const targetPhase = pct <= 0.25 ? 3 : pct <= 0.5 ? 2 : 1;
          if (targetPhase > e.phase) {
            e.phase = targetPhase;
            this.emit(targetPhase === 3 ? '🔥 位面之主濒死反扑！' : '🔥 位面之主狂暴了！', 'death');
            this.emitFx('surge', e.x, e.y);
          }
        }
        const rage = e.phase === 3 ? 1.6 : e.phase === 2 ? 1.3 : 1;
        if (e.telegraphT > 0) {
          // 预警中：给玩家一个可见的抬手信号
          e.telegraphT -= dt;
          if (e.telegraphT <= 0) this.bossSkill(e);
        } else {
          e.bossSkillCd -= dt;
          if (e.bossSkillCd <= 0) {
            // 迅捷词缀：出手更频繁
            e.bossSkillCd = (e.kind === 'boss' ? 4.0 : 6.0) / rage * (e.affix?.eff.skillCdMul ?? 1);
            e.telegraphT = 0.6;               // 抬手 0.6s，期间可躲
            this.emitFx('boss', e.x, e.y);
            this.emit(e.kind === 'boss' ? '⚠ 位面之主蓄势待发！' : '⚠ 精英即将出手！', 'death');
          }
        }
      }

      // 接触攻击：抬手预警 0.3s（attackT 走完才结算伤害，给足躲闪窗口）
      if (prevAttackT > 0 && e.attackT <= 0 && d < p.r + e.r + 8 && p.invuln <= 0) {
        const bigMul = e.kind === 'boss' ? 5.0 : e.kind === 'elite' ? 3.5 : 1;
        let dmg = Math.max(1, e.atk * CONTACT_DPS_SCALE * bigMul * (1 - this.stats.dmgReduct));
        if (this.mech?.type === 'combo') dmg *= this.mech.mul;   // 武侠：连招增伤
        this.hp -= dmg;
        p.invuln = INVULN_ON_HIT;
        p.hitFlash = 0.18;
        this.emitFx('hit', p.x, p.y);
        // 汲血词缀：命中玩家即自我治疗（逼玩家优先处理它，而不是拖着打）
        const leech = e.affix?.eff.leech ?? 0;
        if (leech > 0) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * leech);
        }
        if (this.hp <= 0) {
          this.hp = 0;
          this.state = RunState.LOST;
          this.emit(`被 <b>${e.name}</b> 吞噬，你倒在裂缝之中……`, 'death');
          return;
        }
      }
      // 贴身 → 开始抬手（可读预警，不立即掉血）
      if (d < p.r + e.r && p.invuln <= 0 && e.attackT <= 0) {
        e.attackT = 0.3;   // 抬手 0.3s
      }
    }
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    // 守望词缀：光环内杂兵加速（一只精英能改变整片战场的压迫感）
    const wardens = this.enemies.filter((e) => e.affix?.eff.auraSpeed && !e.dead);
    if (wardens.length) {
      for (const m of this.enemies) {
        if (m.kind !== 'minion' || m.dead) continue;
        const buffed = wardens.some((w) => Math.hypot(m.x - w.x, m.y - w.y) <= (w.affix.eff.auraRadius ?? 200));
        const want = buffed ? (wardens[0].affix.eff.auraSpeed ?? 1.25) : 1;
        if (m.auraMul !== want) {
          m.speed = (m.speed / (m.auraMul ?? 1)) * want;
          m.auraMul = want;
        }
      }
    }
    // 简单互斥：同类之间轻推开，避免全部叠在一个点上
    separate(this.enemies);
  }

  /** 死亡特效计时：0.5 秒后淡出 */
  updateDeaths(dt) {
    for (const d of this.deaths) d.t += dt;
    this.deaths = this.deaths.filter((d) => d.t < 0.5);
  }

  /** 精英/Boss 技能：朝向玩家扇形弹幕（后续按位面换弹体形态） */
  bossSkill(e) {
    const p = this.player;
    const plane = this.dungeon.plane.id;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    const rage = e.phase === 3 ? 1.6 : e.phase === 2 ? 1.3 : 1;
    const mul = (e.kind === 'boss' ? 2.5 : 1.8) * rage;

    if (e.kind === 'boss') {
      // —— 每位面之主一套专属技能（不再人人同款扇形弹幕）——
      if (plane === 'jiguan') {
        // 傀儡巨像：激光横扫（朝玩家方向的直线，二连）
        const ang = base;
        for (let k = 0; k < 2; k++) {
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, atk: e.atk * mul, life: 2.5, r: 10, sprite: 'gear_blade' });
        }
      } else if (plane === 'dujie') {
        // 雷劫神君：落雷（随机方向闪电）
        for (let i = 0; i < 7; i++) {
          const a = this.rng() * Math.PI * 2;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, atk: e.atk * mul, life: 3, sprite: 'lightning' });
        }
        this.emitFx('surge', e.x, e.y);
      } else if (plane === 'jijia') {
        // 零式：导弹齐射（追踪玩家长达 4 秒）
        for (let i = 0; i < 4; i++) {
          this.mechProjectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, kind: 'missile', atk: e.atk * 1.2, life: 4, r: 9 });
        }
      } else if (plane === 'aofa') {
        // 秘法王：弹幕法阵（满圆 18 发魔法弹）
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, atk: e.atk * mul, life: 3.2, sprite: 'magic_orb' });
        }
      } else if (plane === 'jushen') {
        // 泰坦巨人：震地（巨大慢速冲击波）
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, atk: e.atk * mul, life: 4, r: 12, sprite: 'quake_wave' });
        }
        this.emitFx('surge', e.x, e.y);
      } else if (plane === 'gongde') {
        // 金身佛陀：佛光普照（扇形 + 自愈）
        for (let i = 0; i < 14; i++) {
          const a = base - Math.PI * 1.3 / 2 + (Math.PI * 1.3 * i) / 13;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, atk: e.atk * mul, life: 3.2, sprite: 'shockwave_gold' });
        }
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.08);   // 自愈 8%
      } else if (plane === 'shihai') {
        // 湮灭者：尸潮爆裂（周身 AoE 直接伤害）
        for (const o of this.enemies) {
          if (o === e || o.dead) continue;
        }
        // 直接对玩家方向爆发绿雾弹
        for (let i = 0; i < 10; i++) {
          const a = base - 0.4 + (0.8 * i) / 9;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, atk: e.atk * mul, life: 3, sprite: 'miasma' });
        }
      } else if (plane === 'gongshengchao') {
        // 万生：召唤孵化（招 3 只小怪）
        for (let i = 0; i < 3; i++) {
          this.spawnEnemy({ kind: 'minion', name: '孵化虫', hp: this.stage.minion.hp, atk: this.stage.minion.atk }, false);
        }
        this.emit('万生母体孵化出新的寄生物', 'death');
      } else if (plane === 'shanhai') {
        // 饕餮：吞噬（把玩家朝自己拽 + 扇形）
        const dx = e.x - p.x, dy = e.y - p.y; const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 90; p.y += (dy / d) * 90;
        for (let i = 0; i < 12; i++) {
          const a = base - Math.PI * 1.2 / 2 + (Math.PI * 1.2 * i) / 11;
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, atk: e.atk * mul, life: 3, sprite: 'stomp_wave' });
        }
      } else if (plane === 'zhutian') {
        // 崩坏之影：全机制融合（随机两种）
        const pick = Math.floor(this.rng() * 4);
        if (pick === 0) { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, atk: e.atk * mul, life: 3, sprite: 'magic_orb' }); } }
        else if (pick === 1) { for (let i = 0; i < 3; i++) this.mechProjectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, kind: 'missile', atk: e.atk * 1.2, life: 4, r: 9 }); }
        else if (pick === 2) { for (let i = 0; i < 6; i++) { const a = this.rng() * Math.PI * 2; this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, atk: e.atk * mul, life: 3, sprite: 'lightning' }); } }
        else { for (let i = 0; i < 3; i++) this.spawnEnemy({ kind: 'minion', name: '崩坏碎片', hp: this.stage.minion.hp, atk: this.stage.minion.atk }, false); }
      } else {
        // 奇巧/功德/武侠等：扇形弹幕（剑圣无名之外默认）
        const n = 14; const spread = Math.PI * 1.6;
        for (let i = 0; i < n; i++) {
          const a = base - spread / 2 + (spread * i) / (n - 1);
          this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, atk: e.atk * mul, life: 3.5, sprite: plane === 'wuxia' ? 'jiansheng_slash' : 'projectile' });
        }
      }
      this.emitFx('burst', e.x, e.y);
      return;
    }

    // 精英：小扇形弹幕（弹体跟着位面主题走，与 Boss 同风格但更弱）
    const ELITE_SPRITE = {
      dujie: 'lightning', aofa: 'magic_orb', jijia: 'bullet', jushen: 'quake_wave',
      gongde: 'shockwave_gold', shihai: 'miasma', shanhai: 'stomp_wave',
      jiguan: 'gear_blade', qiqiao: 'gear_blade', gongshengchao: 'tendril', wuxia: 'jiansheng_slash', zhutian: 'magic_orb',
    }[plane] ?? 'projectile';
    const n = 9;
    const spread = Math.PI * 1.0;
    for (let i = 0; i < n; i++) {
      const a = base - spread / 2 + (spread * i) / (n - 1);
      this.shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, atk: e.atk * mul, life: 3.5, sprite: ELITE_SPRITE });
    }
    this.emitFx('burst', e.x, e.y);
  }

  /** 自动索敌：每 1/攻速 秒打一次射程内最近的敌人（攻击抬手用 state='attack' 的帧动画表现，不额外延迟结算） */
  updateAttack(dt) {
    const p = this.player;
    if (p.attackCd > 0) return;

    const range = ATTACK_RANGE * this.stats.range;
    // 索敌优先级：**大件优先**。同屏 60 只杂兵时若只打最近的，
    // 精英/位面之主永远轮不到，阶段推不动（实测卡死 20 分钟）。
    let best = null;
    let bestD = Infinity;
    let bestBig = false;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > range + e.r) continue;
      const big = e.kind !== 'minion';
      if (big && !bestBig) { best = e; bestD = d; bestBig = true; continue; }
      if (big === bestBig && d < bestD) { best = e; bestD = d; }
    }
    if (!best) return;

    p.attackCd = 1 / Math.max(0.2, this.stats.aspd * ATTACK_RATE * (p.berserk > 0 ? BERSERK_MUL : 1));
    p.facing = best.x >= p.x ? 1 : -1;

    // 连击/连招（侠客·剑气流）：每次命中累积
    this.combo.hits += 1;
    let comboMul = 1;
    if (this.combo.dmgPct && this.combo.hits % this.combo.every === 0) comboMul *= 1 + this.combo.dmgPct;
    if (this.combo.rampMax) comboMul *= 1 + Math.min(this.combo.rampMax, this.combo.hits * 0.05);

    // 攻击形状 = 武器自带属性：single单体 / line直线 / circle环绕 / aoe溅射
    const pattern = this.weapon.pattern ?? 'aoe';
    // 武器进化：等级越高，伤害越强、范围越大（力量幻想核心）
    const lvlMul = 1 + this.geneStep * 0.06;                       // 每级 +6% 伤害
    const splash = 34 * this.stats.range + this.stats.aoe * 40 + this.geneStep * 3;
    const isCrit = this.rng() < this.stats.crit;
    const berserk = p.berserk > 0 ? BERSERK_MUL : 1;
    let dmg = calcDamage(this.stats.atk * berserk * comboMul * lvlMul, 1, isCrit, 0, this.stats.critDmg ?? 0);
    if (this.mech?.type === 'armor') dmg *= (1 - this.mech.factor);   // 功德：金身减伤
    let healed = 0;
    const execBonus = this.stats.execute ?? 0;
    const hitFn = (e) => {
      // 斩杀本能：残血（<30%）目标吃额外伤害，奖励「补刀收割」的打法
      let eDmg = execBonus > 0 && e.hp / Math.max(1, e.maxHp) < 0.3 ? dmg * (1 + execBonus) : dmg;
      // 铁壁词缀：减伤（换来更慢的移动，用走位可以拉扯）
      eDmg *= e.affix?.eff.dmgTaken ?? 1;
      e.hp -= eDmg;
      e.hitFlash = 0.12;
      healed += eDmg;
      if (e.hp <= 0) this.killEnemy(e);
      // 渡劫·雷链弹射：命中后在敌人间跳跃（构筑强化可 +跳数/+伤害）
      if (this.routeMech === 'chain') {
        const jumps = 3 + (this.mechLvl.jumps ?? 0);
        const chainDmg = 0.5 * (1 + (this.mechLvl.dmg ?? 0));
        let last = e;
        for (let j = 0; j < jumps; j++) {
          let nb = null; let nd = Infinity;
          for (const o of this.enemies) {
            if (o === last || o.dead || o.hp <= 0) continue;
            const dd2 = Math.hypot(o.x - last.x, o.y - last.y);
            if (dd2 < nd && dd2 <= 140) { nd = dd2; nb = o; }
          }
          if (!nb) break;
          nb.hp -= dmg * chainDmg;
          nb.hitFlash = 0.12;
          this.damageNums.push({ x: nb.x, y: nb.y - 24, v: Math.round(dmg * chainDmg), crit: false, life: 0.9 });
          if (nb.hp <= 0) this.killEnemy(nb);
          last = nb;
        }
      }
    };

    if (pattern === 'single') {
      hitFn(best);
    } else if (pattern === 'line') {
      const ang = Math.atan2(best.y - p.y, best.x - p.x);
      const ux = Math.cos(ang), uy = Math.sin(ang);
      hitFn(best);
      for (const e of this.enemies) {
        if (e === best) continue;
        const px = e.x - p.x, py = e.y - p.y;
        const proj = px * ux + py * uy;
        if (proj < 0 || proj > range + e.r) continue;
        if (Math.abs(px * uy - py * ux) <= 30 + e.r) hitFn(e);
      }
    } else if (pattern === 'circle') {
      hitFn(best);
      for (const e of this.enemies) {
        if (e !== best && Math.hypot(e.x - best.x, e.y - best.y) <= 60 * this.stats.range + this.stats.aoe * 30 + e.r) hitFn(e);
      }
    } else {
      for (const e of this.enemies) {
        if (e === best || Math.hypot(e.x - best.x, e.y - best.y) <= splash) hitFn(e);
      }
    }
    // 伤害飘字
    this.damageNums.push({ x: best.x, y: best.y - 24, v: Math.round(dmg), crit: isCrit, life: 0.9 });
    // 武器进化：等级越高弹体越多（Lv0-5 单发 → Lv6 三连 → Lv12 五连，扇形散射）；魔法路线弹幕再 +1
    const projCount = 1 + Math.floor(this.geneStep / 6) + (this.routeMech === 'multishot' ? 1 + (this.mechLvl.count ?? 0) : 0);
    // 进化瞬间：弹体档位提升 = 成长仪式（全屏反馈）
    if (projCount > this.lastProjCount) {
      this.lastProjCount = projCount;
      this.emitFx('surge', p.x, p.y);
      this.emit(`⚡ 进化！武器弹体 ×${projCount}`, 'win');
    }
    const dx = best.x - p.x, dy = best.y - p.y;
    const dd = Math.hypot(dx, dy) || 1;
    const baseAng = Math.atan2(dy, dx);
    for (let i = 0; i < projCount; i++) {
      const spread = projCount <= 1 ? 0 : (i - (projCount - 1) / 2) * 0.16;
      const ang = baseAng + spread;
      this.playerShots.push({
        x: p.x + Math.cos(ang) * 14, y: p.y + Math.sin(ang) * 14,
        vx: Math.cos(ang) * 540, vy: Math.sin(ang) * 540,
        life: Math.max(0.18, Math.min(0.4, dd / 540)),
        sprite: this.weapon.projectile,
      });
    }
    this.emitFx(isCrit ? 'crit' : 'sword_hit', best.x, best.y);
    if (this.stats.lifesteal > 0) this.heal(healed * this.stats.lifesteal, '吸血', true);
  }

  /** 玩家剑气/刀波等飞行弹：位移 + 到期回收（纯视觉，伤害不在弹体上结算） */
  updatePlayerShots(dt) {
    for (const s of this.playerShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.playerShots = this.playerShots.filter((s) => s.life > 0);
  }

  /** 伤害飘字：上浮 + 到期回收 */
  updateDamageNums(dt) {
    for (const n of this.damageNums) {
      n.life -= dt;
      n.y -= 42 * dt;
    }
    this.damageNums = this.damageNums.filter((n) => n.life > 0);
    // 可读性（readable chaos）：同屏飘字太多反而糊成一团，最多留 22 个，丢最旧的
    if (this.damageNums.length > 22) this.damageNums = this.damageNums.slice(-22);
  }

  /** 路线机制：周期型（导弹/践踏/激光）按 CD 触发；链式/尸爆/寄生等挂在本方法外 */
  routeMechTick(dt) {
    if (!this.routeMech) return;
    const p = this.player;
    const interval = this.routeMech === 'missile' ? 3 : this.routeMech === 'stomp' ? 4 : this.routeMech === 'laser' ? 5 : 0;
    if (!interval) return;
    this.routeMechCd -= dt;
    if (this.routeMechCd > 0) return;
    this.routeMechCd = interval;

    if (this.routeMech === 'missile') {
      // 机甲·周期导弹：锁定最接近的 N 个敌人齐射（构筑可 +数量/+伤害）
      const count = 3 + (this.mechLvl.count ?? 0);
      const mDmg = 1.3 * (1 + (this.mechLvl.dmg ?? 0));
      const targets = this.enemies.slice().sort((a, b) =>
        (Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)));
      for (let i = 0; i < Math.min(count, targets.length); i++) {
        const e = targets[i];
        e.hp -= this.stats.atk * mDmg;
        e.hitFlash = 0.12;
        this.damageNums.push({ x: e.x, y: e.y - 24, v: Math.round(this.stats.atk * mDmg), crit: false, life: 0.9 });
        if (e.hp <= 0) this.killEnemy(e);
      }
      this.emitFx('surge', p.x, p.y);
    } else if (this.routeMech === 'stomp') {
      // 山海/巨化·践踏震荡：周身 AoE（构筑可 +范围/+伤害）
      const sR = 120 * (1 + (this.mechLvl.radius ?? 0));
      const sDmg = 1.2 * (1 + (this.mechLvl.dmg ?? 0));
      for (const e of this.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) <= sR + e.r) {
          e.hp -= this.stats.atk * sDmg;
          e.hitFlash = 0.12;
          this.damageNums.push({ x: e.x, y: e.y - 24, v: Math.round(this.stats.atk * sDmg), crit: false, life: 0.9 });
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      this.emitFx('burst', p.x, p.y);
      this.emitFx('surge', p.x, p.y);
    } else if (this.routeMech === 'laser') {
      // 奇技·机关激光：直线贯穿（构筑可 +宽/+伤害）
      const lW = 40 * (1 + (this.mechLvl.width ?? 0));
      const lDmg = 1.5 * (1 + (this.mechLvl.dmg ?? 0));
      const ang = p.facing > 0 ? 0 : Math.PI;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      for (const e of this.enemies) {
        const px = e.x - p.x, py = e.y - p.y;
        const proj = px * ux + py * uy;
        if (proj < 0 || proj > 500 + e.r) continue;
        if (Math.abs(px * uy - py * ux) <= lW + e.r) {
          e.hp -= this.stats.atk * lDmg;
          e.hitFlash = 0.12;
          this.damageNums.push({ x: e.x, y: e.y - 24, v: Math.round(this.stats.atk * lDmg), crit: false, life: 0.9 });
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      this.emitFx('surge', p.x, p.y);
    }
  }

  // ===== 玩家动词（整体策划 2.3）=====

  /**
   * 闪避翻滚：朝当前输入方向位移 + 0.25s 无敌，可穿怪。
   * 无输入时朝面向翻滚。CD 1.6s。
   * @returns {boolean} 是否成功触发
   */
  dodge(input) {
    const p = this.player;
    if (p.dodgeCd > 0 || this.state !== RunState.FIGHTING) return false;
    const len = Math.hypot(input?.mx ?? 0, input?.my ?? 0);
    const dx = len > 0.05 ? input.mx / len : p.facing;
    const dy = len > 0.05 ? input.my / len : 0;
    p.x += dx * DODGE_DIST;
    p.y += dy * DODGE_DIST;
    p.invuln = Math.max(p.invuln, DODGE_INVULN);
    p.dodgeCd = DODGE_CD;
    p.state = 'dodge';
    this.emitFx('dodge', p.x, p.y);
    return true;
  }

  /**
   * 吞噬爆发：范围内尸体全部吸取 + 回血 + 狂暴 3s（攻击力与攻速 ×1.8）。
   * 这是整体策划 2.3 里唯一的**主动爆发键**，也是「吞噬」主题的动作化表达。
   * @returns {boolean}
   */
  devour() {
    const p = this.player;
    if (p.devourCd > 0 || this.state !== RunState.FIGHTING) return false;
    p.devourCd = DEVOUR_CD;
    p.berserk = DEVOUR_BERSERK;

    // 吞噬一切：全屏吸取所有基因尸体（力量幻想的「吸干全场」瞬间）
    let sucked = 0;
    for (const o of this.orbs) { o.taken = true; sucked += o.genes; }
    if (sucked > 0) this.addGenes(sucked, true);
    this.orbs = [];

    // 噬咬爆发：周身一圈伤害（吞噬主题的动作化表达）
    for (const e of [...this.enemies]) {
      if (Math.hypot(e.x - p.x, e.y - p.y) <= 160 + e.r) {
        e.hp -= this.stats.atk * 1.5;
        e.hitFlash = 0.15;
        this.damageNums.push({ x: e.x, y: e.y - 24, v: Math.round(this.stats.atk * 1.5), crit: false, life: 0.9 });
        if (e.hp <= 0) this.killEnemy(e);
      }
    }

    this.heal(this.stats.maxHp * DEVOUR_HEAL_PCT, '吞噬', true);
    this.emitFx('devour', p.x, p.y);
    this.emitFx('surge', p.x, p.y);
    this.hitStop = 0.15;   // 吞噬的「压实」停顿
    this.emit(`【吞噬爆发】吸取 ${sucked} 基因 · 噬咬周围 · 狂暴 ${DEVOUR_BERSERK}s`, 'gene');
    return true;
  }

  /** 吞噬爆发冷却进度 0..1（UI 画环用） */
  get devourReady() { return this.player.devourCd <= 0; }

  /** 主动槽只读状态：UI 展示技能名/剩余冷却，不复制战斗逻辑 */
  get activeSkillStatus() {
    const slots = this.save.player.skillSlots;
    return ['activeA', 'activeB'].map((key) => {
      const slot = slots[key];
      if (!slot || slot.kind !== 'active') return null;
      const skill = findSkill(slot.skillId) ?? findHiddenSkill(slot.skillId);
      if (!skill) return null;
      const cd = skill.cd ?? 30;
      const left = Math.max(0, this.skillCd.get(slot.skillId) ?? 0);
      return { key, name: skill.name, left, cd, ready: left <= 0 };
    }).filter(Boolean);
  }

  /**
   * 主动技能自动释放。
   * 单摇杆游戏里主动技通常**自动施放**（整体策划 2.3 只给了移动 + 吞噬两个操作），
   * 所以主动槽里的技能一到 CD 就打出去，玩家的决策发生在三选一而不是操作上。
   */
  updateActiveSkills(dt) {
    const slots = this.save.player.skillSlots;
    for (const key of ['activeA', 'activeB']) {
      const slot = slots[key];
      if (!slot || slot.kind !== 'active') continue;
      const skill = findSkill(slot.skillId) ?? findHiddenSkill(slot.skillId);
      if (!skill) continue;
      const cd = skill.cd ?? 30;
      const left = (this.skillCd.get(slot.skillId) ?? 0) - dt;
      if (left > 0) { this.skillCd.set(slot.skillId, left); continue; }
      this.skillCd.set(slot.skillId, cd);
      this.castSkill(skill);
    }
  }

  /** 释放一个主动技：按 eff 结算全屏/范围伤害、治疗、无敌、增益 */
  castSkill(skill) {
    const p = this.player;
    const e = skill.eff ?? {};
    const mul = e.aoeMul ?? e.burstMul ?? e.trapMul ?? e.missileMul ?? 0;

    if (mul > 0) {
      // 全屏或大范围爆发：割草里终极技的价值就是「清空一屏」
      const radius = e.aoe || e.burstMul ? 9999 : 220;
      const dmg = this.stats.atk * mul * (e.duration ? e.duration : 1);
      for (const en of [...this.enemies]) {
        if (Math.hypot(en.x - p.x, en.y - p.y) > radius) continue;
        en.hp -= dmg;
        en.hitFlash = 0.15;
        if (en.hp <= 0) this.killEnemy(en);
        if (this.state !== RunState.FIGHTING) return;
      }
    }
    if (e.invuln) p.invuln = Math.max(p.invuln, e.invuln);
    if (e.allStatsPct) p.berserk = Math.max(p.berserk, e.duration ?? 5);
    if (e.devourHealPct) this.heal(this.stats.maxHp * e.devourHealPct * 3, skill.name, true);
    if (e.summon) {
      // 召唤类折算成一次范围清扫（真正的随从留给后续版本）
      for (const en of [...this.enemies]) {
        if (Math.hypot(en.x - p.x, en.y - p.y) > 200) continue;
        en.hp -= this.stats.atk * 0.6 * e.summon;
        if (en.hp <= 0) this.killEnemy(en);
        if (this.state !== RunState.FIGHTING) return;
      }
    }
    this.emitFx('skill', p.x, p.y);
    this.emit(`释放 <b>${skill.name}</b>`, 'learn');
  }

  killEnemy(e) {
    e.dead = true;
    this.kills += 1;
    if (e.kind === 'minion') this.minionKills += 1;
    this.emitFx('burst', e.x, e.y);
    if (e.kind !== 'minion') this.hitStop = 0.08;   // 精英/Boss 击杀：命中停顿
    // 自爆怪：死时爆炸，近身波及玩家（别贴脸杀它）
    if (e.variant === 'bomber') {
      const p = this.player;
      if (Math.hypot(p.x - e.x, p.y - e.y) < 55 && p.invuln <= 0) {
        this.hurtPlayer(Math.max(1, e.atk * 1.5), 0.4);
      }
      this.emitFx('burst', e.x, e.y);
    }
    // 爆裂词缀：精英死亡炸开一圈弹幕（击杀瞬间不能松懈）
    const deathBurst = e.affix?.eff.deathBurst ?? 0;
    if (deathBurst > 0) {
      for (let i = 0; i < deathBurst; i++) {
        const a = (i / deathBurst) * Math.PI * 2;
        this.shots.push({
          x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
          atk: e.atk * 1.2, life: 2.4, sprite: 'projectile',
        });
      }
      this.emit('💥 爆裂精英炸开一圈弹幕！', 'death');
      this.emitFx('burst', e.x, e.y);
    }
    // 急袭挑战：最后一只标记怪死亡时结算基因雨奖励（标记先清，避免尸爆递归重复发奖）
    const eventTag = e.eventTag;
    e.eventTag = null;
    if (eventTag === 'miniRush' && !this.enemies.some((o) => o !== e && !o.dead && o.eventTag === eventTag)) {
      this.rewardMiniRush();
    }

    // 死亡帧特效：渲染层据此播放死亡动画
    this.deaths.push({ x: e.x, y: e.y, kind: e.kind, variant: e.variant, id: e.id, sprite: e.sprite, facing: e.x < this.player.x ? 1 : -1, t: 0 });

    // 位面机制：尸爆连锁 / 寄生反水（挂在击杀上）
    const mech = this.mech;
    if (mech?.type === 'corpseBlast' && e.kind !== 'boss') {
      for (const o of [...this.enemies]) {
        if (o === e || o.dead) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < mech.radius) {
          o.hp -= e.atk * mech.mul;
          o.hitFlash = 0.15;
          if (o.hp <= 0) this.killEnemy(o);   // 连锁
        }
      }
    }
    if (mech?.type === 'parasite' && e.kind === 'minion' && this.rng() < mech.chance) {
      this.mechAllies.push({ x: e.x, y: e.y, atk: 12 * this.dungeon.D, life: mech.duration, anim: 0 });
      this.emitFx('surge', e.x, e.y);
      this.emit('🩸 寄生反水：一只小怪倒戈助你', 'gene');
    }

    // —— 路线机制：尸爆连锁 / 寄生反水（玩家的 Build，区别于位面机制）——
    if (this.routeMech === 'corpseBlast' && e.kind !== 'boss') {
      const cR = 70 * (1 + (this.mechLvl.radius ?? 0));
      const cDmg = 1.4 * (1 + (this.mechLvl.dmg ?? 0));
      for (const o of [...this.enemies]) {
        if (o === e || o.dead) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < cR) {
          o.hp -= this.stats.atk * cDmg;
          o.hitFlash = 0.15;
          if (o.hp <= 0) this.killEnemy(o);   // 尸爆连锁
        }
      }
      this.emitFx('burst', e.x, e.y);
    }
    if (this.routeMech === 'parasite' && e.kind === 'minion' && this.rng() < 0.06 + (this.mechLvl.chance ?? 0)) {
      this.mechAllies.push({ x: e.x, y: e.y, atk: this.stats.atk * 0.8, life: 6, anim: 0 });
      this.emitFx('surge', e.x, e.y);
    }

    if (e.kind === 'boss') {
      this.enemies = this.enemies.filter((x) => !x.dead);
      this.onKill(e);            // 父类：BOSS 掉落 + 置为 WON
      return;
    }

    const kindForDrop = e.kind === 'elite' ? 'stageBoss' : 'minion';
    const drop = rollKillDrop(this.dungeon, this.save, kindForDrop, this.rng);
    if (drop.gear) this.addGear(drop.gear);
    // 基因不直接入账，先掉成尸体，玩家靠近才吸（整体策划 4.2）
    this.orbs.push({ x: e.x, y: e.y, genes: drop.genes, bob: this.rng() * 6 });

    this.enemies = this.enemies.filter((x) => !x.dead);
    if (e.kind === 'elite' && !e.ambush) {
      this.emit(`击破 <b>${e.name}</b>`, 'gene');
      this.advanceStage();
    }
  }

  /** 阶段推进：重置时间轴游标；未完成的急袭挑战作废，伏击精英未击杀则消失，奖励不得跨阶段结算 */
  advanceStage() {
    if (this.enemies.some((e) => e.kind === 'elite' && !e.ambush)) return;
    if (this.enemies.some((e) => e.ambush)) {
      this.emit('伏击精英逃逸，奖励错过', 'death');
      this.enemies = this.enemies.filter((e) => !e.ambush);
    }
    if (this.stageIndex + 1 >= this.dungeon.stages.length) return;
    const rushLeft = this.miniRushRemaining;
    if (rushLeft > 0) {
      for (const e of this.enemies) if (e.eventTag === 'miniRush') e.eventTag = null;
      this.emit(`急袭未肃清（剩余 ${rushLeft}），基因雨奖励失效`, 'death');
    }
    super.advanceStage();
    this.stageElapsed = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.spawnCarry = 0;
  }

  /** 远程弹幕：命中玩家或超时消失 */
  updateShots(dt) {
    const p = this.player;
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      // 无限画布：弹幕超出生效半径即回收
      if (s.life <= 0 || Math.hypot(s.x - p.x, s.y - p.y) > ARENA.w) {
        s.dead = true;
        continue;
      }
      if (p.invuln <= 0 && Math.hypot(s.x - p.x, s.y - p.y) < p.r + 5) {
        s.dead = true;
        const dmg = Math.max(1, s.atk * CONTACT_DPS_SCALE * 1.4 * (1 - this.stats.dmgReduct));
        this.hp -= dmg;
        p.invuln = INVULN_ON_HIT * 0.6;
        p.hitFlash = 0.18;
        this.emitFx('hit', p.x, p.y);
        if (this.hp <= 0) {
          this.hp = 0;
          this.state = RunState.LOST;
          this.emit('生命耗尽，你倒在裂缝之中……', 'death');
          return;
        }
      }
    }
    if (this.shots.some((s) => s.dead)) this.shots = this.shots.filter((s) => !s.dead);
  }

  /** 基因尸体：进入吸取半径后飞向玩家 */
  updateOrbs(dt) {
    const p = this.player;
    const suck = SUCK_RADIUS * this.stats.suckRadius;
    for (const o of this.orbs) {
      o.bob += dt * 4;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < suck) {
        const pull = 320 + (1 - d / suck) * 500;
        o.x += (dx / d) * pull * dt;
        o.y += (dy / d) * pull * dt;
      }
      if (d < p.r + 6) {
        o.taken = true;
        this.addGenes(o.genes, true);
        this.emitFx('gene', o.x, o.y);
      }
    }
    if (this.orbs.some((o) => o.taken)) this.orbs = this.orbs.filter((o) => !o.taken);
  }

  // ===== 位面主题机制 =====

  /** 周期机制主循环：落雷 / 弹幕 / 导弹 / 激光 / 践踏 / 融合 */
  mechanicsTick(dt) {
    const m = this.mech;
    if (!m) return;
    this.mechTimer += dt;

    this.updateMechAllies(dt);
    this.updateMechProjectiles(dt);

    // 挂在击杀/接触上的机制不走周期计时
    if (['armor', 'corpseBlast', 'parasite', 'combo'].includes(m.type)) return;

    if (m.type === 'mix') {
      if (this.mechTimer < m.interval) return;
      this.mechTimer = 0;
      const picks = ['lightning', 'bulletHell', 'missile', 'laser', 'stomp'];
      this.castMech(picks[Math.floor(this.rng() * picks.length)]);
      return;
    }

    if (this.mechTimer < m.interval) return;
    this.mechTimer = 0;
    this.castMech(m.type);
  }

  castMech(type) {
    const p = this.player;
    switch (type) {
      case 'lightning': {
        const x = p.x + (this.rng() * 2 - 1) * 200;
        const y = p.y + (this.rng() * 2 - 1) * 200;
        this.emitFx('lightning', x, y);
        if (Math.hypot(x - p.x, y - p.y) < 45) this.hurtPlayer(3 * this.dungeon.D);
        for (const e of [...this.enemies]) {
          if (Math.hypot(x - e.x, y - e.y) < 70) {
            e.hp -= 12 * this.dungeon.D;
            e.hitFlash = 0.15;
            if (e.hp <= 0) this.killEnemy(e);
            if (this.state !== RunState.FIGHTING) return;
          }
        }
        break;
      }
      case 'bulletHell': {
        const n = this.mech.count ?? 6;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + this.rng() * 0.5;
          this.mechProjectiles.push({
            x: p.x + Math.cos(ang) * 360, y: p.y + Math.sin(ang) * 360,
            vx: -Math.cos(ang) * 150, vy: -Math.sin(ang) * 150,
            kind: 'bullet', atk: 1 * this.dungeon.D, life: 4, r: 6,
          });
        }
        this.emitFx('surge', p.x, p.y);
        break;
      }
      case 'missile': {
        const ang = this.rng() * Math.PI * 2;
        const sx = p.x + Math.cos(ang) * 400;
        const sy = p.y + Math.sin(ang) * 400;
        this.mechProjectiles.push({ x: sx, y: sy, vx: 0, vy: 0, kind: 'missile', atk: 6 * this.dungeon.D, life: 6, r: 8 });
        this.emitFx('spit', sx, sy);
        break;
      }
      case 'laser': {
        const horiz = this.rng() < 0.5;
        const line = horiz ? (p.y + (this.rng() * 2 - 1) * 160) : (p.x + (this.rng() * 2 - 1) * 160);
        this.emitFx('laser', horiz ? p.x : line, horiz ? line : p.y);
        if (horiz ? Math.abs(p.y - line) < 22 : Math.abs(p.x - line) < 22) {
          this.hurtPlayer(4 * this.dungeon.D);
        }
        break;
      }
      case 'stomp': {
        // 践踏来自巨物，落点随机（不是必中玩家）：玩家只有站在震源附近才受伤
        const x = p.x + (this.rng() * 2 - 1) * 250;
        const y = p.y + (this.rng() * 2 - 1) * 250;
        this.emitFx('stomp', x, y);
        if (Math.hypot(x - p.x, y - p.y) < (this.mech.radius ?? 100)) this.hurtPlayer(5 * this.dungeon.D, 0.4);
        break;
      }
      default: break;
    }
  }

  /** 玩家受伤统一入口（无敌帧内免疫 + 闪白 + 死亡判定） */
  hurtPlayer(dmg, invuln = 0.6) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== RunState.FIGHTING) return;
    const d = Math.max(1, dmg * (1 - this.stats.dmgReduct));
    this.hp -= d;
    p.invuln = invuln;
    p.hitFlash = 0.18;
    this.emitFx('hit', p.x, p.y);
    // 功德·金身反击：挨打反震周身敌人
    if (this.routeMech === 'reflect') {
      const rDmg = 0.9 * (1 + (this.mechLvl.dmg ?? 0));
      for (const o of [...this.enemies]) {
        if (o.dead) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) <= 90 + o.r) {
          o.hp -= this.stats.atk * rDmg;
          o.hitFlash = 0.12;
          this.damageNums.push({ x: o.x, y: o.y - 24, v: Math.round(this.stats.atk * rDmg), crit: false, life: 0.9 });
          if (o.hp <= 0) this.killEnemy(o);
        }
      }
      this.emitFx('burst', p.x, p.y);
    }
    // 倒刺外壳（属性构筑）：受击反震周身敌人，与路线反击可叠加
    const thorn = this.stats.thorn ?? 0;
    if (thorn > 0) {
      for (const o of [...this.enemies]) {
        if (o.dead) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) <= 85 + o.r) {
          const td = this.stats.atk * thorn;
          o.hp -= td;
          o.hitFlash = 0.12;
          this.damageNums.push({ x: o.x, y: o.y - 24, v: Math.round(td), crit: false, life: 0.9 });
          if (o.hp <= 0) this.killEnemy(o);
        }
      }
      this.emitFx('burst', p.x, p.y);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = RunState.LOST;
      this.emit('生命耗尽，你倒在裂缝之中……', 'death');
    }
  }

  /** 寄生反水：友军追最近的敌人并啃它 */
  updateMechAllies(dt) {
    for (const a of this.mechAllies) {
      a.life -= dt;
      let best = null; let bd = Infinity;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x - a.x, e.y - a.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      const dx = best.x - a.x; const dy = best.y - a.y; const d = Math.hypot(dx, dy) || 1;
      a.x += (dx / d) * 130 * dt;
      a.y += (dy / d) * 130 * dt;
      a.anim += dt * 8;
      if (d < 18 + best.r) {
        best.hp -= a.atk * dt;
        best.hitFlash = Math.max(best.hitFlash, 0.1);
        if (best.hp <= 0) this.killEnemy(best);
      }
    }
    if (this.mechAllies.some((a) => a.life <= 0)) this.mechAllies = this.mechAllies.filter((a) => a.life > 0);
  }

  /** 弹幕 / 导弹投射物 */
  updateMechProjectiles(dt) {
    const p = this.player;
    for (const pr of this.mechProjectiles) {
      pr.life -= dt;
      if (pr.kind === 'missile') {
        const dx = p.x - pr.x; const dy = p.y - pr.y; const d = Math.hypot(dx, dy) || 1;
        pr.vx = (dx / d) * 190;
        pr.vy = (dy / d) * 190;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.life <= 0) { pr.dead = true; continue; }
      if (p.invuln <= 0 && Math.hypot(pr.x - p.x, pr.y - p.y) < p.r + pr.r) {
        pr.dead = true;
        this.hurtPlayer(pr.atk, 0.5);
      }
    }
    if (this.mechProjectiles.some((pr) => pr.dead)) this.mechProjectiles = this.mechProjectiles.filter((pr) => !pr.dead);
  }

  /** 覆盖父类：实时下回血是连续量，不刷屏 */
  heal(amount, reason, silent = false) {
    if (amount <= 0 || this.hp >= this.stats.maxHp) return;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    if (!silent) super.emit(`${reason} 回复生命`, 'heal');
  }

  /** 回合制的 step() 在实时模式下不再使用 */
  step() {}
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** 让敌人不完全重叠（割草里成群但不叠成一个点） */
function separate(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  }
}
