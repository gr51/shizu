// ===== core/balance.js · 战力 / D 值 / 阶段系数 / 难度进化 / 永久成长 =====
// 来源：《噬祖-开发实现指南》四章；《噬祖-数值平衡表》一/二/七章
//
// ⚠ 两条口径必须分清，混用会导致装备被计两次（重写前的旧代码就犯了这个错）：
//   1) computePower（战力，驱动 D）：
//        ((1+permAtk%) + (1+permHp%) + (1+permSpd%)) / 3 × 基因锁加成 × 装备加成
//      装备只通过 gearPowerBonus（词条数 × 稀有度倍率 × 2.5%）进入，
//      **不**再把词条百分比塞进三个 term —— 指南 4.1 就是这么写的。
//   2) combatStats（局内实际战斗属性）：
//        攻 = 10 × (1+perm攻%) × (1+装备攻词条%)，血/速同理
//      这里才用词条百分比。它不参与 D 的计算。

import { clamp, randRange } from './rng.js';
import { gearAffixSum, gearPowerBonus } from './gear.js';
import { DYN_FACTOR_MAX, DYN_FACTOR_MIN, PERM_GROWTH_CAP_PCT } from './save.js';

/** 巢灵基础数值（平衡表 一章） */
export const BASE_STATS = { atk: 10, hp: 100, speed: 220, crit: 0.05 };

/**
 * 敌人**通用**基准（战力 1 时），来自《数值平衡表》三章数值详表 + 2.2 总表。
 *
 * ⚠ 这是全部 12 个位面共用的唯一一张基准表 —— 这是红线 1 的强制要求：
 *   「位面不设固有强度：所有敌人数值只由 基准 × D × 阶段系数 × dynFactor 生成，
 *     **禁止按位面手写不同强度表**」
 *   整体策划 3.2 同样写明「位面模板不设固有难度」。
 *
 * 因此平衡表**五章**那张逐位面 HP/攻表（机关城 20 → 巨神界 70，跨度 3.5 倍）
 * 不作为战斗数值来源，只保留在 data/planes.js 里当作设定参考。
 * 位面之间的差异体现在：敌人类型 / 主题机制 / 波次数 / 数量型·单体型修正。
 */
export const UNIT_BASE = {
  minion: { baseHp: 20, baseAtk: 3 },
  elite: { baseHp: 150, baseAtk: 8 },
  boss: { baseHp: 300, baseAtk: 12 },
};

/** 难度等级系数（指南 4.2） */
export const DIFFICULTY_COEF = { easy: 0.9, normal: 1.5, hard: 2.0 };
export const DIFFICULTY_LABEL = { easy: '简单', normal: '中等', hard: '困难' };

/** 阶段系数（阶段 1-4）；阶段 5 用 bossStageCoef */
export const STAGE_COEF = [0.9, 1.0, 1.15, 1.3];
export const BOSS_COEF_MIN = 1.1;
export const BOSS_COEF_MAX = 1.15;

/** 基因锁每段 +2% 战力（平衡表 八章） */
export const GENE_LOCK_POWER_PER_SEG = 0.02;

/** 基因锁战力加成 = 1 + 总段数 × 2% */
export function geneLockPowerBonus(geneLocks) {
  let segs = 0;
  for (const v of Object.values(geneLocks ?? {})) segs += v || 0;
  return 1 + segs * GENE_LOCK_POWER_PER_SEG;
}

/** 战力（指南 4.1）。新档 = 1.0 */
export function computePower(player) {
  const atkTerm = 1 + player.permAtkPct / 100;
  const hpTerm = 1 + player.permHpPct / 100;
  const spdTerm = 1 + player.permSpeedPct / 100;
  return ((atkTerm + hpTerm + spdTerm) / 3)
    * geneLockPowerBonus(player.geneLocks)
    * gearPowerBonus(player.gear);
}

/** 副本难度值 D = 战力 × 难度等级系数（指南 4.2；dynFactor 在敌人数值处再乘） */
export function dungeonDifficulty(power, level) {
  return power * DIFFICULTY_COEF[level];
}

/** 阶段 5 位面之主系数：1.10~1.15 随机，锁定「差一点」 */
export function bossStageCoef(rng) {
  return randRange(BOSS_COEF_MIN, BOSS_COEF_MAX, rng);
}

/** 阶段系数（stage 1-5；阶段 5 需传 rng） */
export function stageCoef(stage, rng) {
  return stage === 5 ? bossStageCoef(rng) : STAGE_COEF[stage - 1];
}

/**
 * 敌人实际数值 = 基准 × D × 阶段系数 × dynFactor（指南 4.4，向上取整）
 * @param {{baseHp:number, baseAtk:number}} unit 战力 1 基准
 */
export function buildEnemy(unit, D, coef, dynFactor) {
  const d = D * coef * dynFactor;
  return { hp: Math.ceil(unit.baseHp * d), atk: Math.ceil(unit.baseAtk * d) };
}

/** 单次伤害 = 攻 × 技能倍率 × 暴击(1.5) − 防御，保底 1（指南 4.5） */
export function calcDamage(atk, skillMul, isCrit, def = 0) {
  return Math.max(1, atk * skillMul * (isCrit ? 1.5 : 1) - def);
}

/** 局内实际战斗属性（口径 2，见文件头） */
export function combatStats(player) {
  const gear = player.gear;
  return {
    atk: BASE_STATS.atk * (1 + player.permAtkPct / 100) * (1 + gearAffixSum(gear, 'atk')),
    hp: BASE_STATS.hp * (1 + player.permHpPct / 100) * (1 + gearAffixSum(gear, 'hp')),
    speed: BASE_STATS.speed * (1 + player.permSpeedPct / 100) * (1 + gearAffixSum(gear, 'speed')),
    crit: BASE_STATS.crit + gearAffixSum(gear, 'crit'),
    aspd: 1 * (1 + gearAffixSum(gear, 'aspd')),
    lifesteal: gearAffixSum(gear, 'lifesteal'),
    dmgReduct: gearAffixSum(gear, 'dmgReduct'),
    regen: gearAffixSum(gear, 'regen'),
    cooldown: 1 - gearAffixSum(gear, 'cooldown'),
    suckRadius: 1 + gearAffixSum(gear, 'suckRadius'),
    range: 1,
  };
}

// ===== 难度进化（指南 4.3）=====

/**
 * 每次副本结算后调整 dynFactor。
 * 通关 → ×(1.05~1.15)；连败 ≥2 → ×(0.90~0.95)；恒钳制 [0.70, 1.50]（红线 5）。
 */
export function adjustDynamicFactor(save, victory, rng) {
  const p = save.player;
  const before = p.dynFactor;
  if (victory) {
    const mult = randRange(1.05, 1.15, rng);
    p.dynFactor = clamp(p.dynFactor * mult, DYN_FACTOR_MIN, DYN_FACTOR_MAX);
    p.consecFails = 0;
  } else {
    p.consecFails += 1;
    if (p.consecFails >= 2) {
      const mult = randRange(0.9, 0.95, rng);
      p.dynFactor = clamp(p.dynFactor * mult, DYN_FACTOR_MIN, DYN_FACTOR_MAX);
      p.consecFails = 0;
    }
  }
  return { before, after: p.dynFactor, deltaPct: Math.round((p.dynFactor / before - 1) * 100) };
}

// ===== 永久属性转化（平衡表 7.2）=====

/** 一次成长授予的三档（攻+2% / 血+2% / 速+1%），按游标轮转 */
export const PERM_GRANTS = [
  { key: 'permAtkPct', pct: 2, label: '攻击' },
  { key: 'permHpPct', pct: 2, label: '生命' },
  { key: 'permSpeedPct', pct: 1, label: '速度' },
];

/** 单局成长上限：三种属性合计 +3 个百分点（平衡表 7.2） */
export const PERM_CAP_PER_RUN_PCT = 3;

/**
 * 每多少基因兑换一次成长。
 *
 * 【文档歧义 · 已显式取值】平衡表 7.2 同时给了「基因 ×5% 结算为永久成长」和
 * 「单局上限 +3%」，但没给两者的换算率。此处取 600：
 *   依据是平衡表 7.1「基因产出速率 40-60/分钟」× 整体策划「单局 12-15 分钟」
 *   ≈ 480~900 基因/局，即典型一局兑换 1 次成长 ——
 *   正好对上平衡表 八章「每次通关结算战力 ≈ 增长 1.67%」（= (2+2+1)/3）。
 * 若策划另有换算意图，只改这一个常量即可，逻辑不变。
 */
export const GENES_PER_GROWTH = 600;

/**
 * 局内基因 → 永久属性（就地修改 save）。
 * @returns {{grants: Array<{label:string, pct:number}>, totalPct:number}}
 */
export function applyPermGrowth(save, runGenes) {
  const p = save.player;
  let budget = Math.floor(runGenes / GENES_PER_GROWTH);
  const grants = [];
  let totalPct = 0;

  while (budget > 0) {
    const grant = PERM_GRANTS[p.permGrowthCursor % PERM_GRANTS.length];
    if (totalPct + grant.pct > PERM_CAP_PER_RUN_PCT) break; // 单局上限
    const current = p[grant.key];
    if (current < PERM_GROWTH_CAP_PCT) {                     // 单维 +500% 上限
      const applied = Math.min(grant.pct, PERM_GROWTH_CAP_PCT - current);
      p[grant.key] = current + applied;
      totalPct += applied;
      grants.push({ label: grant.label, pct: applied });
    }
    p.permGrowthCursor = (p.permGrowthCursor + 1) % PERM_GRANTS.length;
    budget -= 1;
  }
  return { grants, totalPct };
}
