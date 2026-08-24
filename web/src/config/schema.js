// ===== config/schema.js · 可编辑资产维度注册表（唯一真源）=====
// 目标：新增一个可配置维度 = 在这里加一条声明，而不是散改五个文件。
// 消费方：
//   · config/overrides.js —— applyOverridesData 按 schema 通用应用（查重/推送/白名单字段）
//   · admin.js —— 未写专属构建器的维度自动获得通用编辑页；新增按钮取 addDefaults
//
// 字段类型：text | num | json(效果eff) ；restricted 集合只允许列出的键被覆盖。
// kind：list（按 id 查重的数组）｜map（键值表）｜special（保留手写分支）。

import { skills, findSkill } from '../../../shizu-cocos/assets/scripts/data/skills.js';
import { SYNERGIES } from '../../../shizu-cocos/assets/scripts/data/synergies.js';
import { RELICS } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { CRISES } from '../../../shizu-cocos/assets/scripts/data/crises.js';
import { ELITE_AFFIXES } from '../../../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { GENERIC_ATTR_POOL } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { RIFT_MODS } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { COMBO_SKILLS } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { HIDDEN_SKILLS } from '../../../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { ACHIEVEMENTS } from '../../../shizu-cocos/assets/scripts/data/achievements.js';
import { NEST_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/nestUpgrades.js';
import { SHOP_ITEMS } from '../../../shizu-cocos/assets/scripts/data/shopItems.js';
import { SIDE_QUESTS } from '../../../shizu-cocos/assets/scripts/data/sideQuests.js';

const T = {
  name: { key: 'name', type: 'text', label: '名称' },
  desc: { key: 'desc', type: 'text', label: '描述' },
};

/** 通用维度声明。eff:true 表示存在结构化效果字段（JSON 编辑 + 运行时合并）。 */
export const SCHEMA = [
  {
    key: 'skills', label: '技能', kind: 'list',
    find: (id) => findSkill(id), push: (e) => skills.push(e),
    required: ['route', 'lv'],
    addDefaults: () => ({ route: 'xiake', lv: 1, kind: 'passive', name: '新技能' }),
    fields: [T.name, { key: 'desc', type: 'text', label: '描述' }, { key: 'val', type: 'text', label: '数值文案' }, { key: 'cd', type: 'num', label: 'CD(s)' }, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'synergies', label: '共鸣', kind: 'list',
    find: (id) => SYNERGIES.find((x) => x.id === id), push: (e) => SYNERGIES.push(e),
    required: ['need'],
    addDefaults: () => ({ need: ['attr_atk', 'attr_crit'], name: '新共鸣' }),
    fields: [T.name, T.desc, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'relics', label: '传承', kind: 'map', target: RELICS, prefix: 'relic_',
    baseDefaults: { name: '新传承', story: '', eff: {} },
    fields: [T.name, { key: 'story', type: 'text', label: '故事' }, { key: 'eff', type: 'json', label: '效果 eff（残响×2 自动）' }],
  },
  {
    key: 'crises', label: '危机', kind: 'list',
    find: (id) => CRISES.find((x) => x.id === id), push: (e) => CRISES.push(e),
    required: ['duration'],
    addDefaults: () => ({ name: '新危机', warn: '⚠ 危机来袭！', duration: 8 }),
    fields: [T.name, T.desc, { key: 'warn', type: 'text', label: '预警文案' }],
  },
  {
    key: 'eliteAffixes', label: '词缀', kind: 'list',
    find: (id) => ELITE_AFFIXES.find((x) => x.id === id), push: (e) => ELITE_AFFIXES.push(e),
    addDefaults: () => ({ name: '新词缀', color: '#9ac97f' }),
    fields: [T.name, { key: 'color', type: 'text', label: '颜色' }, T.desc, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'attrPool', label: '属性池', kind: 'list',
    find: (id) => GENERIC_ATTR_POOL.find((x) => x.id === id), push: (e) => GENERIC_ATTR_POOL.push({ kind: 'attr', weight: 10, ...e }),
    required: ['rarity'],
    addDefaults: () => ({ rarity: 'feature', weight: 10, name: '新属性' }),
    fields: [T.name, T.desc, { key: 'rarity', type: 'text', label: '稀有度' }, { key: 'weight', type: 'num', label: '权重' }, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'riftMods', label: '变异', kind: 'list',
    find: (id) => RIFT_MODS.find((x) => x.id === id), push: (e) => RIFT_MODS.push(e),
    required: ['risk'],
    addDefaults: () => ({ name: '新变异', risk: 2 }),
    fields: [T.name, T.desc, { key: 'risk', type: 'num', label: '风险' }],
  },
  {
    key: 'combos', label: '组合技', kind: 'list',
    find: (id) => COMBO_SKILLS.find((x) => x.id === id), push: (e) => COMBO_SKILLS.push(e),
    required: ['routes'],
    addDefaults: () => ({ name: '新组合技', routes: ['xiake', 'shanhai'] }),
    fields: [T.name, T.desc],
  },
  {
    key: 'routes', label: '路线', kind: 'map', target: ROUTES, prefix: 'route_',
    baseDefaults: { name: '新路线', role: '', skin: '', mutexWith: [] },
    fields: [{ key: 'name', type: 'text', label: '名称' }, { key: 'role', type: 'text', label: '定位' }, { key: 'skin', type: 'text', label: '皮肤' }],
  },
  {
    key: 'hiddenSkills', label: '隐藏技', kind: 'map', target: HIDDEN_SKILLS, noAdd: true,
    fields: [T.name, T.desc, { key: 'route', type: 'text', label: '路线' }, { key: 'kind', type: 'text', label: '类型' }, { key: 'slotPrefer', type: 'text', label: '槽位偏好' }, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'achievements', label: '成就', kind: 'list', restricted: true,
    find: (id) => ACHIEVEMENTS.find((x) => x.id === id),
    fields: [T.name, T.desc, { key: 'reward', type: 'text', label: '奖励文案' }],
  },
  {
    key: 'nestUpgrades', label: '虫巢', kind: 'list',
    find: (id) => NEST_UPGRADES.find((x) => x.id === id),
    fields: [T.name, T.desc, { key: 'max', type: 'num', label: '上限' }, { key: 'eff', type: 'json', label: '效果 eff' }],
  },
  {
    key: 'shopItems', label: '黑市', kind: 'list', restricted: true,
    find: (id) => SHOP_ITEMS.find((x) => x.id === id),
    fields: [T.name, T.desc, { key: 'price', type: 'num', label: '价格' }],
  },
  {
    key: 'sideQuests', label: '支线', kind: 'list', restricted: true,
    find: (id) => SIDE_QUESTS.find((x) => x.id === id),
    fields: [T.name, T.desc, { key: 'reward', type: 'num', label: '奖励基因' }],
  },
];

/** 按 schema 取某维度的目标集合（list 返回数组引用，map 返回表对象） */
export function schemaTarget(entry) {
  if (entry.kind !== 'map') return null;
  return entry.target;
}

/** 新增条目：合并默认骨架与自增 id */
export function schemaNewEntry(entry, makeId) {
  const id = `${entry.prefix ?? entry.key.slice(0, 4)}_${makeId()}`;
  return { id, ...(entry.baseDefaults ?? {}), ...(entry.addDefaults ? entry.addDefaults() : {}) };
}