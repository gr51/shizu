// ===== core/projectOverrides.js · Web 后台保存配置的 Cocos 运行时消费 =====
// 只做纯数据就地覆盖，不依赖 DOM/cc；Web 端的 overrides.js 与 Cocos 端共用同一份 JSON。

import { planes } from '../data/planes.js';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE, PLANE_MECHANICS, RANGED_SPRITES } from '../data/planeModules.js';
import { skills } from '../data/skills.js';
import { HIDDEN_SKILLS } from '../data/hiddenSkills.js';
import { ROUTES, COMBO_SKILLS } from '../data/routes.js';
import { SYNERGIES } from '../data/synergies.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { RELICS } from '../data/relics.js';
import { CRISES } from '../data/crises.js';
import { ELITE_AFFIXES } from '../data/eliteAffixes.js';
import { GENERIC_ATTR_POOL } from '../data/attrPool.js';
import { NEST_UPGRADES } from '../data/nestUpgrades.js';
import { MECH_UPGRADES } from '../data/mechUpgrades.js';
import { WEAPON_ATTACK, DEFAULT_WEAPON } from '../data/weaponAttack.js';
import { RIFT_MODS } from '../data/riftMods.js';
import { SHOP_ITEMS } from '../data/shopItems.js';
import { SIDE_QUESTS } from '../data/sideQuests.js';

const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
const patchOne = (target, patch) => {
  if (!target || !patch) return;
  for (const [k, v] of Object.entries(patch)) {
    if (k !== '_new' && v !== undefined && typeof v !== 'function') target[k] = clone(v);
  }
};
const patchList = (list, patches) => {
  for (const patch of Array.isArray(patches) ? patches : []) {
    const target = list.find((x) => x.id === patch?.id);
    if (target) patchOne(target, patch);
  }
};

export function applyProjectOverrides(o) {
  if (!o || typeof o !== 'object') return;
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    let p = planes.find((x) => x.id === pid);
    if (!p && patch?._new && String(pid).startsWith('plane_')) {
      p = { id: pid, codex: Number(patch.codex) || planes.length + 1, name: '新位面', group: '自定义', routes: [], waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard' };
      planes.push(p);
    }
    if (p) patchOne(p, patch);
  }
  for (const [pid, patch] of Object.entries(o.mechanics ?? {})) {
    PLANE_MECHANICS[pid] ??= {};
    patchOne(PLANE_MECHANICS[pid], patch);
  }
  for (const [pid, pairs] of Object.entries(o.stageSprites ?? {})) if (Array.isArray(pairs)) MINION_SPRITE_BY_STAGE[pid] = clone(pairs);
  for (const [pid, name] of Object.entries(o.bossSprites ?? {})) BOSS_BY_PLANE[pid] = name;
  if (Array.isArray(o.rangedSprites)) for (const name of o.rangedSprites) RANGED_SPRITES.add(name);

  patchList(skills, o.skills);
  for (const [id, patch] of Object.entries(o.hiddenSkills ?? {})) patchOne(HIDDEN_SKILLS[id], patch);
  for (const [id, patch] of Object.entries(o.routes ?? {})) patchOne(ROUTES[id], patch);
  patchList(COMBO_SKILLS, o.combos);
  patchList(SYNERGIES, o.synergies);
  patchList(ACHIEVEMENTS, o.achievements);
  for (const [id, patch] of Object.entries(o.relics ?? {})) patchOne(RELICS[id], patch);
  patchList(CRISES, o.crises);
  patchList(ELITE_AFFIXES, o.eliteAffixes);
  patchList(GENERIC_ATTR_POOL, o.attrPool);
  patchList(NEST_UPGRADES, o.nestUpgrades);
  patchList(Object.values(MECH_UPGRADES).flat(), o.mechUpgrades);
  for (const [id, patch] of Object.entries(o.weaponAttack ?? {})) patchOne(id === '__default' ? DEFAULT_WEAPON : WEAPON_ATTACK[id], patch);
  patchList(RIFT_MODS, o.riftMods);
  patchList(SHOP_ITEMS, o.shopItems);
  patchList(SIDE_QUESTS, o.sideQuests);
}
