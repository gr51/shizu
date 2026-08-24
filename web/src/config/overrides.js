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

  // —— 位面叙事与 Boss 词；带 _new 标记的未知 id = 后台新增位面，补默认骨架后注册 ——
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    const p = planes.find((x) => x.id === pid);
    if (!p) {
      if (!patch || !patch._new || !pid.startsWith('plane_')) continue;
      const { _new, codex: _ignored, ...rest } = patch;   // 忽略后台占位 codex，统一由运行时递增分配
      const nextCodex = planes.reduce((m, x) => Math.max(m, Number(x.codex) || 0), 0) + 1;
      planes.push({
        id: pid,
        codex: nextCodex,
        name: rest.name ?? '新位面',
        group: '自定义',
        routes: [],
        waves: [3, 4, 3, 4],
        eliteStages: [3, 4],
        spawnStyle: 'standard',
        poem: '',
        bossDesc: '',
        ...rest,
      });
      continue;
    }
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

  // —— 技能（10 路线 × 6 段；未知 id 视为后台新增条目，追加进池）——
  for (const s2 of o.skills ?? []) {
    const t = findSkill(s2.id);
    if (!t) {
      if (!s2.id || !s2.route || !s2.lv) continue;   // 缺关键键的残条目不入池
      skills.push({ ...s2 });
      continue;
    }
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

  // —— 路线（未知 id 允许注册新路线；互斥缺省为空）——
  for (const [rid, patch] of Object.entries(o.routes ?? {})) {
    const t = ROUTES[rid];
    if (!t) { if (!rid.startsWith('route_')) continue; ROUTES[rid] = { id: rid, mutexWith: [], ...patch }; continue; }
    assignShallow(t, patch);
  }
  for (const c of o.combos ?? []) {
    const t = COMBO_SKILLS.find((x) => x.id === c.id);
    if (!t) { if (!c.id || !Array.isArray(c.routes)) continue; COMBO_SKILLS.push({ ...c }); continue; }
    assignShallow(t, c);
  }

  // —— 共鸣 ——
  for (const s2 of o.synergies ?? []) {
    const t = SYNERGIES.find((x) => x.id === s2.id);
    if (!t) {
      if (!s2.id || !Array.isArray(s2.need)) continue;
      SYNERGIES.push({ ...s2 });
      continue;
    }
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

  // —— 传承（未知 id = 后台新增传承，直接注册）——
  for (const [rid, patch] of Object.entries(o.relics ?? {})) {
    const t = RELICS[rid];
    if (!t) { if (!rid.startsWith('relic_')) continue; RELICS[rid] = { id: rid, name: '新传承', story: '', eff: {}, ...patch }; continue; }
    assignShallow(t, patch);
    if (patch.eff && typeof patch.eff === 'object') t.eff = { ...t.eff, ...patch.eff };
  }

  // —— 危机事件（未知 id 追加进池；不在位面子集过滤名单里=全开位面可抽到）——
  for (const c of o.crises ?? []) {
    const t = CRISES.find((x) => x.id === c.id);
    if (!t) { if (!c.id || !c.duration) continue; CRISES.push({ ...c }); continue; }
    assignShallow(t, c);
  }

  // —— 精英词缀（未知 id 追加；rollEliteAffix 均匀索引即时可见）——
  for (const a of o.eliteAffixes ?? []) {
    const t = ELITE_AFFIXES.find((x) => x.id === a.id);
    if (!t) { if (!a.id) continue; ELITE_AFFIXES.push({ ...a }); continue; }
    assignShallow(t, a);
    if (a.eff && typeof a.eff === 'object') t.eff = { ...t.eff, ...a.eff };
  }

  // —— 通用属性池（未知 id 追加；三选一池实时读取）——
  for (const a of o.attrPool ?? []) {
    const t = GENERIC_ATTR_POOL.find((x) => x.id === a.id);
    if (!t) { if (!a.id || !a.rarity) continue; GENERIC_ATTR_POOL.push({ kind: 'attr', weight: 10, ...a }); continue; }
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

  // —— 裂缝变异（未知 id 追加进池）——
  for (const m of o.riftMods ?? []) {
    const t = RIFT_MODS.find((x) => x.id === m.id);
    if (!t) { if (!m.id || !m.risk) continue; RIFT_MODS.push({ ...m }); continue; }
    Object.assign(t, m);
  }

  // —— 黑市（文案/价格可改；apply 是函数不可序列化，新增条目不安全 → 仅改写）——
  for (const s2 of o.shopItems ?? []) {
    const t = SHOP_ITEMS.find((x) => x.id === s2.id);
    if (!t) continue;
    if (s2.name != null) t.name = s2.name;
    if (s2.desc != null) t.desc = s2.desc;
    if (s2.price != null) t.price = s2.price;
  }

  // —— 支线协议（progress 是函数 → 仅改写）——
  for (const q of o.sideQuests ?? []) {
    const t = SIDE_QUESTS.find((x) => x.id === q.id);
    if (!t) continue;
    if (q.name != null) t.name = q.name;
    if (q.desc != null) t.desc = q.desc;
    if (q.reward != null) t.reward = q.reward;
  }

  // —— 成套重写逃生门：routes 里新来的（后台新增位面/路线场景），不在此处理 ——
}