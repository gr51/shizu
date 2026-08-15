// ===== core/drop.js · 掉落表（基因 / 装备 / 传承 / 传说 / 隐藏）=====
// 来源：《噬祖-开发实现指南》九章；《噬祖-数值平衡表》7.1 / 7.3 / 7.4 / 7.5
//
// 红线 3 的装备侧：装备通道**全位面开放**，属性通道掉率 ×1.5 补偿。
// PRD 一律走 core/prd.js 的 prdRoll(save, key, rng) —— 计数器落存档，跨局累积。

import { ZHUTIAN_ID } from '../data/planes.js';
import { generateGear } from './gear.js';
import { prdRoll } from './prd.js';
import { randInt } from './rng.js';
import { rollHiddenSkill } from './skillSlots.js';
import { skillsByRoute } from '../data/skills.js';

/** 基因掉落（平衡表 7.1） */
export function geneDrop(kind, rng) {
  if (kind === 'boss') return randInt(200, 300, rng);
  if (kind === 'stageBoss') return randInt(80, 120, rng);
  if (kind === 'elite') return randInt(30, 50, rng);
  return randInt(5, 10, rng);
}

/** 属性通道装备掉率补偿倍率（平衡表 7.5） */
export const ATTR_CHANNEL_GEAR_MULT = 1.5;

/** 非位面之主装备掉率（平衡表 7.5 掉落来源表） */
const COMMON_GEAR_TABLE = {
  minion: [{ p: 0.005, rarity: 'white' }],
  elite: [{ p: 0.01, rarity: 'green' }, { p: 0.04, rarity: 'white' }],
  stageBoss: [{ p: 0.005, rarity: 'blue' }, { p: 0.03, rarity: 'green' }, { p: 0.08, rarity: 'white' }],
};

/**
 * 小怪 / 精英 / 阶段 BOSS 的装备掉落。
 * 按稀有度从高到低依次判定（高稀有优先，避免被白装吞掉）。
 */
export function rollCommonGear(kind, isAttrChannel, isZhutian, rng) {
  const table = COMMON_GEAR_TABLE[kind];
  if (!table) return null;
  const mult = (isAttrChannel ? ATTR_CHANNEL_GEAR_MULT : 1) * (isZhutian ? 2 : 1);
  for (const row of table) {
    if (rng() < row.p * mult) return generateGear(rng, row.rarity);
  }
  return null;
}

/**
 * 位面之主装备稀有度：100% 保底蓝，紫 25%，金 5%（指南 9 章 rollBossGear）。
 * 属性通道 ×1.5 体现为「更容易上翻到紫/金」。
 */
export function rollBossGearRarity(isAttrChannel, rng) {
  const mult = isAttrChannel ? ATTR_CHANNEL_GEAR_MULT : 1;
  const roll = rng() / mult;      // ×1.5 掉率 ⇒ 判定值缩小 1.5 倍，更易命中高档
  if (roll < 0.05) return 'gold';
  if (roll < 0.30) return 'purple';
  return 'blue';
}

/**
 * 位面之主完整掉落（就地更新 save 上的 PRD 计数器）。
 * @returns {{genes:number, gear:object[], relics:string[], legendSkillId:string|null, hiddenSkill:object|null}}
 */
export function rollBossDrop(dungeon, save, rng) {
  const plane = dungeon.plane;
  const isZhutian = plane.id === ZHUTIAN_ID;
  const isSkillChannel = dungeon.channel === 'skill';
  const isAttrChannel = !isSkillChannel;

  const relics = [];
  // 普通传承：诸天之心必掉「崩坏之心」，其余 20% + PRD 保底
  if (isZhutian) {
    relics.push('relic_benghuaixin');
  } else if (prdRoll(save, 'relicPity', rng)) {
    relics.push(`relic_${plane.id}`);
  }
  // 稀有传承：5% + PRD 保底
  if (prdRoll(save, 'rareRelic', rng)) {
    relics.push(`relic_rare_${plane.id}`);
  }

  // 传说技能：0.5% PRD，仅匹配位面
  let legendSkillId = null;
  if (isSkillChannel && prdRoll(save, 'legendPity', rng)) {
    legendSkillId = rollLegendSkill(dungeon, save, rng);
  }

  // 隐藏技能：0.1% PRD，仅匹配位面
  let hiddenSkill = null;
  if (isSkillChannel && prdRoll(save, 'hiddenPity', rng)) {
    hiddenSkill = rollHiddenSkill(plane, save, rng);
  }

  // 装备：位面之主必掉；诸天之心双倍
  const gear = [generateGear(rng, rollBossGearRarity(isAttrChannel, rng))];
  if (isZhutian) gear.push(generateGear(rng, rollBossGearRarity(isAttrChannel, rng)));

  return { genes: geneDrop('boss', rng), gear, relics, legendSkillId, hiddenSkill };
}

/** 传说技能 = 已激活路线的 Lv6 终极技（平衡表 6.2：仅匹配位面产出） */
function rollLegendSkill(dungeon, save, rng) {
  const owned = new Set(save.inventory.comboSkills);
  const pool = [];
  for (const route of dungeon.channelRoutes) {
    for (const s of skillsByRoute(route)) {
      if (s.lv === 6 && !owned.has(s.id)) pool.push(s.id);
    }
  }
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/** 普通击杀掉落（基因 + 可能的装备） */
export function rollKillDrop(dungeon, save, kind, rng) {
  const isAttrChannel = dungeon.channel === 'attr';
  const isZhutian = dungeon.plane.id === ZHUTIAN_ID;
  return {
    genes: geneDrop(kind, rng),
    gear: rollCommonGear(kind, isAttrChannel, isZhutian, rng),
  };
}
