// ===== core/gear.js · 装备系统（生成 / 战力折算 / 合成 · 强化 · 分解）=====
// 来源：《噬祖-开发实现指南》十一章；《噬祖-数值平衡表》7.5
// 红线 9：装备加成参与 computePower → 抬升 D，形成闭环，禁止做成局外碾压常量。

import { AFFIX_BASE, GEAR_RARITY, GEAR_SLOTS, GEAR_SLOT_IDS, RARITY_ORDER, SALVAGE_ESSENCE } from '../data/attrPool.js';
import { pick, round1, uid } from './rng.js';

/** 单标准词条 = 战力 +2.5%（平衡表 7.5） */
export const AFFIX_POWER_UNIT = 0.025;

/** 强化每星 ×1.1，上限 +5 星 */
export const STAR_MAX = 5;
export const STAR_MULT_PER = 0.1;

/**
 * 生成一件装备。
 * 词条从**槽位倾向池**去重抽取；池不足以填满高稀有度词条数时，从全局词条池补齐
 * （白 1 / 绿 2 / 蓝 3 / 紫 4 / 金 5，而槽位池只有 3 条，故紫金必然要补）。
 */
export function generateGear(rng, rarity, slotId) {
  const slot = slotId ?? pick(GEAR_SLOT_IDS, rng);
  const slotCfg = GEAR_SLOTS[slot];
  const rarityCfg = GEAR_RARITY[rarity];
  if (!slotCfg) throw new Error(`未知装备槽位: ${slot}`);
  if (!rarityCfg) throw new Error(`未知稀有度: ${rarity}`);

  const preferred = [...slotCfg.affixPool];
  const fallback = Object.keys(AFFIX_BASE).filter((k) => !preferred.includes(k));
  const affixes = [];
  while (affixes.length < rarityCfg.affixCount) {
    const src = preferred.length > 0 ? preferred : fallback;
    if (src.length === 0) break;
    const key = src.splice(Math.floor(rng() * src.length), 1)[0];
    const base = AFFIX_BASE[key];
    affixes.push({
      key,
      value: round1(base.value * rarityCfg.mult),
      weight: base.weight,
    });
  }

  return {
    uid: uid(rng),
    slot,
    rarity,
    star: 0,
    affixes,
    name: `${rarityCfg.name}·${slotCfg.name}`,
  };
}

/** 词条展示文案 */
export function affixText(affix) {
  return AFFIX_BASE[affix.key].fmt(affix.value);
}

/** 单件装备的战力折算：词条数 × 稀有度倍率 ×(1+0.1×星) × 2.5% */
export function gearItemPower(item) {
  const mult = GEAR_RARITY[item.rarity].mult * (1 + STAR_MULT_PER * item.star);
  return item.affixes.length * mult * AFFIX_POWER_UNIT;
}

/** 装备战力加成 = 1 + Σ(单件折算)（指南 11.1 gearPowerBonus） */
export function gearPowerBonus(gear) {
  let bonus = 1;
  for (const item of Object.values(gear ?? {})) {
    if (item) bonus += gearItemPower(item);
  }
  return bonus;
}

/**
 * 已装备词条按 key 汇总，返回**小数比例**（value 是百分点，此处 /100）。
 * 供 combatStats 使用；注意 gearPowerBonus 走的是另一条（词条数×倍率）口径，
 * 两者不叠加到同一处 —— 见 balance.js 顶部说明。
 */
export function gearAffixSum(gear, key) {
  let sum = 0;
  for (const item of Object.values(gear ?? {})) {
    if (!item) continue;
    const starMul = 1 + STAR_MULT_PER * item.star;
    for (const a of item.affixes) if (a.key === key) sum += (a.value / 100) * starMul;
  }
  return sum;
}

// ===== 合成 / 强化 / 分解（指南 11.2）=====

/** 合成：3 件同稀有度 → 1 件高一级；金色不可再合成 */
export function craftGear(items, rng) {
  if (items.length !== 3) return null;
  const r = items[0].rarity;
  if (!items.every((g) => g.rarity === r)) return null;
  const next = RARITY_ORDER[RARITY_ORDER.indexOf(r) + 1];
  if (!next) return null;
  return generateGear(rng, next);
}

/** 强化：同槽位同稀有度 3 件 → 目标 +1 星（上限 5） */
export function enhanceGear(target, fodder) {
  if (target.star >= STAR_MAX) return false;
  if (fodder.length < 3) return false;
  if (fodder.some((g) => g.uid === target.uid)) return false;
  if (!fodder.every((g) => g.slot === target.slot && g.rarity === target.rarity)) return false;
  target.star += 1;
  return true;
}

/** 分解：白 1 / 绿 3 / 蓝 8 / 紫 20 / 金 50 精华 */
export function salvageGear(item) {
  return SALVAGE_ESSENCE[item.rarity] ?? 0;
}
