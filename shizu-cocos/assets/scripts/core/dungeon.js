// ===== core/dungeon.js · 副本生成（seed 驱动，可复现）=====
// 来源：《噬祖-开发实现指南》四章 4.4 / 六章；《噬祖-数值平衡表》2.5
//
// 红线 1：位面不设固有强度系数 —— 敌人数值只由「基准 × D × 阶段系数 × dynFactor」生成。
//         位面之间的差异只体现在**基准模板值**与**敌人类型/机制**，不额外加位面难度系数。
// 红线 2：D 在开副本时快照，进入副本后不随局内 Build 变动。

import { buildEnemy, dungeonDifficulty, computePower, stageCoef, UNIT_BASE } from './balance.js';
import { planeChannel, channelRoutes } from './planePool.js';
import { rngFactory } from './rng.js';

/**
 * 位面类型对小怪 HP 的修正（平衡表 2.5）。
 * ⚠ 波次的 ±1 调整**已经烘焙在 data/planes.js 的 waves 表里**（那是平衡表五章的绝对值），
 *   所以这里只返回 HP 倍率，不再动波次，避免重复施加。
 */
export function spawnStyleHpMul(spawnStyle) {
  if (spawnStyle === 'horde') return 0.75;   // 数量型：量多血薄
  if (spawnStyle === 'single') return 1.5;   // 单体型：量少血厚
  return 1.0;
}

/**
 * 生成副本蓝图。
 * @param {object} plane 位面模板
 * @param {object} save  存档
 * @param {number} seed  随机种子（每日挑战传 dailySeed()）
 */
export function generateDungeon(plane, save, seed) {
  const rng = rngFactory(seed);
  const p = save.player;

  // 红线 2：此刻快照 D，整局不再变
  const power = computePower(p);
  const D = dungeonDifficulty(power, p.difficultyLevel);
  const dyn = p.dynFactor;

  const minionHpMul = spawnStyleHpMul(plane.spawnStyle);
  const stages = [];

  for (let stage = 1; stage <= 5; stage++) {
    const coef = stageCoef(stage, rng);
    if (stage === 5) {
      stages.push({
        stage,
        coef,
        waves: [{
          index: 1,
          enemies: [{
            kind: 'boss',
            name: plane.boss,
            desc: plane.bossDesc,
            ...buildEnemy(UNIT_BASE.boss, D, coef, dyn),
          }],
        }],
      });
      continue;
    }

    const waveCount = plane.waves[stage - 1];
    const hasElite = plane.eliteStages.includes(stage);
    const waves = [];
    for (let w = 1; w <= waveCount; w++) {
      const enemies = [];
      const minionCount = 2 + Math.floor(rng() * 2); // 每波 2-3 只
      for (let i = 0; i < minionCount; i++) {
        enemies.push({
          kind: 'minion',
          name: `${plane.theme}·喽啰`,
          ...buildEnemy(
            { baseHp: UNIT_BASE.minion.baseHp * minionHpMul, baseAtk: UNIT_BASE.minion.baseAtk },
            D, coef, dyn,
          ),
        });
      }
      // 精英出现在该阶段最后一波
      if (hasElite && w === waveCount) {
        enemies.push({
          kind: 'elite',
          name: `${plane.theme}·精英`,
          ...buildEnemy(UNIT_BASE.elite, D, coef, dyn),
        });
      }
      waves.push({ index: w, enemies });
    }
    stages.push({ stage, coef, waves });
  }

  return {
    seed,
    plane,
    power,
    D,
    dynFactor: dyn,
    difficultyLevel: p.difficultyLevel,
    channel: planeChannel(plane, save),
    channelRoutes: channelRoutes(plane, save),
    stages,
  };
}
