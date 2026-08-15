// ===== Rng.ts · 随机数（seed 可复现，引擎无关）=====

export type RNG = () => number;

/** mulberry32：seed 驱动的可复现随机数 */
export function rngFactory(seed: number): RNG {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(min: number, max: number, rng: RNG = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(arr: T[], rng: RNG = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export interface Weighted<T> { item: T; weight: number; }

/** 加权抽取 */
export function weightedPick<T>(entries: Weighted<T>[], rng: RNG = Math.random): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return entries[0].item;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

/** PRD 伪随机：命中重置为基础概率，未命中按 40% 基础步长递增 */
export function prdRoll(baseP: number, currentP: number, rng: RNG = Math.random): { hit: boolean; nextP: number } {
  const hit = rng() < currentP;
  const nextP = hit ? baseP : Math.min(currentP + baseP * 0.4, 1);
  return { hit, nextP };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

let _uid = 0;
export function uid(): string {
  return (Date.now().toString(36) + (++_uid).toString(36)).slice(-10);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
