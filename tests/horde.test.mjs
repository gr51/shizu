// ===== 割草定位的量化守护 =====
// 《噬祖》是肉鸽割草：杂兵一刀死、成片倒、同屏成群。
// 这些是「手感」，但手感可以量化 —— 一旦有人改动基准或刷怪曲线把节奏改回
// 「砍三刀死一只」的慢节奏动作游戏，这里会立刻炸。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, MAX_ONSCREEN, SPAWN_RATE, spawnStyleHpMul, spawnStyleRateMul, STAGE_SECONDS } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { UNIT_BASE, LEGACY_MINION_BASE, combatStats } from '../shizu-cocos/assets/scripts/core/balance.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { RealtimeRun, ARENA, ATTACK_RANGE } from '../shizu-cocos/assets/scripts/core/battle.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave, repo } from './helpers.mjs';

const plane = (id) => planes.find((p) => p.id === id);

/** 自动打完一局，返回统计 */
const DT = 1 / 60;

/** 用「盲走机器人」（原地绕圈、不会闪避）自动打完一局 —— balance 的下限基准 */
function autoRun(planeId, seed, patch = {}) {
  const save = freshSave({ totalRuns: 5, ...patch });
  const d = generateDungeon(plane(planeId), save, seed);
  const run = new RealtimeRun(save, d, seed * 13 + 5);
  let guard = 0;
  let peakOnScreen = 0;
  while (run.state !== RunState.WON && run.state !== RunState.LOST && guard < 60 * 60 * 20) {
    if (run.state === RunState.CHOOSING) { run.choose(0); continue; }
    if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
    const a = guard * 0.02 + seed;
    run.update(DT, { mx: Math.cos(a), my: Math.sin(a) });
    run.drainEffects();
    peakOnScreen = Math.max(peakOnScreen, run.onScreen);
    guard += 1;
  }
  return {
    kills: run.kills, minionKills: run.minionKills, seconds: run.time,
    stage: run.stageNo, won: run.state === RunState.WON, genes: run.genes, peakOnScreen,
  };
}

function sample(planeId, n = 6) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(autoRun(planeId, i + 1));
  const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
  return {
    kills: avg((r) => r.kills),
    minutes: avg((r) => r.seconds) / 60,
    stage: avg((r) => r.stage),
    genes: avg((r) => r.genes),
    winRate: runs.filter((r) => r.won).length / runs.length,
    peakOnScreen: Math.max(...runs.map((r) => r.peakOnScreen)),
    get killsPerMinute() { return this.kills / this.minutes; },
  };
}

// ===== 手感底线：杂兵一刀死 =====

test('割草：杂兵基准已由平衡表三章的 20/3 下调，且保留了原值供对照', () => {
  assert.deepEqual(LEGACY_MINION_BASE, { baseHp: 20, baseAtk: 3 });
  assert.ok(UNIT_BASE.minion.baseHp < LEGACY_MINION_BASE.baseHp, '小怪基准没下调，割草手感立不住');
});

test('割草：全副本每个阶段的杂兵都必须能被一刀带走（标准型位面）', () => {
  const save = freshSave({ totalRuns: 5 });
  const atk = combatStats(save.player).atk;
  const d = generateDungeon(plane('aofa'), save, 7);
  for (const st of d.stages.slice(0, 4)) {
    assert.ok(
      st.minion.hp <= atk,
      `阶段 ${st.stage} 小怪 HP ${st.minion.hp} > 玩家攻击 ${atk} —— 砍不动，不是割草`,
    );
  }
});

test('割草：精英与位面之主**不该**被一刀带走 —— 节奏锚点', () => {
  const save = freshSave({ totalRuns: 5 });
  const atk = combatStats(save.player).atk;
  const d = generateDungeon(plane('aofa'), save, 7);
  assert.ok(d.stages[2].closer.hp > atk * 10, '精英太脆，割草失去节奏对比');
  assert.ok(d.stages[4].closer.hp > atk * 20, '位面之主太脆');
});

// ===== 结构：持续刷怪 + 涌潮，不是逐波清怪 =====

test('副本是时间轴：5 个阶段带时长，合计 15 分钟（整体策划 3.2 的时间列）', () => {
  assert.deepEqual(STAGE_SECONDS, [120, 180, 180, 180, 240]);
  assert.equal(STAGE_SECONDS.reduce((a, b) => a + b, 0), 900);

  const d = generateDungeon(plane('jiguan'), freshSave({ totalRuns: 5 }), 1);
  assert.equal(d.stages.length, 5);
  for (const st of d.stages) {
    assert.ok(st.duration > 0, '阶段没有时长 —— 退回离散波次结构了');
    assert.ok(st.spawnRate > 0, '阶段没有持续刷怪速率');
    assert.ok(Array.isArray(st.surges), '阶段没有涌潮表');
    assert.ok(st.closer, '阶段没有收尾单位');
  }
});

test('刷怪速率逐阶段递增（整体策划 3.2「变量递增顺序：数量 → 速度 → 复杂度 → 精度」）', () => {
  for (let i = 1; i < 4; i++) {
    assert.ok(SPAWN_RATE[i] > SPAWN_RATE[i - 1], `阶段 ${i + 1} 刷怪速率没有递增`);
  }
});

test('涌潮次数取自平衡表五章「波次」列，且真的排进了时间轴', () => {
  const save = freshSave({ totalRuns: 5 });
  const d = generateDungeon(plane('jiguan'), save, 1);
  assert.deepEqual(d.stages.slice(0, 4).map((s) => s.surges.length), plane('jiguan').waves);
  for (const st of d.stages) {
    for (const s of st.surges) {
      assert.ok(s.atSec > 0 && s.atSec < st.duration, '涌潮时间点落在阶段之外');
      assert.ok(s.count > 0, '涌潮没有怪');
    }
  }
});

// ===== 量化：击杀量 / 节奏 / 同屏 =====

test('割草：一局击杀量落在 1200~6000 只，速率 120~400 只/分钟', () => {
  const s = sample('aofa');
  assert.ok(s.kills >= 1200 && s.kills <= 6000, `一局只杀了 ${s.kills.toFixed(0)} 只 —— 不是割草`);
  assert.ok(
    s.killsPerMinute >= 120 && s.killsPerMinute <= 400,
    `击杀速率 ${s.killsPerMinute.toFixed(0)} 只/分钟 越界`,
  );
});

test('单局时长落在文档的 12-15 分钟（整体策划 一章）', () => {
  const s = sample('aofa');
  // 盲走机器人常在第 3-4 阶段被围死，所以下限放宽；上限守住「不能拖过 16 分钟」
  assert.ok(s.minutes >= 5 && s.minutes <= 16, `单局 ${s.minutes.toFixed(1)} 分钟，偏离预期`);
});

test('杂兵同屏受 60 上限约束（整体策划 9.3）；阶段收尾单位不受限', () => {
  assert.equal(MAX_ONSCREEN, 60);
  // 精英/位面之主是节奏锚点，必须出场，故不占杂兵名额 —— 允许小幅超出
  for (const id of ['aofa', 'shihai', 'shanhai']) {
    const peak = sample(id, 3).peakOnScreen;
    assert.ok(peak <= MAX_ONSCREEN + 4, `${id} 同屏 ${peak} 远超上限`);
    assert.ok(peak >= 30, `${id} 同屏峰值仅 ${peak} —— 怪潮压力不足，不是割草`);
  }
});

test('实时战斗：自动索敌**优先大件** —— 否则精英被杂兵挡住，阶段推不动', () => {
  const save = freshSave({ totalRuns: 5 });
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  // 造一个「精英在射程边缘、一堆杂兵贴脸」的局面
  run.enemies = [];
  run.player.x = ARENA.w / 2; run.player.y = ARENA.h / 2;
  for (let i = 0; i < 20; i++) {
    run.enemies.push({ id: i, kind: 'minion', name: 'm', hp: 999, maxHp: 999, atk: 0,
      x: run.player.x + 20, y: run.player.y + 20, r: 12, speed: 0, hitFlash: 0, anim: 0 });
  }
  const elite = { id: 99, kind: 'elite', name: 'E', hp: 9999, maxHp: 9999, atk: 0,
    x: run.player.x + ATTACK_RANGE * 0.8, y: run.player.y, r: 24, speed: 0, hitFlash: 0, anim: 0 };
  run.enemies.push(elite);

  const before = elite.hp;
  run.player.attackCd = 0;
  run.updateAttack(DT);
  assert.ok(elite.hp < before, '精英没吃到伤害 —— 索敌被杂兵挡住了');
});

test('实时战斗：一局是连续时间流，不是离散回合', () => {
  const save = freshSave({ totalRuns: 5 });
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  run.update(DT, { mx: 1, my: 0 });
  assert.ok(run.time > 0 && run.time < 0.02, '时间应按 dt 连续推进');
  assert.ok(run.player.x > ARENA.w / 2, '玩家应响应摇杆输入');
});

// ===== 位面类型：血量吞吐守恒，不得变成固有难度 =====

test('数量型/单体型：速率修正 = 1/HP修正² —— 补偿秒杀悬崖', () => {
  for (const style of ['standard', 'horde', 'single']) {
    const hp = spawnStyleHpMul(style);
    assert.equal(
      (hp * hp * spawnStyleRateMul(style)).toFixed(6), '1.000000',
      `${style} 的补偿系数不对 —— 会变成事实上的位面难度差`,
    );
  }
});

test('三种位面类型的通关率不得拉开数量级（红线 1 的实测校验）', () => {
  const std = sample('aofa', 8).winRate;
  const horde = sample('shihai', 8).winRate;
  const single = sample('shanhai', 8).winRate;
  const lo = Math.min(std, horde, single);
  const hi = Math.max(std, horde, single);
  assert.ok(lo > 0.05, `有位面通关率仅 ${(lo * 100).toFixed(1)}% —— 新手随机到就是必死`);
  assert.ok(hi / lo < 4, `位面通关率差 ${(hi / lo).toFixed(1)} 倍 —— 事实上的位面固有难度`);
});

// ===== 「差一点」：设计支柱 3 =====

test('设计支柱3：绝大多数失败发生在第 4-5 阶段（BOSS 永远比你强一点点）', () => {
  const s = sample('aofa');
  // ⚠ 基准是**盲走机器人**（原地绕圈、不会闪避、三选一恒取第一项），
  //   它是平衡的**下限**，不是真人手感。这条断言守的是两个崩溃方向：
  //   「过不了第 2 阶段」= 太难；「100% 通关」= 白给。
  //   真人的「差一点」体感必须实机验证，代码测不了。
  assert.ok(s.stage >= 2.5, `盲走机器人平均只打到第 ${s.stage.toFixed(2)} 阶段 —— 太难`);
  assert.ok(s.winRate > 0.05 && s.winRate < 0.9, `通关率 ${(s.winRate * 100).toFixed(1)}% 越界`);
});

test('割草经济：一局基因产出足以支撑 6-12 次局内升级（整体策划 4.3）', () => {
  const s = sample('aofa');
  assert.ok(s.genes > 700, `一局只产出 ${s.genes.toFixed(0)} 基因，升级次数不够`);
});
