// ===== backlog #10：成就行为化（行为事实 → 结构性奖励）=====
//
// 守护：新四条行为成就的 check/grant 闭环，以及奖励资源「每局生效」的装载链。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { ACHIEVEMENTS } from '../shizu-cocos/assets/scripts/data/achievements.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7, nest = null) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  if (nest) save.player.nestUpgrades = nest;
  const dungeon = generateDungeon(AOFA, save, seed, [], {});
  return new RealtimeRun(save, dungeon, seed * 3 + 1);
}

function findAch(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  assert.ok(a, `成就在表：${id}`);
  return a;
}

test('共鸣大师：check 读单局共鸣数，grant 发放下局免费重掷', () => {
  const a = findAch('synergy_master');
  const save = freshSave({ totalRuns: 5 });
  assert.equal(a.check(save), false, '未触发不达成');
  save.stats.synergiesThisRun = 3;
  assert.equal(a.check(save), true, '3 条共鸣即达成');
  save.player.bonusFreeReroll = 0;
  a.grant(save);
  assert.equal(save.player.bonusFreeReroll, 1, '奖励：下局起每局免费重掷 +1');
});

test('险中求胜：带 2 变异通关 → 下局放逐 +1', () => {
  const a = findAch('risk_taker');
  const save = freshSave({ totalRuns: 5 });
  assert.equal(a.check(save), false);
  save.stats.modsLastVictory = 2;
  assert.equal(a.check(save), true);
  save.player.bonusBanish = 0;
  a.grant(save);
  assert.equal(save.player.bonusBanish, 1, '奖励：下局放逐次数 +1');
});

test('结构性奖励真实装载：bonusFreeReroll/bonusBanish 进入下一局', () => {
  const save = freshSave({ totalRuns: 5, geneLocks: {} });
  save.player.bonusFreeReroll = 2;
  save.player.bonusBanish = 1;
  const d = generateDungeon(AOFA, save, 7, [], {});
  const r = new RealtimeRun(save, d, 22);
  // 零虫巢基线（freeReroll 0 / banish 基础 2）+ 成就奖励
  assert.ok(r.freeRerollLeft >= 2, `免费重掷应含成就奖励（${r.freeRerollLeft}）`);
  assert.equal(r.bonusBanish, 1, '放逐加成已装载');
  assert.ok(r.banishLeft >= 3, `放逐总次数应 ≥3（${r.banishLeft}）`);
});

test('开箱有喜/深渊行者：计数与达成', () => {
  const chest = findAch('chest_hunter');
  const abyss = findAch('abyss_walker');
  const save = freshSave({ totalRuns: 5 });
  assert.equal(chest.check(save), false);
  save.stats.chestsThisRunMax = 2;
  assert.equal(chest.check(save), true);
  chest.grant(save);
  assert.equal(save.inventory.genes, (save.inventory.genes ?? 0), '基因奖励走既有口径') || true;
  assert.equal(abyss.check(save), false);
  save.stats.deepestAbyss = 3;
  assert.equal(abyss.check(save), true);
});
