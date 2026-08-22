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

/** 按 rng 抽一条精英词缀；chance 未命中则返回 null（不是每只都带）
 *  概率不宜过高：精英是节奏锚点，词缀过密会持续拉长清怪时间，
 *  在单体型位面（小怪少、精英占比高）会明显压低怪潮密度。 */
export function rollEliteAffix(rng, chance = 0.45) {
  if (rng() > chance) return null;
  return ELITE_AFFIXES[Math.floor(rng() * ELITE_AFFIXES.length)] ?? null;
}

export function eliteAffixById(id) {
  return ELITE_AFFIXES.find((a) => a.id === id) ?? null;
}
