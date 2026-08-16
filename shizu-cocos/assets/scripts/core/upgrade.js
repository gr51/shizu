// ===== core/upgrade.js · 三选一升级（技能通道 / 属性通道）=====
// 来源：《噬祖-开发实现指南》七章；《噬祖-数值平衡表》6.1 / 6.2
//
// 红线 3（单向硬规则）：
//   属性通道的池**绝不能**混入任何路线技能 —— 由 rollUpgradeOptions 保证，测试守护。
//   反向不禁止：技能池不足 3 个时用通用属性补位（属性是全局通用成长，不是路线专属）。

import { GENERIC_ATTR_POOL, RARITY_WEIGHT } from '../data/attrPool.js';
import { skillRarity, skillsByRoute } from '../data/skills.js';
import { weightedPickMany } from './rng.js';

export const CHOICE_COUNT = 3;

/**
 * 本副本可选的路线技能池：已激活路线中、段位已解锁、且本局未学过的技能。
 * @param {string[]} routes 通道路线（planePool.channelRoutes）
 * @param {object} save
 * @param {Set<string>} learnedIds 本局已学技能 id
 */
export function skillPool(routes, save, learnedIds) {
  const pool = [];
  for (const route of routes) {
    const unlocked = save.player.geneLocks[route] ?? 0;
    for (const s of skillsByRoute(route)) {
      if (s.lv > unlocked) continue;
      if (learnedIds.has(s.id)) continue;
      pool.push({
        id: s.id,
        kind: 'skill',
        skillKind: s.kind,       // 'active' | 'passive' → 决定入哪种槽
        rarity: skillRarity(s.lv),
        name: s.name,
        desc: s.desc,
        val: s.val,
        cd: s.cd ?? null,
        route: s.route,
        lv: s.lv,
        eff: s.eff,
      });
    }
  }
  return pool;
}

/**
 * 通用属性池。
 *
 * ⚠ 属性**可重复获取**（与技能不同）。这是割草的核心结构：
 *   同一条强化不断叠层，才有「这局我堆的是攻速流」的 Build 感。
 *   早期实现按「去重」处理，9 条属性选完就没得选了 ——
 *   一局 8-12 次升级会直接把池子抽干，后半程无事可做。
 */
export function attrPool() {
  return GENERIC_ATTR_POOL;
}

/**
 * 生成三选一选项。
 * @param {object} dungeon 副本蓝图（含 channel / channelRoutes）
 * @param {object} save
 * @param {{learnedSkills:Set<string>, takenAttrs:Set<string>}} runState
 * @param {() => number} rng
 * @returns {Array} 最多 3 个去重选项
 */
export function rollUpgradeOptions(dungeon, save, runState, rng) {
  const weightOf = (x) => RARITY_WEIGHT[x.rarity] ?? 1;

  if (dungeon.channel === 'attr') {
    // 硬规则：只有属性，一个技能都不能出现
    return weightedPickMany(attrPool(), CHOICE_COUNT, weightOf, rng);
  }

  const skills = skillPool(dungeon.channelRoutes, save, runState.learnedSkills);
  const picked = weightedPickMany(skills, CHOICE_COUNT, weightOf, rng);
  if (picked.length < CHOICE_COUNT) {
    // 技能池枯竭 → 用通用属性补位（属性非路线专属，不违反红线 3）
    const fill = weightedPickMany(
      attrPool().filter((a) => !picked.some((x) => x.id === a.id)),
      CHOICE_COUNT - picked.length,
      weightOf,
      rng,
    );
    picked.push(...fill);
  }
  return picked;
}

/** 属性选项 → 局内战斗属性的就地叠加 */
export function applyAttrOption(stats, option) {
  const e = option.eff;
  if (e.atkPct) stats.atk *= 1 + e.atkPct;
  if (e.hpPct) { stats.hp *= 1 + e.hpPct; stats.maxHp = stats.hp; }
  if (e.speedPct) stats.speed *= 1 + e.speedPct;
  if (e.aspdPct) stats.aspd *= 1 + e.aspdPct;
  if (e.crit) stats.crit += e.crit;
  if (e.lifesteal) stats.lifesteal += e.lifesteal;
  if (e.regen) stats.regen += e.regen;
  if (e.range) stats.range *= 1 + e.range;
  if (e.aoe) stats.aoe = (stats.aoe ?? 0) + e.aoe;
  return stats;
}
