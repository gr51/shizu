// ===== data/attrPool.js · 通用属性池 + 装备词条/稀有度配表 =====
// 来源：《噬祖-数值平衡表》6.1（属性池）、7.5（装备经济表）；《噬祖-开发实现指南》11.1
//
// 红线 3：属性通道的三选一池**不得混入任何路线技能**。本文件只有属性，无技能。

/** 稀有度权重（平衡表 6.2：基础40 / 特色40 / 稀有15 / 传说5） */
export const RARITY_WEIGHT = { base: 40, feature: 40, rare: 15, legend: 5 };

/**
 * 通用属性池（平衡表 6.1 逐条照抄，8 条）。
 * 注意：6.1 表只定义了「基础」与「特色」两档，故本池无 rare/legend 条目 ——
 * 传说档仅由**技能通道**产出（6.2「传说技能仅匹配位面产出」），
 * 这正是红线 3 想要的效果：属性通道拿不到传说。
 */
export const GENERIC_ATTR_POOL = [
  { id: 'attr_atk',       kind: 'attr', rarity: 'base',    name: '攻击强化', desc: '攻击 +10%',          eff: { atkPct: 0.10 } },
  { id: 'attr_hp',        kind: 'attr', rarity: 'base',    name: '生命强化', desc: '生命 +15%',          eff: { hpPct: 0.15 } },
  { id: 'attr_speed',     kind: 'attr', rarity: 'base',    name: '速度强化', desc: '速度 +10%',          eff: { speedPct: 0.10 } },
  { id: 'attr_aspd',      kind: 'attr', rarity: 'base',    name: '攻速强化', desc: '攻速 +8%',           eff: { aspdPct: 0.08 } },
  { id: 'attr_crit',      kind: 'attr', rarity: 'feature', name: '暴击强化', desc: '暴击率 +5%',         eff: { crit: 0.05 } },
  { id: 'attr_lifesteal', kind: 'attr', rarity: 'feature', name: '吸血强化', desc: '吸血 +2%',           eff: { lifesteal: 0.02 } },
  { id: 'attr_regen',     kind: 'attr', rarity: 'feature', name: '回血强化', desc: '回血 +1% 最大生命/s', eff: { regen: 0.01 } },
  { id: 'attr_range',     kind: 'attr', rarity: 'feature', name: '射程强化', desc: '攻击范围 +10%',      eff: { range: 0.10 } },
];

// ===== 装备（平衡表 7.5）=====

/** 6 装备槽位 + 词条倾向池 */
export const GEAR_SLOTS = {
  claw:    { id: 'claw',    name: '噬爪',     affixPool: ['atk', 'crit', 'aspd'] },
  shell:   { id: 'shell',   name: '甲壳',     affixPool: ['hp', 'dmgReduct', 'regen'] },
  crown:   { id: 'crown',   name: '虫冠',     affixPool: ['atk', 'cooldown', 'crit'] },
  legs:    { id: 'legs',    name: '足器',     affixPool: ['speed', 'crit', 'aspd'] },
  core:    { id: 'core',    name: '基因核心', affixPool: ['lifesteal', 'regen', 'hp'] },
  trinket: { id: 'trinket', name: '传承饰品', affixPool: ['suckRadius', 'atk', 'cooldown'] },
};

export const GEAR_SLOT_IDS = Object.keys(GEAR_SLOTS);

/** 5 稀有度：词条数 / 基础倍率 */
export const GEAR_RARITY = {
  white:  { id: 'white',  name: '普通', cn: '白', affixCount: 1, mult: 1.0 },
  green:  { id: 'green',  name: '精良', cn: '绿', affixCount: 2, mult: 1.3 },
  blue:   { id: 'blue',   name: '稀有', cn: '蓝', affixCount: 3, mult: 1.6 },
  purple: { id: 'purple', name: '史诗', cn: '紫', affixCount: 4, mult: 2.0 },
  gold:   { id: 'gold',   name: '传说', cn: '金', affixCount: 5, mult: 2.5 },
};

/** 稀有度升序（合成链：白→绿→蓝→紫→金） */
export const RARITY_ORDER = ['white', 'green', 'blue', 'purple', 'gold'];

/**
 * 词条基准（指南 11.1 AFFIX_BASE）。
 * value 为**百分点**（5 = +5%）；weight 为标准词条价值（平衡表 7.5）。
 */
export const AFFIX_BASE = {
  atk:        { key: 'atk',        name: '攻击',     value: 5,   weight: 1,   fmt: (v) => `攻击 +${v}%` },
  hp:         { key: 'hp',         name: '生命',     value: 8,   weight: 1,   fmt: (v) => `生命 +${v}%` },
  speed:      { key: 'speed',      name: '速度',     value: 5,   weight: 1,   fmt: (v) => `速度 +${v}%` },
  crit:       { key: 'crit',       name: '暴击',     value: 5,   weight: 1,   fmt: (v) => `暴击率 +${v}%` },
  aspd:       { key: 'aspd',       name: '攻速',     value: 5,   weight: 1,   fmt: (v) => `攻速 +${v}%` },
  lifesteal:  { key: 'lifesteal',  name: '吸血',     value: 2,   weight: 1,   fmt: (v) => `吸血 +${v}%` },
  dmgReduct:  { key: 'dmgReduct',  name: '减伤',     value: 5,   weight: 1,   fmt: (v) => `减伤 +${v}%` },
  regen:      { key: 'regen',      name: '回血',     value: 0.5, weight: 1,   fmt: (v) => `回血 +${v}% 最大生命/s` },
  cooldown:   { key: 'cooldown',   name: '技能冷却', value: 5,   weight: 1,   fmt: (v) => `技能 CD -${v}%` },
  suckRadius: { key: 'suckRadius', name: '吸取半径', value: 15,  weight: 0.5, fmt: (v) => `吸取半径 +${v}%` },
};

/** 分解精华（平衡表 7.5）：白 1 / 绿 3 / 蓝 8 / 紫 20 / 金 50 */
export const SALVAGE_ESSENCE = { white: 1, green: 3, blue: 8, purple: 20, gold: 50 };

/** 精华保底兑换：100 精华 = 自选蓝装 */
export const ESSENCE_FOR_BLUE = 100;
