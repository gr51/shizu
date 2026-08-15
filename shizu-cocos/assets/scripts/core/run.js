// ===== core/run.js · 单局状态机（5 阶段连打 → 结算）=====
// 来源：《噬祖-开发实现指南》13.1 / 13.2 / 13.3；《噬祖-整体策划》2.2 / 4.3
//
// 红线 2：D 已在 generateDungeon 快照，局内 Build 只改玩家，不改敌人。
// 红线 6：所有跨局写入集中在 finalizeRun 末尾**一次** persist。

import { activateRoute, chargeGeneLock } from './geneLock.js';
import { adjustDynamicFactor, applyPermGrowth, calcDamage, combatStats } from './balance.js';
import { enemyHits, resolveAttackCount } from './combatModel.js';
import { applyAttrOption, rollUpgradeOptions } from './upgrade.js';
import { applyHiddenSkill, engravedSkills, learnSkill } from './skillSlots.js';
import { rollBossDrop, rollKillDrop } from './drop.js';
import { ZHUTIAN_ID } from '../data/planes.js';
import { rngFactory } from './rng.js';

/** 局内升级基因阈值（平衡表 7.1：80 → 120 → 170 → 230 → 300 …递增） */
export const UPGRADE_GENE_STEPS = [80, 120, 170, 230, 300, 380, 470, 570];

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
    this.stats = { ...base, maxHp: base.hp };
    this.hp = base.hp;

    this.stageIndex = 0;   // 0-4 对应阶段 1-5
    this.waveIndex = 0;
    this.enemies = [];
    this.genes = 0;
    this.geneStep = 0;
    this.kills = 0;
    this.gearFound = [];
    this.learnedSkills = new Set();
    this.takenAttrs = new Set();
    this.pendingOptions = null;
    this.pendingSkill = null;
    this.pendingHidden = null;
    this.state = RunState.FIGHTING;
    this.result = null;

    // 指南 13.1 onRunStart：隐藏刻印开局自动装载，永不入三选一池
    this.engraved = engravedSkills(save);
    for (const s of this.engraved) {
      this.learnedSkills.add(s.skillId);
      this.emit(`【刻印生效】${s.name}`, 'hidden');
    }

    this.emit(`裂缝开启 —— 【${dungeon.plane.name}】${dungeon.plane.theme}`, 'stage');
    this.emit(
      `通道：${dungeon.channel === 'skill' ? '技能通道（可学路线技能）' : '属性通道（零技能，装备掉率 ×1.5）'}`,
      'info',
    );
    this.loadWave();
  }

  emit(text, cls = '') {
    this.log.push({ text, cls });
    if (this.log.length > 200) this.log.shift();
  }

  get stage() {
    return this.dungeon.stages[this.stageIndex];
  }

  get stageNo() {
    return this.stageIndex + 1;
  }

  get target() {
    return this.enemies.find((e) => e.hp > 0) ?? null;
  }

  loadWave() {
    const wave = this.stage.waves[this.waveIndex];
    this.enemies = wave.enemies.map((e) => ({ ...e, maxHp: e.hp }));
    this.emit(
      `—— 阶段 ${this.stageNo}/5 · 第 ${this.waveIndex + 1}/${this.stage.waves.length} 波 ——`,
      'wave',
    );
  }

  /** 推进一次战斗交换。UI 的「前进」按钮调它。 */
  step() {
    if (this.state !== RunState.FIGHTING) return;
    const target = this.target;
    if (!target) return;

    // —— 玩家攻击（攻速决定本次交锋的出手次数）——
    const swings = Math.max(1, resolveAttackCount(this.stats, this.rng));
    let totalDmg = 0;
    let anyCrit = false;
    for (let i = 0; i < swings && target.hp > 0; i++) {
      const isCrit = this.rng() < this.stats.crit;
      anyCrit = anyCrit || isCrit;
      const variance = 0.85 + this.rng() * 0.3;
      const dmg = Math.round(calcDamage(this.stats.atk * variance, 1, isCrit));
      target.hp -= dmg;
      totalDmg += dmg;
    }
    this.emit(
      `你${anyCrit ? '<b class="crit">暴击</b>' : ''}命中 ${target.name}${swings > 1 ? ` ×${swings}` : ''}，`
        + `造成 <b>${totalDmg}</b> 伤害`
        + (target.hp <= 0 ? '，<b>击杀</b>' : `（剩 ${Math.max(0, Math.round(target.hp))}）`),
      'atk',
    );

    if (this.stats.lifesteal > 0) {
      const heal = Math.round(totalDmg * this.stats.lifesteal);
      if (heal > 0) this.heal(heal, '吸血');
    }

    if (target.hp <= 0) {
      this.onKill(target);
      if (this.state !== RunState.FIGHTING) return;
    } else {
      this.enemyTurn(target);
      if (this.state !== RunState.FIGHTING) return;
    }

    if (this.stats.regen > 0) this.heal(Math.round(this.stats.maxHp * this.stats.regen), '再生');
  }

  heal(amount, reason) {
    if (amount <= 0 || this.hp >= this.stats.maxHp) return;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = Math.round(this.hp - before);
    if (gained > 0) this.emit(`${reason} 回复 <b>${gained}</b> 生命`, 'heal');
  }

  enemyTurn(enemy) {
    // 走位 / 闪避 / 无敌帧的回合制抽象，见 core/combatModel.js
    if (!enemyHits(enemy, this.stats, this.stageNo, this.rng)) return;
    const variance = 0.85 + this.rng() * 0.3;
    let dmg = enemy.atk * variance * (1 - this.stats.dmgReduct);
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.emit(`${enemy.name} 突破走位，你受到 <b>${dmg}</b> 伤害`, 'dmg');
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = RunState.LOST;
      this.emit('生命耗尽，你倒在裂缝之中……', 'death');
    }
  }

  onKill(enemy) {
    this.kills += 1;
    const kindForDrop = enemy.kind === 'boss' ? 'boss' : enemy.kind;

    if (kindForDrop === 'boss') {
      const drop = rollBossDrop(this.dungeon, this.save, this.rng);
      this.addGenes(drop.genes, false);
      for (const g of drop.gear) this.addGear(g);
      this.bossDrop = drop;
      this.emit(`击败位面之主 <b>${enemy.name}</b>！基因 +${drop.genes}`, 'win');
      this.state = RunState.WON;
      return;
    }

    const drop = rollKillDrop(this.dungeon, this.save, kindForDrop, this.rng);
    this.addGenes(drop.genes, true);
    if (drop.gear) this.addGear(drop.gear);

    if (this.enemies.every((e) => e.hp <= 0)) this.onWaveCleared();
  }

  addGear(item) {
    this.gearFound.push(item);
    this.emit(`🎁 掉落装备 <b class="r-${item.rarity}">${item.name}</b>`, 'drop');
  }

  addGenes(amount, allowUpgrade) {
    this.genes += amount;
    if (!allowUpgrade) return;
    // 累积吞噬达阈值 → 三选一（整体策划 4.3）
    while (
      this.geneStep < UPGRADE_GENE_STEPS.length &&
      this.genes >= UPGRADE_GENE_STEPS[this.geneStep]
    ) {
      this.geneStep += 1;
      this.openChoice('吞噬充能已满');
    }
  }

  onWaveCleared() {
    if (this.waveIndex + 1 < this.stage.waves.length) {
      this.waveIndex += 1;
      this.loadWave();
      return;
    }
    this.emit(`✨ 第 ${this.stageNo} 阶段肃清`, 'stage');
    if (this.stageIndex + 1 >= this.dungeon.stages.length) return;
    this.stageIndex += 1;
    this.waveIndex = 0;
    this.openChoice(`阶段 ${this.stageNo - 1} 完成`);
    this.loadWave();
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

  /** 选择一个三选一选项 */
  choose(index) {
    if (this.state !== RunState.CHOOSING || !this.pendingOptions) return;
    const option = this.pendingOptions.options[index];
    if (!option) return;
    this.pendingOptions = null;

    if (option.kind === 'attr') {
      this.takenAttrs.add(option.id);
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

  /** 槽满时玩家选定要替换的槽位；slotKey 为 null = 放弃新技能 */
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
      const tail = res.replaced ? `（替换了 ${res.replaced.name}，旧技能销毁）` : '';
      this.emit(`习得 <b>${skill.name}</b> · ${skill.route}·第${skill.lv}段${tail}`, 'learn');
    }
    this.state = RunState.FIGHTING;
  }

  /** 技能被动效果折算进局内战斗属性（主动技的释放留给 Cocos 实时战斗层） */
  applySkillEff(skill) {
    const e = skill.eff ?? {};
    if (e.atkPct) this.stats.atk *= 1 + e.atkPct;
    if (e.dmgPct) this.stats.atk *= 1 + e.dmgPct;
    if (e.hpPct) {
      this.stats.maxHp *= 1 + e.hpPct;
      this.hp *= 1 + e.hpPct;
    }
    if (e.speedPct) this.stats.speed *= 1 + e.speedPct;
    if (e.aspdPct) this.stats.aspd *= 1 + e.aspdPct;
    if (e.crit) this.stats.crit += e.crit;
    if (e.lifesteal) this.stats.lifesteal += e.lifesteal;
    if (e.regen) this.stats.regen += e.regen;
    if (e.dmgReduct) this.stats.dmgReduct = Math.min(0.9, this.stats.dmgReduct + e.dmgReduct);
    if (e.addFlatMul) this.stats.atk *= 1 + e.addFlatMul;
    if (e.splashMul) this.stats.atk *= 1 + e.splashMul * 0.5;
    if (e.range) this.stats.range *= 1 + e.range;
  }

  // ===== 结算（指南 13.3）=====

  /**
   * 结算本局。**唯一**跨局写入点。
   * @param {object} repo createSaveRepo 的产物
   * @returns {object} 结算摘要（供 UI 展示）
   */
  finalize(repo) {
    if (this.state === RunState.SETTLED) return this.result;
    const victory = this.state === RunState.WON;
    const save = this.save;
    const p = save.player;
    const plane = this.dungeon.plane;

    p.totalRuns += 1;
    if (victory) p.wins += 1;

    // 1) 首进激活（互斥封印随之生效）
    const activations = [];
    for (const r of plane.routes ?? []) {
      const ev = activateRoute(save, r);
      if (ev.newlyActivated) activations.push(ev);
    }

    // 2) 基因锁充能（只给本副本的技能通道路线）
    const charges = [];
    for (const r of this.dungeon.channelRoutes) {
      const c = chargeGeneLock(save, r, this.genes);
      if (c.to > c.from) charges.push({ route: r, ...c });
    }

    // 3) 永久属性转化
    const growth = applyPermGrowth(save, this.genes);

    // 4) 传承 / 传说技能入库
    const drop = this.bossDrop;
    if (drop) {
      for (const relic of drop.relics) {
        if (!save.inventory.relics.includes(relic)) save.inventory.relics.push(relic);
      }
      if (drop.legendSkillId && !save.inventory.comboSkills.includes(drop.legendSkillId)) {
        save.inventory.comboSkills.push(drop.legendSkillId);
      }
    }

    // 5) 装备入库
    for (const g of this.gearFound) p.gearBag.push(g);

    // 6) 隐藏技能永久刻印
    let engraveResult = null;
    if (drop?.hiddenSkill) {
      engraveResult = applyHiddenSkill(save, drop.hiddenSkill.id);
      if (engraveResult.result === 'needChoice') this.pendingHidden = engraveResult;
    }

    // 7) 难度进化
    const dyn = adjustDynamicFactor(save, victory, this.rng);

    // 8) 首通诸天之心
    let firstClear = false;
    if (plane.id === ZHUTIAN_ID && victory && !save.stats.firstClear) {
      save.stats.firstClear = true;
      save.stats.endlessUnlocked = true;
      firstClear = true;
    }

    // 9) 红线 6：一次性落盘
    repo.persist(save);

    this.state = RunState.SETTLED;
    this.result = {
      victory,
      plane,
      stageReached: this.stageNo,
      kills: this.kills,
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

/** 结算评级 S/A/B/C（整体策划 6.1 结算页） */
export function gradeRun(victory, stageReached, kills) {
  if (victory && kills >= 40) return 'S';
  if (victory) return 'A';
  if (stageReached >= 4) return 'B';
  return 'C';
}
