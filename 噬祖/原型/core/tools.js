// ===== tools.js · 通用工具 =====

/** 可复现随机数生成器（mulberry32），支持 seed 驱动 */
export function rngFactory(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 加权抽取：entries = [{item, weight}] */
export function weightedPick(entries, rng = Math.random) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return entries[0].item;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

/** PRD 伪随机：命中后重置为基础概率，未命中按步长递增 */
export function prdRoll(baseP, currentP, rng = Math.random) {
  const hit = rng() < currentP;
  const nextP = hit ? baseP : Math.min(currentP + baseP * 0.4, 1);
  return { hit, nextP };
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
