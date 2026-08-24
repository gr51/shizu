// ===== config/overrides.js · 后台管理界面的运行时配置覆盖 =====
// 管理页（/web/admin.html）把编辑结果写入 localStorage['cfg_overrides_v1']；
// 游戏装配前在此应用——直接改写已导入数据表的属性（引用可变，const 不碍事）。
// 「清除覆盖」= 移除该键并刷新。
//
// ⚠ 保持向后兼容：老版本 KEY 里的字段（planes/mechanics/stageSprites/bossSprites/
//   riftMods/shopItems/sideQuests）继续生效；本文件在此基础上扩展了
//   skills / hiddenSkills / routes / combos / synergies / achievements / relics /
//   crises / eliteAffixes / attrPool / nestUpgrades / mechUpgrades / weaponAttack。

import {
  MINION_SPRITE_BY_STAGE,
  BOSS_BY_PLANE,
  PLANE_MECHANICS,
  RANGED_SPRITES,
} from '../../../shizu-cocos/assets/scripts/data/planeModules.js';
import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { RIFT_MODS } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { SHOP_ITEMS } from '../../../shizu-cocos/assets/scripts/data/shopItems.js';
import { SIDE_QUESTS } from '../../../shizu-cocos/assets/scripts/data/sideQuests.js';
import { skills, findSkill } from '../../../shizu-cocos/assets/scripts/data/skills.js';
import { HIDDEN_SKILLS } from '../../../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { ROUTES, COMBO_SKILLS } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { SYNERGIES } from '../../../shizu-cocos/assets/scripts/data/synergies.js';
import { ACHIEVEMENTS } from '../../../shizu-cocos/assets/scripts/data/achievements.js';
import { RELICS } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { CRISES } from '../../../shizu-cocos/assets/scripts/data/crises.js';
import { ELITE_AFFIXES } from '../../../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { GENERIC_ATTR_POOL } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { NEST_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/nestUpgrades.js';
import { MECH_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { WEAPON_ATTACK, DEFAULT_WEAPON } from '../../../shizu-cocos/assets/scripts/data/weaponAttack.js';

const KEY = 'cfg_overrides_v1';

export function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); }
  catch { return null; }
}

export function saveOverrides(o) {
  // 有对象就存（哪怕只改了黑市/支线这类局部维度）；显式传 null 才移除
  if (o && typeof o === 'object') {
    localStorage.setItem(KEY, JSON.stringify(o));
  } else {
    localStorage.removeItem(KEY);
  }
}

export function clearOverrides() { localStorage.removeItem(KEY); }

/** 按对象逐个浅拷贝可写的展示/叙事字段（保留原对象上的函数/复杂字段） */
function assignShallow(target, patch) {
  if (!patch || typeof patch !== 'object') return;
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'function') continue;              // 不覆盖 apply/progress 等函数
    if (v !== undefined) target[k] = v;
  }
}

/** 把覆盖对象应用到已导入的数据表（在 boot 最早期调用） */
export function applyConfigOverrides() {
  const o = loadOverrides();
  if (!o) return;

  // —— 位面叙事与 Boss 词 ——
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    const p = planes.find((x) => x.id === pid);
    if (!p) continue;
    assignShallow(p, patch);
  }

  // —— 位面机制参数 ——
  for (const [pid, mech] of Object.entries(o.mechanics ?? {})) {
    const cur = PLANE_MECHANICS[pid];
    if (cur) assignShallow(cur, mech);
    else PLANE_MECHANICS[pid] = { ...mech };
  }

  // —— 敌人阶段表 ——
  for (const [pid, pairs] of Object.entries(o.stageSprites ?? {})) {
    if (Array.isArray(pairs) && pairs.length === 5) MINION_SPRITE_BY_STAGE[pid] = pairs;
  }
  for (const [pid, name] of Object.entries(o.bossSprites ?? {})) {
    BOSS_BY_PLANE[pid] = name;
  }
  // 远程集：后台提供一个显式覆盖（替换为给定 set 的交集，避免塞入未定义 sprite）
  if (Array.isArray(o.rangedSprites)) {
    // 尽量保留原声明里的合理项 + 后台新增项；这里做并集
    for (const s of o.rangedSprites) RANGED_SPRITES.add(s);
  }

  // —— 技能（10 路线 × 6 段）——
  for (const s2 of o.skills ?? []) {
    const t = findSkill(s2.id);
    if (!t) continue;
    assignShallow(t, s2);
    if (s2.eff && typeof s2.eff === 'object') t.eff = { ...t.eff, ...s2.eff };
  }

  // —— 隐藏技能（禁忌）——
  for (const [hid, patch] of Object.entries(o.hiddenSkills ?? {})) {
    if (!HIDDEN_SKILLS[hid]) continue;
    assignShallow(HIDDEN_SKILLS[hid], patch);
    if (patch.eff && typeof patch.eff === 'object') {
      HIDDEN_SKILLS[hid].eff = { ...(HIDDEN_SKILLS[hid].eff ?? {}), ...patch.eff };
    }
  }

  // —— 路线 / 组合技 ——
  for (const [rid, patch] of Object.entries(o.routes ?? {})) {
    const t = ROUTES[rid];
    if (!t) continue;
    assignShallow(t, patch);
  }
  for (const c of o.combos ?? []) {
    const t = COMBO_SKILLS.find((x) => x.id === c.id);
    if (!t) continue;
    assignShallow(t, c);
  }

  // —— 共鸣 ——
  for (const s2 of o.synergies ?? []) {
    const t = SYNERGIES.find((x) => x.id === s2.id);
    if (!t) continue;
    assignShallow(t, s2);
    if (s2.eff && typeof s2.eff === 'object') t.eff = { ...t.eff, ...s2.eff };
  }

  // —— 成就（desc / reward 文案可改；check/grant 是函数，跳过）——
  for (const a of o.achievements ?? []) {
    const t = ACHIEVEMENTS.find((x) => x.id === a.id);
    if (!t) continue;
    if (a.name != null) t.name = a.name;
    if (a.desc != null) t.desc = a.desc;
    if (a.reward != null) t.reward = a.reward;
  }

  // —— 传承 ——
  for (const [rid, patch] of Object.entries(o.relics ?? {})) {
    const t = RELICS[rid];
    if (!t) continue;
    assignShallow(t, patch);
    if (patch.eff && typeof patch.eff === 'object') t.eff = { ...t.eff, ...patch.eff };
  }

  // —— 危机事件 ——
  for (const c of o.crises ?? []) {
    const t = CRISES.find((x) => x.id === c.id);
    if (!t) continue;
    assignShallow(t, c);
  }

  // —— 精英词缀 ——
  for (const a of o.eliteAffixes ?? []) {
    const t = ELITE_AFFIXES.find((x) => x.id === a.id);
    if (!t) continue;
    assignShallow(t, a);
    if (a.eff && typeof a.eff === 'object') t.eff = { ...t.eff, ...a.eff };
  }

  // —— 通用属性池 ——
  for (const a of o.attrPool ?? []) {
    const t = GENERIC_ATTR_POOL.find((x) => x.id === a.id);
    if (!t) continue;
    assignShallow(t, a);
    if (a.eff && typeof a.eff === 'object') t.eff = { ...t.eff, ...a.eff };
  }

  // —— 虫巢强化（文案 / 上限 / 价格梯度可改；cost 是函数，保留）——
  for (const u of o.nestUpgrades ?? []) {
    const t = NEST_UPGRADES.find((x) => x.id === u.id);
    if (!t) continue;
    assignShallow(t, u);
    if (u.eff && typeof u.eff === 'object') t.eff = { ...t.eff, ...u.eff };
  }

  // —— 机械强化 ——
  for (const u of o.mechUpgrades ?? []) {
    const t = Object.values(MECH_UPGRADES).flat().find((x) => x.id === u.id);
    if (!t) continue;
    assignShallow(t, u);
    if (u.eff && typeof u.eff === 'object') t.eff = { ...t.eff, ...u.eff };
  }

  // —— 攻击方式（路线武器）——
  for (const [rid, patch] of Object.entries(o.weaponAttack ?? {})) {
    if (rid === '__default') { assignShallow(DEFAULT_WEAPON, patch); continue; }
    const t = WEAPON_ATTACK[rid];
    if (!t) continue;
    assignShallow(t, patch);
  }

  // —— 成套重写逃生门：routes 里新来的（后台新增位面/路线场景），不在此处理 ——
}