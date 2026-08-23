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
 * 三选一能「够到」的段位上限 = 基因锁等级 + 这个值。
 * 够太远会让局内一次拿到终极技，破坏「越滚越强」的节奏；只够 2 段刚好是
 * 「本局能摸到下一阶段的样子，想永久拥有还得去刷基因锁」。
 */
export const SKILL_REACH = 2;

/**
 * 本副本可选的路线技能池：已激活路线中、**尚未永久解锁**、且本局未学过的技能。
 *
 * ⚠ 这里的过滤条件曾经是 `s.lv <= unlocked`，与 run.js 的 equipGeneLockSkills()
 * 完全同谓词 —— 那边会把所有 `lv <= geneLockLevel` 的技能开局就发放并写进 learnedIds，
 * 于是本函数返回的永远是空集：实测连打 8 局、59 次三选一、177 个选项，
 * 技能类一个都没出过，data/skills.js 里的 60 个技能是彻底的死内容。
 *
 * 现在改成只提供**已解锁段位之上**的段位：基因锁给的是永久解锁，
 * 三���一给的是「本局提前够到下一段」，两者不再抢同一批内容。
 *
 * @param {string[]} routes 通道路线（planePool.channelRoutes）
 * @param {object} save
 * @param {Set<string>} learnedIds 本局已学技能 id（含开局自动生效的基因锁段位）
 */
export function skillPool(routes, save, learnedIds) {
  const pool = [];
  for (const route of routes) {
    const unlocked = save.player.geneLocks[route] ?? 0;
    for (const s of skillsByRoute(route)) {
      if (s.lv <= unlocked) continue;          // 已永久解锁 → 开局自动生效，不必再选
      if (s.lv > unlocked + SKILL_REACH) continue;
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
export function rollUpgradeOptions(dungeon, save, runState, rng, opts = {}) {
  // 权重：稀有度为默认档位，条目可用显式 weight 覆盖（情境型属性压低，避免稀释核心成长）。
  // opts.rarityBias：按稀有度乘权重——宝箱事件用（rare/legend 抬高、base/feature 压低），
  // 让「开宝箱」在体感上明显优于普通升级，兑现「爆发性奖励」的节拍承诺。
  const bias = opts.rarityBias ?? null;
  const weightOf = (x) => {
    const w = x.weight ?? RARITY_WEIGHT[x.rarity] ?? 1;
    return bias && bias[x.rarity] ? w * bias[x.rarity] : w;
  };
  // 渐进复杂度：开局只给核心成长（攻/血/速/攻速/范围），专精类选项到中期才进池。
  // 早期就混入情境型选项会稀释成长曲线 —— 实测会让整局强度明显下滑。
  const level = runState.level ?? 0;
  // 放逐：本局被移除的选项永不再出现（构筑的「减法」）
  const banished = runState.banished ?? new Set();
  const keep = (x) => !banished.has(x.id);
  const attrs = attrPool().filter((a) => (a.minLevel ?? 0) <= level).filter(keep);
  // 构筑感：已激活路线的机制强化选项，名字/描述直接引用你的 Build。
  // 出征路线优先作为「本局构建主轴」—— 玩家所选武器的专属强化选项进三选一池，
  // 而非元进度最高的路线，保证「我选的流派」在三选一里得到持续喂给。
  const routeMech = currentRouteMech(save.player.geneLocks, dungeon.weaponLoadout ?? null);
  const mechPool = mechUpgradePool(routeMech).filter(keep);

  if (dungeon.channel === 'attr') {
    // 硬规则：只有属性 + 机制强化，一个路线技能都不能出现
    return weightedPickMany([...attrs, ...mechPool], CHOICE_COUNT, weightOf, rng);
  }

  const skills = skillPool(dungeon.channelRoutes, save, runState.learnedSkills).filter(keep);
  // 技能通道里三类选项必须共存。
  //
  // 这里原本只在「skills + mech 凑不满 3 个」时才拿属性补位，而那个条件永远不成立，
  // 于是技能通道局的属性选项恒为 0。更糟的是强化池每个流派只有 2~3 条 ——
  // 一整局十几次升级，反复看到的就是同样那两三个强化。
  // 实测 16 局成长线：中期「技能 3 / 强化 18 / 属性 0」，
  // 路线满段后退化成「技能 0 / 强化 24 / 属性 0」。三类从不共存，
  // 每次升级面对的都是同质的三个东西 —— 这正是「内容没意思」的机制来源。
  //
  // 按**类别配额**混合，而不是把三个池直接倒在一起：
  // 属性池 16 条权重和 436，强化池 2~3 条权重和 88，直接混会被属性淹没（实测 19:5）。
  // 配额法先定各类占比、再在类内按原有稀有度权重抽，与池子大小无关，
  // 加内容时也不会悄悄改变手感。
  const CATEGORY_SHARE = { skill: 0.40, mech: 0.30, attr: 0.30 };
  const groups = [
    ['skill', skills], ['mech', mechPool], ['attr', attrs],
  ].filter(([, pool]) => pool.length > 0);
  const shareSum = groups.reduce((s, [k]) => s + CATEGORY_SHARE[k], 0) || 1;
  const norm = new Map();
  for (const [k, pool] of groups) {
    const raw = pool.reduce((s, x) => s + weightOf(x), 0) || 1;
    norm.set(k, (CATEGORY_SHARE[k] / shareSum) / raw);   // 把该类总权重压到目标占比
  }
  const mixedWeight = (x) => weightOf(x) * (norm.get(x.kind) ?? 1);
  const picked = weightedPickMany(groups.flatMap(([, pool]) => pool), CHOICE_COUNT, mixedWeight, rng);
  if (picked.length < CHOICE_COUNT) {
    // 三类合起来仍不足 3 个（极端情况：几乎全被放逐）→ 用剩下的属性兜底
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
  // 真动词（backlog #9）：击杀爆炸 / 命中减速——属性通道也能改变战斗行为
  if (e.killBurst) stats.killBurst = (stats.killBurst ?? 0) + e.killBurst;
  if (e.chill) stats.chill = (stats.chill ?? 0) + e.chill;
  return stats;
}
