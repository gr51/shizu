// ===== plane/DungeonGen.js · 副本生成（开发指南 五章）=====
// 输入：位面 + 存档 + seed → 输出：可复现的副本配置（波次/数值/通道标记）
// 数值 = 基准 × 阶段系数 × 动态系数（planes.js 注释约定）

import { rngFactory, clamp } from '../rng.js';
import { planeChannel, rollPlane } from './PlanePool.js';

/** 阶段系数：随通关次数递增（战力成长曲线，数值平衡表 五章） */
export function stageFactor(totalRuns) {
  // 每 3 局 +10%，封顶 +60%
  return 1 + clamp(Math.floor(totalRuns / 3) * 0.1, 0, 0.6);
}

/** 动态系数：seed 抖动 ±10%（同 seed 可复现） */
export function dynamicFactor(rng) {
  return 0.9 + rng() * 0.2;
}

/**
 * 生成副本配置
 * @param {object} plane 位面对象（data/planes.js）
 * @param {object} save  存档（含 player.totalRuns / geneLocks / sealedRoutes）
 * @param {number} [seed] 随机种子（缺省用 Date.now()）
 * @returns {object} dungeon 配置
 */
export function genDungeon(plane, save, seed = Date.now()) {
  const rng = rngFactory(seed);
  const player = save.player;
  const sf = stageFactor(player.totalRuns);
  const df = dynamicFactor(rng);

  // 波次：planes.waves 定义每波小怪数；末波追加 boss
  const waves = plane.waves.map((count, i) => ({
    index: i + 1,
    count: Math.max(1, Math.round(count * df)),
    isBoss: i === plane.waves.length - 1,
  }));

  // 数值缩放（四舍五入取整）
  const scale = (v) => Math.round(v * sf * df);
  const stats = {
    bossHp: scale(plane.bossHp),
    bossAtk: scale(plane.bossAtk),
    mHp: scale(plane.mHp),
    mAtk: scale(plane.mAtk),
    eHp: scale(plane.eHp),
    eAtk: scale(plane.eAtk),
  };

  // 通道标记：决定本副本掉落走 skill（路线技能）还是 attr（通用属性）
  const channel = planeChannel(plane, save);

  return {
    codex: plane.codex,
    name: plane.name,
    group: plane.group,
    theme: plane.theme,
    boss: plane.boss,
    seed,
    stageFactor: sf,
    dynamicFactor: df,
    channel,
    waves,
    stats,
    flags: {
      swarm: plane.swarm,
      single: plane.single,
      double: plane.double,
    },
  };
}

/** 便捷：从存档 roll 位面并生成副本（一步到位） */
export function rollDungeon(save, rng = Math.random, seed = Date.now()) {
  const plane = rollPlane(save, rng);
  return genDungeon(plane, save, seed);
}