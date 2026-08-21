// ===== data/nestUpgrades.js · 虫巢永久升级（局外元进度）=====
// 目的：把「失败」也变成推进 —— 每局带回的基因除了兑换永久属性，
// 还能买断式解锁**开局就生效的能力**，让下一局起点不同（而不是每次都从同一条线开始）。
//
// 设计约束：
//   · 只增不减、买断式（无重置），与「一条账号一路走到黑」的宿命感一致。
//   · 效果必须进 computePower 的既有口径或局内 stats，不新增第二套隐形碾压常量。
//   · 价格按级数递增，等级上限小（3-5 级），避免把局内构筑压成配角。

/** @typedef {{ id:string, name:string, desc:string, max:number, cost:(lv:number)=>number, eff:object }} NestUpgrade */

export const NEST_UPGRADES = [
  {
    id: 'nest_vitality',
    name: '巢髓·体质',
    desc: '每级开局生命 +8%',
    max: 5,
    cost: (lv) => 150 + lv * 150,
    eff: { hpPct: 0.08 },
  },
  {
    id: 'nest_fang',
    name: '巢髓·利齿',
    desc: '每级开局攻击 +6%',
    max: 5,
    cost: (lv) => 180 + lv * 180,
    eff: { atkPct: 0.06 },
  },
  {
    id: 'nest_reroll',
    name: '巢髓·抉择',
    desc: '每级开局免费重掷 +1 次',
    max: 3,
    cost: (lv) => 240 + lv * 240,
    eff: { freeReroll: 1 },
  },
  {
    id: 'nest_banish',
    name: '巢髓·断绝',
    desc: '每级本局放逐次数 +1',
    max: 2,
    cost: (lv) => 300 + lv * 300,
    eff: { banish: 1 },
  },
  {
    id: 'nest_suck',
    name: '巢髓·贪食',
    desc: '每级基因吸取半径 +15%',
    max: 3,
    cost: (lv) => 120 + lv * 120,
    eff: { suckRadius: 0.15 },
  },
  {
    id: 'nest_revive',
    name: '巢髓·残命',
    desc: '解锁后每局一次：致死伤害时保留 1 点生命并回复 25%',
    max: 1,
    cost: () => 900,
    eff: { revive: 1 },
  },
];

export function nestUpgradeById(id) {
  return NEST_UPGRADES.find((u) => u.id === id) ?? null;
}

/** 当前等级（存档 player.nestUpgrades 里按 id 记级） */
export function nestLevel(save, id) {
  return save?.player?.nestUpgrades?.[id] ?? 0;
}

/** 下一级价格；已满级返回 null */
export function nextCost(save, id) {
  const u = nestUpgradeById(id);
  if (!u) return null;
  const lv = nestLevel(save, id);
  if (lv >= u.max) return null;
  return u.cost(lv);
}

/** 汇总所有已购升级的效果（供开局装载） */
export function aggregateNestEff(save) {
  const out = { hpPct: 0, atkPct: 0, freeReroll: 0, banish: 0, suckRadius: 0, revive: 0 };
  for (const u of NEST_UPGRADES) {
    const lv = nestLevel(save, u.id);
    if (lv <= 0) continue;
    for (const [k, v] of Object.entries(u.eff)) {
      out[k] = (out[k] ?? 0) + v * lv;
    }
  }
  return out;
}

/**
 * 购买一级：扣库存基因并升级。
 * @returns {{ok:boolean, reason?:string, cost?:number, level?:number}}
 */
export function buyNestUpgrade(save, id) {
  const u = nestUpgradeById(id);
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = nestLevel(save, id);
  if (lv >= u.max) return { ok: false, reason: '已满级' };
  const cost = u.cost(lv);
  if ((save.inventory.genes ?? 0) < cost) return { ok: false, reason: '基因不足' };
  save.inventory.genes -= cost;
  save.player.nestUpgrades = save.player.nestUpgrades ?? {};
  save.player.nestUpgrades[id] = lv + 1;
  return { ok: true, cost, level: lv + 1 };
}
