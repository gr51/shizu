// ===== upgrade/AttrPool.js · 通用属性池（数值平衡表 6.1）=====
// 三通道之「属性通道」：不匹配位面时，三选一从本池抽取通用属性。
// 硬规则：不匹配位面零技能，本池不得混入任何路线技能。

/** 通用属性选项 */
export const GENERIC_ATTR_POOL = [
  // —— 基础档（权重 40）——
  { id: 'attr_atk',    kind: 'attr', rarity: 'base',    name: '攻击强化', desc: '攻击 +10%', eff: { atkPct: 0.10 } },
  { id: 'attr_hp',     kind: 'attr', rarity: 'base',    name: '生命强化', desc: '生命 +15%', eff: { hpPct: 0.15 } },
  { id: 'attr_speed',  kind: 'attr', rarity: 'base',    name: '速度强化', desc: '速度 +10%', eff: { speedPct: 0.10 } },
  { id: 'attr_aspd',   kind: 'attr', rarity: 'base',    name: '攻速强化', desc: '攻速 +8%',  eff: { aspdPct: 0.08 } },
  // —— 特色档（权重 40）——
  { id: 'attr_crit',   kind: 'attr', rarity: 'feature', name: '暴击强化', desc: '暴击率 +5%', eff: { crit: 0.05 } },
  { id: 'attr_lifesteal', kind: 'attr', rarity: 'feature', name: '吸血强化', desc: '吸血 +2%', eff: { lifesteal: 0.02 } },
  { id: 'attr_regen',  kind: 'attr', rarity: 'feature', name: '回血强化', desc: '回血 +1% 最大生命/s', eff: { regen: 0.01 } },
  { id: 'attr_range',  kind: 'attr', rarity: 'feature', name: '射程强化', desc: '攻击范围 +10%', eff: { range: 0.10 } },
];

/** 稀有度权重（数值平衡表 6.2：基础40 / 特色40 / 稀有15 / 传说5） */
export const RARITY_WEIGHT = { base: 40, feature: 40, rare: 15, legend: 5 };

/** 按稀有度权重去重抽取 count 个属性 */
export function rollAttrs(count, rng = Math.random) {
  const remain = [...GENERIC_ATTR_POOL];
  const out = [];
  while (out.length < count && remain.length > 0) {
    const total = remain.reduce((s, x) => s + (RARITY_WEIGHT[x.rarity] ?? 1), 0);
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