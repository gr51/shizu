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
import { buildEndlessStage, ENDLESS_GENE_PER_LAYER } from './dungeon.js';
import { ZHUTIAN_ID } from '../data/planes.js';
import { skillsByRoute } from '../data/skills.js';
import { findSkill } from '../data/skills.js';
import { newlyFiredSynergies } from '../data/synergies.js';
import { aggregateNestEff } from '../data/nestUpgrades.js';
import { aggregateRelicEff } from '../data/relics.js';
import { claimAchievements } from '../data/achievements.js';
import { rollShop } from '../data/shopItems.js';
import { activatedRoutes, geneLockLevel } from './geneLock.js';
import { rngFactory } from './rng.js';

/**
 * 局内升级的累计基因阈值（30 级）。
 * 幸存者like 的「多巴胺节拍」：前期经验少、升级快（约 15-20s 一级），
 * 后期阈值超线性抬升、越来越难（约 1 分钟一级），一局 15 分钟约升到 30 级。
 * 阈值公式 threshold(n) = 18 * n^1.5（n=1..30），累计约 3000 基因 ≈ 15 分钟流速。
 */
export const UPGRADE_LEVEL_CAP = 30;
export const UPGRADE_GENE_STEPS = Array.from({ length: UPGRADE_LEVEL_CAP }, (_, i) =>
  Math.round(18 * Math.pow(i + 1, 1.5)),
);

/**
 * 三选一的「玩家能动性」成本（幸存者like 的 reroll / banish）：
 * 重掷用基因买，价格递增防止刷到最优解；放逐一局只有 2 次，稀缺才构成决策。
 */
export const REROLL_BASE_COST = 20;
export const REROLL_COST_STEP = 15;
export const BANISH_PER_RUN = 2;

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
  SHOPPING: 'shopping',
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

    // 虫巢永久升级（局外元进度）：开局即生效，让下一局起点真的不同
    this.nest = aggregateNestEff(save);
    if (this.nest.hpPct) {
      this.stats.maxHp *= 1 + this.nest.hpPct;
      this.hp = this.stats.maxHp;
    }
    if (this.nest.atkPct) this.stats.atk *= 1 + this.nest.atkPct;
    if (this.nest.suckRadius) this.stats.suckRadius = (this.stats.suckRadius ?? 1) * (1 + this.nest.suckRadius);
    this.reviveLeft = this.nest.revive > 0 ? 1 : 0;   // 残命：每局一次
    this.freeRerollLeft = this.nest.freeReroll ?? 0;

    // 传承残影：收集到的强者基因作为永久被动，开局装载（收集才有回报）
    this.relicEff = aggregateRelicEff(save.inventory?.relics);
    const rel = this.relicEff;
    if (rel.atkPct) this.stats.atk *= 1 + rel.atkPct;
    if (rel.hpPct) { this.stats.maxHp *= 1 + rel.hpPct; this.hp = this.stats.maxHp; }
    if (rel.aspdPct) this.stats.aspd *= 1 + rel.aspdPct;
    if (rel.crit) this.stats.crit += rel.crit;
    if (rel.critDmg) this.stats.critDmg = (this.stats.critDmg ?? 0) + rel.critDmg;
    if (rel.aoe) this.stats.aoe = (this.stats.aoe ?? 0) + rel.aoe;
    if (rel.lifesteal) this.stats.lifesteal += rel.lifesteal;
    if (rel.regen) this.stats.regen += rel.regen;
    if (rel.dmgReduct) this.stats.dmgReduct = Math.min(0.8, this.stats.dmgReduct + rel.dmgReduct);
    if (rel.execute) this.stats.execute = (this.stats.execute ?? 0) + rel.execute;
    if (rel.cooldownPct) this.stats.cooldown = Math.max(0.4, (this.stats.cooldown ?? 1) * (1 - rel.cooldownPct));

    // 裂缝变异：薄命降低生命上限，基因倍率提高产出（高风险高回报）
    const mods = dungeon.mods ?? {};
    if (mods.playerHpMul && mods.playerHpMul !== 1) {
      this.stats.maxHp *= mods.playerHpMul;
      this.hp = this.stats.maxHp;
    }
    this.geneMul = mods.geneMul ?? 1;

    // 无尽模式：通关 5 阶段后无限续接深渊层（需先解锁）
    this.endless = Boolean(dungeon.endless) && Boolean(save.stats?.endlessUnlocked);
    this.endlessLayer = 0;

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
    this.mechLvl = {};   // 路线机制强化等级（三选一「构筑感」选项累积）
    this.banished = new Set();   // 本局被放逐的选项 id（不再出现）
    this.rerollUsed = 0;         // 已重掷次数（决定下次价格）
    this.banishUsed = 0;         // 已放逐次数（一局有限）
    this.ownedPicks = new Set(); // 本局已获得的选项 id（供构筑共鸣判定）
    this.firedSynergies = new Set(); // 已触发的共鸣 id（每条一局一次）
    this.pendingShop = false;    // 阶段推进后待开的黑市
    this.shopItems = null;       // 当前黑市商品（开门期间有效）
    this.shopBought = null;      // 本次开门已购 id

    // 指南 13.1 onRunStart：隐藏刻印开局自动装载，永不入三选一池
    this.engraved = engravedSkills(save);
    for (const s of this.engraved) {
      this.learnedSkills.add(s.skillId);
      this.emit(`【刻印生效】${s.name}`, 'hidden');
    }

    // ★ 基因锁：已解锁段位开局自动生效 —— 这是本作的核心特色，不是抽卡池深度
    this.geneLockSkills = this.equipGeneLockSkills();

    // 传说技能（Lv6 终极技收藏）：开局选一个带进本局，收藏才有战斗价值
    this.equipLegendLoadout();

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

  /**
   * 传说技能出征装载：从已收藏的 Lv6 终极技里带一个进本局。
   * 由 dungeon.legendLoadout 指定（大厅出征前选择）；未选或非法则不装载。
   * 与基因锁不同：这是**玩家主动的赛前决策**，让收藏池变成 loadout 选择。
   */
  equipLegendLoadout() {
    const id = this.dungeon.legendLoadout;
    if (!id) return null;
    if (!(this.save.inventory?.comboSkills ?? []).includes(id)) return null;
    if (this.learnedSkills.has(id)) return null;   // 已由基因锁/刻印覆盖
    const skill = findSkill(id);
    if (!skill) return null;
    this.learnedSkills.add(skill.id);
    this.legendLoaded = skill;
    // 主动技进循环靠槽位；这里直接塞进主动槽的「出征位」，不占用局内三选一槽
    this.legendActive = skill.kind === 'active' ? skill : null;
    if (skill.kind !== 'active') this.applySkillEff(skill);
    this.emit(`【出征传说】${skill.name} —— ${skill.desc}`, 'hidden');
    return skill;
  }

  emit(text, cls = '') {    this.log.push({ text, cls });
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
      // 无尽模式：击破后不结束，续接更深一层（层数即分数，贪多必死）
      if (this.endless) {
        this.pushEndlessLayer();
        return;
      }
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
    this.pendingShop = true;   // 阶段间开黑市（在三选一结束后弹）
    this.openChoice(`阶段 ${this.stageNo - 1} 完成`);
  }

  /**
   * 开黑市：阶段间用基因换即时战力。
   * 与三选一互斥（先选进化再逛市），保证同一时刻只有一个面板。
   */
  openShop() {
    this.pendingShop = false;
    const items = rollShop(this.rng, this.stageNo);
    if (!items.length) return false;
    this.shopItems = items;
    this.shopBought = new Set();
    this.state = RunState.SHOPPING;
    return true;
  }

  /** 购买一件商品：扣基因并立即应用（同一次开门内不可重复买同件） */
  buyShopItem(index) {
    if (this.state !== RunState.SHOPPING || !this.shopItems) return false;
    const item = this.shopItems[index];
    if (!item) return false;
    if (this.shopBought.has(item.id)) return false;
    if (this.genes < item.price) return false;
    this.genes -= item.price;
    this.shopBought.add(item.id);
    try { item.apply(this); } catch { /* 单件失败不影响整局 */ }
    this.emit(`🛒 购入 <b>${item.name}</b>（-${item.price} 基因）`, 'learn');
    return true;
  }

  /** 离开黑市，回到战斗 */
  closeShop() {
    if (this.state !== RunState.SHOPPING) return false;
    this.shopItems = null;
    this.shopBought = null;
    this.state = RunState.FIGHTING;
    return true;
  }

  addGear(item) {
    this.gearFound.push(item);
    this.emit(`🎁 掉落装备 <b class="r-${item.rarity}">${item.name}</b>`, 'drop');
  }

  /**
   * 无尽模式：追加一层深渊并立刻推进过去。
   * 层数越深敌人越强、基因越多；玩家可随时主动收手结算（retire）。
   */
  pushEndlessLayer() {
    this.endlessLayer += 1;
    this.dungeon.stages.push(buildEndlessStage(this.dungeon, this.endlessLayer));
    this.geneMul = (this.dungeon.mods?.geneMul ?? 1) * (1 + this.endlessLayer * ENDLESS_GENE_PER_LAYER);
    this.stageIndex = this.dungeon.stages.length - 1;
    this.stageElapsed = 0;
    this.surgeDone = 0;
    this.closerSpawned = false;
    this.spawnCarry = 0;
    this.emit(`🕳 深渊第 ${this.endlessLayer} 层 —— 敌人更强，基因 ×${this.geneMul.toFixed(2)}`, 'wave');
    this.openChoice(`深入深渊第 ${this.endlessLayer} 层`);
  }

  /** 无尽模式主动收手：立即以胜利结算，保住已赚的基因 */
  retire() {
    if (!this.endless || this.state !== RunState.FIGHTING) return false;
    this.emit(`🚪 主动撤离 —— 深渊第 ${this.endlessLayer} 层，带着战利品回巢`, 'win');
    this.state = RunState.WON;
    return true;
  }

  addGenes(amount, allowUpgrade) {
    // 裂缝变异的基因倍率在入账口生效，升级节奏与结算入库自动同步
    this.genes += Math.round(amount * (this.geneMul ?? 1));
    if (!allowUpgrade) return;
    // 一次只触发一级，避免「一次拿大量基因跳级丢选择」；多余阈值在 choose() 后再补触发
    if (
      this.geneStep < UPGRADE_GENE_STEPS.length
      && this.genes >= UPGRADE_GENE_STEPS[this.geneStep]
    ) {
      this.geneStep += 1;
      this.openChoice('吞噬充能已满');
    }
  }

  /** 选完后若基因仍够下一档，立即补开下一次三选一（连续升级） */
  flushPendingUpgrade() {
    if (
      this.state === RunState.FIGHTING
      && this.geneStep < UPGRADE_GENE_STEPS.length
      && this.genes >= UPGRADE_GENE_STEPS[this.geneStep]
    ) {
      this.geneStep += 1;
      this.openChoice('吞噬充能已满');
      return;
    }
    // 三选一都处理完了，若本阶段挂着黑市则接着开门
    if (this.state === RunState.FIGHTING && this.pendingShop) this.openShop();
  }

  // ===== 三选一 =====

  openChoice(reason) {
    const options = rollUpgradeOptions(
      this.dungeon,
      this.save,
      { learnedSkills: this.learnedSkills, takenAttrs: this.takenAttrs, level: this.geneStep, banished: this.banished },
      this.rng,
    );
    if (options.length === 0) return;
    this.pendingOptions = { reason, options };
    this.state = RunState.CHOOSING;
  }

  /**
   * 重掷：花费基因换一批新选项（玩家能动性 —— 三个都不想要时不必被迫吃亏）。
   * 价格随次数递增，避免无限刷到最优解。
   */
  reroll() {
    if (this.state !== RunState.CHOOSING || !this.pendingOptions) return false;
    // 巢髓·抉择：先用免费次数，再花基因
    const free = this.freeRerollLeft > 0;
    const cost = free ? 0 : this.rerollCost;
    if (!free && this.genes < cost) return false;
    if (free) this.freeRerollLeft -= 1;
    else { this.genes -= cost; this.rerollUsed += 1; }
    const reason = this.pendingOptions.reason;
    this.pendingOptions = null;
    this.openChoice(reason);
    // 池子枯竭导致没roll出东西时，保持在战斗态而不是卡住
    if (!this.pendingOptions) this.state = RunState.FIGHTING;
    this.emit(free ? '♻ 免费重掷（巢髓·抉择）' : `♻ 重掷选项（-${cost} 基因）`, 'info');
    return true;
  }

  /** 当前重掷价格：20 起，每次 +15 */
  get rerollCost() { return REROLL_BASE_COST + this.rerollUsed * REROLL_COST_STEP; }

  /**
   * 放逐：永久移除某个选项（本局不再出现），并立刻重掷一批。
   * 这是构筑的「减法」——把不想要的东西从池子里拿掉，提高后续命中率。
   */
  banish(index) {
    if (this.state !== RunState.CHOOSING || !this.pendingOptions) return false;
    const option = this.pendingOptions.options[index];
    if (!option) return false;
    if (this.banishLeft <= 0) return false;
    this.banished.add(option.id);
    this.banishUsed += 1;
    const reason = this.pendingOptions.reason;
    this.pendingOptions = null;
    this.openChoice(reason);
    if (!this.pendingOptions) this.state = RunState.FIGHTING;
    this.emit(`🚫 放逐 <b>${option.name}</b>（本局不再出现）`, 'info');
    return true;
  }

  /** 剩余放逐次数（基础 2 次 + 巢髓·断绝，稀缺才有决策价值） */
  get banishLeft() { return Math.max(0, BANISH_PER_RUN + (this.nest?.banish ?? 0) - this.banishUsed); }

  /**
   * 构筑共鸣：记录本次获得的 id，若与已有选项凑成套则一次性给永久强化。
   * 让「选什么」从叠数字变成凑套 —— 这是构筑深度的核心。
   */
  checkSynergies(pickedId) {
    if (!pickedId) return;
    this.ownedPicks.add(pickedId);
    for (const syn of newlyFiredSynergies(this.ownedPicks, this.firedSynergies)) {
      this.firedSynergies.add(syn.id);
      const e = syn.eff ?? {};
      if (e.critDmg) this.stats.critDmg = (this.stats.critDmg ?? 0) + e.critDmg;
      if (e.thornMul) this.stats.thorn = (this.stats.thorn ?? 0) * (1 + e.thornMul);
      if (e.execute) this.stats.execute = (this.stats.execute ?? 0) + e.execute;
      if (e.executeThreshold) this.stats.executeThreshold = (this.stats.executeThreshold ?? 0.3) + e.executeThreshold;
      if (e.lifesteal) this.stats.lifesteal += e.lifesteal;
      if (e.regen) this.stats.regen += e.regen;
      if (e.aoe) this.stats.aoe = (this.stats.aoe ?? 0) + e.aoe;
      if (e.aspdPct) this.stats.aspd *= 1 + e.aspdPct;
      this.emit(`✨ ${syn.name} —— ${syn.desc}`, 'win');
    }
  }

  /**
   * 致死拦截：巢髓·残命解锁后每局一次，保留 1 点生命并回复 25%。
   * 战斗层在把 state 置为 LOST 之前先问这里，避免每处死亡分支各写一遍。
   * @returns {boolean} true = 已被救回，不应死亡
   */
  tryRevive() {
    if (this.reviveLeft <= 0) return false;
    this.reviveLeft -= 1;
    this.hp = Math.max(1, this.stats.maxHp * 0.25);
    this.emit('💠 巢髓·残命触发：从致死伤害中挣脱', 'win');
    return true;
  }

  choose(index) {
    if (this.state !== RunState.CHOOSING || !this.pendingOptions) return;
    const option = this.pendingOptions.options[index];
    if (!option) return;
    this.pendingOptions = null;

    if (option.kind === 'mech') {
      for (const [k, v] of Object.entries(option.eff ?? {})) {
        this.mechLvl[k] = (this.mechLvl[k] ?? 0) + v;
      }
      this.emit(`强化 <b>${option.name}</b>（${option.desc}）`, 'learn');
      this.checkSynergies(option.id);
      this.state = RunState.FIGHTING;
      this.flushPendingUpgrade();
      return;
    }

    if (option.kind === 'attr') {
      applyAttrOption(this.stats, option);
      if (option.eff.hpPct) this.hp = Math.min(this.stats.maxHp, this.hp * (1 + option.eff.hpPct));
      this.emit(`获得 <b>${option.name}</b>（${option.desc}）`, 'learn');
      this.checkSynergies(option.id);
      this.state = RunState.FIGHTING;
      this.flushPendingUpgrade();
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
      this.flushPendingUpgrade();
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
    this.flushPendingUpgrade();
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

    // 局外货币：本局基因入库，供虫巢永久升级消费（失败也有推进）
    save.inventory.genes = (save.inventory.genes ?? 0) + this.genes;

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

    // 元进度锚点：记录历史最佳阶段（跨局成长的可感知反馈）
    const prevBestStage = save.stats.bestStage ?? 0;
    const newBest = this.stageNo > prevBestStage;
    save.stats.bestStage = Math.max(prevBestStage, this.stageNo);

    let firstClear = false;
    if (plane.id === ZHUTIAN_ID && victory && !save.stats.firstClear) {
      save.stats.firstClear = true;
      save.stats.endlessUnlocked = true;
      firstClear = true;
    }

    // 里程碑奖励：达成但未领取的成就一次性发放（必须在落盘前，且在所有进度更新之后）
    const achievements = claimAchievements(save);

    repo.persist(save);   // 红线 6：一次性落盘

    this.state = RunState.SETTLED;
    this.result = {
      victory,
      plane,
      stageReached: this.stageNo,
      prevBestStage,
      newBest,
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
      achievements,
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
