// ===== 装备数据（数值平衡表 7.5 装备经济）=====

/** 6 装备槽位 */
export const 槽位表 = {
  claw:  { 名: '噬爪', 说明: '攻击词条概率 +20%' },
  shell: { 名: '甲壳', 说明: '生命/减伤词条概率 +20%' },
  crown: { 名: '虫冠', 说明: '技能冷却词条概率 +20%' },
  legs:  { 名: '足器', 说明: '速度词条概率 +20%' },
  core:  { 名: '基因核心', 说明: '暴击/攻速词条概率 +20%' },
  trinket: { 名: '传承饰品', 说明: '全能词条池' },
};

/** 稀有度（白→金）：词条数 / 基础倍率 / 分解精华 */
export const 稀有度表 = {
  白: { 词条数: 1, 倍率: 1.0, 精华: 1 },
  绿: { 词条数: 2, 倍率: 1.3, 精华: 3 },
  蓝: { 词条数: 3, 倍率: 1.6, 精华: 8 },
  紫: { 词条数: 4, 倍率: 2.0, 精华: 20 },
  金: { 词条数: 5, 倍率: 2.5, 精华: 50 },
};

/**
 * 词条池（10 种）。key 用于属性中心合计。
 * value 为加成比例（0.05 = +5%），装备词条基值：
 * 攻+5% / 血+8% / 速+5% / 暴击+5% / 攻速+5% / 吸血+2% / 减伤+5% / 回血+0.5% / 冷却-5% / 吸取半径+15%
 */
export const 词条池 = [
  { key: 'atk',        名: '噬骨之爪', 值: 0.05, 描述: '攻击 +5%', 权重: 10 },
  { key: 'hp',         名: '甲壳强化', 值: 0.08, 描述: '生命 +8%', 权重: 10 },
  { key: 'speed',      名: '疾行之足', 值: 0.05, 描述: '速度 +5%', 权重: 10 },
  { key: 'crit',       名: '暴君之眼', 值: 0.05, 描述: '暴击 +5%', 权重: 8 },
  { key: 'aspd',       名: '连噬之颚', 值: 0.05, 描述: '攻速 +5%', 权重: 8 },
  { key: 'lifesteal',  名: '血饲之牙', 值: 0.02, 描述: '吸血 +2%', 权重: 7 },
  { key: 'dmgReduct',  名: '厚鳞之甲', 值: 0.05, 描述: '减伤 +5%', 权重: 8 },
  { key: 'regen',      名: '自愈之囊', 值: 0.005, 描述: '回血 +0.5%/s', 权重: 6 },
  { key: 'cooldown',   名: '速咏之腺', 值: 0.05, 描述: '冷却 -5%', 权重: 6 },
  { key: 'suckRadius', 名: '贪婪触须', 值: 0.15, 描述: '吸取半径 +15%', 权重: 5 },
];

/** 槽位偏好：该槽位词条权重提升 */
export const 槽位偏好 = {
  claw:  { atk: 1.4 },
  shell: { hp: 1.3, dmgReduct: 1.3 },
  crown: { cooldown: 1.4 },
  legs:  { speed: 1.4 },
  core:  { crit: 1.3, aspd: 1.3 },
  trinket: {},
};

/** 生成一件装备 */
export function 生成装备(稀有度, 槽位, rng = Math.random) {
  const r = 稀有度表[稀有度];
  const 词条数 = r.词条数;
  const 已选 = [];
  const 偏好 = 槽位偏好[槽位] || {};
  while (已选.length < 词条数) {
    const pool = 词条池.map((c) => ({ ...c, 权重: (偏好[c.key] || 1) * c.权重 }));
    const total = pool.reduce((s, c) => s + c.权重, 0);
    let x = rng() * total;
    let hit = pool[pool.length - 1];
    for (const c of pool) { x -= c.权重; if (x <= 0) { hit = c; break; } }
    if (!已选.some((a) => a.key === hit.key)) {
      已选.push({ key: hit.key, 名: hit.名, value: hit.值, 描述: hit.描述 });
    }
  }
  const 名称 = `${稀有度}·${槽位表[槽位].名}`;
  return {
    uid: (rng() * 1e9).toString(36) + Date.now().toString(36).slice(-4),
    名称, 槽位, 稀有度, 星: 0, 词条: 已选,
  };
}

/** 装备战力加成文本 */
export function 装备战力文本(装备) {
  let sum = 0;
  for (const slot of Object.values(装备)) {
    if (!slot) continue;
    const r = 稀有度表[slot.稀有度];
    sum += slot.词条.length * r.倍率 * (1 + 0.1 * slot.星) * 0.025;
  }
  return sum;
}
