// ===== core/dungeon.js · 副本生成（seed 驱动，可复现）=====
// 来源：《噬祖-开发实现指南》四章 4.4 / 六章；《噬祖-整体策划》3.2；《噬祖-数值平衡表》2.3 / 2.5
//
// 【结构：割草时间轴，不是离散波次】
//   整体策划 3.2 的阶段表带**时间**列：0-2 / 2-5 / 5-8 / 8-11 / 11-15 分钟。
//   所以一局 = 15 分钟时间轴，小怪**持续涌来**，玩家不是「清完一波进下一波」，
//   而是在压力里活下去 —— 这正是肉鸽割草的形态（单摇杆 + 自动索敌，2.3）。
//
//   平衡表五章的「波次」列（如机关城 3｜5｜3｜4）在此读作**阶段内的涌潮次数**：
//   每次涌潮 = 一次成群刷怪的尖峰，而非一组要清空的敌人。
//
//   阶段末尾刷出精英／阶段 BOSS，击杀即过阶段（整体策划 2.4：
//   「击杀阶段 BOSS 即通过该阶段」）；第 5 阶段的是位面之主。
//
// 红线 1：位面不设固有强度 —— 敌人数值只由「通用基准 × D × 阶段系数 × dynFactor」生成。
// 红线 2：D 在开副本时快照，进入副本后不随局内 Build 变动。

import { buildEnemy, dungeonDifficulty, computePower, stageCoef, UNIT_BASE } from './balance.js';
import { planeChannel, channelRoutes } from './planePool.js';
import { rngFactory } from './rng.js';

/** 阶段时长（秒），取自整体策划 3.2 的时间列；合计 900 秒 = 15 分钟 */
export const STAGE_SECONDS = [120, 180, 180, 180, 240];

/**
 * 阶段收尾单位（精英/阶段BOSS/位面之主）提前多少秒刷出。
 * 阶段是靠**击杀收尾单位**推进的（整体策划 2.4），若等计时满才刷，
 * 那场仗的时间会整段加在阶段时长之外，单局会拖到 17-18 分钟。
 * 提前 30 秒刷出 ⇒ 收尾战与阶段尾段重叠，单局收敛回文档的 12-15 分钟。
 */
export const CLOSER_LEAD_SEC = 45;

/** 同屏敌人上限（整体策划 9.3：同屏上限 60 单位） */
export const MAX_ONSCREEN = 60;

/**
 * 各阶段小怪基础刷新速率（只/秒）。
 *
 * 【实时战斗重标】原值 [0.8,1.2,1.6,2.2,1.5] 是按**回合制**（一个 tick 3 秒）标的；
 * 接上实时战斗后玩家杀得比刷得快，同屏恒定只有 2-4 只 —— 那不是割草。
 * 按品类基准（同屏 25-55、150-300 只/分钟）上调至下表，实测：
 * 同屏峰值 62、178 只/分钟、单局 14.6 分钟，正好落在设计区间。
 *
 * 递增顺序遵循整体策划 3.2「变量递增顺序：**数量** → 速度 → 复杂度 → 精度」——
 * 先加数量，所以这条曲线是本作难度爬升的主轴。
 * 第 5 阶段回落，是为了把注意力让给位面之主。
 */
export const SPAWN_RATE = [3.0, 4.5, 6.0, 8.0, 5.0];

/** 一次涌潮的小怪数量（阶段越后越猛） */
export const SURGE_SIZE = [18, 22, 26, 32, 24];

/** 位面类型对小怪 HP 的修正（平衡表 2.5）：数量型量多血薄 / 单体型量少血厚 */
export function spawnStyleHpMul(spawnStyle) {
  if (spawnStyle === 'horde') return 0.75;
  if (spawnStyle === 'single') return 1.5;
  return 1.0;
}

/**
 * 刷怪速率修正 = 1 / HP 修正 —— 让三种位面的**血量吞吐压力恒等**。
 *
 * 平衡表 2.5 说单体型是「量少血厚」、数量型是「量多血薄」，但只给了 HP 倍率，
 * 「量」那一半落在「波次 ±1」上，而波次列里各位面并不一致（山海 4｜4｜3｜4
 * 并不比标准少）。若只改 HP 不改量，会撞上割草特有的**秒杀悬崖**：
 *
 *   小怪 HP = 5×D×阶段系数 ≈ 7~10，玩家攻 10 → 一刀死
 *   单体型 ×1.5 → 11~15 → **两刀死**，有效清怪速度直接砍半
 *   实测通关率会从 12~16% 崩到 0.7%
 *
 * 秒杀与否是个悬崖不是斜坡，所以「血厚」必须配套「量少」才成立。
 * 取 rate × (1/hpMul) 使 HP 吞吐量守恒，位面差异只剩**手感颗粒度**：
 * 数量型 = 一片一片地割，单体型 = 一只一只地啃。这才是 2.5 想表达的东西。
 */
export function spawnStyleRateMul(spawnStyle) {
  // 平方而非线性：秒杀悬崖是**乘性**的 ——
  // 小怪 HP ×1.5 会让「一刀死」变「两刀死」，有效清速直接砍半（而不是降到 1/1.5）。
  // 线性补偿下山海/巨神的通关率实测掉到 0%；取平方后三种位面重新齐平。
  const hp = spawnStyleHpMul(spawnStyle);
  return 1 / (hp * hp);
}

/**
 * 生成副本蓝图（时间轴形态）。
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

  const hpMul = spawnStyleHpMul(plane.spawnStyle);
  const rateMul = spawnStyleRateMul(plane.spawnStyle);
  const stages = [];

  for (let stage = 1; stage <= 5; stage++) {
    const coef = stageCoef(stage, rng);
    const duration = STAGE_SECONDS[stage - 1];

    // 涌潮：次数取自平衡表五章的「波次」列，均匀分布在本阶段时间轴上
    const surgeCount = stage === 5 ? 2 : plane.waves[stage - 1];
    const surges = [];
    for (let i = 0; i < surgeCount; i++) {
      surges.push({
        atSec: Math.round(((i + 1) / (surgeCount + 1)) * duration),
        count: Math.round(SURGE_SIZE[stage - 1] * rateMul),
      });
    }

    const minion = buildEnemy(
      { baseHp: UNIT_BASE.minion.baseHp * hpMul, baseAtk: UNIT_BASE.minion.baseAtk },
      D, coef, dyn,
    );

    // 阶段收尾单位：1-4 阶段为精英／阶段 BOSS，第 5 阶段为位面之主
    const closer = stage === 5
      ? {
          kind: 'boss',
          name: plane.boss,
          desc: plane.bossDesc,
          ...buildEnemy(UNIT_BASE.boss, D, coef, dyn),
        }
      : {
          kind: 'elite',
          name: `${plane.theme}·${stage >= 3 ? '精英' : '首领'}`,
          ...buildEnemy(UNIT_BASE.elite, D, coef, dyn),
        };

    stages.push({
      stage,
      coef,
      duration,
      spawnRate: SPAWN_RATE[stage - 1] * rateMul,
      surges,
      minionName: `${plane.theme}·喽啰`,
      minion,
      closer,
      closerAt: Math.max(30, duration - CLOSER_LEAD_SEC),
      // 关卡策划「阶段4：精英×2」—— 第 4 阶段夹击加一只
      extraElite: stage === 4 && plane.eliteStages.includes(4),
    });
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
    totalSeconds: STAGE_SECONDS.reduce((a, b) => a + b, 0),
    stages,
  };
}

/** 预估一局的刷怪总量（调参用；实际击杀取决于玩家清怪速度） */
export function estimateSpawns(dungeon) {
  let n = 0;
  for (const st of dungeon.stages) {
    n += st.spawnRate * st.duration;
    for (const s of st.surges) n += s.count;
    n += 1 + (st.extraElite ? 1 : 0);
  }
  return Math.round(n);
}
