// ===== GeneLockSystem.ts · 基因锁：激活 / 互斥封印 / 充能（开发实现指南 八章）=====
// 规则：
//  1) 首进新位面 → 永久激活对应路线（跨局，写存档），解锁第 1 段。
//  2) 激活时触发互斥：封印 ROUTES[route].mutexWith 中所有路线（永久，不可逆）。
//  3) 被封印路线不可激活；已激活路线不可重复激活。
//  4) 局内充能：每段基因锁由吞噬基因充能解锁（本局临时 + 跨局已解锁段），上限 6 段。
//  5) 所有跨局变更集中在 activateRoute 完成后一次 persistSave，避免中途退出丢档。

import { SaveData, RouteId } from '../Types';
import { ROUTES, ALL_ROUTES, mutexOf } from './MutexTable';
import { persistSave } from '../SaveSystem';

export const GENE_LOCK_MAX = 6; // 每路线基因锁段数上限

/** 每段基因锁所需吞噬基因数（数值见《数值平衡表》，此处为默认曲线） */
const CHARGE_THRESHOLDS = [0, 3, 6, 10, 15, 21]; // 解锁第 1~6 段所需累计基因

export interface GeneLockEvent {
  route: RouteId;
  newlyActivated: boolean;   // 本次是否新激活
  newlySealed: RouteId[];    // 本次新封印的路线
  chargedTo: number;         // 充能后段数
}

/**
 * 首进新位面 → 永久激活对应路线（跨局，写存档）。
 * 返回本次事件详情（供 UI 弹台词 / 图鉴刷新）。
 */
export function activateRoute(save: SaveData, route: RouteId): GeneLockEvent {
  const p = save.player;
  const ev: GeneLockEvent = { route, newlyActivated: false, newlySealed: [], chargedTo: p.geneLocks[route] ?? 0 };

  // 被封印路线不可激活
  if (p.sealedRoutes.includes(route)) return ev;
  // 已激活（段数 > 0）不可重复激活
  if ((p.geneLocks[route] ?? 0) > 0) return ev;

  // 解锁第 1 段
  p.geneLocks[route] = 1;
  ev.newlyActivated = true;
  ev.chargedTo = 1;

  // 触发互斥：封印对方
  for (const m of mutexOf(route)) {
    if (!p.sealedRoutes.includes(m)) {
      p.sealedRoutes.push(m);
      ev.newlySealed.push(m);
      // UI：图鉴显示"已封印 · 你的血脉拒绝了它" + 噬祖特殊台词
    }
  }

  persistSave(save);
  return ev;
}

/**
 * 局内基因锁充能：每段基因锁由局内吞噬基因充能解锁。
 * 本局临时充能 + 跨局已解锁段，上限 GENE_LOCK_MAX。
 * 返回充能后段数（> 旧段数 表示本次升级）。
 */
export function chargeGeneLock(save: SaveData, route: RouteId, genes: number): number {
  const p = save.player;
  const cur = p.geneLocks[route] ?? 0;
  if (cur >= GENE_LOCK_MAX) return cur;

  // 累计基因（跨局已解锁段对应的阈值 + 本局新增基因）
  const base = CHARGE_THRESHOLDS[cur] ?? 0;
  const total = base + genes;

  let next = cur;
  for (let seg = cur + 1; seg <= GENE_LOCK_MAX; seg++) {
    const need = CHARGE_THRESHOLDS[seg - 1] ?? Infinity;
    if (total >= need) next = seg;
    else break;
  }

  if (next > cur) {
    p.geneLocks[route] = next;
    // 局内充能不写跨局存档（本局临时），由 finalizeRun 统一落盘
  }
  return next;
}

/** 互斥查询（UI 图鉴用）：某路线是否已被永久封印 */
export function isSealed(save: SaveData, route: RouteId): boolean {
  return save.player.sealedRoutes.includes(route);
}

/** 某路线当前解锁段数（0 = 未激活） */
export function geneLockLevel(save: SaveData, route: RouteId): number {
  return save.player.geneLocks[route] ?? 0;
}

/** 某路线是否已激活（段数 >= 1） */
export function isActivated(save: SaveData, route: RouteId): boolean {
  return geneLockLevel(save, route) >= 1;
}

/** 已激活路线列表（按激活顺序） */
export function activatedRoutes(save: SaveData): RouteId[] {
  return ALL_ROUTES.filter(r => isActivated(save, r));
}

/** 已封印路线列表 */
export function sealedRoutes(save: SaveData): RouteId[] {
  return [...save.player.sealedRoutes];
}

/** 可激活路线列表（未激活且未被封印） */
export function activatableRoutes(save: SaveData): RouteId[] {
  return ALL_ROUTES.filter(r => !isActivated(save, r) && !isSealed(save, r));
}

/** 基因锁战力加成：每段少量加成（见平衡表，此处默认每段 +2%） */
export function geneLockPowerBonus(save: SaveData): number {
  let segs = 0;
  for (const r of ALL_ROUTES) segs += geneLockLevel(save, r);
  return 1 + segs * 0.02;
}

/** 图鉴展示：某路线的完整状态描述 */
export function describeRoute(save: SaveData, route: RouteId): {
  name: string; group: string; skinName: string;
  level: number; sealed: boolean; activated: boolean;
  mutexWith: RouteId[];
} {
  const cfg = ROUTES[route];
  return {
    name: cfg.name,
    group: cfg.group,
    skinName: cfg.skinName,
    level: geneLockLevel(save, route),
    sealed: isSealed(save, route),
    activated: isActivated(save, route),
    mutexWith: cfg.mutexWith,
  };
}