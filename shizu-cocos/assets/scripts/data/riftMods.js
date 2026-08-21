// ===== data/riftMods.js · 裂缝变异（开局前的高风险高回报选择）=====
// 目的：给「开裂缝」这一步加入真实决策 —— 同一个位面可以主动叠加变异，
// 变强的是敌人，换来的是更高的基因产出。玩家自己决定这局要多难。
//
// 设计约束：
//   · 只作用于本局，不写入永久存档；难度红线（精英/Boss 基准）不动。
//   · 效果统一走「刷怪率 / 敌人乘区 / 奖励乘区」三个口径，便于验证与回滚。
//   · 收益必须与风险成正比，且基因倍率封顶，避免刷分套路化。

/** @typedef {{ id:string, name:string, desc:string, risk:number, eff:object }} RiftMod */

export const RIFT_MODS = [
  {
    id: 'mod_horde',
    name: '虫潮汹涌',
    desc: '刷怪速率 +35%，基因产出 +25%',
    risk: 1,
    eff: { spawnMul: 1.35, geneMul: 1.25 },
  },
  {
    id: 'mod_frenzy',
    name: '狂暴之息',
    desc: '敌人移速 +20%，基因产出 +20%',
    risk: 1,
    eff: { enemySpeedMul: 1.2, geneMul: 1.2 },
  },
  {
    id: 'mod_ironhide',
    name: '铁皮化',
    desc: '杂兵生命 +40%，基因产出 +30%',
    risk: 2,
    eff: { minionHpMul: 1.4, geneMul: 1.3 },
  },
  {
    id: 'mod_elite',
    name: '精英丛生',
    desc: '精英词缀必定出现，基因产出 +35%',
    risk: 2,
    eff: { affixChance: 1, geneMul: 1.35 },
  },
  {
    id: 'mod_glass',
    name: '薄命',
    desc: '你的生命上限 −25%，基因产出 +40%',
    risk: 3,
    eff: { playerHpMul: 0.75, geneMul: 1.4 },
  },
];

export function riftModById(id) {
  return RIFT_MODS.find((m) => m.id === id) ?? null;
}

/** 基因倍率封顶，避免叠满变异后收益失控 */
export const GENE_MUL_CAP = 2.5;

/**
 * 汇总选中的变异效果。
 * @param {string[]} ids
 */
export function aggregateRiftMods(ids) {
  const out = {
    spawnMul: 1, enemySpeedMul: 1, minionHpMul: 1,
    playerHpMul: 1, geneMul: 1, affixChance: null, risk: 0,
  };
  for (const id of ids ?? []) {
    const m = riftModById(id);
    if (!m) continue;
    out.risk += m.risk;
    const e = m.eff;
    if (e.spawnMul) out.spawnMul *= e.spawnMul;
    if (e.enemySpeedMul) out.enemySpeedMul *= e.enemySpeedMul;
    if (e.minionHpMul) out.minionHpMul *= e.minionHpMul;
    if (e.playerHpMul) out.playerHpMul *= e.playerHpMul;
    if (e.geneMul) out.geneMul *= e.geneMul;
    if (e.affixChance != null) out.affixChance = Math.max(out.affixChance ?? 0, e.affixChance);
  }
  out.geneMul = Math.min(GENE_MUL_CAP, out.geneMul);
  return out;
}
