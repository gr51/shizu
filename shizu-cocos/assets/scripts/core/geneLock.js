// ===== core/geneLock.js · 基因锁：激活 / 永久互斥封印 / 充能 =====
// 来源：《噬祖-整体策划》4.1；《噬祖-开发实现指南》八章；《噬祖-数值平衡表》4.6
//
// 规则：
//  1) 首进新位面 → 永久激活该路线（解锁第 1 段），跨局写档
//  2) 激活立刻触发互斥：ROUTES[route].mutexWith 全部永久封印，不可逆、无重置
//  3) 被封印路线不可激活；已激活不可重复激活
//  4) 第 2-6 段由**累计吞噬基因**充能解锁（平衡表 4.6 阈值表）
//  5) 红线 6：跨局变更由调用方在 finalizeRun 末尾统一 persist，本模块不落盘

import { ALL_ROUTES, mutexOf } from '../data/routes.js';
import { CHARGE_THRESHOLDS } from '../data/skills.js';

export const GENE_LOCK_MAX = 6;

/**
 * 激活路线（就地修改 save）。
 * @returns {{route:string, newlyActivated:boolean, newlySealed:string[], level:number}}
 */
export function activateRoute(save, route) {
  const p = save.player;
  const ev = { route, newlyActivated: false, newlySealed: [], level: p.geneLocks[route] ?? 0 };

  if (p.sealedRoutes.includes(route)) return ev;   // 已封印，拒绝
  if ((p.geneLocks[route] ?? 0) > 0) return ev;    // 已激活，拒绝

  p.geneLocks[route] = 1;
  p.geneLockCharge[route] = Math.max(p.geneLockCharge[route] ?? 0, CHARGE_THRESHOLDS[0]);
  ev.newlyActivated = true;
  ev.level = 1;

  for (const m of mutexOf(route)) {
    if (!p.sealedRoutes.includes(m)) {
      p.sealedRoutes.push(m);
      ev.newlySealed.push(m);
    }
  }
  return ev;
}

/** 累计基因 → 段数（平衡表 4.6：100/200/350/550/800/1200） */
export function segmentForCharge(charge) {
  let seg = 0;
  for (let i = 0; i < CHARGE_THRESHOLDS.length; i++) {
    if (charge >= CHARGE_THRESHOLDS[i]) seg = i + 1;
    else break;
  }
  return seg;
}

/**
 * 为某路线充能（就地修改 save）。仅对**已激活**路线生效。
 * @returns {{from:number, to:number, charge:number}} 段数变化
 */
export function chargeGeneLock(save, route, genes) {
  const p = save.player;
  const from = p.geneLocks[route] ?? 0;
  if (from < 1) return { from, to: from, charge: p.geneLockCharge[route] ?? 0 };

  const charge = (p.geneLockCharge[route] ?? 0) + Math.max(0, genes);
  p.geneLockCharge[route] = charge;
  const to = Math.min(GENE_LOCK_MAX, Math.max(from, segmentForCharge(charge)));
  p.geneLocks[route] = to;
  return { from, to, charge };
}

/** 距离下一段还差多少基因（UI「距离下个解锁差 XX」）；已满返回 null */
export function chargeToNextSegment(save, route) {
  const lv = geneLockLevel(save, route);
  if (lv < 1 || lv >= GENE_LOCK_MAX) return null;
  const charge = save.player.geneLockCharge[route] ?? 0;
  return Math.max(0, CHARGE_THRESHOLDS[lv] - charge);
}

export function geneLockLevel(save, route) {
  return save.player.geneLocks[route] ?? 0;
}

export function isActivated(save, route) {
  return geneLockLevel(save, route) >= 1;
}

export function isSealed(save, route) {
  return save.player.sealedRoutes.includes(route);
}

export function activatedRoutes(save) {
  return ALL_ROUTES.filter((r) => isActivated(save, r));
}

/** 未激活且未封印 —— 仍可争取的路线 */
export function activatableRoutes(save) {
  return ALL_ROUTES.filter((r) => !isActivated(save, r) && !isSealed(save, r));
}

/** 已解锁的技能段（该路线 lv <= 当前段数），供三选一技能池使用 */
export function unlockedSegments(save, route) {
  return geneLockLevel(save, route);
}
