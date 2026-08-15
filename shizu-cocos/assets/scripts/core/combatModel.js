// ===== core/combatModel.js · 实时战斗 → 回合交锋的抽象层 =====
//
// ⚠ 本文件的常量**不是策划数值**，策划文档里没有它们。
//   原因：《噬祖》设计的是**实时动作**肉鸽（单摇杆 + 自动索敌 + 闪避无敌帧），
//   文档给的 HP/攻击数值是按「玩家能躲掉绝大部分伤害」标定的。
//   网页版是回合制文字战斗，如果每次交锋都必定挨打，数值会立刻崩掉：
//
//     机关城一局需 ≈232 次交锋，而玩家只扛得住 ≈20 次阶段 1 命中
//     ⇒ 被命中率必须 ≤ 8% 才可能通关 —— 这正好反推出实时战斗里的闪避强度。
//
//   所以这里引入「有效命中率」把走位/闪避/无敌帧压缩成一个概率。
//   迁移到 Cocos 实时战斗层后，本文件整体废弃，改由碰撞与无敌帧真实决定。

/**
 * 每次交锋被敌人有效命中的基础概率。
 * 由上面的反推得出上界 8%，取 6% 留出让「减伤/吸血/回血」发挥作用的余量。
 */
export const BASE_CONTACT_CHANCE = 0.06;

/** 精英 / BOSS 的压制力更强：命中率上浮 */
export const CONTACT_BY_KIND = {
  minion: 1.0,
  elite: 1.6,
  boss: 2.2,
};

/** 阶段推进 → 敌人越来越难躲（对应文档「数量→速度→复杂度→精度」的递增顺序） */
export function stagePressure(stage) {
  return 1 + (stage - 1) * 0.12;
}

/**
 * 本次交锋敌人是否命中玩家。
 * 移速是唯一能降低被命中率的属性（对应实时战斗里的走位能力）。
 */
export function enemyHits(enemy, stats, stage, rng) {
  const mobility = Math.min(0.6, Math.max(0, (stats.speed / 220 - 1) * 0.25));
  const chance = BASE_CONTACT_CHANCE
    * (CONTACT_BY_KIND[enemy.kind] ?? 1)
    * stagePressure(stage)
    * (1 - mobility);
  return rng() < chance;
}

/**
 * 玩家每次交锋的攻击次数（攻速的回合制体现）。
 * 返回小数，由调用方按「整数次 + 余数概率」结算，避免攻速被取整吃掉。
 */
export function attacksPerExchange(stats) {
  return Math.max(0.2, stats.aspd);
}

export function resolveAttackCount(stats, rng) {
  const raw = attacksPerExchange(stats);
  const whole = Math.floor(raw);
  return whole + (rng() < raw - whole ? 1 : 0);
}
