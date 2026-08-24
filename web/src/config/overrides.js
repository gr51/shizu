// ===== config/overrides.js · 运行时配置覆盖（schema 驱动通用引擎）=====
// 管理页把编辑结果写入 localStorage['cfg_overrides_v1']；boot 时应用。
// 数据来源双通道：localStorage（本机预览）与 项目文件 overrides.data.json（可提交）。
//
// ★ 扩展性契约：新增一个「纯数据维度」只需在 schema.js 加一条声明——
//   本文件的通用引擎会自动完成 查重/推送/白名单字段过滤/eff 合并；
//   admin.js 对没有专属构建器的维度也会自动生成通用编辑页。
//   仅真正特殊的逻辑保留手写分支：planes(codex 规则)/敌人阶段表/机制表/远程集/机械强化/攻击方式。

import {
  MINION_SPRITE_BY_STAGE,
  BOSS_BY_PLANE,
  PLANE_MECHANICS,
  RANGED_SPRITES,
} from '../../../shizu-cocos/assets/scripts/data/planeModules.js';
import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { WEAPON_ATTACK, DEFAULT_WEAPON } from '../../../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { MECH_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { SCHEMA } from './schema.js';

const KEY = 'cfg_overrides_v1';

export function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); }
  catch { return null; }
}

export function saveOverrides(o) {
  if (o && typeof o === 'object') localStorage.setItem(KEY, JSON.stringify(o));
  else localStorage.removeItem(KEY);
}

export function clearOverrides() { localStorage.removeItem(KEY); }

/** 浅拷贝补丁字段（跳过函数与 undefined）；restricted 维度只允许 schema 声明的键 */
function applyFields(target, patch, entry) {
  const allowed = entry.restricted ? new Set((entry.fields ?? []).map((f) => f.key)) : null;
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'function' || v === undefined) continue;
    if (allowed && !allowed.has(k)) continue;
    target[k] = v;
  }
  for (const f of entry.fields ?? []) {
    if (f.type === 'json' && patch[f.key] && typeof patch[f.key] === 'object') {
      target[f.key] = { ...(target[f.key] ?? {}), ...patch[f.key] };
    }
  }
  for (const dk of entry.deepKeys ?? []) {
    if (patch[dk]) target[dk] = JSON.parse(JSON.stringify(patch[dk]));
  }
}

/** 通用维度应用：list 按 id 查重（缺则校验 required 后推送），map 直接落键 */
function applyCollection(o) {
  for (const entry of SCHEMA) {
    const patches = o[entry.key];
    if (!patches || typeof patches !== 'object') continue;
    if (entry.kind === 'map') {
      const target = entry.target;
      for (const [rid, patch] of Object.entries(patches)) {
        if (!patch || typeof patch !== 'object') continue;
        if (!target[rid]) {
          if (entry.noAdd || !rid.startsWith(entry.prefix ?? '')) continue;
          target[rid] = { id: rid, ...(entry.baseDefaults ?? {}), ...patch };
          continue;
        }
        applyFields(target[rid], patch, entry);
      }
    } else {
      for (const patch of Array.isArray(patches) ? patches : []) {
        if (!patch?.id) continue;
        const t = entry.find(patch.id);
        if (!t) {
          if (entry.restricted || entry.noAdd) continue;
          const missingRequired = (entry.required ?? []).some((k) => patch[k] == null);
          if (missingRequired) continue;
          entry.push({ id: patch.id, ...(entry.baseDefaults ?? {}), ...patch });
          continue;
        }
        applyFields(t, patch, entry);
      }
    }
  }
}

/** boot 同步入口：应用 localStorage 覆盖 */
export function applyConfigOverrides() {
  applyOverridesData(loadOverrides());
}

/** 应用任意覆盖对象（幂等：所有推送路径先按 id/prefix 查重，重复应用零副作用） */
export function applyOverridesData(o) {
  if (!o || typeof o !== 'object') return;

  // —— 位面：叙事字段 + 新位面骨架注册（codex 由后台导出解析，_new 位面可带回）——
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    const p = planes.find((x) => x.id === pid);
    if (!p) {
      if (!patch || !patch._new || !pid.startsWith('plane_')) continue;
      const { _new, codex, ...rest } = patch;
      const nextCodex = planes.reduce((m, x) => Math.max(m, Number(x.codex) || 0), 0) + 1;
      planes.push({
        id: pid,
        codex: Number(codex) >= 1 ? Number(codex) : nextCodex,
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
    const clean = { ...patch };
    delete clean._new;
    if (!patch._new) delete clean.codex;
    if (clean.stagePlan) clean.stagePlan = JSON.parse(JSON.stringify(clean.stagePlan));
    if (clean.variantWeights) clean.variantWeights = { ...clean.variantWeights };
    if (clean.triggers) clean.triggers = JSON.parse(JSON.stringify(clean.triggers));
    if (Object.keys(clean).length) {
      for (const [k, v] of Object.entries(clean)) {
        if (typeof v !== 'function' && v !== undefined) p[k] = v;
      }
    }
  }

  // —— 位面机制参数 ——
  for (const [pid, mech] of Object.entries(o.mechanics ?? {})) {
    const cur = PLANE_MECHANICS[pid];
    if (cur) {
      for (const [k, v] of Object.entries(mech ?? {})) if (v !== undefined) cur[k] = v;
    } else if (mech) PLANE_MECHANICS[pid] = { ...mech };
  }

  // —— 敌人阶段表 / Boss 表 / 远程集并集 ——
  for (const [pid, pairs] of Object.entries(o.stageSprites ?? {})) {
    if (Array.isArray(pairs) && pairs.length === 5) MINION_SPRITE_BY_STAGE[pid] = pairs;
  }
  for (const [pid, name] of Object.entries(o.bossSprites ?? {})) BOSS_BY_PLANE[pid] = name;
  if (Array.isArray(o.rangedSprites)) for (const s of o.rangedSprites) RANGED_SPRITES.add(s);

  // —— 通用维度（schema 驱动）——
  applyCollection(o);

  // —— 机械强化（嵌套结构，暂保留手写分支）——
  for (const u of o.mechUpgrades ?? []) {
    const t = Object.values(MECH_UPGRADES).flat().find((x) => x.id === u?.id);
    if (!t) continue;
    for (const [k, v] of Object.entries(u)) {
      if (typeof v === 'function' || v === undefined) continue;
      t[k] = v;
    }
    if (u.eff && typeof u.eff === 'object') t.eff = { ...t.eff, ...u.eff };
  }

  // —— 攻击方式（__default 特殊键）——
  for (const [rid, patch] of Object.entries(o.weaponAttack ?? {})) {
    if (rid === '__default') {
      for (const [k, v] of Object.entries(patch ?? {})) if (v !== undefined) DEFAULT_WEAPON[k] = v;
      continue;
    }
    const t = WEAPON_ATTACK[rid];
    if (!t) continue;
    for (const [k, v] of Object.entries(patch ?? {})) if (v !== undefined) t[k] = v;
  }
}