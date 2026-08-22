// ===== data/synergies.js · 构筑共鸣（选项之间的组合奖励）=====
// 目的：让「选什么」不只是叠数字，而是**凑套**。
// 每条共鸣要求集齐若干个已获得的属性/机制 id，集齐即一次性触发永久强化。
//
// 设计约束：
//   · 只读取本局已获得的 id 集合，不改任何既有选项的数值（不破坏平衡基线口径）。
//   · 奖励走 stats 乘/加区，幅度克制：定位是「构筑成立的确认反馈」，不是新的主力成长线。
//   · 每条共鸣一局只触发一次，触发即广播，玩家要能看到自己「凑成了什么」。

/** @typedef {{ id:string, name:string, desc:string, need:string[], eff:object }} Synergy */

export const SYNERGIES = [
  {
    id: 'syn_crit',
    name: '共鸣·裂骨暴君',
    desc: '暴击率与暴击伤害同时在手：暴击伤害再 +40%',
    need: ['attr_crit', 'attr_critdmg'],
    eff: { critDmg: 0.4 },
  },
  {
    id: 'syn_bruiser',
    name: '共鸣·钝甲倒刺',
    desc: '减伤与倒刺同时在手：反震伤害翻倍',
    need: ['attr_dmgreduct', 'attr_thorn'],
    eff: { thornMul: 1.0 },
  },
  {
    id: 'syn_harvest',
    name: '共鸣·饥饿收割',
    desc: '吸取半径与斩杀同时在手：斩杀阈值放宽且伤害再 +20%',
    need: ['attr_suck', 'attr_execute'],
    eff: { execute: 0.2, executeThreshold: 0.15 },
  },
  {
    id: 'syn_sustain',
    name: '共鸣·血饲自愈',
    desc: '吸血与再生同时在手：两者各再提升一档',
    need: ['attr_lifesteal', 'attr_regen'],
    eff: { lifesteal: 0.04, regen: 0.01 },
  },
  {
    id: 'syn_sweep',
    name: '共鸣·噬域狂澜',
    desc: '清场范围与攻速同时在手：范围再 +25%',
    need: ['attr_aoe', 'attr_aspd'],
    eff: { aoe: 0.25 },
  },
  {
    id: 'syn_glass',
    name: '共鸣·疾风利爪',
    desc: '攻击与移速同时在手：攻速 +15%',
    need: ['attr_atk', 'attr_speed'],
    eff: { aspdPct: 0.15 },
  },
  // —— 新增 build 轴共鸣：把同屏清场与「持续伤害/护盾/攻坚」串起来，凑套就换玩法 ——
  {
    id: 'syn_cinders',
    name: '共鸣·燃域',
    desc: '范围与暴击同时在手：每次命中附带灼烧（新持续伤害轴）',
    need: ['attr_aoe', 'attr_crit'],
    eff: { elemental: 1, dotMul: 0.15 },
  },
  {
    id: 'syn_bastion',
    name: '共鸣·坚垒',
    desc: '减伤与再生同时在手：周期性生成护盾吸收伤害',
    need: ['attr_dmgreduct', 'attr_regen'],
    eff: { shieldMul: 1.2, shieldEvery: 18 },
  },
  {
    id: 'syn_huntsman',
    name: '共鸣·诛主',
    desc: '斩杀与暴击同时在手：对精英/位面之主增伤',
    need: ['attr_execute', 'attr_crit'],
    eff: { vsEliteDmgPct: 0.25 },
  },
  {
    id: 'syn_sawtooth',
    name: '共鸣·锯齿',
    desc: '斩杀与攻速同时在手：击杀回充主动技能冷却',
    need: ['attr_execute', 'attr_aspd'],
    eff: { killCdRefund: 0.03 },
  },
  // —— backlog：技能/机制局共鸣（此前 10 条 need 全只认 attr_* id，技能局触发率 ≈ 0）——
  // need 引用技能段位 id 和机制强化 id，让技能通道的构筑也有「凑套」时刻
  {
    id: 'syn_overload_chain',
    name: '共鸣·过载雷链',
    desc: '雷链过载与多跳同时在手：弹射伤害 +30%',
    need: ['chain_overload', 'chain_jump'],
    eff: { aoe: 0.3 },
  },
  {
    id: 'syn_toxic_cloud',
    name: '共鸣·毒云弥漫',
    desc: '毒云与尸爆范围同时在手：DoT 伤害 +25%',
    need: ['corpse_cloud', 'corpse_radius'],
    eff: { dotMul: 0.25 },
  },
  {
    id: 'syn_blast_salvo',
    name: '共鸣·爆破齐射',
    desc: '爆破弹头与多发齐射同时在手：导弹伤害 +30%',
    need: ['missile_blast', 'missile_count'],
    eff: { dmgPct: 0.30 },
  },
  {
    id: 'syn_stagger_pierce',
    name: '共鸣·震慑贯穿',
    desc: '震慑与贯穿同时在手：对被减速的敌人伤害 +20%',
    need: ['stomp_knock', 'multi_pierce'],
    eff: { execute: 0.20 },
  },
];

/**
 * 检查哪些共鸣在本次获取后**刚好**集齐。
 * @param {Set<string>} owned 本局已获得的选项 id
 * @param {Set<string>} fired 已触发过的共鸣 id
 * @returns {Synergy[]} 本次新触发的共鸣
 */
export function newlyFiredSynergies(owned, fired) {
  const out = [];
  for (const s of SYNERGIES) {
    if (fired.has(s.id)) continue;
    if (s.need.every((id) => owned.has(id))) out.push(s);
  }
  return out;
}
