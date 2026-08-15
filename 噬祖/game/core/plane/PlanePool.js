// ===== plane/PlanePool.js · 位面随机池（开发指南 五章）=====
// 权重规则（整体策划 3.4 / 关卡策划五·规则1）：
//   已激活路线位面 ×2（刷技能导向）
//   未激活路线位面 ×1（首进激活价值）
//   互斥路线位面   ×0（不可抽中）
// 首进固定机关城（totalRuns === 0），全局唯一固定分支。

import { planes } from '../../data/planes.js';

/** 位面权重：返回该位面当前权重（0 = 不可抽中） */
export function planeWeight(plane, player) {
  // 无专属路线（奇巧迷宫/诸天之心）：不激活路线 → 权重始终 = 1
  if (plane.route === null) return 1;
  const r = plane.route;
  if (player.sealedRoutes.includes(r)) return 0;   // 互斥 → 0
  return (player.geneLocks[r] ?? 0) >= 1 ? 2 : 1;  // 已激活 → 2，未激活 → 1
}

/** 开裂缝：返回本次副本位面（对象） */
export function rollPlane(save, rng = Math.random) {
  // 规则 3：首次副本固定机关城（教学）
  if (save.player.totalRuns === 0) {
    return planes.find((p) => p.codex === 1);
  }

  const pool = planes.filter((p) => planeWeight(p, save.player) > 0);
  // 规则 2 兜底：若过滤后为空（理论不会发生，防御性处理）→ 全池重随机
  const safePool = pool.length > 0 ? pool : planes;

  // 加权随机（权重累计法）
  const total = safePool.reduce((s, p) => s + planeWeight(p, save.player), 0);
  let roll = rng() * total;
  for (const p of safePool) {
    roll -= planeWeight(p, save.player);
    if (roll <= 0) return p;
  }
  return safePool[safePool.length - 1];
}

/** 互斥冲突兜底（规则 2）：极端情况仍命中互斥位面（配置错误）→ 替换为同组相容位面 */
export function resolveConflict(plane, player, rng = Math.random) {
  const hasConflict = plane.route !== null && player.sealedRoutes.includes(plane.route);
  if (!hasConflict) return plane;
  const compatible = planes.filter((p2) => p2.codex !== plane.codex && planeWeight(p2, player) > 0);
  if (compatible.length > 0) {
    return compatible[Math.floor(rng() * compatible.length)];
  }
  // 防御兜底（正常不会走到）：从全池随机一个
  return planes[Math.floor(rng() * planes.length)];
}

/** 通道判定（硬规则，见第七章）：位面路线已激活 → 'skill'，否则 'attr' */
export function planeChannel(plane, save) {
  if (plane.route === null) return 'attr';
  return (save.player.geneLocks[plane.route] ?? 0) >= 1 ? 'skill' : 'attr';
}