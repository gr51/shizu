// ===== AttrPool.ts · 通用属性池（数值平衡表 六章）=====
// 不匹配位面 → 三选一只能出通用属性（零技能），保证"进错位面也能变强"。

import { RNG } from '../Rng';

export type AttrRarity = 'base' | 'feature' | 'rare' | 'legend';

export interface AttrOption {
  id: string;
  kind: 'attr';
  rarity: AttrRarity;
  name: string;
  desc: string;
  eff: Record<string, number>;   // 供战斗引擎读取
}

/** 通用属性池（跨路线共享，永不混入路线技能） */
export const GENERIC_ATTR_POOL: AttrOption[] = [
  // 基础（base）
  { id: 'attr_atk',   kind: 'attr', rarity: 'base',    name: '攻击强化',   desc: '攻击 +8%',   eff: { atkPct: 0.08 } },
  { id: 'attr_hp',    kind: 'attr', rarity: 'base',    name: '生命强化',   desc: '生命 +12%',  eff: { hpPct: 0.12 } },
  { id: 'attr_speed', kind: 'attr', rarity: 'base',    name: '移速强化',   desc: '移速 +8%',   eff: { speedPct: 0.08 } },
  { id: 'attr_aspd',  kind: 'attr', rarity: 'base',    name: '攻速强化',   desc: '攻速 +10%',  eff: { aspdPct: 0.10 } },
  // 特色（feature）
  { id: 'attr_crit',  kind: 'attr', rarity: 'feature', name: '暴击强化',   desc: '暴击率 +5%', eff: { crit: 0.05 } },
  { id: 'attr_lifesteal', kind: 'attr', rarity: 'feature', name: '吸血',   desc: '吸血 +4%',   eff: { lifesteal: 0.04 } },
  { id: 'attr_regen', kind: 'attr', rarity: 'feature', name: '再生',       desc: '每秒回血 +1%', eff: { regen: 0.01 } },
  { id: 'attr_range', kind: 'attr', rarity: 'feature', name: '射程强化',   desc: '射程 +15%',  eff: { range: 0.15 } },
  // 稀有（rare）
  { id: 'attr_dmgReduct', kind: 'attr', rarity: 'rare', name: '减伤',      desc: '受伤 -8%',   eff: { dmgReduct: 0.08 } },
  { id: 'attr_suckRadius', kind: 'attr', rarity: 'rare', name: '吞噬范围', desc: '吸取范围 +20%', eff: { suckRadius: 0.20 } },
  { id: 'attr_cooldown', kind: 'attr', rarity: 'rare', name: '冷却缩减',   desc: '技能冷却 -10%', eff: { cooldown: 0.10 } },
  // 传说（legend）—— 仅匹配位面可出，属性通道不产出传说
  { id: 'attr_legend', kind: 'attr', rarity: 'legend', name: '全能',       desc: '全属性 +5%', eff: { atkPct: 0.05, hpPct: 0.05, speedPct: 0.05, aspdPct: 0.05 } },
];

/** 按稀有度过滤属性池 */
export function attrPoolByRarity(rarity: AttrRarity): AttrOption[] {
  return GENERIC_ATTR_POOL.filter((a) => a.rarity === rarity);
}

/** 从属性池按稀有度权重抽取 count 个（去重） */
export function rollAttrs(count: number, rng: RNG): AttrOption[] {
  const RARITY_WEIGHT: Record<AttrRarity, number> = { base: 40, feature: 40, rare: 15, legend: 5 };
  const remain = [...GENERIC_ATTR_POOL];
  const out: AttrOption[] = [];
  while (out.length < count && remain.length > 0) {
    const total = remain.reduce((s, a) => s + (RARITY_WEIGHT[a.rarity] ?? 1), 0);
    let roll = rng() * total;
    let idx = 0;
    for (let i = 0; i < remain.length; i++) {
      roll -= RARITY_WEIGHT[remain[i].rarity] ?? 1;
      if (roll <= 0) { idx = i; break; }
    }
    out.push(remain.splice(idx, 1)[0]);
  }
  return out;
}