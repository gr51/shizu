// ===== data/shopItems.js · 裂缝黑市（局内商店：把基因变成即时战力）=====
// 目的：给基因第二个用途 —— 除了升级阈值与重掷，阶段间还能主动购买。
// 这创造了「攒着升级 vs 现在买」的资源分配决策，也给运气差的局一条自救路径。
//
// 设计约束：
//   · 只在阶段推进时开门（不打断战斗节奏），一次开门固定 3 件随机商品。
//   · 商品效果复用既有 stats 口径与既有系统（回血/属性/放逐次数/机制强化），
//     不新增第二套战斗逻辑。
//   · 价格随阶段递增，避免后期基因通胀让商店变成无脑扫货。

/** @typedef {{ id:string, name:string, desc:string, price:number, apply:(run:object)=>void }} ShopItem */

export const SHOP_ITEMS = [
  {
    id: 'shop_heal',
    name: '血肉修补',
    desc: '立即回复 40% 生命上限',
    price: 60,
    apply: (run) => { run.heal(run.stats.maxHp * 0.4, '黑市', true); },
  },
  {
    id: 'shop_atk',
    name: '狂噬血清',
    desc: '本局攻击 +18%',
    price: 110,
    apply: (run) => { run.stats.atk *= 1.18; },
  },
  {
    id: 'shop_aspd',
    name: '痉挛腺体',
    desc: '本局攻速 +15%',
    price: 110,
    apply: (run) => { run.stats.aspd *= 1.15; },
  },
  {
    id: 'shop_aoe',
    name: '噬域扩散剂',
    desc: '本局清场范围 +25%',
    price: 130,
    apply: (run) => { run.stats.aoe = (run.stats.aoe ?? 0) + 0.25; },
  },
  {
    id: 'shop_maxhp',
    name: '厚壳培养液',
    desc: '本局生命上限 +20%（并回满该部分）',
    price: 120,
    apply: (run) => {
      const add = run.stats.maxHp * 0.2;
      run.stats.maxHp += add;
      run.hp = Math.min(run.stats.maxHp, run.hp + add);
    },
  },
  {
    id: 'shop_banish',
    name: '断绝符',
    desc: '本局放逐次数 +1',
    price: 90,
    apply: (run) => { run.banishUsed -= 1; },
  },
  {
    id: 'shop_reroll',
    name: '抉择符',
    desc: '获得 2 次免费重掷',
    price: 80,
    apply: (run) => { run.freeRerollLeft += 2; },
  },
  {
    id: 'shop_revive',
    name: '残命囊',
    desc: '获得一次致死拦截（可与巢髓叠加）',
    price: 260,
    apply: (run) => { run.reviveLeft += 1; },
  },
  {
    id: 'shop_crit',
    name: '裂瞳药剂',
    desc: '本局暴击率 +10%',
    price: 120,
    apply: (run) => { run.stats.crit += 0.10; },
  },
  {
    id: 'shop_lifesteal',
    name: '饮血菌株',
    desc: '本局吸血 +4%',
    price: 130,
    apply: (run) => { run.stats.lifesteal += 0.04; },
  },
];

export function shopItemById(id) {
  return SHOP_ITEMS.find((s) => s.id === id) ?? null;
}

/** 阶段价格系数：越往后越贵，抵消后期基因通胀 */
export function stagePriceMul(stageNo) {
  return 1 + Math.max(0, stageNo - 1) * 0.25;
}

/**
 * 开一次黑市：随机 3 件不重复商品，价格按阶段放大。
 * @param {() => number} rng
 * @param {number} stageNo
 */
export function rollShop(rng, stageNo, count = 3) {
  const pool = [...SHOP_ITEMS];
  const out = [];
  const mul = stagePriceMul(stageNo);
  while (out.length < count && pool.length) {
    const i = Math.floor(rng() * pool.length);
    const item = pool.splice(i, 1)[0];
    out.push({ ...item, price: Math.round(item.price * mul) });
  }
  return out;
}
