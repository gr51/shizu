// ===== core/planePool.js · 位面随机池 / 权重 / 通道判定 =====
// 来源：《噬祖-开发实现指南》五章；《噬祖-整体策划》3.4；《噬祖-关卡策划》五章
//
// 权重（红线 4：互斥必须真的抽不中，兜底不能只弹窗）：
//   已激活路线位面 ×2（刷技能导向）
//   未激活路线位面 ×1（首进激活价值）
//   互斥（任一路线被封印）×0
// 首进固定机关城（红线 7：totalRuns === 0，全局唯一固定分支）

import { planes, TUTORIAL_PLANE_ID, ZHUTIAN_ID } from '../data/planes.js';
import { weightedPick } from './rng.js';

/** 位面权重（0 = 不可抽中） */
export function planeWeight(plane, player) {
  const routes = plane.routes ?? [];
  // 任一路线被封印 → 整个位面不可抽中
  if (routes.some((r) => player.sealedRoutes.includes(r))) return 0;
  // 无专属路线（诸天之心）→ 恒为 1
  if (routes.length === 0) return 1;
  // 任一路线已激活 → ×2
  return routes.some((r) => (player.geneLocks[r] ?? 0) >= 1) ? 2 : 1;
}

/** 当前可抽中的位面（权重 > 0） */
export function availablePlanes(player) {
  return planes.filter((p) => planeWeight(p, player) > 0);
}

/**
 * 开裂缝：抽取本次副本位面。
 * @param {object} save
 * @param {() => number} rng
 */
export function rollPlane(save, rng) {
  if (save.player.totalRuns === 0) {
    return planes.find((p) => p.id === TUTORIAL_PLANE_ID);
  }
  const pool = availablePlanes(save.player);
  // 理论不会为空（诸天之心与诡术组恒可抽），但配置错误时不能崩
  const safePool = pool.length > 0 ? pool : planes;
  const picked = weightedPick(
    safePool.map((p) => ({ item: p, weight: planeWeight(p, save.player) })),
    rng,
  );
  return picked ?? safePool[0];
}

/**
 * 互斥冲突兜底（关卡策划 五·规则 2）：
 * 若传入位面与已激活路线互斥 → **重新抽取**一个相容位面，而不是仅提示。
 */
export function resolveConflict(plane, save, rng) {
  if (planeWeight(plane, save.player) > 0) return plane;
  const compatible = availablePlanes(save.player).filter((p) => p.id !== plane.id);
  if (compatible.length === 0) return plane;
  const picked = weightedPick(
    compatible.map((p) => ({ item: p, weight: planeWeight(p, save.player) })),
    rng,
  );
  return picked ?? compatible[0];
}

/**
 * 通道判定（红线 3 的判据）：
 *   'skill' = 该位面任一路线已激活（匹配位面）
 *   'attr'  = 否则（不匹配位面：零技能 + 装备掉率 ×1.5）
 *
 * 诸天之心（routes 为空）按「全路线融合位面」处理：只要玩家有任何已激活路线
 * 即为技能通道，技能池 = 全部已激活路线（平衡表 4.8 注：诸天之心可掉任意路线隐藏技能）。
 */
export function planeChannel(plane, save) {
  const activated = channelRoutes(plane, save);
  return activated.length > 0 ? 'skill' : 'attr';
}

/** 本副本技能池对应的路线列表（空数组 = 属性通道） */
export function channelRoutes(plane, save) {
  const locks = save.player.geneLocks;
  if (plane.id === ZHUTIAN_ID) {
    return Object.keys(locks).filter((r) => (locks[r] ?? 0) >= 1);
  }
  return (plane.routes ?? []).filter((r) => (locks[r] ?? 0) >= 1);
}

/** 裂缝卡预览（整体策划 6.1「裂缝选择」页） */
export function previewPlane(plane, save) {
  const channel = planeChannel(plane, save);
  return {
    codex: plane.codex,
    name: plane.name,
    poem: plane.poem,
    theme: plane.theme,
    boss: plane.boss,
    routes: plane.routes ?? [],
    channel,
    rewards: channel === 'skill' ? ['技能', '装备'] : ['属性', '装备（×1.5）'],
    firstVisit: (plane.routes ?? []).some((r) => (save.player.geneLocks[r] ?? 0) === 0),
  };
}
