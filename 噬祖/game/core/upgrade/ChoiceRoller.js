// ===== upgrade/ChoiceRoller.js · 三选一生成（开发指南 七章）=====
// 三通道之「技能/属性」双通道：
//   匹配位面（该位面路线已激活）→ 路线技能池（已解锁段位技能）
//   不匹配位面 → 通用属性池（零技能，硬规则）
// 装备不走三选一，走击杀掉落（第三通道，见 gear 模块）。

import { skillsByRoute } from '../../data/skills.js';
import { GENERIC_ATTR_POOL, RARITY_WEIGHT } from './AttrPool.js';

/** 普适加权随机（去重）：按稀有度权重抽 count 个 */
export function weightedPickNoRepeat(pool, count, rng = Math.random) {
  const out = [];
  const remain = [...pool];
  while (out.length < count && remain.length > 0) {
    const wOf = (x) => RARITY_WEIGHT[x.rarity] ?? 1;
    const total = remain.reduce((s, x) => s + wOf(x), 0);
    let roll = rng() * total;
    let idx = 0;
    for (let i = 0; i < remain.length; i++) {
      roll -= wOf(remain[i]);
      if (roll <= 0) { idx = i; break; }
    }
    out.push(remain.splice(idx, 1)[0]);
  }
  return out;
}

/** 位面是否匹配：该位面路线已激活（geneLocks >= 1） */
export function isPlaneMatched(plane, save) {
  const route = plane.route;
  if (!route) return false;                 // 无专属路线（奇巧迷宫/诸天之心）→ 不匹配
  return (save.player.geneLocks[route] ?? 0) >= 1;
}

/** 路线技能池：该路线已解锁段位（lv <= 已解锁段数）的技能，转成 UpgradeOption */
export function routeSkillPool(route, save) {
  const unlocked = save.player.geneLocks[route] ?? 0;
  return skillsByRoute(route)
    .filter((s) => s.lv <= unlocked)
    .map((s) => ({
      id: `${route}_lv${s.lv}`,
      kind: 'skill',
      rarity: skillRarity(s.lv),
      name: s.name,
      desc: s.desc,
      val: s.val,
      eff: s.eff,
      route,
      lv: s.lv,
      skillKind: s.kind,                    // 'active' | 'passive'
      cd: s.cd ?? null,
    }));
}

/** 技能稀有度映射：段位越高越稀有（1-2 基础 / 3-4 特色 / 5 稀有 / 6 传说） */
function skillRarity(lv) {
  if (lv >= 6) return 'legend';
  if (lv >= 5) return 'rare';
  if (lv >= 3) return 'feature';
  return 'base';
}

/**
 * 三选一生成。
 * @param {object} plane 位面配置（data/planes.js，含 route 字段）
 * @param {object} save  存档（player.geneLocks）
 * @param {function} rng 随机函数（默认 Math.random）
 * @returns {Array} 3 个 UpgradeOption（去重）
 */
export function rollUpgradeOptions(plane, save, rng = Math.random) {
  const matched = isPlaneMatched(plane, save);
  const pool = matched
    ? routeSkillPool(plane.route, save)
    : GENERIC_ATTR_POOL;
  return weightedPickNoRepeat(pool, 3, rng);
}