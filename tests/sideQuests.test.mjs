// ===== 支线协议（无限流任务制）：开局随机、实时进度、结算奖励 =====

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { SIDE_QUESTS, rollSideQuest } from '../shizu-cocos/assets/scripts/data/sideQuests.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave, repo } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  const dungeon = generateDungeon(AOFA, save, seed, [], {});
  return new RealtimeRun(save, dungeon, seed * 3 + 1);
}

test('支线池：四条协议齐备，rollSideQuest 只出池内条目', () => {
  assert.equal(SIDE_QUESTS.length, 4);
  for (let i = 0; i < 40; i++) {
    const q = rollSideQuest(() => i / 40);
    assert.ok(SIDE_QUESTS.includes(q), `第 ${i} 次抽中池外条目`);
  }
});

test('歼灭协议：进度随击杀增长', () => {
  const r = buildRun({});
  r.sideQuest = SIDE_QUESTS.find((q) => q.id === 'annihilation');
  mkDummy(r, 60, 1);
  r.player.attackCd = 0;
  r.updateAttack(1 / 60);
  assert.equal(r.sideQuestProgress(), r.kills, '进度 = 击杀数');
});

test('收割协议：进度 = 本局吞噬基因', () => {
  const r = buildRun({});
  r.sideQuest = SIDE_QUESTS.find((q) => q.id === 'harvest');
  r.addGenes(250, false);
  assert.ok(r.sideQuestProgress() >= 250, `进度应含基因入账（${r.sideQuestProgress()}）`);
});

test('速通协议：150 秒内抵达 S3 达成；超时抵达则失败', () => {
  const fast = buildRun({ dujie: 3 });
  fast.sideQuest = SIDE_QUESTS.find((q) => q.id === 'speedrun');
  fast.time = 120;
  fast.advanceStage();   // → stage 2
  fast.advanceStage();   // → stage 3，time=120 ≤ 150
  assert.equal(fast.isSideQuestDone(), true, '限时内抵达 S3 应达成');

  const slow = buildRun({ dujie: 3 });
  slow.time = 200;
  slow.advanceStage();
  slow.advanceStage();
  assert.equal(slow.isSideQuestDone(), false, '超时后不达成');
});

test('猎头协议：精英击杀计数进进度', () => {
  const r = buildRun({});
  r.sideQuest = SIDE_QUESTS.find((q) => q.id === 'headhunter');
  const elite = mkDummy(r, 100);
  elite.kind = 'elite';
  elite.name = '守关者';
  r.killEnemy(elite);
  assert.equal(r.elitesKilled, 1, '精英击杀应计数');
  assert.equal(r.sideQuestProgress(), 1);
});

test('结算：完成支线发额外基因并计数', () => {
  const save = freshSave({ totalRuns: 5 });
  const dungeon = generateDungeon(AOFA, save, 7, [], {});
  const r = new RealtimeRun(save, dungeon, 91);
  r.state = RunState.LOST;
  r.sideQuest = SIDE_QUESTS.find((q) => q.id === 'harvest');
  r.genes = 700;
  const genes0 = save.inventory.genes ?? 0;
  const done0 = save.stats.sideQuestsDone ?? 0;
  r.finalize({ persist() {} });   // 桩 repo：本测试只验证结算奖励逻辑
  // 结算同时发生两件事：①本局携带基因入库（+700）②支线奖励（+300）
  assert.equal(save.inventory.genes, genes0 + 1000, '结算应入库基因并发放支线奖励');
  assert.equal(save.stats.sideQuestsDone, done0 + 1, '完成计数 +1');
});

// —— 复用 ——
function mkDummy(r, dx, hp = 5000) {
  const p = r.player;
  const e = {
    id: r.nextId++, kind: 'minion', variant: 'walker', name: '木桩',
    hp, maxHp: hp, atk: 0, x: p.x + dx, y: p.y, r: 12,
    speed: 0, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
  };
  r.enemies.push(e);
  return e;
}
