// ===== data/eliteAffixes.js · 精英词缀（每只精英一条随机词缀，制造「这只不一样」）=====
// 来源思路：动作肉鸽的精英词缀系统（护盾/迅捷/分裂/放血…）——
// 同一只精英换词缀就要换打法，这是在不增加美术量的前提下拉开战斗差异的最高性价比手段。
//
// 设计约束（不破坏既有红线）：
//   · 只挂在 kind==='elite' 上，Boss 与杂兵不带词缀（Boss 已有多阶段狂暴）。
//   · 不改精英基准 HP/ATK（红线 1：150/8 固定），词缀只改**行为与表现**，
//     数值影响走乘区且幅度克制，避免变成事实上的位面固有难度。
//   · 每条词缀必须**可读**：有名字、有颜色，渲染层据此标注。

/** @typedef {{ id:string, name:string, color:string, desc:string, eff:object }} EliteAffix */

export const ELITE_AFFIXES = [
  {
    id: 'shielded',
    name: '铁壁',
    color: '#7fa8c9',
    desc: '受到的伤害降低，但移动更慢',
    eff: { dmgTaken: 0.6, speedMul: 0.8 },
  },
  {
    id: 'swift',
    name: '迅捷',
    color: '#8fe0cb',
    desc: '移动与出手都更快，血量偏低',
    eff: { speedMul: 1.5, skillCdMul: 0.7, hpMul: 0.8 },
  },
  {
    id: 'volatile',
    name: '爆裂',
    color: '#e0653c',
    desc: '死亡时炸开一圈弹幕',
    eff: { deathBurst: 10 },
  },
  {
    id: 'leech',
    name: '汲血',
    color: '#c9556a',
    desc: '命中玩家时自我治疗',
    eff: { leech: 0.06 },
  },
  {
    id: 'warden',
    name: '守望',
    color: '#d8a3d8',
    desc: '周围杂兵移动更快',
    eff: { auraSpeed: 1.25, auraRadius: 220 },
  },
  // —— backlog #3：S3 断档修补的两条纯行为词缀（无新美术，靠行为制造阶段压力）——
  {
    id: 'summoner',
    name: '召唤者',
    color: '#9ac97f',
    desc: '周期在脚下孵出两只杂兵——清场不及时会越滚越多',
    eff: { summonEvery: 9 },
  },
  {
    id: 'aegis',
    name: '坚壁',
    color: '#b0aa98',
    desc: '周围杂兵受到的伤害减半（先杀光环或拉开距离）',
    eff: { auraRadius: 180, auraMul: 0.5 },
  },
  {
    id: 'splitting',
    name: '分裂',
    color: '#7fd47f',
    desc: '死亡时分裂为两只小体（先杀或一次爆发带走）',
    eff: { splitOnDeath: 2 },
  },
];

/**
 * 按 rng 抽词缀；chance 未命中返回 null。
 * opts.pool：限定位面词缀池（id 数组，关卡编辑「这只怪会什么技能」）；
 * opts.count：一次叠多条（怪物技能组合），eff 逐键合并、名字「·」串联。
 */
export function rollEliteAffix(rng, chance = 0.45, opts = {}) {
  if (rng() > chance) return null;
  const pool = Array.isArray(opts.pool) && opts.pool.length
    ? ELITE_AFFIXES.filter((a) => opts.pool.includes(a.id))
    : ELITE_AFFIXES;
  if (!pool.length) return null;
  const count = Math.max(1, Math.min(Number(opts.count) || 1, 3, pool.length));
  const picked = [];
  const bag = [...pool];
  for (let i = 0; i < count && bag.length; i++) {
    picked.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
  }
  if (picked.length === 1) return picked[0];
  const merged = {
    id: picked.map((a) => a.id).join('+'),
    name: picked.map((a) => a.name).join('·'),
    color: picked[picked.length - 1].color,
    desc: picked.map((a) => a.desc).join('；'),
    eff: {},
  };
  // 合并语义：乘区键（×速度/×血量/承伤系数等）连乘，其余（概率/触发强度）求和
  const MUL_KEYS = new Set(['speedMul', 'hpMul', 'skillCdMul', 'auraSpeed', 'auraMul', 'dmgTaken']);
  for (const a of picked) {
    for (const [k, v] of Object.entries(a.eff ?? {})) {
      merged.eff[k] = MUL_KEYS.has(k) ? (merged.eff[k] ?? 1) * v : (merged.eff[k] ?? 0) + v;
    }
  }
  return merged;
}

export function eliteAffixById(id) {
  return ELITE_AFFIXES.find((a) => a.id === id) ?? null;
}
