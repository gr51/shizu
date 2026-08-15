// ===== core/rng.js · 可复现随机（引擎无关，零 DOM 依赖）=====
// 红线相关：每日挑战固定种子（指南十二章）要求同 seed 必须产出同副本，
// 因此本模块**不使用** Math.random / Date.now —— 全部随机都必须显式传入 rng。

/** @typedef {() => number} RNG 返回 [0,1) */

/** mulberry32：seed 驱动的可复现随机数 */
export function rngFactory(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** [min, max] 闭区间整数 */
export function randInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** [min, max) 连续区间 */
export function randRange(min, max, rng) {
  return min + (max - min) * rng();
}

export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * 加权抽取。entries = [{ item, weight }]。
 * 总权重 <= 0 时返回 null（调用方须显式处理，不静默返回首项）。
 */
export function weightedPick(entries, rng) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

/**
 * 按权重不放回抽取 count 个（去重）。
 * weightOf(item) 返回该项权重；权重 <= 0 的项不会被抽中。
 */
export function weightedPickMany(pool, count, weightOf, rng) {
  const remain = pool.filter((x) => weightOf(x) > 0);
  const out = [];
  while (out.length < count && remain.length > 0) {
    const total = remain.reduce((s, x) => s + weightOf(x), 0);
    let roll = rng() * total;
    let idx = remain.length - 1;
    for (let i = 0; i < remain.length; i++) {
      roll -= weightOf(remain[i]);
      if (roll < 0) {
        idx = i;
        break;
      }
    }
    out.push(remain.splice(idx, 1)[0]);
  }
  return out;
}

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 可复现的实例 id（装备 uid 等）；依赖 rng，不依赖时钟 */
export function uid(rng) {
  return (
    Math.floor(rng() * 0xffffffff).toString(36) +
    Math.floor(rng() * 0xffffffff).toString(36)
  ).slice(0, 12);
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

/** FNV-1a（指南十二章 simpleHash） */
export function simpleHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 每日挑战固定种子（指南十二章）。
 * 日期由调用方传入（不读时钟），便于测试与跨端对齐。
 * @param {{year:number, month:number, day:number}} date month 为 1-12
 */
export function dailySeed(date) {
  const dateStr = `${date.year}${String(date.month).padStart(2, '0')}${String(date.day).padStart(2, '0')}`;
  return simpleHash(dateStr + 'SHIZU_DAILY_SALT');
}
