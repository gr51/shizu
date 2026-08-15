// ===== gear.ts · 装备经济（数值平衡表 7.5）=====

import { GearSlotId, GearRarity, GearAffix, GearItem, AffixKey } from '../core/Types';
import { weightedPick, uid } from '../core/Rng';

export const gearSlots: Record<GearSlotId, { name: string; pref: Partial<Record<AffixKey, number>> }> = {
  claw:    { name: '噬爪',     pref: { atk: 1.4 } },
  shell:   { name: '甲壳',     pref: { hp: 1.3, dmgReduct: 1.3 } },
  crown:   { name: '虫冠',     pref: { cooldown: 1.4 } },
  legs:    { name: '足器',     pref: { speed: 1.4 } },
  core:    { name: '基因核心', pref: { crit: 1.3, aspd: 1.3 } },
  trinket: { name: '传承饰品', pref: {} },
};

export const rarityTable: Record<GearRarity, { affixCount: number; mult: number; essence: number }> = {
  白: { affixCount: 1, mult: 1.0, essence: 1 },
  绿: { affixCount: 2, mult: 1.3, essence: 3 },
  蓝: { affixCount: 3, mult: 1.6, essence: 8 },
  紫: { affixCount: 4, mult: 2.0, essence: 20 },
  金: { affixCount: 5, mult: 2.5, essence: 50 },
};

export const affixPool: { key: AffixKey; name: string; value: number; desc: string; weight: number }[] = [
  { key: 'atk',        name: '噬骨之爪', value: 0.05,  desc: '攻击 +5%',        weight: 10 },
  { key: 'hp',         name: '甲壳强化', value: 0.08,  desc: '生命 +8%',        weight: 10 },
  { key: 'speed',      name: '疾行之足', value: 0.05,  desc: '速度 +5%',        weight: 10 },
  { key: 'crit',       name: '暴君之眼', value: 0.05,  desc: '暴击 +5%',        weight: 8 },
  { key: 'aspd',       name: '连噬之颚', value: 0.05,  desc: '攻速 +5%',        weight: 8 },
  { key: 'lifesteal',  name: '血饲之牙', value: 0.02,  desc: '吸血 +2%',        weight: 7 },
  { key: 'dmgReduct',  name: '厚鳞之甲', value: 0.05,  desc: '减伤 +5%',        weight: 8 },
  { key: 'regen',      name: '自愈之囊', value: 0.005, desc: '回血 +0.5%/s',    weight: 6 },
  { key: 'cooldown',   name: '速咏之腺', value: 0.05,  desc: '冷却 -5%',        weight: 6 },
  { key: 'suckRadius', name: '贪婪触须', value: 0.15,  desc: '吸取半径 +15%',   weight: 5 },
];

export function generateGear(rarity: GearRarity, slot: GearSlotId, rng: () => number = Math.random): GearItem {
  const r = rarityTable[rarity];
  const pref = gearSlots[slot].pref;
  const chosen: GearAffix[] = [];
  while (chosen.length < r.affixCount) {
    const pool = affixPool.map((c) => ({ item: c, weight: (pref[c.key] || 1) * c.weight }));
    const c = weightedPick(pool, rng);
    if (!chosen.some((a) => a.key === c.key)) {
      chosen.push({ key: c.key, value: c.value, weight: 1, desc: c.desc });
    }
  }
  return { uid: uid(), slot, rarity, star: 0, affixes: chosen, name: `${rarity}·${gearSlots[slot].name}` };
}

export function randomSlot(): GearSlotId {
  const keys = Object.keys(gearSlots) as GearSlotId[];
  return keys[Math.floor(Math.random() * keys.length)];
}

/** 装备战力加成 = 1 + Σ(词条数 × 基础倍率 × (1+0.1*星) × 2.5%) */
export function gearPowerBonus(gear: Partial<Record<GearSlotId, GearItem>>): number {
  let sum = 0;
  for (const item of Object.values(gear)) {
    if (!item) continue;
    const r = rarityTable[item.rarity];
    sum += item.affixes.length * r.mult * (1 + 0.1 * item.star) * 0.025;
  }
  return 1 + sum;
}

/** 装备词条合计（按 key） */
export function gearAffixSum(gear: Partial<Record<GearSlotId, GearItem>>, key: AffixKey): number {
  let sum = 0;
  for (const item of Object.values(gear)) {
    if (!item) continue;
    for (const a of item.affixes) if (a.key === key) sum += a.value;
  }
  return sum;
}
