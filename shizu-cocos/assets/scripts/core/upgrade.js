// ===== core/upgrade.js · 三选一升级（技能通道 / 属性通道）=====
// 来源：《噬祖-开发实现指南》七章；《噬祖-数值平衡表》6.1 / 6.2
//
// 红线 3（单向硬规则）：
//   属性通道的池**绝不能**混入任何路线技能 —— 由 rollUpgradeOptions 保证，测试守护。
//   反向不禁止：技能池不足 3 个时用通用属性补位（属性是全局通用成长，不是路线专属）。

import { GENERIC_ATTR_POOL, RARITY_WEIGHT } from '../data/attrPool.js';
import { skillRarity, skillsByRoute } from '../data/skills.js';
import { mechUpgradePool } from '../data/mechUpgrades.js';
import { currentRouteMech } from '../data/weaponAttack.js';
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
  // 权重：稀有度为默认档位，条目可用显式 weight 覆盖（情境型属性压低，避免稀释核心成长）
  const weightOf = (x) => x.weight ?? RARITY_WEIGHT[x.rarity] ?? 1;
  // 渐进复杂度：开局只给核心成长（攻/血/速/攻速/范围），专精类选项到中期才进池。
  // 早期就混入情境型选项会稀释成长曲线 —— 实测会让整局强度明显下滑。
  const level = runState.level ?? 0;
  // 放逐：本局被移除的选项永不再出现（构筑的「减法」）
  const banished = runState.banished ?? new Set();
  const keep = (x) => !banished.has(x.id);
  const attrs = attrPool().filter((a) => (a.minLevel ?? 0) <= level).filter(keep);
  // 构筑感：已激活路线的机制强化选项，名字/描述直接引用你的 Build
  const mechPool = mechUpgradePool(currentRouteMech(save.player.geneLocks)).filter(keep);

  if (dungeon.channel === 'attr') {
    // 硬规则：只有属性 + 机制强化，一个路线技能都不能出现
    return weightedPickMany([...attrs, ...mechPool], CHOICE_COUNT, weightOf, rng);
  }

  const skills = skillPool(dungeon.channelRoutes, save, runState.learnedSkills).filter(keep);
  const picked = weightedPickMany([...skills, ...mechPool], CHOICE_COUNT, weightOf, rng);
  if (picked.length < CHOICE_COUNT) {
    // 技能池枯竭 → 用通用属性补位（属性非路线专属，不违反红线 3）
    const fill = weightedPickMany(
      attrs.filter((a) => !picked.some((x) => x.id === a.id)),
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
  // 构筑分化：暴伤 / 减伤 / 反震 / 吸取 / 斩杀
  if (e.critDmg) stats.critDmg = (stats.critDmg ?? 0) + e.critDmg;
  if (e.dmgReduct) stats.dmgReduct = Math.min(0.8, (stats.dmgReduct ?? 0) + e.dmgReduct);
  if (e.thorn) stats.thorn = (stats.thorn ?? 0) + e.thorn;
  if (e.suckRadius) stats.suckRadius = (stats.suckRadius ?? 1) * (1 + e.suckRadius);
  if (e.execute) stats.execute = (stats.execute ?? 0) + e.execute;
  return stats;
}
