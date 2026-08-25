// ===== statMods.test.mjs · 位面数值覆盖（关卡编辑·手动配数）=====
// plane.statMods = { minionHpPct?, minionAtkPct?, bossHpPct?, bossAtkPct?, eliteHpPct?, eliteAtkPct?, enemySpeedPct? }
// 契约：缺省/为 0 时与基线完全一致（同 seed 同数值）；配置后按百分比精确缩放，
// 且无尽层（buildEndlessStage）同样吃同一份覆盖。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, buildEndlessStage } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const jiguan = planes.find((p) => p.id === 'jiguan');

test('minionCount/closerCount 自定义进入阶段蓝图', () => {
  const d = generateDungeon({ ...jiguan, stagePlan: [{ duration: 60, minionCount: 12, closerCount: 3 }, {}, {}, {}, { closerCount: 4 }] }, freshSave(), 41);
  assert.equal(d.stages[0].spawnCount, 12);
  assert.equal(d.stages[0].closerCount, 3);
  assert.equal(d.stages[4].closerCount, 4);
  assert.equal(d.stages[0].spawnRate, 0.4, '收尾时间钳制30秒，预算12只应换算为0.4只/s');
});

test('statMods 缺省 = 与基线完全一致（同 seed）', () => {
  const a = generateDungeon(jiguan, freshSave(), 7);
  const b = generateDungeon({ ...jiguan, statMods: {} }, freshSave(), 7);
  assert.equal(a.stages[0].minion.hp, b.stages[0].minion.hp);
  assert.equal(a.stages[4].closer.hp, b.stages[4].closer.hp);
});

test('minionHpPct/minionAtkPct 精确缩放小怪', () => {
  const base = generateDungeon(jiguan, freshSave(), 11);
  const mod = generateDungeon({ ...jiguan, statMods: { minionHpPct: 50, minionAtkPct: -25 } }, freshSave(), 11);
  for (let i = 0; i < 5; i++) {
    assert.equal(mod.stages[i].minion.hp, Math.ceil(base.stages[i].minion.hp * 1.5), `S${i + 1} hp`);
    assert.equal(mod.stages[i].minion.atk, Math.ceil(base.stages[i].minion.atk * 0.75), `S${i + 1} atk`);
  }
});

test('bossHpPct 只影响第5阶段位面之主；eliteHpPct 只影响 1-4 阶段收尾', () => {
  const base = generateDungeon(jiguan, freshSave(), 23);
  const mod = generateDungeon({ ...jiguan, statMods: { bossHpPct: 100, eliteHpPct: 10 } }, freshSave(), 23);
  // buildEnemy 先乘后 ceil，与「先 ceil 再乘」最多差 1
  const near = (got, want) => Math.abs(got - want) <= 1;
  assert.ok(near(mod.stages[4].closer.hp, base.stages[4].closer.hp * 2), `boss hp ×2：${mod.stages[4].closer.hp} vs ${base.stages[4].closer.hp}`);
  assert.ok(near(mod.stages[0].closer.hp, base.stages[0].closer.hp * 1.1), 'elite hp ×1.1');
  assert.equal(mod.stages[2].closer.atk, base.stages[2].closer.atk, '未配 atk 则不动');
  // 小怪不受 boss/elite 覆盖影响
  assert.equal(mod.stages[0].minion.hp, base.stages[0].minion.hp);
});

test('无尽层同样消费 statMods（深渊小怪与 BOSS 同步缩放）', () => {
  const plain = generateDungeon(jiguan, freshSave(), 31);
  const modded = generateDungeon({ ...jiguan, statMods: { minionHpPct: 50, bossAtkPct: 20 } }, freshSave(), 31);
  const l1 = buildEndlessStage(plain, 1);
  const l2 = buildEndlessStage(modded, 1);
  assert.ok(Math.abs(l2.minion.hp - l1.minion.hp * 1.5) <= 1, `深渊小怪 hp ×1.5：${l2.minion.hp} vs ${l1.minion.hp}`);
  assert.ok(Math.abs(l2.closer.atk - l1.closer.atk * 1.2) <= 1, `深渊 BOSS atk ×1.2：${l2.closer.atk} vs ${l1.closer.atk}`);
});

test('非法 statMods 字段不炸（NaN/字符串安全忽略）', () => {
  const d = generateDungeon({ ...jiguan, statMods: { minionHpPct: 'abc', bossHpPct: NaN } }, freshSave(), 5);
  const base = generateDungeon(jiguan, freshSave(), 5);
  assert.equal(d.stages[0].minion.hp, base.stages[0].minion.hp);
});
