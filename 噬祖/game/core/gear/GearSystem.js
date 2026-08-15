// ===== gear/GearSystem.js · 装备系统（开发指南 11 章 + 数值平衡表 7.5）=====
// 合成：3 件同稀有度 → 1 件更高稀有度（白→绿→蓝→紫→金）
// 强化：同槽位同名 +3 件 → 目标 +1 星（词条数值 ×1.1/星，上限 +5）
// 分解：白 1 / 绿 3 / 蓝 8 / 紫 20 / 金 50 装备精华
// 战力加成：1 + Σ(词条数 × 稀有度倍率 × (1+0.1×星) × 2.5%)

import { generateGear, GEAR_RARITY, RARITY_ORDER } from '../reward/DropTable.js';
import { rngFactory } from '../rng.js';

/** 合成升级映射：白→绿→蓝→紫→金 */
export const CRAFT_NEXT = { white: 'green', green: 'blue', blue: 'purple', purple: 'gold' };

/** 分解精华表（数值平衡表 7.5） */
export const SALVAGE_ESSENCE = { white: 1, green: 3, blue: 8, purple: 20, gold: 50 };

/** 强化上限 */
export const MAX_STAR = 5;

/**
 * 合成：3 件同稀有度 → 1 件更高稀有度
 * @param {object} a 装备
 * @param {object} b 装备
 * @param {object} c 装备
 * @param {object} [rng] 随机函数
 * @returns {object|null} 新装备（槽位随机）或 null（条件不满足）
 */
export function craftGear(a, b, c, rng = Math.random) {
  if (!a || !b || !c) return null;
  if (a.rarity !== b.rarity || b.rarity !== c.rarity) return null;
  if (a.rarity === 'gold') return null; // 金不可再合成
  const next = CRAFT_NEXT[a.rarity];
  return generateGear(rng, next);
}

/**
 * 强化：同槽位同名 +3 件 → 目标 +1 星（上限 +5）
 * @param {object} target 目标装备（会被修改）
 * @param {object[]} three 3 件同槽位同稀有度材料
 * @returns {boolean} 是否成功
 */
export function enhanceGear(target, three) {
  if (!target || !Array.isArray(three) || three.length < 3) return false;
  if (target.star >= MAX_STAR) return false;
  const valid = three.every((g) => g && g.slot === target.slot && g.rarity === target.rarity);
  if (!valid) return false;
  target.star += 1;
  return true;
}

/**
 * 分解：返回装备精华数量
 * @param {object} g 装备
 * @returns {number} 精华数
 */
export function salvageGear(g) {
  if (!g) return 0;
  return SALVAGE_ESSENCE[g.rarity] ?? 0;
}

/**
 * 单件装备战力加成（含强化星级）
 * 加成 = 词条数 × 稀有度倍率 × (1 + 0.1×星) × 2.5%
 * @param {object} g 装备
 * @returns {number} 单件加成（如 0.12 = +12%）
 */
export function gearPower(g) {
  if (!g) return 0;
  const mult = GEAR_RARITY[g.rarity].mult * (1 + 0.1 * (g.star ?? 0));
  return g.affixes.length * mult * 0.025;
}

/**
 * 已穿戴装备总战力加成：1 + Σ(单件加成)
 * @param {object} gear 穿戴表 { slot: GearItem|null }
 * @returns {number} 总加成（1 = 无加成）
 */
export function gearPowerBonus(gear = {}) {
  let bonus = 1;
  for (const g of Object.values(gear)) {
    if (g) bonus += gearPower(g);
  }
  return bonus;
}

/**
 * 装备精华合成保底：100 精华 = 自选蓝（数值平衡表 7.5）
 * @param {number} essence 当前精华
 * @param {string} slotKey 自选槽位
 * @param {object} [rng] 随机函数
 * @returns {{ok:boolean, gear:object|null, essence:number}} 结果
 */
export function craftGuaranteedBlue(essence, slotKey, rng = Math.random) {
  if (essence < 100) return { ok: false, gear: null, essence };
  return { ok: true, gear: generateGear(rng, 'blue', slotKey), essence: essence - 100 };
}

/**
 * 便捷：从背包按稀有度分组（供合成 UI 使用）
 * @param {object[]} bag 装备背包
 * @returns {object} { white: [], green: [], blue: [], purple: [], gold: [] }
 */
export function groupByRarity(bag = []) {
  const groups = { white: [], green: [], blue: [], purple: [], gold: [] };
  for (const g of bag) {
    if (groups[g.rarity]) groups[g.rarity].push(g);
  }
  return groups;
}

/**
 * 便捷：从背包按槽位分组（供强化 UI 使用）
 * @param {object[]} bag 装备背包
 * @returns {object} { claw: [], shell: [], crown: [], legs: [], core: [], trinket: [] }
 */
export function groupBySlot(bag = []) {
  const groups = {};
  for (const g of bag) {
    (groups[g.slot] ??= []).push(g);
  }
  return groups;
}