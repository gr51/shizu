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
  tank: { speedMul: 0.55, weight: 8, hpMul: 1.6, slam: true },  // 重装：慢而硬，贴近就践踏（AOE+踉跄）
  bomber: { speedMul: 1.6, weight: 6, hpMul: 0.5, bomber: true }, // 自爆：快而脆，死了炸你
};

/** 每阶段刷的小怪 sprite（每阶段一对，5 阶段各不同） */
export const MINION_SPRITE_BY_STAGE = {
  jiguan: [['jixie_xie', 'lu_kuilei'], ['jixie_xie', 'paotai_ji'], ['lu_kuilei', 'paotai_ji'], ['jixie_xie', 'lu_kuilei'], ['paotai_ji', 'jixie_xie']],
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
  jiguan: 'boss_jiguan',
  wuxia: 'jiansheng', aofa: 'aofa_boss', qiqiao: 'qiqiao_boss', dujie: 'dujie_boss',
  gongde: 'gongde_boss', shihai: 'shihai_boss', gongshengchao: 'gongshengchao_boss',
  shanhai: 'shanhai_boss', jijia: 'jijia_boss', jushen: 'jushen_boss', zhutian: 'zhutian_boss',
};

/** 远程小怪散集：这些 sprite 用远程弹体，其余一律近战 */
export const RANGED_SPRITES = new Set(['anqi', 'gongshou', 'yuan_jingling', 'huo_bing', 'bing_yuansu', 'aoshu_shicong', 'fashu_jiguan', 'jing_ling', 'lei_jing', 'tianlei_zi', 'shi_wu', 'wuren_ji', 'guidao_paotai', 'shaojie', 'zizou_pao', 'benghuai_suipian', 'weimian_canying', 'xukong_jiti', 'paotai_ji']);

/** 远程小怪的射击参数 */
export const SPIT_RANGE = 300;
export const SPIT_CD = 2.6;
export const SPIT_SPEED = 190;

/** 重装怪（tank）践踏参数：慢而硬的「区域拒绝」——贴脸不走位就要吃践踏+踉跄。
 *  践踏从第 2 阶段起才启用：第 1 阶段的下限基准在生死线上（实测 shanhai 盲走
 *  机器人低谷期 minHp=29），教学期必须温和 —— 这也是「数量→速度→复杂度」的
 *  难度曲线本义：新行为属于复杂度，按阶段引入。 */
export const SLAM_RANGE = 85;        // 进入该距离才起脚（远处它只是个肉沙包）
export const SLAM_WINDUP = 0.6;      // 蓄力 0.6s（36 帧）：收缩圈预警，走开即可躲
export const SLAM_RADIUS = 115;      // 践踏判定半径（圆心=坦克，含玩家 r）
export const SLAM_ATK_MUL = 1.0;     // 践踏伤害 = atk ×1.0：疼点在踉跄和区域拒绝，不在数值秒人
export const SLAM_CD_MIN = 5.0;
export const SLAM_CD_MAX = 7.0;
export const SLAM_STAGE_FROM = 2;    // 第 2 阶段起才会践踏
export const SLAM_PLAYER_SLOW = 0.8; // 被震到后的踉跄时长（秒）；禅心的 ccResist 在此生效
export const PLAYER_SLOW_MUL = 0.6;  // 踉跄期间移速 ×0.6

/**
 * 冲撞怪（charger）的蓄力冲刺参数。
 *
 * 在这套状态机之前，walker / charger / tank / bomber 四种变体跑的是
 * 完全相同的两行直线追踪 —— 差别只在 MINION_VARIANTS 的 speedMul / hpMul。
 * 也就是说「冲撞形态」只是走得快 1.9 倍，玩家读不出任何行为差异。
 *
 * 现在给它一段可读、可躲的节奏：进入距离带 → 原地抬手（方向此刻锁定）
 * → 沿锁定方向直线冲刺 → 收招长 CD。锁方向是关键：会追踪的冲刺躲不掉，
 * 只有「提交后不再修正」才让走位有意义。
 */
export const DASH_RANGE_MIN = 70;    // 太近就不冲了，直接贴身打
export const DASH_RANGE_MAX = 260;   // 太远冲不到，先走近
export const DASH_WINDUP = 0.45;     // 抬手：原地不动，给玩家反应窗口
export const DASH_TIME = 0.34;       // 冲刺持续
export const DASH_SPEED_MUL = 3.2;   // 冲刺期速度倍率
export const DASH_CD_MIN = 2.2;
export const DASH_CD_MAX = 3.6;

/** 自爆怪引信：靠近玩家点燃，烧完就地引爆（不必等被打死） */
export const FUSE_RANGE = 64;
export const FUSE_TIME = 0.85;
export const FUSE_BLAST_RADIUS = 62;

/** 敌人时间坡的强度上限（防止「打不动 → 阶段不推进 → 敌人更厚」的死局） */
export const TIME_SCALE_MAX = 6;

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
      r: Math.round(14 * (this.stats.size ?? 1)),
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

    // 玩家武器：优先「出征路线」（剑=剑气、枪=子弹、雷=雷电……），否则由基因锁等级最高的路线决定。
    // 出征路线是本作给玩家的主动构建选择 —— 开裂缝前选定用哪条路线的武器/机制，不再被元进度锁定。
    this.loadoutRoute = (this.dungeon.weaponLoadout ?? null);
    this.weapon = currentWeapon(this.save.player.geneLocks, this.loadoutRoute);
    // 玩家进化形态皮肤：优先出征路线（无激活路线则基础形态）
    this.skin = currentSkin(this.save.player.geneLocks, this.loadoutRoute);
    // 玩家路线机制：每条路线一种独特玩法（雷链/尸爆/导弹/弹幕/寄生/反击/践踏/激光/连击）
    this.routeMech = currentRouteMech(this.save.player.geneLocks, this.loadoutRoute);
    this.routeMechCd = 0;
    this.lastProjCount = 0;      // 武器进化档位（用于进化瞬间庆祝）
    this.bossWarnedStage = -1;   // 已预警 Boss 降临的阶段（张弛节奏）
    this.diffKey = this.save.player.difficultyLevel ?? 'normal';
    this.miniRushCd = 45;        // 周期性小波急袭（完成挑战后才结算基因雨奖励）
    this.ambushTimer = 15;       // 精英伏击事件倒计时（阶段中段高价值风险点）
    this.ambushDoneStage = -1;   // 已触发伏击的阶段（每阶段一次）

    // —— 已接线的 build 轴运行时状态 ——
    this.dots = [];              // 敌人持续伤害（dot）：{eid,t,period,dmg,elapsed}
    this.shield = 0;             // 护盾剩余吸收量（机甲·护盾）
    this.shieldTimer = 0;        // 护盾刷新倒计时
    this.dodgeAspdT = 0;         // 闪避后攻速加成剩余秒（侠客·身法）
    this.aspdStealT = 0;         // 汲取攻速窗口剩余秒（共生_1；命中刷新）
    this.missileSalvoT = 0;      // 周期导弹齐射计时（机甲_5 / 钢铁巨神组合技）
    this.chestSpawnedForStage = -1;  // 宝箱守卫已生成的阶段号（每阶段一只，S3-S4）
    this.chestQueue = false;     // 击破守卫后排队开箱（update 消费）
    this.playerSlowT = 0;        // 玩家踉跄剩余秒（tank 践踏；禅心 ccResist 缩短它）
    this.elementalSlows = new Map(); // 元素减速：enemyId → 剩余减速秒
  }

  /** 难度对应的时间坡分母（困难更快变强，简单更慢） */
  get timeScaleDenom() { return this.diffKey === 'hard' ? 150 : this.diffKey === 'easy' ? 360 : 240; }
  /**
   * 敌人随时间的强度倍率，**有上限**。
   *
   * 阶段推进的唯一条件是击杀精英守关者（见 killEnemy → advanceStage），
   * 而这条坡原来是 1 + time/denom 无限增长。两者相乘出一个死局：
   * 玩家一旦打不动精英，阶段就永不推进，敌人却继续变厚 ——
   * 吸血把血量锁满、既杀不掉也死不了，一局可以无限拖下去，没有胜负。
   * 封顶后强度停在一个玩家仍可能追上的水平，局面重新有解。
   * （上限 6 ≈ 普通难度 20 分钟；参照同类割草游戏的坡度也是有封顶的。）
   */
  get timeScale() { return Math.min(TIME_SCALE_MAX, 1 + this.time / this.timeScaleDenom); }
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
    this.statusTick(dt);
    this.mechanicsTick(dt);
    this.miniRushTick(dt);
    this.ambushTick(dt);
    this.chestTick(dt);
    // 宝箱开箱消费：击破守卫时若正处于其他结算流程，这里统一兜住
    if (this.chestQueue) {
      this.chestQueue = false;
      this.openChest();
    }

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
    // 踉跄（tank 践踏被震到）：移速打折，直到 playerSlowT 走完（statusTick 计时）
    const slow = this.playerSlowT > 0 ? PLAYER_SLOW_MUL : 1;
    const speed = this.stats.speed * slow;
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
      // 剧情节拍（backlog 剧情单薄）：Boss 降临附带机制提示——既是氛围也是可读预警
      if (st.closer.kind === 'boss' && this.dungeon.plane.bossDesc) {
        this.emit(`⚔ ${this.dungeon.plane.boss}：${this.dungeon.plane.bossDesc}`, 'wave');
      }
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
    // 已配齐小怪表 + 近战/远程分明的位面（武侠、机关城）：远程造型→spitter，近战→walker/charger，
    // 不串味；其余位面维持权重随机——全量硬派实测会让远程占比暴涨（各表约半数名为远程），
    // 盲走机器人 0.4 分钟即死。串味修复需逐位面调远程配比（美术战役后的独立平衡课题）。
    const HARD_ASSIGN = this.dungeon.plane.id === 'wuxia' || this.dungeon.plane.id === 'jiguan';
    const variant = isBig ? null
      : (HARD_ASSIGN
        ? (RANGED_SPRITES.has(sprite) ? 'spitter' : (this.rng() < 0.7 ? 'walker' : 'charger'))
        : this.rollVariant());
    const v = variant ? MINION_VARIANTS[variant] : null;
    // 阶段越后敌人越快（整体策划 3.2「数量 → **速度** → 复杂度 → 精度」的第二项）
    const stageSpeed = 1 + (this.stageNo - 1) * 0.09;
    // 难度随时间坡：每 4 分钟敌人血量/攻击 +1 倍（吸血鬼幸存者式难度曲线）
    const timeScale = this.timeScale;
    // 精英词缀：同一只精英换词缀就换打法（不改精英基准数值，只改行为与乘区）。
    // 概率随阶段递增（backlog #3：S1 0.2 → S3 0.5+）——S3 断档修补的一半；
    // 裂缝变异的 affixChance 仍是最高优先（玩家主动选的风险）。
    const AFFIX_CHANCE_BY_STAGE = [0.2, 0.35, 0.5, 0.6, 0.6];
    const affixChance = this.dungeon.mods?.affixChance
      ?? AFFIX_CHANCE_BY_STAGE[Math.min(this.stageNo - 1, AFFIX_CHANCE_BY_STAGE.length - 1)];
    const affix = tpl.kind === 'elite' ? rollEliteAffix(this.rng, affixChance) : null;
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
        * (v?.speedMul ?? 1) * stageSpeed * affixSpeed * (this.dungeon.mods?.enemySpeedMul ?? 1),
      spitCd: v?.ranged ? this.rng() * SPIT_CD : 0,
      // 冲撞怪：蓄力 → 锁定方向直线冲刺 → 收招。没有这套状态机的话，
      // charger 与 walker 的差别只有 speedMul，「冲撞形态」名不副实。
      dashCd: variant === 'charger' ? 1 + this.rng() * 1.5 : 0,
      dashWindup: 0,   // > 0 = 正在抬手（原地不动，玩家可读）
      dashT: 0,        // > 0 = 正在冲刺（沿锁定方向，不再追踪）
      dashVx: 0,
      dashVy: 0,
      // 自爆怪：靠近玩家就点燃引信，给出可见倒计时而不是死了才炸
      fuseT: 0,
      // 重装怪（tank）：贴近就原地蓄力践踏 —— AOE + 玩家踉跄，预警收缩圈给足 0.6s。
      // 首次践踏 CD 用固定值：不在 spawn 时消耗 rng —— 否则每只 tank 都会移位整条
      // 随机流，把「与本次改动无关」的平衡基线（单局时长/基因产出）全部抽重签。
      slamCd: variant === 'tank' ? 2.0 : 0,
      slamWindup: 0,   // > 0 = 正在蓄力（原地不动，收缩圈可读）
      // 召唤者词缀：孵化计时（仅 summoner 词缀的精英使用，其余恒 0 不触发）
      summonT: affix?.eff.summonEvery ?? 0,
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
      const timeScale = this.timeScale;
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

      // 召唤者词缀：周期在脚下孵两只杂兵（backlog #3 行为词缀）。
      // 孵化不消耗 rng、受同屏上限约束；「清场不及时就滚雪球」是它对玩家的全部要求。
      const summonEvery = e.affix?.eff.summonEvery;
      if (summonEvery) {
        e.summonT = (e.summonT ?? summonEvery) - dt;
        if (e.summonT <= 0) {
          e.summonT = summonEvery;
          if (this.enemies.length < MAX_ONSCREEN) {
            for (let k = 0; k < 2; k++) {
              this.enemies.push({
                id: this.nextId++, kind: 'minion', variant: 'walker', sprite: e.sprite ?? null,
                name: '孵体', hp: Math.max(1, Math.round(e.maxHp * 0.06)), maxHp: Math.max(1, Math.round(e.maxHp * 0.06)),
                atk: Math.max(1, Math.round(e.atk * 0.5)),
                x: e.x + (k ? 26 : -26), y: e.y, r: 9,
                speed: 110, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false, eventTag: null,
              });
            }
            this.emitFx('surge', e.x, e.y);
            this.emit('🥚 召唤者孵出了杂兵！', 'wave');
          }
        }
      }

      // 元素减速（魔法·冰霜）：被冻住的敌人移动变慢
      const slowMul = this.elementalSlows.has(e.id) ? 0.55 : 1;

      if (e.variant === 'spitter') {
        // 远程：停在射程边缘，逼玩家主动上前，不能龟在安全圈里
        const want = d > SPIT_RANGE ? 1 : d < SPIT_RANGE * 0.7 ? -1 : 0;
        e.x += (dx / d) * e.speed * slowMul * want * dt;
        e.y += (dy / d) * e.speed * slowMul * want * dt;
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
      } else if (e.variant === 'charger') {
        this.updateCharger(e, dx, dy, d, dt, slowMul);
      } else if (e.variant === 'tank') {
        this.updateTank(e, dx, dy, d, dt, slowMul);
      } else {
        e.x += (dx / d) * e.speed * slowMul * dt;
        e.y += (dy / d) * e.speed * slowMul * dt;
        // 自爆怪：贴近就点引信，烧完原地炸。给的是「看见了就该走开」的压力，
        // 而不是原来那种「死了才炸、事前零信号」的暗算。
        if (e.variant === 'bomber') this.updateBomberFuse(e, d, dt);
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
        if (this.hp <= 0 && !this.tryRevive()) {
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
    // 坚壁词缀：光环内杂兵受伤减半（backlog #3 新增行为词缀）。
    // 每帧重算标记；伤害侧在 hitFn 里读 aegis 打折——近战主伤害生效，DoT/弹幕 v1 不减免。
    const aegises = this.enemies.filter((e) => e.affix?.eff.auraMul && !e.dead);
    if (aegises.length) {
      for (const m of this.enemies) {
        if (m.kind !== 'minion' || m.dead) continue;
        m.aegis = aegises.some((w) => !w.dead && Math.hypot(m.x - w.x, m.y - w.y) <= (w.affix.eff.auraRadius ?? 180));
      }
    } else if (this.enemies.some((m) => m.aegis)) {
      for (const m of this.enemies) m.aegis = false;
    }
    // 简单互斥：同类之间轻推开，避免全部叠在一个点上
    separate(this.enemies);
  }

  /**
   * 冲撞怪：走近 → 抬手（原地、锁方向）→ 直线冲刺 → 长 CD 收招。
   * 冲刺期不再追踪玩家，所以走位真的能躲开 —— 会拐弯的冲刺等于必中，没有博弈。
   * 元素减速只作用于接近阶段；冲刺一旦离手就是「提交过的」，不吃减速。
   */
  updateCharger(e, dx, dy, d, dt, slowMul = 1) {
    if (e.dashT > 0) {
      e.dashT -= dt;
      e.x += e.dashVx * dt;
      e.y += e.dashVy * dt;
      if (e.dashT <= 0) e.dashCd = DASH_CD_MIN + this.rng() * (DASH_CD_MAX - DASH_CD_MIN);
      return;
    }
    if (e.dashWindup > 0) {
      e.dashWindup -= dt;   // 抬手期：站定不动，这就是给玩家的信号
      if (e.dashWindup <= 0) {
        // 方向在**离手这一刻**锁定，之后不再修正
        const s = e.speed * DASH_SPEED_MUL;
        e.dashVx = (dx / d) * s;
        e.dashVy = (dy / d) * s;
        e.dashT = DASH_TIME;
      }
      return;
    }
    e.dashCd -= dt;
    if (e.dashCd <= 0 && d >= DASH_RANGE_MIN && d <= DASH_RANGE_MAX) {
      e.dashWindup = DASH_WINDUP;
      this.emitFx('elite', e.x, e.y);   // 抬手闪一下，远处也读得到
      return;
    }
    // 不在冲刺窗口内：正常追击（吃元素减速）
    e.x += (dx / d) * e.speed * slowMul * dt;
    e.y += (dy / d) * e.speed * slowMul * dt;
  }

  /**
   * 重装怪（tank）：慢而硬的肉盾 + 贴脸践踏。
   * 践踏是「区域拒绝」：进入 SLAM_RANGE 就原地蓄力 0.6s（收缩圈预警），
   * 然后以自身为圆心 AOE 震地 —— 被震到的玩家掉血并踉跄减速。
   * 与 charger 同一套语言：抬手期站定 = 给玩家的可读窗口；提交后不再追踪。
   * 第 1 阶段不践踏（SLAM_STAGE_FROM）：教学期温和，复杂度按阶段引入。
   */
  updateTank(e, dx, dy, d, dt, slowMul = 1) {
    if (e.slamWindup > 0) {
      e.slamWindup -= dt;   // 蓄力期：站定不动，收缩圈收缩到脚底就是落点
      if (e.slamWindup <= 0) this.doTankSlam(e);
      return;
    }
    e.slamCd -= dt;
    if (this.stageNo >= SLAM_STAGE_FROM && e.slamCd <= 0 && d <= SLAM_RANGE) {
      e.slamWindup = SLAM_WINDUP;
      this.emitFx('elite', e.x, e.y);   // 抬手闪一下，与 charger 同一「有怪要出招」信号
      return;
    }
    // 不在践踏窗口内：正常慢速追击
    e.x += (dx / d) * e.speed * slowMul * dt;
    e.y += (dy / d) * e.speed * slowMul * dt;
  }

  /** 践踏落地：AOE 判定 + 屏幕震动级特效；被震到 → 掉血 + 踉跄（ccResist 缩短踉跄） */
  doTankSlam(e) {
    e.slamWindup = 0;   // 落地即清零，别给渲染层/探针留负残值
    e.slamCd = SLAM_CD_MIN + this.rng() * (SLAM_CD_MAX - SLAM_CD_MIN);
    // 专用事件类型：web 渲染层给位面爆裂贴图 + 镜头震动；audit:enemy 按类型计数
    this.emitFx('slam', e.x, e.y);
    const p = this.player;
    const dist = Math.hypot(p.x - e.x, p.y - e.y);
    if (dist <= SLAM_RADIUS + p.r && p.invuln <= 0) {
      this.hurtPlayer(Math.max(1, e.atk * SLAM_ATK_MUL), 0.4);
      // 踉跄：禅心（ccResist）是玩家自身的控制抗性 —— 它真正的消费者在这里
      this.playerSlowT = Math.max(this.playerSlowT, SLAM_PLAYER_SLOW * (1 - (this.stats.ccResist ?? 0)));
      this.emit('💥 重装怪震地践踏！', 'death');
    }
  }

  /**
   * 自爆怪引信：进入 FUSE_RANGE 就点燃，烧完原地引爆并自毁。
   * 离开范围会熄火，所以「后退」是有效应对 —— 原来它只在被打死时炸，
   * 事前零信号，玩家既读不到也躲不开，等于随机掉血。
   */
  updateBomberFuse(e, d, dt) {
    if (d > FUSE_RANGE * 1.6) { e.fuseT = 0; return; }
    if (d > FUSE_RANGE) return;              // 在缓冲带里维持现状，不点也不灭
    if (e.fuseT === 0) this.emit('💣 自爆怪贴近了！', 'death');
    e.fuseT += dt;
    if (e.fuseT < FUSE_TIME) return;

    const p = this.player;
    if (Math.hypot(p.x - e.x, p.y - e.y) < FUSE_BLAST_RADIUS && p.invuln <= 0) {
      this.hurtPlayer(Math.max(1, e.atk * 1.5), 0.4);
    }
    this.emitFx('burst', e.x, e.y);
    e.hp = 0;
    e.dead = true;   // 自毁不计入击杀，不给基因 —— 躲开它才是「赢」
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

    // 侠客·身法：闪避后的攻速窗口叠加
    const dodgeAspdBonus = this.dodgeAspdT > 0 ? (1 + (this.stats.dodgeAspd ?? 0)) : 1;
    // 共生·汲取：命中夺取攻速的窗口（命中时刷新，见 hitFn）
    const stealBonus = this.aspdStealT > 0 ? (1 + (this.stats.aspdSteal ?? 0)) : 1;
    p.attackCd = 1 / Math.max(0.2, this.stats.aspd * ATTACK_RATE * (p.berserk > 0 ? BERSERK_MUL : 1) * dodgeAspdBonus * stealBonus);
    p.facing = best.x >= p.x ? 1 : -1;

    // 连击/连招（侠客·剑气流）：每次命中累积
    this.combo.hits += 1;
    let comboMul = 1;
    if (this.combo.dmgPct && this.combo.hits % this.combo.every === 0) {
      comboMul *= 1 + this.combo.dmgPct;
      // 血脉武者（侠客+山海组合技）：连招触发时体型增长——清场半径与身板一起涨，
      // 上限 ×2 防失控；size 影响攻击溅射半径（见下方 splash 计算）
      if (this.hasCombo('xuemai_wuzhe') && (this.stats.size ?? 1) < 2) {
        this.stats.size = Math.min(2, (this.stats.size ?? 1) + 0.05);
        p.r = Math.round(14 * this.stats.size);
        this.emitFx('surge', p.x, p.y);
      }
    }
    if (this.combo.rampMax) comboMul *= 1 + Math.min(this.combo.rampMax, this.combo.hits * 0.05);

    // 攻击形状 = 武器自带属性：single单体 / line直线 / circle环绕 / aoe溅射
    const pattern = this.weapon.pattern ?? 'aoe';
    // 武器进化：等级越高，伤害越强、范围越大（力量幻想核心）
    const lvlMul = 1 + this.geneStep * 0.06;                       // 每级 +6% 伤害
    const splash = 34 * this.stats.range + this.stats.aoe * 40 + this.geneStep * 3;
    const isCrit = this.rng() < this.stats.crit;
    const berserk = p.berserk > 0 ? BERSERK_MUL : 1;
    let dmg = calcDamage(this.stats.atk * berserk * comboMul * lvlMul, 1, isCrit, 0, this.stats.critDmg ?? 0);
    // 连招·剑气迸发（backlog #6）：爆发瞬间迸发周身剑气——爆发从「增伤」变「增伤+扫一圈」。
    // 放在 dmg 计算之后：迸发伤害吃同一套暴击/成长乘区
    if ((this.mechLvl.wave ?? 0) > 0 && this.combo.dmgPct && this.combo.hits % this.combo.every === 0) {
      for (const o of [...this.enemies]) {
        if (o.dead) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) <= splash + o.r) {
          o.hp -= dmg * 0.6;
          o.hitFlash = 0.12;
          if (o.hp <= 0) this.killEnemy(o);
        }
      }
      this.emitFx('sword_hit', p.x, p.y);
    }
    if (this.mech?.type === 'armor') dmg *= (1 - this.mech.factor);   // 功德：金身减伤
    let healed = 0;
    const execBonus = this.stats.execute ?? 0;
    const hitFn = (e) => {
      // 共生·汲取：命中即刷新攻速夺取窗口（结算见 attackCd 的 stealBonus）
      if (this.stats.aspdSteal) this.aspdStealT = Math.max(this.aspdStealT, 0.5);
      // 斩杀本能：残血目标吃额外伤害（阈值可由共鸣放宽），奖励「补刀收割」的打法
      const execThreshold = this.stats.executeThreshold ?? 0.3;
      let eDmg = execBonus > 0 && e.hp / Math.max(1, e.maxHp) < execThreshold ? dmg * (1 + execBonus) : dmg;
      // 巨化·踏碎：对精英/位面之主增伤（攻坚 build 的一条轴）
      const vsElite = this.stats.vsEliteDmgPct ?? 0;
      if (vsElite > 0 && e.kind !== 'minion') eDmg *= 1 + vsElite;
      // 铁壁词缀：减伤（换来更慢的移动，用走位可以拉扯）
      eDmg *= e.affix?.eff.dmgTaken ?? 1;
      // 坚壁光环（召唤者批次新增词缀）：光环内杂兵受伤减半——优先处理坚壁精英
      if (e.aegis) eDmg *= 0.5;
      e.hp -= eDmg;
      e.hitFlash = 0.12;
      healed += eDmg;
      // 击杀后目标已消失，不再叠状态
      if (e.hp > 0) {
        // 尸毒（持续伤害）：命中叠 DoT
        const dotMul = this.stats.dotMul ?? 0;
        if (dotMul > 0) this.applyDot(e, this.stats.atk * dotMul, this.stats.dotDuration ?? 3);
        // 元素附加（魔法）：灼烧（DoT）+ 冰霜减速（固定时长；
        // ccResist 是玩家自身的控制抗性，与敌人被减速的时长无关，别在这里用）
        const elem = this.stats.elemental ?? 0;
        if (elem > 0) {
          this.applyDot(e, this.stats.atk * elem * 0.6, this.stats.dotDuration ?? 2);
          this.elementalSlows.set(e.id, 1.5);
        }
        // 寒噬之息（属性通道动词，backlog #9）：命中附带冰霜减速
        // （时长克制在 0.6s：减速会改变盲走机器人的接触节奏，实测过长会把怪潮压塌）
        const chill = this.stats.chill ?? 0;
        if (chill > 0) {
          this.elementalSlows.set(e.id, Math.max(this.elementalSlows.get(e.id) ?? 0, Math.min(0.6, 0.4 + chill * 0.2)));
        }
      }
      if (e.hp <= 0) this.killEnemy(e);
      // 渡劫·雷链弹射：命中后在敌人间跳跃（构筑强化可 +跳数/+伤害）
      if (this.routeMech === 'chain') {
        const jumps = 3 + (this.mechLvl.jumps ?? 0) + (this.stats.chainJumps ?? 0);
        const chainDmg = 0.5 * (1 + (this.mechLvl.dmg ?? 0));
        // 渡劫_3「雷链」提供 chainDecay：每跳伤害按保留比例递减（默认 1 = 不衰减，
        // 与接线前的平坦行为完全一致——不削弱任何既有 Build）。
        // 「过载」强化：弹射不衰减——与「雷链」的逐跳衰减互为构筑取舍（backlog #6）。
        const decay = this.mechLvl.noDecay ? 1 : (this.stats.chainDecay || 1);
        let last = e;
        for (let j = 0; j < jumps; j++) {
          let nb = null; let nd = Infinity;
          for (const o of this.enemies) {
            if (o === last || o.dead || o.hp <= 0) continue;
            const dd2 = Math.hypot(o.x - last.x, o.y - last.y);
            if (dd2 < nd && dd2 <= 140) { nd = dd2; nb = o; }
          }
          if (!nb) break;
          const jumpDmg = dmg * chainDmg * Math.pow(decay, j);
          nb.hp -= jumpDmg;
          nb.hitFlash = 0.12;
          this.damageNums.push({ x: nb.x, y: nb.y - 24, v: Math.round(jumpDmg), crit: false, life: 0.9 });
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
    // 弹幕·贯穿（backlog #6）：多发弹幕的伤害叠加到主目标——「多一发」从视觉变成真 DPS
    if (this.routeMech === 'multishot' && (this.mechLvl.pierce ?? 0) > 0 && projCount > 1 && best.hp > 0) {
      const pierceDmg = dmg * 0.25 * (projCount - 1);
      best.hp -= pierceDmg;
      healed += pierceDmg;
      this.damageNums.push({ x: best.x, y: best.y - 34, v: Math.round(pierceDmg), crit: false, life: 0.7 });
      if (best.hp <= 0) this.killEnemy(best);
    }
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
        tier: Math.floor(this.geneStep / 6),   // 进化档位：渲染层据此缩放弹体
      });
    }
    // 侠客_5「剑气」（backlog #1 还债）：每次攻击追加一道攻×rangedMul 的剑气伤害，
    // 配视觉弹体（effects/sword_qi）。此前 rangedMul 是聚合了却没有消费者的死字段。
    if ((this.stats.rangedMul ?? 0) > 0 && best.hp > 0 && this.state === RunState.FIGHTING) {
      const qi = dmg * this.stats.rangedMul;
      best.hp -= qi;
      best.hitFlash = Math.max(best.hitFlash, 0.1);
      healed += qi;
      this.playerShots.push({
        x: p.x + Math.cos(baseAng) * 14, y: p.y + Math.sin(baseAng) * 14,
        vx: Math.cos(baseAng) * 420, vy: Math.sin(baseAng) * 420,
        life: 0.3, sprite: 'sword_qi',
      });
      if (best.hp <= 0) this.killEnemy(best);
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
        // 导弹·爆破弹头（backlog #6）：命中溅射周围敌人（半伤）
        if (this.mechLvl.blast) {
          for (const o of [...this.enemies]) {
            if (o === e || o.dead || o.kind === 'boss') continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 60) {
              o.hp -= this.stats.atk * mDmg * 0.5;
              o.hitFlash = 0.1;
              if (o.hp <= 0) this.killEnemy(o);
            }
          }
        }
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
          // 践踏·震慑（backlog #6）：被震荡的敌人减速 1.2s——跑不掉才是真震慑
          if (this.mechLvl.stagger && e.hp > 0) {
            this.elementalSlows.set(e.id, Math.max(this.elementalSlows.get(e.id) ?? 0, 1.2));
          }
          if (e.hp <= 0) this.killEnemy(e);
        }
      }
      this.emitFx('burst', p.x, p.y);
      this.emitFx('surge', p.x, p.y);
    } else if (this.routeMech === 'laser') {
      // 奇技·机关激光：直线贯穿（构筑可 +宽/+伤害/+折射）
      const lW = 40 * (1 + (this.mechLvl.width ?? 0));
      const lDmg = 1.5 * (1 + (this.mechLvl.dmg ?? 0));
      const baseAng = p.facing > 0 ? 0 : Math.PI;
      const fireBeam = (ang) => {
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
      };
      fireBeam(baseAng);
      // 激光·折射（backlog #6）：向后折射成双束——被包围时收益翻倍
      if (this.mechLvl.refract) {
        fireBeam(baseAng + Math.PI);
        this.emitFx('laser', p.x, p.y);
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
    // 侠客·身法：闪避后 1s 攻速提升
    if (this.stats.dodgeAspd) this.dodgeAspdT = 1;
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
    const rows = ['activeA', 'activeB'].map((key) => {
      const slot = slots[key];
      if (!slot || slot.kind !== 'active') return null;
      const skill = findSkill(slot.skillId) ?? findHiddenSkill(slot.skillId);
      if (!skill) return null;
      const cd = (skill.cd ?? 30) * (this.stats.cooldown ?? 1);
      const left = Math.max(0, this.skillCd.get(slot.skillId) ?? 0);
      return { key, name: skill.name, left, cd, ready: left <= 0 };
    }).filter(Boolean);
    if (this.legendActive) {
      const cd = (this.legendActive.cd ?? 30) * (this.stats.cooldown ?? 1);
      const left = Math.max(0, this.skillCd.get(this.legendActive.id) ?? 0);
      rows.push({ key: 'legend', name: `★${this.legendActive.name}`, left, cd, ready: left <= 0 });
    }
    return rows;
  }

  /**
   * 主动技能自动释放。
   * 单摇杆游戏里主动技通常**自动施放**（整体策划 2.3 只给了移动 + 吞噬两个操作），
   * 所以主动槽里的技能一到 CD 就打出去，玩家的决策发生在三选一而不是操作上。
   */
  updateActiveSkills(dt) {
    const slots = this.save.player.skillSlots;
    const actives = ['activeA', 'activeB']
      .map((key) => slots[key])
      .filter((slot) => slot && slot.kind === 'active')
      .map((slot) => ({ id: slot.skillId, skill: findSkill(slot.skillId) ?? findHiddenSkill(slot.skillId) }));
    // 出征传说（主动型）不占槽位，与槽内主动技一起进自动施放循环
    if (this.legendActive) actives.push({ id: this.legendActive.id, skill: this.legendActive });
    for (const { id, skill } of actives) {
      if (!skill) continue;
      // 冷却缩减（装备词条 + 传承被动）统一走 stats.cooldown 乘区
      const cd = (skill.cd ?? 30) * (this.stats.cooldown ?? 1);
      const left = (this.skillCd.get(id) ?? 0) - dt;
      if (left > 0) { this.skillCd.set(id, left); continue; }
      this.skillCd.set(id, cd);
      this.castSkill(skill);
    }
  }

  /** 释放一个主动技：按 eff 结算全屏/范围伤害、治疗、无敌、增益 */
  castSkill(skill) {
    const p = this.player;
    const e = skill.eff ?? {};

    // —— 终极形态技（form 标记：高达合体 / 顶天立地）——
    // 变身用既有狂暴与护盾系统按时长兑现，不再永久改写属性（曾致双计/常驻 +100% 生命）
    if (e.form && e.duration) {
      if (e.allStatsPct) {
        p.berserk = Math.max(p.berserk, e.duration);   // 攻击增幅走既有狂暴
        this.shield = Math.max(this.shield, this.stats.maxHp * e.allStatsPct * 0.75);   // 机甲装甲
        this.emit('🤖 高达合体！', 'win');
      }
      if (e.hpPct && e.aoe) {
        // 「生命 +100%」以护盾兑现；「全屏攻击」对全场敌人造成攻 ×2.5
        this.shield = Math.max(this.shield, this.stats.maxHp * e.hpPct * 0.9);
        for (const en of [...this.enemies]) {
          en.hp -= this.stats.atk * 2.5;
          en.hitFlash = 0.15;
          if (en.hp <= 0) this.killEnemy(en);
          if (this.state !== RunState.FIGHTING) return;
        }
        this.emit('🏔 顶天立地！', 'win');
      }
      this.emitFx('surge', p.x, p.y);
      return;
    }

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
      // 召唤类：真随从（复用寄生友军 AI）+ 保留一次范围清扫作为「落地爆发」。
      // inherit / summonDuration 此前是死字段——现在决定随从的继承属性与存在时长。
      // 注意 qiji 的召唤技是主动技：装备时不经 applySkillEff，字段直接从 eff 读。
      const n = Math.max(1, Math.round(e.summon));
      const inherit = Math.max(0.3, e.inherit ?? this.stats.inherit ?? 0.3);
      const life = e.summonDuration ?? this.stats.summonDuration ?? 6;
      for (let k = 0; k < n; k++) {
        this.mechAllies.push({
          x: p.x + (k - (n - 1) / 2) * 26,
          y: p.y + 20,
          atk: this.stats.atk * inherit,
          life,
          anim: 0,
          // 奇法傀儡（魔法+奇巧组合技）：机关单位继承元素附加——攻击附带冰霜减速
          el: this.hasCombo('qifa_kuilei') && (this.stats.elemental ?? 0) > 0,
        });
      }
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

  killEnemy(e, { fromBurst = false } = {}) {
    e.dead = true;
    this.kills += 1;
    if (e.kind === 'minion') this.minionKills += 1;
    if (e.kind === 'elite') this.elitesKilled = (this.elitesKilled ?? 0) + 1;   // 猎头协议进度
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
    if (eventTag === 'chest') this.chestQueue = true;   // 击破守卫 → 排队开宝箱（update 消费）
    if (eventTag === 'miniRush' && !this.enemies.some((o) => o !== e && !o.dead && o.eventTag === eventTag)) {
      this.rewardMiniRush();
    }

    // 死亡帧特效：渲染层据此播放死亡动画
    this.deaths.push({ x: e.x, y: e.y, kind: e.kind, variant: e.variant, id: e.id, sprite: e.sprite, facing: e.x < this.player.x ? 1 : -1, t: 0 });

    // 位面机制：尸爆连锁 / 寄生反水（挂在击杀上）
    const mech = this.mech;
    // 尸生共融（丧尸+共生组合技）：尸爆范围 +50%
    const blastMul = this.hasCombo('shisheng_gongrong') ? 1.5 : 1;
    if (mech?.type === 'corpseBlast' && e.kind !== 'boss') {
      for (const o of [...this.enemies]) {
        if (o === e || o.dead) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < mech.radius * blastMul) {
          o.hp -= e.atk * mech.mul;
          o.hitFlash = 0.15;
          // 尸爆·毒云（backlog #6）：波及的幸存者沾染尸毒
          if (this.mechLvl.cloud && o.hp > 0) this.applyDot(o, this.stats.atk * 0.4, 3);
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
      const cR = 70 * (1 + (this.mechLvl.radius ?? 0)) * blastMul;   // 尸生共融：范围 +50%
      const cDmg = 1.4 * (1 + (this.mechLvl.dmg ?? 0));
      for (const o of [...this.enemies]) {
        if (o === e || o.dead) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < cR) {
          o.hp -= this.stats.atk * cDmg;
          o.hitFlash = 0.15;
          // 尸爆·毒云（backlog #6）：波及的幸存者沾染尸毒
          if (this.mechLvl.cloud && o.hp > 0) this.applyDot(o, this.stats.atk * 0.4, 3);
          if (o.hp <= 0) this.killEnemy(o);   // 尸爆连锁
        }
      }
      this.emitFx('burst', e.x, e.y);
    }
    if (this.routeMech === 'parasite' && e.kind === 'minion' && this.rng() < 0.06 + (this.mechLvl.chance ?? 0)) {
      this.mechAllies.push({ x: e.x, y: e.y, atk: this.stats.atk * 0.8, life: 6, anim: 0 });
      this.emitFx('surge', e.x, e.y);
    }

    // 寄生（共生_3）：击杀精英概率反水一只友军（此前 parasiteChance 是死字段）
    if (e.kind === 'elite' && (this.stats.parasiteChance ?? 0) > 0 && this.rng() < this.stats.parasiteChance) {
      this.mechAllies.push({ x: e.x, y: e.y, atk: this.stats.atk * 0.8, life: 8, anim: 0 });
      this.emit('🩸 寄生：精英倒戈助你', 'gene');
      this.emitFx('surge', e.x, e.y);
    }

    // 蚀爆体（属性通道动词，backlog #9）：击杀小范围爆炸——与尸爆同构但范围/伤害克制。
    // 爆炸击杀不再连锁（fromBurst）：否则「清场润滑」会滚成清屏器，把怪潮压力打塌
    //（实测 shanhai 盲走局同屏峰值 47→24，触发 horde 守护测试）。
    const killBurst = this.stats.killBurst ?? 0;
    if (killBurst > 0 && e.kind === 'minion' && !fromBurst) {
      const kbR = 40;
      for (const o of [...this.enemies]) {
        if (o === e || o.dead || o.kind === 'boss') continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < kbR) {
          o.hp -= this.stats.atk * killBurst;
          o.hitFlash = 0.12;
          if (o.hp <= 0) this.killEnemy(o, { fromBurst: true });
        }
      }
      this.emitFx('burst', e.x, e.y);
    }

    if (e.kind === 'boss') {
      this.enemies = this.enemies.filter((x) => !x.dead);
      this.onKill(e);            // 父类：BOSS 掉落 + 置为 WON
      return;
    }

    // 魔法·法力共鸣：每次击杀按比例削减剩余主动冷却（高速率的割草直接喂给技能循环）
    const refund = this.stats.killCdRefund ?? 0;
    if (refund > 0 && this.skillCd.size) {
      for (const [id, left] of this.skillCd) {
        this.skillCd.set(id, left * (1 - Math.min(refund, 0.5)));
      }
    }

    const kindForDrop = e.kind === 'elite' ? 'stageBoss' : 'minion';
    const drop = rollKillDrop(this.dungeon, this.save, kindForDrop, this.rng);
    if (drop.gear) this.addGear(drop.gear);
    // 丧尸·腐肉：击杀额外基因（掉尸体时按倍率放大）
    const geneBonus = this.stats.geneBonus ?? 0;
    const genes = geneBonus > 0 ? Math.max(1, Math.round(drop.genes * (1 + geneBonus))) : drop.genes;
    // 基因不直接入账，先掉成尸体，玩家靠近才吸（整体策划 4.2）
    this.orbs.push({ x: e.x, y: e.y, genes, bob: this.rng() * 6 });

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
    // 阶段叙事节拍（backlog 剧情单薄）：关键阶段注入位面级氛围文本
    const plane = this.dungeon.plane;
    if (this.stageNo === 3) {
      this.emit(`⚔ ${plane.theme}深处，真正的考验开始了……`, 'wave');
    } else if (this.stageNo === 5) {
      this.emit(`☠ ${plane.boss}在等你。这是最后一战。`, 'death');
    }
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
        if (this.hp <= 0 && !this.tryRevive()) {
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

  // ===== 战斗状态轴（已接线的 build 效果：DoT / 护盾 / 元素减速 / 闪避攻速）=====

  /**
   * 每帧结算持续类效果：
   *  · 护盾（机甲·护盾）每 shieldEvery 秒生成，先吸收伤害
   *  · DoT（尸毒 / 元素灼烧）对敌人按秒止血
   *  · 元素减速（冰）随时间解除
   *  · 闪避后攻速（侠客·身法）随时间解除
   */
  statusTick(dt) {
    const p = this.player;
    // 护盾刷新
    const shieldEvery = this.stats.shieldEvery;
    if (this.stats.shieldMul && shieldEvery) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldTimer = shieldEvery;
        this.shield = this.stats.atk * this.stats.shieldMul;
        this.emitFxMax('shield', p.x, p.y);
      }
    }
    // 护盾被持续消耗时也随时间微降（不无限累积到 BOSS 战）
    if (this.shield > 0 && !this.stats.shieldEvery) this.shield = 0;

    // 计时型 buff/状态必定随时间走（与 DoT 有无无关，避免「没毒就不减速」）
    this.dodgeAspdT = Math.max(0, this.dodgeAspdT - dt);
    this.aspdStealT = Math.max(0, this.aspdStealT - dt);
    this.playerSlowT = Math.max(0, this.playerSlowT - dt);

    // 周期导弹齐射（机甲_5 被动；钢铁巨神组合技在狂暴期间加速为每 3s 一轮）
    const berserkSalvo = this.hasCombo('gangtie_jushen') && this.player.berserk > 0;
    let salvoEvery = this.stats.missileEvery ?? Infinity;
    if (berserkSalvo) salvoEvery = Math.min(salvoEvery, 3);
    if (Number.isFinite(salvoEvery)) {
      this.missileSalvoT += dt;
      if (this.missileSalvoT >= salvoEvery) {
        this.missileSalvoT = 0;
        this.fireMissileSalvo();
      }
    }
    if (this.elementalSlows.size) {
      for (const [id, t] of this.elementalSlows) {
        const nt = t - dt;
        if (nt <= 0) this.elementalSlows.delete(id);
        else this.elementalSlows.set(id, nt);
      }
    }

    // DoT：对每个受毒/灼烧敌人每秒结算一次
    if (this.dots.length === 0) return;
    const alive = new Map(this.enemies.map((e) => [e.id, e]));
    const keep = [];
    for (const d of this.dots) {
      d.elapsed += dt;
      const e = alive.get(d.eid);
      if (!e || e.dead) continue;
      while (d.elapsed >= d.period) {
        d.elapsed -= d.period;
        const tick = d.dmg;
        e.hp -= tick;
        e.hitFlash = Math.max(e.hitFlash, 0.08);
        this.damageNums.push({ x: e.x, y: e.y - 26, v: Math.round(tick), crit: false, dot: true, life: 0.7 });
        this.emitFxMin('poison', e.x, e.y);
        if (e.hp <= 0) this.killEnemy(e);
      }
      d.t -= dt;
      if (d.t > 0) keep.push(d);
    }
    this.dots = keep;
  }

  /** 给敌人叠一段持续伤害（不同来源合并取最大） */
  applyDot(e, dmg, duration) {
    const id = e.id;
    const old = this.dots.find((d) => d.eid === id);
    // 同源刷新；不同源也合并（取最高 dps 的那段）
    const period = 1;
    if (old) {
      old.dmg = Math.max(old.dmg, dmg);
      old.t = Math.max(old.t, duration);
    } else {
      this.dots.push({ eid: id, dmg, t: duration, period, elapsed: 0 });
    }
  }

  /** 效果特效减负：同帧重复不刷屏 */
  emitFxMax(type, x, y) {
    if (this.hits.length < 24) this.emitFx(type, x, y);
  }
  emitFxMin(type, x, y) {
    if (this.hits.length < 30) this.emitFx(type, x, y);
  }

  /**
   * 周期导弹齐射（机甲_5「导弹」被动 / 钢铁巨神组合技狂暴态）：
   * 打最近的最多 3 个目标，单发 atk × missileMul。
   * 只在该玩家拥有相应内容时才会被调度——不改变无此技能局的任何行为与随机流。
   */
  fireMissileSalvo() {
    const mul = this.stats.missileMul ?? 1.5;
    const px = this.player.x; const py = this.player.y;
    const targets = [...this.enemies]
      .filter((e) => !e.dead)
      .sort((a, b2) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b2.x - px, b2.y - py))
      .slice(0, 3);
    for (const t of targets) {
      t.hp -= this.stats.atk * mul;
      t.hitFlash = 0.15;
      this.emitFx('burst', t.x, t.y);
      if (t.hp <= 0) this.killEnemy(t);
    }
    if (targets.length) this.emit('🚀 导弹齐射', 'learn');
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

    // 位面机制随阶段收紧（backlog #5）：S1 教学期不启用；S2 起频率按表加速，
    // S5 达 2 倍——位面身份参与阶段曲线，「考验」阶段开始有位面自己的声音。
    const MECH_STAGE_ACCEL = [1, 1.15, 1.3, 1.6, 2];
    if (false) return; // TEMP-ISO
    const accel = MECH_STAGE_ACCEL[Math.min(this.stageNo - 1, MECH_STAGE_ACCEL.length - 1)];

    if (m.type === 'mix') {
      if (this.mechTimer < m.interval / accel) return;
      this.mechTimer = 0;
      const picks = ['lightning', 'bulletHell', 'missile', 'laser', 'stomp'];
      this.castMech(picks[Math.floor(this.rng() * picks.length)]);
      return;
    }

    if (this.mechTimer < m.interval / accel) return;
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
    const raw = dmg * (1 - this.stats.dmgReduct);
    // 护盾（机甲·护盾）：先吸收伤害，破盾后剩余才掉血
    const bleed = raw - this.shield;
    this.shield = Math.max(0, this.shield - raw);
    if (this.shield === 0 && bleed > 0) this.emitFx('shield', p.x, p.y);
    const d = bleed > 0 ? Math.max(1, bleed) : 0;
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
    // 渡劫·雷枢护体：受击概率引雷反击最近敌人
    const counterChance = this.stats.counterChance ?? 0;
    if (counterChance > 0 && this.rng() < counterChance) {
      let nb = null; let bd = Infinity;
      for (const o of this.enemies) {
        if (o.dead) continue;
        const dd = Math.hypot(o.x - p.x, o.y - p.y);
        if (dd < bd) { bd = dd; nb = o; }
      }
      const cMul = this.stats.counterMul ?? 0.5;
      if (nb && bd <= 260) {
        nb.hp -= this.stats.atk * cMul;
        nb.hitFlash = 0.15;
        this.damageNums.push({ x: nb.x, y: nb.y - 24, v: Math.round(this.stats.atk * cMul), crit: true, life: 0.9 });
        if (nb.hp <= 0) this.killEnemy(nb);
        this.emitFx('lightning', nb.x, nb.y);
      }
    }
    // 金身业力 / 天雷护体：把所受伤害按比例弹给最近的敌人
    const reflect = this.stats.reflect ?? 0;
    if (reflect > 0 && d > 0) {
      let nb = null; let bd = Infinity;
      for (const o of this.enemies) {
        if (o.dead) continue;
        const dd = Math.hypot(o.x - p.x, o.y - p.y);
        if (dd < bd) { bd = dd; nb = o; }
      }
      if (nb && bd <= 160) {
        nb.hp -= d * reflect;
        nb.hitFlash = 0.12;
        // 金身·震慑（backlog #6）：反震命中的敌人被震得减速
        if (this.mechLvl.stagger) this.elementalSlows.set(nb.id, Math.max(this.elementalSlows.get(nb.id) ?? 0, 1.2));
        if (nb.hp <= 0) this.killEnemy(nb);
        this.emitFx('burst', nb.x, nb.y);
      }
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
    if (this.hp <= 0 && !this.tryRevive()) {
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
        // 奇法傀儡：继承元素附加的机关单位，啃咬附带冰霜减速
        if (a.el) this.elementalSlows.set(best.id, 1.5);
        if (best.hp <= 0) {
          this.killEnemy(best);
          // 寄生·再寄生（backlog #6）：被友军啃死的怪原地再寄生，滚雪球上限 8 只。
          // rng 只在装备了 rebind 的局才会消耗——不影响任何既有平衡基线
          if ((this.mechLvl.rebind ?? 0) > 0 && this.mechAllies.length < 8 && this.rng() < 0.35) {
            this.mechAllies.push({ x: best.x, y: best.y, atk: a.atk, life: a.life, anim: 0 });
            this.emitFx('surge', best.x, best.y);
          }
        }
      }
    }
    if (this.mechAllies.some((a) => a.life <= 0)) this.mechAllies = this.mechAllies.filter((a) => a.life > 0);
  }

  /**
   * 宝箱事件（backlog #4）：S3-S4 各出现一只宝箱守卫，击破 → 高稀有度三选一。
   * 「释放」节拍：S3 考验（守卫+词缀）、开箱即释放——补上阶段曲线的断档。
   * 守卫复用涌潮生成与 eventTag 机制；开箱复用 CHOOSING——零新增状态。
   */
  chestTick(dt) {
    void dt;
    if (this.stageNo !== 3 && this.stageNo !== 4) return;
    if (this.chestSpawnedForStage === this.stageNo) return;
    if (this.state !== RunState.FIGHTING) return;
    const st = this.stage;
    this.chestSpawnedForStage = this.stageNo;
    this.spawnSurge(
      { name: '🧰 宝箱守卫', hp: Math.round(st.minion.hp * 4), atk: st.minion.atk },
      1,
      'chest',
    );
    this.emit('🧰 宝箱守卫出现了！击破它可获得高稀有进化', 'wave');
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
