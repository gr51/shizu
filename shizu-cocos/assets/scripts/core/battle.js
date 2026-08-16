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

/** 战场尺寸（设计分辨率内的逻辑坐标，横屏 960×640 减去 HUD） */
export const ARENA = { w: 960, h: 560 };

/** 基础数值（整体策划 2.3） */
export const SUCK_RADIUS = 40;        // 基因吸取半径 40pt
export const ATTACK_RANGE = 150;      // 自动索敌基础射程
/** 基础攻击频率（次/秒）。割草要「不停地砍」，1.6 太慢，清不动怪潮 */
export const ATTACK_RATE = 3.0;
export const INVULN_ON_HIT = 0.6;     // 受击后无敌帧（秒）
/**
 * 接触伤害系数：被怪蹭到时按敌人攻击力的这个比例结算一次。
 * 割草里伤害来自「被围」，单次必须很轻，靠数量累积成压力 ——
 * 标定方式：用 tools/probe-battle.mjs 的**盲走机器人**（原地绕圈、不会闪避）扫参数：
 *   0.30 → 通关 100%（太软）  0.55 → 88%  0.65 → 见下  0.80 → 50%  1.10 → 13%
 * 取 0.65 ——机器人打到第 4 阶段左右，真人会明显更好；
 * 剩下的由 dynFactor（每局 ±5~15%）与难度等级自动收敛。
 */
export const CONTACT_DPS_SCALE = 0.65;

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
      state: 'idle',   // idle | walk | attack
      anim: 0,
    };

    this.enemies = [];        // 覆盖父类的数组，元素带 x/y
    this.orbs = [];           // 基因尸体
    this.hits = [];           // 特效请求（渲染层消费后清空）
    this.time = 0;            // 本局已过秒数（父类 elapsed 同步）
    this.spawnCarry = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.stageElapsed = 0;
    this.nextId = 1;
  }

  get onScreen() { return this.enemies.length; }

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
    dt = Math.min(dt, 1 / 20);          // 防止切后台后一帧跳太多
    this.time += dt;
    this.elapsed = Math.round(this.time);
    this.stageElapsed += dt;

    this.updatePlayer(dt, input);
    this.spawnTick(dt);
    this.updateEnemies(dt);
    this.updateAttack(dt);
    this.updateOrbs(dt);

    if (this.stats.regen > 0) {
      this.heal(this.stats.maxHp * this.stats.regen * dt, '再生', true);
    }
  }

  updatePlayer(dt, input) {
    const p = this.player;
    const speed = this.stats.speed;
    const len = Math.hypot(input.mx, input.my);
    const nx = len > 1 ? input.mx / len : input.mx;
    const ny = len > 1 ? input.my / len : input.my;

    p.vx = nx * speed;
    p.vy = ny * speed;
    p.x = clamp(p.x + p.vx * dt, p.r, ARENA.w - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, ARENA.h - p.r);

    if (Math.abs(nx) > 0.01) p.facing = nx > 0 ? 1 : -1;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);

    const moving = len > 0.05;
    if (p.attackCd > 0.18) p.state = 'attack';
    else p.state = moving ? 'walk' : 'idle';
    p.anim += dt * (moving ? 10 : 6);
  }

  /** 按 dungeon 时间轴刷怪（持续流 + 涌潮 + 阶段收尾单位） */
  spawnTick(dt) {
    const st = this.stage;

    this.spawnCarry += st.spawnRate * dt;
    let n = Math.floor(this.spawnCarry);
    this.spawnCarry -= n;

    while (this.surgeDone < st.surges.length && this.stageElapsed >= st.surges[this.surgeDone].atSec) {
      const surge = st.surges[this.surgeDone];
      n += surge.count;
      this.surgeDone += 1;
      this.emit(`⚠ 涌潮！${surge.count} 只 ${st.minionName} 涌出`, 'wave');
      this.emitFx('surge', ARENA.w / 2, ARENA.h / 2);
    }

    if (!this.closerSpawned && this.stageElapsed >= st.closerAt) {
      this.closerSpawned = true;
      this.spawnEnemy(st.closer, true);
      if (st.extraElite) this.spawnEnemy({ ...st.closer, name: `${st.closer.name}·其二` }, true);
      this.emit(
        st.closer.kind === 'boss'
          ? `【位面之主】${st.closer.name} 降临`
          : `【${st.closer.name}】出现`,
        'death',
      );
    }

    const room = MAX_ONSCREEN - this.enemies.length;
    for (let i = 0; i < Math.min(n, room); i++) {
      this.spawnEnemy({
        kind: 'minion', name: st.minionName, hp: st.minion.hp, atk: st.minion.atk,
      }, false);
    }
  }

  /** 从场地边缘外侧刷入（割草的怪从四面涌来，不凭空出现在脸上） */
  spawnEnemy(tpl, isCloser) {
    const edge = Math.floor(this.rng() * 4);
    const m = 24;
    let x; let y;
    if (edge === 0) { x = this.rng() * ARENA.w; y = -m; }
    else if (edge === 1) { x = ARENA.w + m; y = this.rng() * ARENA.h; }
    else if (edge === 2) { x = this.rng() * ARENA.w; y = ARENA.h + m; }
    else { x = -m; y = this.rng() * ARENA.h; }

    const isBig = tpl.kind !== 'minion';
    this.enemies.push({
      id: this.nextId++,
      kind: tpl.kind,
      name: tpl.name,
      hp: tpl.hp,
      maxHp: tpl.hp,
      atk: tpl.atk,
      x, y,
      r: isBig ? (tpl.kind === 'boss' ? 40 : 24) : 12,
      speed: isBig ? (tpl.kind === 'boss' ? 55 : 75) : 95 + this.rng() * 25,
      hitFlash: 0,
      anim: this.rng() * 10,
      isCloser,
    });
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.anim += dt * 8;

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;

      // 接触伤害（无敌帧内免疫）
      if (d < p.r + e.r && p.invuln <= 0) {
        const dmg = Math.max(1, e.atk * CONTACT_DPS_SCALE * (1 - this.stats.dmgReduct));
        this.hp -= dmg;
        p.invuln = INVULN_ON_HIT;
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
    // 简单互斥：同类之间轻推开，避免全部叠在一个点上
    separate(this.enemies);
  }

  /** 自动索敌：每 1/攻速 秒打一次射程内最近的敌人 */
  updateAttack(dt) {
    const p = this.player;
    if (p.attackCd > 0) return;

    const range = ATTACK_RANGE * this.stats.range;
    // 索敌优先级：**大件优先**。同屏 60 只杂兵时若只打最近的，
    // 精英/位面之主永远轮不到，阶段推不动（实测卡死 20 分钟）。
    // 现实里自动索敌也该优先大威胁 —— 它们体型大、就杵在你脸上。
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

    p.attackCd = 1 / Math.max(0.2, this.stats.aspd * ATTACK_RATE);
    p.facing = best.x >= p.x ? 1 : -1;

    // aoe 决定溅射范围：割草的「一次清一片」
    const splash = 34 + this.stats.aoe * 40;
    const isCrit = this.rng() < this.stats.crit;
    const dmg = calcDamage(this.stats.atk, 1, isCrit);
    let healed = 0;

    for (const e of this.enemies) {
      if (e === best || Math.hypot(e.x - best.x, e.y - best.y) <= splash) {
        e.hp -= dmg;
        e.hitFlash = 0.12;
        healed += dmg;
        if (e.hp <= 0) this.killEnemy(e);
      }
    }
    this.emitFx(isCrit ? 'crit' : 'slash', best.x, best.y);
    if (this.stats.lifesteal > 0) this.heal(healed * this.stats.lifesteal, '吸血', true);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills += 1;
    if (e.kind === 'minion') this.minionKills += 1;
    this.emitFx('burst', e.x, e.y);

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
    if (e.kind === 'elite') {
      this.emit(`击破 <b>${e.name}</b>`, 'gene');
      this.advanceStage();
    }
  }

  /** 阶段推进：重置时间轴游标（父类只管数据，位置状态在这里重置） */
  advanceStage() {
    if (this.enemies.some((e) => e.kind === 'elite')) return;
    if (this.stageIndex + 1 >= this.dungeon.stages.length) return;
    super.advanceStage();
    this.stageElapsed = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.spawnCarry = 0;
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
