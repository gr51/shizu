// ===== data/mechUpgrades.js · 路线机制强化（三选一里的「构筑感」选项）=====
// 每条路线机制有一套专属强化选项，只在你激活该路线时出现，名字/描述直接引用你的 Build。
// eff 里的 key 对应 battle.js 里 this.mechLvl 的字段（如 jumps=跳数、radius=范围）。

/** @typedef {{ id: string, name: string, desc: string, eff: object }} MechUpgrade */

export const MECH_UPGRADES = {
  chain: [
    { id: 'chain_jump', name: '雷链 +1 跳', desc: '闪电在敌人间多弹跳一次', eff: { jumps: 1 } },
    { id: 'chain_dmg', name: '雷链伤害 +30%', desc: '每跳伤害提升', eff: { dmg: 0.3 } },
  ],
  corpseBlast: [
    { id: 'corpse_radius', name: '尸爆范围 +40%', desc: '尸体爆炸炸得更广', eff: { radius: 0.4 } },
    { id: 'corpse_dmg', name: '尸爆伤害 +30%', desc: '爆炸更疼', eff: { dmg: 0.3 } },
  ],
  missile: [
    { id: 'missile_count', name: '导弹 +1 枚', desc: '周期齐射多一发', eff: { count: 1 } },
    { id: 'missile_dmg', name: '导弹伤害 +30%', desc: '洗地更狠', eff: { dmg: 0.3 } },
  ],
  stomp: [
    { id: 'stomp_radius', name: '践踏范围 +30%', desc: '震波更大', eff: { radius: 0.3 } },
    { id: 'stomp_dmg', name: '践踏伤害 +30%', desc: '震荡更疼', eff: { dmg: 0.3 } },
  ],
  laser: [
    { id: 'laser_width', name: '激光 +50% 宽', desc: '贯穿线更粗', eff: { width: 0.5 } },
    { id: 'laser_dmg', name: '激光伤害 +30%', desc: '切割更狠', eff: { dmg: 0.3 } },
  ],
  multishot: [
    { id: 'multi_count', name: '弹幕 +1', desc: '再多一发弹体', eff: { count: 1 } },
  ],
  parasite: [
    { id: 'para_chance', name: '寄生概率 +4%', desc: '怪更容易倒戈', eff: { chance: 0.04 } },
  ],
  reflect: [
    { id: 'reflect_dmg', name: '反击伤害 +40%', desc: '金身反震更疼', eff: { dmg: 0.4 } },
  ],
  combo: [
    { id: 'combo_every', name: '连击更易爆发', desc: '爆发间隔 -1 下', eff: { every: -1 } },
    { id: 'combo_dmg', name: '连击伤害 +30%', desc: '爆发增伤提升', eff: { dmg: 0.3 } },
  ],
};

/** 某路线机制的强化池（未激活该路线则空） */
export function mechUpgradePool(routeMech) {
  return (MECH_UPGRADES[routeMech] ?? []).map((m) => ({ ...m, kind: 'mech', mech: routeMech, rarity: 2 }));
}