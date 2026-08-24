// ===== config/overrides.js · 后台管理界面的运行时配置覆盖 =====
// 管理页（/admin/）把编辑结果写入 localStorage['cfg_overrides_v1']；
// 游戏装配前在此应用——直接改写已导入数据表的属性（引用可变，const 不碍事）。
// 「清除覆盖」= 移除该键并刷新。

import {
  MINION_SPRITE_BY_STAGE,
  BOSS_BY_PLANE,
  PLANE_MECHANICS,
} from '../../../shizu-cocos/assets/scripts/data/planeModules.js';
import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { RIFT_MODS } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { SHOP_ITEMS } from '../../../shizu-cocos/assets/scripts/data/shopItems.js';
import { SIDE_QUESTS } from '../../../shizu-cocos/assets/scripts/data/sideQuests.js';

const KEY = 'cfg_overrides_v1';

export function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); }
  catch { return null; }
}

export function saveOverrides(o) {
  if (o && Object.values(o).some((v) => v && Object.keys(v).length)) {
    localStorage.setItem(KEY, JSON.stringify(o));
  } else {
    localStorage.removeItem(KEY);
  }
}

export function clearOverrides() { localStorage.removeItem(KEY); }

/** 把覆盖对象应用到已导入的数据表（在 boot 最早期调用） */
export function applyConfigOverrides() {
  const o = loadOverrides();
  if (!o) return;

  // 位面叙事与 Boss 词
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    const p = planes.find((x) => x.id === pid);
    if (!p) continue;
    Object.assign(p, patch);
  }

  // 位面机制参数
  for (const [pid, mech] of Object.entries(o.mechanics ?? {})) {
    const cur = PLANE_MECHANICS[pid];
    if (cur) Object.assign(cur, mech);
    else PLANE_MECHANICS[pid] = { ...mech };
  }

  // 敌人阶段表
  for (const [pid, pairs] of Object.entries(o.stageSprites ?? {})) {
    MINION_SPRITE_BY_STAGE[pid] = pairs;
  }
  for (const [pid, name] of Object.entries(o.bossSprites ?? {})) {
    BOSS_BY_PLANE[pid] = name;
  }

  // 变异 / 黑市 / 支线：按 id 匹配改写
  for (const m of o.riftMods ?? []) {
    const t = RIFT_MODS.find((x) => x.id === m.id);
    if (t) Object.assign(t, m);
  }
  for (const s2 of o.shopItems ?? []) {
    const t = SHOP_ITEMS.find((x) => x.id === s2.id);
    if (!t) continue;
    if (s2.name != null) t.name = s2.name;
    if (s2.desc != null) t.desc = s2.desc;
    if (s2.price != null) t.price = s2.price;
  }
  for (const q of o.sideQuests ?? []) {
    const t = SIDE_QUESTS.find((x) => x.id === q.id);
    if (!t) continue;
    if (q.name != null) t.name = q.name;
    if (q.desc != null) t.desc = q.desc;
    if (q.reward != null) t.reward = q.reward;
  }
}
