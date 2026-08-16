// ===== core/run.js · 单局状态机（15 分钟割草时间轴 → 结算）=====
// 来源：《噬祖-开发实现指南》13.1 / 13.2 / 13.3；《噬祖-整体策划》2.2 / 2.4 / 3.2 / 4.3
//
// 【形态：割草生存，不是逐波清怪】
//   一次 step() = 一个 TICK_SECONDS 的时间片：刷怪 → 横扫 → 被围受击 → 推进时钟。
//   小怪源源不断，阶段内有若干次**涌潮**（大波）；阶段计时到点刷出精英/阶段BOSS，
//   击杀它才过阶段（整体策划 2.4）。第 5 阶段的收尾单位是位面之主。
//
// 红线 2：D 已在 generateDungeon 快照，局内 Build 只改玩家，不改敌人。
// 红线 6：所有跨局写入集中在 finalize 末尾**一次** persist。

import { activateRoute, chargeGeneLock } from './geneLock.js';
import { adjustDynamicFactor, applyPermGrowth, calcDamage, combatStats } from './balance.js';
import { applyAttrOption, rollUpgradeOptions } from './upgrade.js';
import { applyHiddenSkill, engravedSkills, learnSkill } from './skillSlots.js';
import { rollBossDrop, rollKillDrop } from './drop.js';
import { ZHUTIAN_ID } from '../data/planes.js';
import { skillsByRoute } from '../data/skills.js';
import { activatedRoutes, geneLockLevel } from './geneLock.js';
import { rngFactory } from './rng.js';

/**
 * 局内升级的累计基因阈值。
 * 平衡表 7.1 给的是 80→120→170→230→300 递增，但那套数是按
 * 「小怪掉 5-10 基因、6-10 只/分钟」标的；割草下击杀量高一个量级，
 * 小怪改为掉 1 基因（见 drop.js），故阈值同比重标，
 * 保持整体策划 4.3「单局总计 6-12 次升级」的节奏不变。
 *
 * 阈值按实时战斗的基因流速重标：首档 75 让**首次升级落在 40 秒内**
 *（4.3 要求 30-60s；原先 120 档要等到 63s，开局太干）。
 * 全表 7 档 + 4 次阶段结算 ≈ 11 次/局，落在 6-12 区间。
 */
export const UPGRADE_GENE_STEPS = [75, 250, 550, 1000, 1600, 2400, 3400];

/**
 * 主动技折算成「持续贡献」的权重。
 *
 * 单纯按占空比（duration / cd）会**严重低估割草里的爆发清场**：
 * 九重雷劫 3s/CD60s 占空比只有 5%，但一局 15 分钟能放 15 次，
 * 每次清空整屏（同屏上限 60）≈ 900 次击杀，占全局击杀的三分之一。
 * 在同屏有上限的割草里，「周期性清空屏幕」的价值与它的持续时间无关。
 *
 * 故取 max(占空比, BURST_FLOOR)。实测支撑：不给这个下限时，
 * 单路线 Lv1→Lv6 的通关率会从 13% 倒挂到 3%（越深越弱），
 * 因为 Lv5/Lv6 恰好都是主动终极技，只抬 D 不给战力。
 */
export const BURST_FLOOR = 0.35;

export function dutyCycle(skill) {
  if (skill.kind !== 'active' || !skill.cd) return 1;
  const duration = skill.eff?.duration ?? skill.eff?.summonDuration ?? 0;
  return Math.max(BURST_FLOOR, Math.min(1, duration / skill.cd));
}

export const RunState = {
  FIGHTING: 'fighting',
  CHOOSING: 'choosing',
  SLOT_CONFLICT: 'slotConflict',
  WON: 'won',
  LOST: 'lost',
  SETTLED: 'settled',
};

export class Run {
  /**
   * @param {object} save 存档（会被就地修改）
   * @param {object} dungeon generateDungeon 的产物
   * @param {number} seed 战斗随机种子（与副本 seed 分离，便于重放）
   */
  constructor(save, dungeon, seed) {
    this.save = save;
    this.dungeon = dungeon;
    this.rng = rngFactory(seed >>> 0);
    this.log = [];

    const base = combatStats(save.player);
    this.stats = { ...base, maxHp: base.hp, aoe: 0 };
    this.hp = base.hp;

    this.stageIndex = 0;
    this.elapsed = 0;           // 全局已过秒数
    this.enemies = [];          // 同屏敌人（由子类维护）

    this.genes = 0;
    this.geneStep = 0;
    this.kills = 0;
    this.minionKills = 0;
    this.gearFound = [];
    this.learnedSkills = new Set();
    this.takenAttrs = new Set();
    this.pendingOptions = null;
    this.pendingSkill = null;
    this.state = RunState.FIGHTING;
    this.result = null;
    this.bossDrop = null;

    // 指南 13.1 onRunStart：隐藏刻印开局自动装载，永不入三选一池
    this.engraved = engravedSkills(save);
    for (const s of this.engraved) {
      this.learnedSkills.add(s.skillId);
      this.emit(`【刻印生效】${s.name}`, 'hidden');
    }

    // ★ 基因锁：已解锁段位开局自动生效 —— 这是本作的核心特色，不是抽卡池深度
    this.geneLockSkills = this.equipGeneLockSkills();

    this.emit(`裂缝开启 —— 【${dungeon.plane.name}】${dungeon.plane.theme}`, 'stage');
    this.emit(
      dungeon.channel === 'skill'
        ? '通道：技能通道（可学该路线技能）'
        : '通道：属性通道（零技能，装备掉率 ×1.5）',
      'info',
    );
    this.emit(`—— 阶段 1 · ${dungeon.plane.theme} ——`, 'wave');
  }

  /**
   * 开局装载基因锁已解锁的全部段位能力。
   *
   * 【策划裁定 · 基因锁不占技能槽】
   *   基因锁是本作核心特色：跨局永久、账号唯一的进化图谱（整体策划 4.1 / 设计支柱 2）。
   *   它**整条线都不受技能槽位限制** —— 解锁即生效，被动叠属性、主动进循环。
   *   技能槽（主动×2 + 被动×2）只承载**局内三选一**拿到的技能与**隐藏技能刻印**。
   *
   *   ⚠ 这与《数值平衡表》4.7 的表述冲突 —— 该表把「基因锁主动段（Lv5 召唤类、
   *   Lv6 终极技）」也列为主动槽来源。按裁定以本实现为准，4.7 待修订。
   *   理由（实测支撑）：6 条路线满段共 12 个主动段抢 2 个槽，10 个作废，
   *   而战力公式仍按 36 段全额 +2% 抬升 D，导致「满段比半段更难」——
   *   Lv3 通关率 54%，Lv6 反而掉到 14%。核心成长线不该有这种倒挂。
   *
   * 主动段按**占空比**折算持续贡献：终极技是爆发不是常驻，
   * 九重雷劫 3s/CD60s ⇒ 只按 5% 权重计入，避免把爆发当常驻数值。
   */
  equipGeneLockSkills() {
    const loaded = [];
    for (const route of activatedRoutes(this.save)) {
      const lv = geneLockLevel(this.save, route);
      for (const skill of skillsByRoute(route)) {
        if (skill.lv > lv) continue;
        if (this.learnedSkills.has(skill.id)) continue;   // 隐藏刻印已覆盖同名能力
        this.learnedSkills.add(skill.id);                 // 已生效 → 不再进三选一池
        this.applySkillEff(skill, dutyCycle(skill));
        loaded.push(skill);
      }
    }
    if (loaded.length) {
      const names = loaded.map((s) => s.name);
      this.emit(
        `【基因锁 ${loaded.length} 段生效】${names.slice(0, 6).join('、')}`
        + (names.length > 6 ? ` 等 ${names.length} 项` : ''),
        'gene',
      );
    }
    return loaded;
  }

  emit(text, cls = '') {
    this.log.push({ text, cls });
    if (this.log.length > 200) this.log.shift();
  }

  get stage() { return this.dungeon.stages[this.stageIndex]; }
  get stageNo() { return this.stageIndex + 1; }
  get boss() { return this.enemies.find((e) => e.kind === 'boss' || e.kind === 'elite') ?? null; }


  // ===== 战斗由子类实现 =====
  // 本类只负责「单局元数据」：三选一、掉落入账、基因锁充能、结算。
  // 实际打斗在 core/battle.js 的 RealtimeRun 里 —— 实时、有位置、有碰撞。
  // （早期有一套回合制 step() 作为原型替身，实时战斗落地后已整体删除，
  //   避免同一件事存在两套实现。）

  heal(amount, reason) {
    if (amount <= 0 || this.hp >= this.stats.maxHp) return;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = Math.round(this.hp - before);
    if (gained > 0) this.emit(`${reason} 回复 <b>${gained}</b> 生命`, 'heal');
  }

  onKill(enemy) {
    this.kills += 1;
    if (enemy.kind === 'minion') this.minionKills += 1;

    if (enemy.kind === 'boss') {
      const drop = rollBossDrop(this.dungeon, this.save, this.rng);
      this.bossDrop = drop;
      this.addGenes(drop.genes, false);
      for (const g of drop.gear) this.addGear(g);
      this.emit(`噬灭位面之主 <b>${enemy.name}</b>！基因 +${drop.genes}`, 'win');
      this.state = RunState.WON;
      return;
    }

    const kindForDrop = enemy.kind === 'elite' ? 'stageBoss' : 'minion';
    const drop = rollKillDrop(this.dungeon, this.save, kindForDrop, this.rng);
    this.addGenes(drop.genes, true);
    if (drop.gear) this.addGear(drop.gear);

    if (enemy.kind === 'elite') {
      this.emit(`击破 <b>${enemy.name}</b>，基因 +${drop.genes}`, 'gene');
      this.advanceStage();
    }
  }

  /** 阶段收尾单位被击杀 → 进入下一阶段（整体策划 2.4） */
  advanceStage() {
    // 第 4 阶段是精英×2，两只都死才过
    if (this.enemies.some((e) => e.kind === 'elite' && e.hp > 0)) return;
    if (this.stageIndex + 1 >= this.dungeon.stages.length) return;

    this.emit(`✨ 第 ${this.stageNo} 阶段肃清`, 'stage');
    this.stageIndex += 1;
    this.stageElapsed = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.spawnCarry = 0;
    this.emit(`—— 阶段 ${this.stageNo} / 5 ——`, 'wave');
    this.openChoice(`阶段 ${this.stageNo - 1} 完成`);
  }

  addGear(item) {
    this.gearFound.push(item);
    this.emit(`🎁 掉落装备 <b class="r-${item.rarity}">${item.name}</b>`, 'drop');
  }

  addGenes(amount, allowUpgrade) {
    this.genes += amount;
    if (!allowUpgrade) return;
    while (
      this.geneStep < UPGRADE_GENE_STEPS.length
      && this.genes >= UPGRADE_GENE_STEPS[this.geneStep]
    ) {
      this.geneStep += 1;
      this.openChoice('吞噬充能已满');
    }
  }

  // ===== 三选一 =====

  openChoice(reason) {
    const options = rollUpgradeOptions(
      this.dungeon,
      this.save,
      { learnedSkills: this.learnedSkills, takenAttrs: this.takenAttrs },
      this.rng,
    );
    if (options.length === 0) return;
    this.pendingOptions = { reason, options };
    this.state = RunState.CHOOSING;
  }

  choose(index) {
    if (this.state !== RunState.CHOOSING || !this.pendingOptions) return;
    const option = this.pendingOptions.options[index];
    if (!option) return;
    this.pendingOptions = null;

    if (option.kind === 'attr') {
      applyAttrOption(this.stats, option);
      if (option.eff.hpPct) this.hp = Math.min(this.stats.maxHp, this.hp * (1 + option.eff.hpPct));
      this.emit(`获得 <b>${option.name}</b>（${option.desc}）`, 'learn');
      this.state = RunState.FIGHTING;
      return;
    }

    const res = learnSkill(this.save, option);
    if (res.result === 'needChoice') {
      this.pendingSkill = { skill: option, options: res.options };
      this.state = RunState.SLOT_CONFLICT;
      return;
    }
    this.commitSkill(option, res);
  }

  resolveSlotConflict(slotKey) {
    if (this.state !== RunState.SLOT_CONFLICT || !this.pendingSkill) return;
    const { skill } = this.pendingSkill;
    this.pendingSkill = null;
    if (slotKey === null) {
      this.emit(`放弃了 <b>${skill.name}</b>`, 'info');
      this.state = RunState.FIGHTING;
      return;
    }
    this.commitSkill(skill, learnSkill(this.save, skill, slotKey));
  }

  commitSkill(skill, res) {
    if (res.result === 'rejected') {
      this.emit(`无法装载 ${skill.name}：${res.reason}`, 'info');
    } else {
      this.learnedSkills.add(skill.id);
      this.applySkillEff(skill);
      const tail = res.replaced ? `（替换了 ${res.replaced.name}）` : '';
      this.emit(`习得 <b>${skill.name}</b> · 第${skill.lv}段${tail}`, 'learn');
    }
    this.state = RunState.FIGHTING;
  }

  /**
   * 技能被动效果折算进局内属性。
   * 割草的关键：范围/溅射/弹幕类**统一进 aoe**，直接放大横扫宽度 ——
   * 「一次清一片」的成长感就来自这里。
   */
  applySkillEff(skill, weight = 1) {
    const e0 = skill.eff ?? {};
    const e = weight === 1 ? e0 : Object.fromEntries(
      Object.entries(e0).map(([k, v]) => [k, typeof v === 'number' ? v * weight : v]),
    );
    if (e.atkPct) this.stats.atk *= 1 + e.atkPct;
    if (e.dmgPct) this.stats.atk *= 1 + e.dmgPct;
    if (e.hpPct) { this.stats.maxHp *= 1 + e.hpPct; this.hp *= 1 + e.hpPct; }
    if (e.speedPct) this.stats.speed *= 1 + e.speedPct;
    if (e.aspdPct) this.stats.aspd *= 1 + e.aspdPct;
    if (e.crit) this.stats.crit += e.crit;
    if (e.lifesteal) this.stats.lifesteal += e.lifesteal;
    if (e.regen) this.stats.regen += e.regen;
    if (e.dmgReduct) this.stats.dmgReduct = Math.min(0.9, this.stats.dmgReduct + e.dmgReduct);
    if (e.addFlatMul) this.stats.atk *= 1 + e.addFlatMul;
    if (e.range) this.stats.range *= 1 + e.range;
    // —— 割草成长：这些都变成「一次能扫到几只」——
    if (e.splashMul) this.stats.aoe += e.splashMul;      // 践踏 / 震地
    if (e.chain) this.stats.aoe += e.chain * 0.3;        // 雷链弹射
    if (e.projectiles) this.stats.aoe += e.projectiles * 0.4; // 弹幕 +1
    if (e.aoeMul) this.stats.aoe += e.aoeMul * 0.5;      // 九重雷劫 / 万剑归宗
    if (e.corpseBlastMul) this.stats.aoe += e.corpseBlastMul; // 尸爆连锁
    if (e.summon) this.stats.aoe += e.summon * 0.15;     // 召唤物帮着清
    if (e.aoe) this.stats.aoe += e.aoe;
    if (e.allStatsPct) {                       // 高达合体：全属性提升
      this.stats.atk *= 1 + e.allStatsPct;
      this.stats.maxHp *= 1 + e.allStatsPct;
      this.hp *= 1 + e.allStatsPct;
      this.stats.aspd *= 1 + e.allStatsPct;
    }
    if (e.burstMul) this.stats.aoe += e.burstMul * 0.5;   // 禁咒
    if (e.devourHealPct) this.stats.lifesteal += e.devourHealPct;  // 饕餮巨口
    if (e.killHealPct) this.stats.regen += e.killHealPct * 0.5;    // 度化
  }

  // ===== 结算（指南 13.3）=====

  finalize(repo) {
    if (this.state === RunState.SETTLED) return this.result;
    const victory = this.state === RunState.WON;
    const save = this.save;
    const p = save.player;
    const plane = this.dungeon.plane;

    p.totalRuns += 1;
    if (victory) p.wins += 1;

    const activations = [];
    for (const r of plane.routes ?? []) {
      const ev = activateRoute(save, r);
      if (ev.newlyActivated) activations.push(ev);
    }

    const charges = [];
    for (const r of this.dungeon.channelRoutes) {
      const c = chargeGeneLock(save, r, this.genes);
      if (c.to > c.from) charges.push({ route: r, ...c });
    }

    const growth = applyPermGrowth(save, this.genes);

    const drop = this.bossDrop;
    if (drop) {
      for (const relic of drop.relics) {
        if (!save.inventory.relics.includes(relic)) save.inventory.relics.push(relic);
      }
      if (drop.legendSkillId && !save.inventory.comboSkills.includes(drop.legendSkillId)) {
        save.inventory.comboSkills.push(drop.legendSkillId);
      }
    }

    for (const g of this.gearFound) p.gearBag.push(g);

    let engraveResult = null;
    if (drop?.hiddenSkill) engraveResult = applyHiddenSkill(save, drop.hiddenSkill.id);

    const dyn = adjustDynamicFactor(save, victory, this.rng);

    let firstClear = false;
    if (plane.id === ZHUTIAN_ID && victory && !save.stats.firstClear) {
      save.stats.firstClear = true;
      save.stats.endlessUnlocked = true;
      firstClear = true;
    }

    repo.persist(save);   // 红线 6：一次性落盘

    this.state = RunState.SETTLED;
    this.result = {
      victory,
      plane,
      stageReached: this.stageNo,
      kills: this.kills,
      minionKills: this.minionKills,
      survivedSec: this.elapsed,
      genes: this.genes,
      gear: this.gearFound,
      relics: drop?.relics ?? [],
      legendSkillId: drop?.legendSkillId ?? null,
      hiddenSkill: drop?.hiddenSkill ?? null,
      engraveResult,
      activations,
      charges,
      growth,
      dyn,
      firstClear,
      grade: gradeRun(victory, this.stageNo, this.kills),
    };
    return this.result;
  }
}

/** 结算评级 S/A/B/C（整体策划 6.1 结算页），割草下按击杀量给 S */
export function gradeRun(victory, stageReached, kills) {
  if (victory && kills >= 900) return 'S';
  if (victory) return 'A';
  if (stageReached >= 4) return 'B';
  return 'C';
}
