// ===== 属性中心.js · 数值模型与存档（跨局持久化）=====

import { 触发中心实例 } from './触发中心.js';
import { 词库中心实例 } from './词库中心.js';

const KEY = 'shizu_save_v1';

/** 空档：新玩家默认值 */
export function 初始存档() {
  return {
    version: 1,
    player: {
      巢灵名: '噬灵',
      总次数: 0,
      通关: 0,
      连败: 0,
      难度等级: '中等',
      动态系数: 1.0,
      // 永久属性（跨局，结算转化）
      永久攻%: 0, 永久血%: 0, 永久速%: 0,
      // 基因锁：路线 -> 段数 0-6
      基因锁: {},
      封印路线: [],
      // 技能槽位（隐藏技能永久刻印）
      技能槽: { 主动A: null, 主动B: null, 被动C: null, 被动D: null },
      // 装备栏
      装备: {},
      背包: [],
      装备精华: 0,
    },
    inventory: {
      基因: 0,
      传承: [],
      组合技: [],
      隐藏技能: [],
    },
    stats: {
      传承保底: 0, 传说计数: 0, 隐藏计数: 0,
      首通诸天: false,
      成就: {},
    },
  };
}

/** 读取存档（migrate 兼容未来字段） */
export function 读档() {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : 初始存档();
    return 迁移(d);
  } catch (e) {
    console.error('读档失败，重置', e);
    return 初始存档();
  }
}

export function 存档(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function 迁移(d) {
  const base = 初始存档();
  // 补默认字段（简单合并）
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  for (const k of Object.keys(base.player)) if (d.player[k] === undefined) d.player[k] = base.player[k];
  for (const k of Object.keys(base.inventory)) if (d.inventory[k] === undefined) d.inventory[k] = base.inventory[k];
  for (const k of Object.keys(base.stats)) if (d.stats[k] === undefined) d.stats[k] = base.stats[k];
  return d;
}

/** 局内战斗数值（base 属性 + 装备/基因锁/永久加成，均在 getCombatStats 内统一折算） */
export function 战斗属性(存档) {
  const p = 存档.player;
  // 基础：攻10 血100 速220
  const base = { 攻: 10, 血: 100, 速: 220, 暴击: 0.05, 攻速: 1, 吸血: 0, 减伤: 0, 回血: 0, 冷却: 1, 吸取半径: 1 };
  const g = (1 + p['永久攻%']) * (1 + 装备词条合计(p.装备, 'atk'));
  base.攻 = 10 * g;
  base.血 = 100 * (1 + p['永久血%']) * (1 + 装备词条合计(p.装备, 'hp'));
  base.速 = 220 * (1 + p['永久速%']) * (1 + 装备词条合计(p.装备, 'speed'));
  base.暴击 += 装备词条合计(p.装备, 'crit');
  base.攻速 *= (1 + 装备词条合计(p.装备, 'aspd'));
  base.吸血 += 装备词条合计(p.装备, 'lifesteal');
  base.减伤 += 装备词条合计(p.装备, 'dmgReduct');
  base.回血 += 装备词条合计(p.装备, 'regen');
  base.冷却 *= (1 - 装备词条合计(p.装备, 'cooldown'));
  base.吸取半径 *= (1 + 装备词条合计(p.装备, 'suckRadius'));
  return base;
}

/** 装备词条合计：按 key 汇总已装备词条 value */
export function 装备词条合计(装备, key) {
  let sum = 0;
  for (const slot of Object.values(装备)) {
    if (!slot) continue;
    for (const a of slot.词条) if (a.key === key) sum += a.value;
  }
  return sum;
}

/** 基因锁战力加成：每段 +2% */
export function 基因锁加成(存档) {
  const p = 存档.player;
  let 段 = 0;
  for (const v of Object.values(p.基因锁)) 段 += v;
  return 1 + 段 * 0.02;
}

/** 装备战力加成 = 1 + Σ(词条数 × 基础倍率 × 2.5%) */
export function 装备加成(装备) {
  let sum = 0;
  for (const slot of Object.values(装备)) {
    if (!slot) continue;
    const 倍率 = { 白: 1.0, 绿: 1.3, 蓝: 1.6, 紫: 2.0, 金: 2.5 }[slot.稀有度] || 1;
    sum += slot.词条.length * 倍率 * (1 + 0.1 * slot.星) * 0.025;
  }
  return 1 + sum;
}

/** 战力折算公式：(攻/10 + 血/100 + 速/220) ÷ 3 × 基因锁加成 × 装备加成 */
export function 战力(存档) {
  const p = 存档.player;
  const b = 战斗属性(存档);
  return ((b.攻 / 10 + b.血 / 100 + b.速 / 220) / 3) * 基因锁加成(存档) * 装备加成(p.装备);
}

/** 副本难度值 D = 玩家当前战力 × 难度等级系数（简单0.9/中等1.5/困难2.0）× 动态系数 */
export function 副本难度(存档) {
  const 系数 = { 简单: 0.9, 中等: 1.5, 困难: 2.0 }[存档.player.难度等级] || 1.5;
  return 战力(存档) * 系数 * 存档.player.动态系数;
}

/** 推进并广播属性变化（触发中心 + 词库刷新） */
export function 属性变更(存档, 变化对象) {
  Object.assign(存档, 变化对象);
  触发中心实例.检测触发(变化对象);
  词库中心实例.刷新(变化对象);
}
