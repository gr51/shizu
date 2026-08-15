// ===== reward/DropTable.js · 掉落表（开发指南 九章 + 数值平衡表 七章）=====
// 三通道之「装备通道」：全位面共享，击杀掉落；不匹配位面（属性通道）掉率 ×1.5。
// 位面之主：必掉基因 + 传承 + 保底蓝装备（紫 25% / 金 5%）+ 传说/隐藏技能（仅匹配位面）。
// 非位面之主：小怪 0.5% 白 / 精英 4% 白 1% 绿 / 阶段BOSS 8% 白 3% 绿 0.5% 蓝。

import { PRDCounter } from './PRDCounter.js';
import { planeChannel } from '../plane/PlanePool.js';
import { rollHiddenSkill } from '../upgrade/SkillSlotSystem.js';
import { skills } from '../../data/skills.js';

/** 诸天之心 codex（全路线融合位面，掉落双倍） */
export const ZHUTIAN_CODEX = 12;

// ===== 装备词条池（数值平衡表 7.5）=====
// 词条：{ key, name, desc, value(百分比小数), standard(标准词条价值) }
export const GEAR_AFFIXES = {
  atk:        { key: 'atk',        name: '攻击',     desc: '攻击 +5%',        value: 0.05, standard: 1 },
  hp:         { key: 'hp',         name: '生命',     desc: '生命 +8%',        value: 0.08, standard: 1 },
  speed:      { key: 'speed',      name: '速度',     desc: '速度 +5%',        value: 0.05, standard: 1 },
  crit:       { key: 'crit',       name: '暴击',     desc: '暴击率 +5%',      value: 0.05, standard: 1 },
  aspd:       { key: 'aspd',       name: '攻速',     desc: '攻速 +5%',        value: 0.05, standard: 1 },
  lifesteal:  { key: 'lifesteal',  name: '吸血',     desc: '吸血 +2%',        value: 0.02, standard: 1 },
  dmgReduct:  { key: 'dmgReduct',  name: '减伤',     desc: '减伤 +5%',        value: 0.05, standard: 1 },
  regen:      { key: 'regen',      name: '回血',     desc: '回血 +0.5% 最大生命/s', value: 0.005, standard: 1 },
  cooldown:   { key: 'cooldown',   name: '技能冷却', desc: '技能 CD -5%',     value: 0.05, standard: 1 },
  suckRadius: { key: 'suckRadius', name: '吸取半径', desc: '吸取半径 +15%',   value: 0.15, standard: 0.5 },
};

/** 装备槽位（数值平衡表 7.5 · 6 槽） */
export const GEAR_SLOTS = {
  claw:    { name: '噬爪',     affixPool: ['atk', 'crit', 'aspd'] },
  shell:   { name: '甲壳',     affixPool: ['hp', 'dmgReduct', 'regen'] },
  crown:   { name: '虫冠',     affixPool: ['atk', 'cooldown', 'crit'] },
  legs:    { name: '足器',     affixPool: ['speed', 'crit', 'aspd'] },
  core:    { name: '基因核心', affixPool: ['lifesteal', 'regen', 'hp'] },
  trinket: { name: '传承饰品', affixPool: ['suckRadius', 'atk', 'cooldown'] },
};

/** 稀有度配置：词条数 / 基础倍率（数值平衡表 7.5） */
export const GEAR_RARITY = {
  white:  { name: '普通', affixCount: 1, mult: 1.0 },
  green:  { name: '精良', affixCount: 2, mult: 1.3 },
  blue:   { name: '稀有', affixCount: 3, mult: 1.6 },
  purple: { name: '史诗', affixCount: 4, mult: 2.0 },
  gold:   { name: '传说', affixCount: 5, mult: 2.5 },
};

/** 稀有度顺序（用于合成升级） */
export const RARITY_ORDER = ['white', 'green', 'blue', 'purple', 'gold'];

/**
 * 生成一件装备（词条 roll，开发指南 11.1）
 * @param {object} rng 随机函数
 * @param {string} rarity 稀有度（white/green/blue/purple/gold）
 * @param {string} [slotKey] 指定槽位（缺省随机）
 * @returns {object} 装备对象
 */
export function generateGear(rng = Math.random, rarity = 'white', slotKey) {
  const keys = Object.keys(GEAR_SLOTS);
  const slot = slotKey ?? keys[Math.floor(rng() * keys.length)];
  const slotCfg = GEAR_SLOTS[slot];
  const rarityCfg = GEAR_RARITY[rarity];

  // 从槽位词条池去重抽取 affixCount 个词条；池不足时从全局词条池补充（保证高稀有度词条数）
  const pool = [...slotCfg.affixPool];
  const globalPool = Object.keys(GEAR_AFFIXES).filter((k) => !pool.includes(k));
  const affixes = [];
  while (affixes.length < rarityCfg.affixCount) {
    const src = pool.length > 0 ? pool : globalPool;
    if (src.length === 0) break;
    const idx = Math.floor(rng() * src.length);
    const key = src.splice(idx, 1)[0];
    affixes.push({ ...GEAR_AFFIXES[key] });
  }

  return {
    uid: rng().toString(36).slice(2, 10) + rng().toString(36).slice(2, 6),
    slot,
    slotName: slotCfg.name,
    rarity,
    rarityName: rarityCfg.name,
    star: 0,
    affixes,
    // 战力折算 = Σ(词条数 × 基础倍率 × 2.5%)，此处存标准词条价值总和
    power: affixes.reduce((s, a) => s + a.standard, 0) * rarityCfg.mult * 0.025,
  };
}

/**
 * 位面之主装备稀有度：保底蓝（紫 25% / 金 5%）；属性通道 ×1.5（数值平衡表 7.5）
 * @returns {string|null} 稀有度
 */
export function rollBossGear(plane, save, rng = Math.random) {
  const isAttrChannel = planeChannel(plane, save) === 'attr';
  const mult = isAttrChannel ? 1.5 : 1;
  const roll = rng() * mult;
  if (roll < 0.05) return 'gold';    // 金 5%
  if (roll < 0.30) return 'purple';  // 紫 25%
  return 'blue';                     // 保底蓝
}

/**
 * 非位面之主掉落：小怪 0.5% 白 / 精英 4% 白 1% 绿 / 阶段BOSS 8% 白 3% 绿 0.5% 蓝
 * 属性通道（不匹配位面）掉率 ×1.5
 * @param {'minion'|'elite'|'stageBoss'} kind 敌人类型
 * @param {boolean} isAttrChannel 是否属性通道
 * @returns {object|null} 装备对象或 null
 */
export function rollCommonGear(kind, isAttrChannel, rng = Math.random) {
  const mult = isAttrChannel ? 1.5 : 1;
  const base = {
    minion:    { p: 0.005, rarity: 'white' },
    elite:     { p: 0.04,  rarity: 'white' },
    stageBoss: { p: 0.08,  rarity: 'white' },
  }[kind];
  if (!base) return null;

  // 先判定是否掉落（基础概率 × 通道倍率）
  if (rng() >= base.p * mult) return null;

  // 掉落 → 按敌人类型 roll 稀有度（精英可绿，阶段BOSS可绿/蓝）
  const roll = rng();
  if (kind === 'stageBoss') {
    if (roll < 0.05) return generateGear(rng, 'blue');   // 蓝 0.5%
    if (roll < 0.35) return generateGear(rng, 'green');  // 绿 3%
    return generateGear(rng, 'white');                   // 白 8%
  }
  if (kind === 'elite') {
    if (roll < 0.2) return generateGear(rng, 'green');   // 绿 1%
    return generateGear(rng, 'white');                   // 白 4%
  }
  return generateGear(rng, 'white');                     // 小怪白 0.5%
}

/**
 * 传说技能掉落：从匹配位面路线技能池随机一个（仅匹配位面触发）
 * @param {object} plane 位面对象
 * @returns {object|null} 技能对象
 */
export function rollLegendSkill(plane, rng = Math.random) {
  const pool = skills.filter((s) => s.route === plane.route);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 位面之主掉落判定（开发指南 9 章）
 * @param {object} plane 位面对象（data/planes.js）
 * @param {object} save 存档
 * @param {object} [rng] 随机函数
 * @returns {object} { drops: string[], genes: number, gear: object|null, legendSkill: object|null, hiddenSkill: object|null }
 */
export function rollBossDrop(plane, save, rng = Math.random) {
  const isZhutian = plane.codex === ZHUTIAN_CODEX;
  const isSkillChannel = planeChannel(plane, save) === 'skill';
  const drops = ['genes']; // 必掉基因

  // 传承：普通 20%（保底 8 次）/ 稀有 5%；诸天之心必掉「崩坏之心」
  const relicP = isZhutian ? 1 : 0.20;
  if (relicP === 1 || new PRDCounter(relicP, relicP * 2).roll(rng)) {
    drops.push(isZhutian ? 'relic_benghuaixin' : `relic_${plane.route ?? plane.codex}`);
  }

  // 传说技能：0.5%，PRD 递增，仅匹配位面
  let legendSkill = null;
  if (isSkillChannel && new PRDCounter(0.005, 0.001).roll(rng)) {
    legendSkill = rollLegendSkill(plane, rng);
    if (legendSkill) drops.push('legend_skill');
  }

  // 隐藏技能（禁忌级）：0.1%，PRD 递增，仅匹配位面；槽位永久替换
  let hiddenSkill = null;
  if (isSkillChannel && new PRDCounter(0.001, 0.0004).roll(rng)) {
    hiddenSkill = rollHiddenSkill(plane, save, rng);
    if (hiddenSkill) drops.push('hidden_skill');
  }

  // 装备：位面之主 100% 保底稀有蓝（紫 25% / 金 5%）；不匹配位面掉率 ×1.5
  const gearRarity = rollBossGear(plane, save, rng);
  const gear = gearRarity ? generateGear(rng, gearRarity) : null;
  if (gear) drops.push(`gear:${gearRarity}`);

  return {
    drops,
    genes: Math.floor(200 + rng() * 101), // 200-300
    gear,
    legendSkill,
    hiddenSkill,
  };
}

/**
 * 便捷：按敌人类型收集掉落（供战斗结算调用）
 * @param {object} plane 位面对象
 * @param {object} save 存档
 * @param {string} kind 敌人类型
 * @param {object} [rng] 随机函数
 * @returns {object} { gear: object|null, genes: number }
 */
export function rollKillDrop(plane, save, kind, rng = Math.random) {
  const isAttrChannel = planeChannel(plane, save) === 'attr';
  const gear = rollCommonGear(kind, isAttrChannel, rng);
  const genes = {
    minion: 5 + Math.floor(rng() * 6),      // 5-10
    elite: 30 + Math.floor(rng() * 21),     // 30-50
    stageBoss: 80 + Math.floor(rng() * 41), // 80-120
  }[kind] ?? 0;
  return { gear, genes };
}