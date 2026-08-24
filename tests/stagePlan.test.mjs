// ===== stagePlan.test.mjs · 位面自定义关卡时间轴（关卡编辑器地基）=====
// generateDungeon 必须尊重 plane.stagePlan 的 时长/刷怪率/涌潮表/收尾时点 覆盖。
// 未覆盖的阶段与字段保持全局默认 —— 这是「像魔兽争霸一样自建地图」的核心契约。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';
import { rollEliteAffix } from '../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { TRIGGER_EVENTS, TRIGGER_ACTIONS } from '../shizu-cocos/assets/scripts/core/run.js';

const jiguan = planes.find((p) => p.id === 'jiguan');

test('无 stagePlan 时完全走默认时间轴', () => {
  const d = generateDungeon(jiguan, freshSave(), 42);
  assert.equal(d.stages[0].duration, 120);
  assert.equal(d.stages[0].surges.length, 3);
});

test('stagePlan 覆盖时长/刷怪率/涌潮表/收尾时点', () => {
  const custom = {
    ...jiguan,
    stagePlan: [{
      duration: 60, ratePct: 150,
      surges: [{ atSec: 20, count: 9 }, { atSec: 40, count: 18 }],
      closerAt: 45,
    }],
  };
  const d = generateDungeon(custom, freshSave(), 42);
  const s1 = d.stages[0];
  assert.equal(s1.duration, 60);
  assert.equal(s1.closerAt, 45);
  assert.deepEqual(s1.surges, [{ atSec: 20, count: 9 }, { atSec: 40, count: 18 }]);
  const base = generateDungeon(jiguan, freshSave(), 42);
  assert.ok(Math.abs(s1.spawnRate - base.stages[0].spawnRate * 1.5) < 1e-9);
});

test('未覆盖的阶段不受影响；非法涌潮条目被过滤', () => {
  const custom = {
    ...jiguan,
    stagePlan: [
      {},
      {},
      { surges: [{ atSec: -5, count: 7 }, { atSec: 90, count: 0 }, { atSec: 60, count: 4 }] },
    ],
  };
  const base = generateDungeon(jiguan, freshSave(), 42);
  const d = generateDungeon(custom, freshSave(), 42);
  assert.equal(d.stages[1].duration, base.stages[1].duration);
  assert.deepEqual(d.stages[2].surges, [{ atSec: 60, count: 4 }]);
});

test('怪物技能组合：词缀池限定 + 多条叠加合并', () => {
  let i = 0;
  const seq = [0.0, 0.0, 0.9];
  const rng = () => seq[Math.min(i++, seq.length - 1)];
  const a = rollEliteAffix(rng, 1, { pool: ['shielded', 'swift'], count: 2 });
  assert.ok(a.name.includes('·'), `双词缀名应串联：${a.name}`);
  assert.ok(Math.abs(a.eff.speedMul - 1.2) < 1e-9, `speedMul 应为 .8×1.5：${a.eff.speedMul}`);
});

test('触发枚举真源：事件/动作集合与文档口径一致', () => {
  assert.equal(TRIGGER_EVENTS.size, 19);
  assert.equal(TRIGGER_ACTIONS.size, 17);
  for (const e of ['onStageClear', 'onLowHp', 'onTimeTick', 'onPlaneEnter', 'onDevour', 'onAmbushSpawn', 'onBossHalfHp', 'onCrisis', 'onEndlessLayer', 'onBossSpawn']) assert.ok(TRIGGER_EVENTS.has(e));
  for (const a of ['surge', 'spawnElite', 'permGenes']) assert.ok(TRIGGER_ACTIONS.has(a));
});
