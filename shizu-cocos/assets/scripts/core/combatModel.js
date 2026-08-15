// ===== core/combatModel.js · 实时割草 → 回合时间片的抽象层 =====
//
// ⚠ 本文件的常量**不是策划数值**，策划文档里没有它们。
//   原因：《噬祖》是**实时肉鸽割草**（单摇杆 + 自动索敌 + 闪避无敌帧 + 同屏 60）。
//   原型层是回合制，所以把「一次前进」定义成一个 TICK 秒的**时间片**：
//     · 这一片里刷进来多少怪（dungeon.js 的 spawnRate / 涌潮）
//     · 玩家横扫掉多少只（sweepTargets）
//     · 被围的怪蹭掉多少血（contactHits）
//   迁移到 Cocos 实时战斗后，本文件整体废弃，改由真实碰撞与无敌帧决定。

import { MAX_ONSCREEN } from './dungeon.js';

/** 一次「前进」代表的游戏内秒数 */
export const TICK_SECONDS = 3;

/**
 * 基础横扫目标数 —— 割草的核心手感参数。
 * 自动索敌下巢灵每 TICK（3 秒）能覆盖到的杂兵数；靠射程 / 范围 / AOE 成长放大。
 * 标定依据：第 4 阶段刷怪速率 2.2 只/秒 × 3 秒 = 6.6 只/片，
 * 基础横扫需与之同量级，否则同屏必然堆到上限、被围压力锁死。
 */
export const BASE_SWEEP = 7;

/**
 * 每 TICK 被有效命中的基础概率（走位 / 闪避 / 无敌帧的压缩表达）。
 * 割草里伤害主要来自**被围**，所以真正的压力项是下面的 packPressure。
 *
 * 这是整个原型层最敏感的一个数：0.10 → 通关率 4.9%，0.085 → 24.6%，0.06 → 79.6%。
 * 取 0.085 使零基因锁新档落在「12 个位面通关率 18.8%~30%、平均抵达第 4.23 阶段、
 * 单局 13.5 分钟」，同时满足文档的单局时长与设计支柱 3。
 * 接实时战斗后本文件废弃，这个数由真实闪避/无敌帧取代。
 */
export const BASE_CONTACT = 0.085;

/** 精英 / BOSS 的压制力更强 */
export const CONTACT_BY_KIND = { minion: 1.0, elite: 1.8, boss: 2.4 };

/**
 * 本 TICK 玩家能横扫掉的目标数。
 * range（射程/攻击范围）与 aoe（践踏/震地/弹幕/全屏类）直接转化为横扫宽度 ——
 * 这就是割草里「越滚越能一次清一片」的成长感来源。
 */
export function sweepTargets(stats) {
  const width = BASE_SWEEP * (stats.range ?? 1) * (1 + (stats.aoe ?? 0));
  return Math.max(1, Math.round(width * (stats.aspd ?? 1)));
}

/** 被围压力的封顶倍率（同屏满员时的值） */
export const PACK_PRESSURE_MAX = 2.5;

/** 压力开始累积的同屏人数（4 只以内算不上「被围」） */
export const PACK_FREE = 4;

/**
 * 被围压力：同屏杂兵越多越容易挨打，同屏满员时恰好达到封顶。
 * 系数由 MAX_ONSCREEN 反推，保证「封顶」在上限处**正好**生效 ——
 * 写死系数的话封顶会变成够不着的死代码（早期版本 60 只时只有 2.456）。
 */
export function packPressure(onScreen, maxOnScreen = MAX_ONSCREEN) {
  const span = Math.max(1, maxOnScreen - PACK_FREE);
  const ratio = Math.max(0, Math.min(1, (onScreen - PACK_FREE) / span));
  return 1 + (PACK_PRESSURE_MAX - 1) * ratio;
}

/** 阶段推进 → 敌人更难躲（「数量→速度→复杂度→精度」的后三项压缩在这里） */
export function stagePressure(stage) {
  return 1 + (stage - 1) * 0.1;
}

/**
 * 本 TICK 玩家被打中几次。
 * 移速是唯一能降低被命中率的属性（对应实时战斗里的走位能力）。
 * @returns {{kind:string, enemy:object}[]}
 */
export function contactHits(enemies, stats, stage, rng, minionsFaced = null) {
  const mobility = Math.min(0.6, Math.max(0, (stats.speed / 220 - 1) * 0.25));
  const stageMul = stagePressure(stage) * (1 - mobility);

  const hits = [];
  // 杂兵按**群体**判定一次，而不是逐只 roll ——
  // 同屏 60 只时逐只判定会必死，而割草里被一群杂兵蹭到算一次受击。
  //
  // 压力基数用「本时间片出现过的杂兵数」而非幸存者：清得再快，
  // 冲上来的那一波也贴到过你身上。否则生存会退化成「清速 > 刷速」的二值判定。
  const minions = enemies.filter((e) => e.kind === 'minion');
  const faced = minionsFaced ?? minions.length;
  if (faced > 0 && rng() < BASE_CONTACT * packPressure(faced) * stageMul) {
    hits.push({ kind: 'minion', enemy: minions[0] ?? { atk: 1, name: '杂兵' } });
  }
  // 精英 / BOSS 各自独立判定
  for (const e of enemies) {
    if (e.kind === 'minion') continue;
    if (rng() < BASE_CONTACT * CONTACT_BY_KIND[e.kind] * stageMul) {
      hits.push({ kind: e.kind, enemy: e });
    }
  }
  return hits;
}
