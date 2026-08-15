// ===== core/save.js · 存档结构 / 存储适配器 / 版本迁移 =====
// 来源：《噬祖-开发实现指南》三章
//
// 存储适配器采用**注入**而非全局探测：Node 测试注入内存实现，
// 浏览器注入 localStorage，微信/抖音各注入自己的 Storage —— 核心层保持零平台依赖。
// 红线 6：所有跨局变更集中在 finalizeRun / activateRoute 之后一次 persist。

import { GEAR_SLOT_IDS } from '../data/attrPool.js';

export const SAVE_KEY = 'shizu_save';
export const SAVE_VERSION = 1;

/** 单维永久成长上限 +500%（平衡表 一章「单维成长上限」） */
export const PERM_GROWTH_CAP_PCT = 500;

/** dynFactor 钳制区间（红线 5） */
export const DYN_FACTOR_MIN = 0.7;
export const DYN_FACTOR_MAX = 1.5;

/** @typedef {{ get(key:string): string|null, set(key:string, value:string): void, remove(key:string): void }} StorageLike */

/** 内存存储（Node 测试 / 无痕降级） */
export function createMemoryStorage() {
  const map = new Map();
  return {
    get: (k) => (map.has(k) ? map.get(k) : null),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

/** 浏览器 localStorage 适配（不可用时降级为内存，不抛错） */
export function createWebStorage() {
  try {
    const probe = '__shizu_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return {
      get: (k) => globalThis.localStorage.getItem(k),
      set: (k, v) => globalThis.localStorage.setItem(k, v),
      remove: (k) => globalThis.localStorage.removeItem(k),
    };
  } catch {
    return createMemoryStorage();
  }
}

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    player: {
      nestlingName: '噬灵',
      totalRuns: 0,
      wins: 0,
      consecFails: 0,

      // 永久属性：**百分点**（2 = +2%），见指南 4.1 computePower 的 /100
      permAtkPct: 0,
      permHpPct: 0,
      permSpeedPct: 0,
      permGrowthCursor: 0, // 攻/血/速 轮转游标（平衡表 八章「三选一轮转」）

      geneLocks: {},       // RouteId -> 已解锁段数 0-6
      geneLockCharge: {},  // RouteId -> 累计充能基因（平衡表 4.6 阈值表的输入）
      sealedRoutes: [],    // 互斥产生的永久封印

      difficultyLevel: 'normal',
      dynFactor: 1.0,

      skillSlots: { activeA: null, activeB: null, passiveC: null, passiveD: null },

      gear: {},            // GearSlotId -> GearItem
      gearBag: [],
      gearEssence: 0,
    },
    inventory: {
      genes: 0,
      relics: [],
      comboSkills: [],
      hiddenSkills: [],
    },
    stats: {
      relicPity: 0,
      rareRelic: 0,
      legendPity: 0,
      hiddenPity: 0,
      gearPity: 0,
      firstClear: false,
      endlessUnlocked: false,
      achievementFlags: {},
    },
  };
}

/**
 * 版本迁移：递归补齐缺失字段，保留玩家已有数据。
 * 破坏性变更时在此按 version 分支处理。
 */
export function migrate(data) {
  const base = createDefaultSave();
  const out = fillDefaults(data ?? {}, base);
  out.version = SAVE_VERSION;

  // 结构性修补：清掉指向不存在槽位的装备键
  for (const k of Object.keys(out.player.gear)) {
    if (!GEAR_SLOT_IDS.includes(k) || !out.player.gear[k]) delete out.player.gear[k];
  }
  // dynFactor 无论来源如何都必须在钳制区间内（红线 5）
  out.player.dynFactor = Math.min(DYN_FACTOR_MAX, Math.max(DYN_FACTOR_MIN, Number(out.player.dynFactor) || 1));
  return out;
}

function fillDefaults(value, base) {
  if (Array.isArray(base)) return Array.isArray(value) ? value : [...base];
  if (base !== null && typeof base === 'object') {
    const src = value !== null && typeof value === 'object' ? value : {};
    const out = {};
    for (const k of Object.keys(base)) out[k] = fillDefaults(src[k], base[k]);
    // 保留 base 里没有但玩家档里有的键（如 geneLocks / achievementFlags 的动态键）
    for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k];
    return out;
  }
  return value === undefined ? base : value;
}

/** 创建一个绑定了存储的存档仓库 */
export function createSaveRepo(storage) {
  return {
    load() {
      try {
        const raw = storage.get(SAVE_KEY);
        return migrate(raw ? JSON.parse(raw) : null);
      } catch (e) {
        console.error('[save] 读档失败，已重置', e);
        return createDefaultSave();
      }
    },
    persist(data) {
      storage.set(SAVE_KEY, JSON.stringify(data));
    },
    reset() {
      storage.remove(SAVE_KEY);
    },
  };
}
