// ===== 红线 3 / 4 / 7：三通道硬规则、互斥权重、首进固定 =====

import test from 'node:test';
import assert from 'node:assert/strict';
import { planeChannel, planeWeight, previewPlane, resolveConflict, rollPlane } from '../shizu-cocos/assets/scripts/core/planePool.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { rollUpgradeOptions } from '../shizu-cocos/assets/scripts/core/upgrade.js';
import { rollCommonGear, ATTR_CHANNEL_GEAR_MULT } from '../shizu-cocos/assets/scripts/core/drop.js';
import { activateRoute } from '../shizu-cocos/assets/scripts/core/geneLock.js';
import { planes, TUTORIAL_PLANE_ID } from '../shizu-cocos/assets/scripts/data/planes.js';
import { ALL_ROUTES, ROUTES, mutexOf } from '../shizu-cocos/assets/scripts/data/routes.js';
import { freshSave, rng } from './helpers.mjs';

const plane = (id) => planes.find((p) => p.id === id);

// ===== 红线 7：首进固定机关城 =====

test('红线7：totalRuns === 0 时恒抽中机关城（1000 次）', () => {
  const save = freshSave();
  const r = rng(42);
  for (let i = 0; i < 1000; i++) {
    assert.equal(rollPlane(save, r).id, TUTORIAL_PLANE_ID);
  }
});

test('红线7：totalRuns > 0 后不再有任何固定分支（能抽到多种位面）', () => {
  const save = freshSave({ totalRuns: 1 });
  const r = rng(42);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) seen.add(rollPlane(save, r).id);
  assert.ok(seen.size >= 8, `随机性不足，只抽到 ${seen.size} 种位面`);
});

// ===== 红线 4：互斥权重 ×0 必须真的生效 =====

test('互斥矩阵是双向的（ROUTES 表自洽）', () => {
  for (const a of ALL_ROUTES) {
    for (const b of mutexOf(a)) {
      assert.ok(mutexOf(b).includes(a), `${a} 互斥 ${b}，但 ${b} 没有反向声明 ${a}`);
    }
  }
});

test('互斥矩阵内容对得上策划文档（仙途⇆异变全互斥、钢铁⇆武炼交叉）', () => {
  assert.deepEqual(new Set(ROUTES.dujie.mutexWith), new Set(['sangshi', 'gongsheng']));
  assert.deepEqual(new Set(ROUTES.gongde.mutexWith), new Set(['sangshi', 'gongsheng']));
  assert.deepEqual(ROUTES.jijia.mutexWith, ['shanhai']);
  assert.deepEqual(ROUTES.juhua.mutexWith, ['xiake']);
  assert.deepEqual(ROUTES.mofa.mutexWith, []);
  assert.deepEqual(ROUTES.qiji.mutexWith, []);
});

test('红线4：激活渡劫后，尸海/共生巢权重为 0 且 10000 次抽取从不出现', () => {
  const save = freshSave({ totalRuns: 5 });
  activateRoute(save, 'dujie');
  assert.equal(planeWeight(plane('shihai'), save.player), 0);
  assert.equal(planeWeight(plane('gongshengchao'), save.player), 0);

  const r = rng(777);
  for (let i = 0; i < 10000; i++) {
    const p = rollPlane(save, r);
    assert.ok(p.id !== 'shihai' && p.id !== 'gongshengchao', `抽中了互斥位面 ${p.name}`);
  }
});

test('红线4：兜底不是弹窗 —— resolveConflict 真的换成相容位面', () => {
  const save = freshSave({ totalRuns: 5 });
  activateRoute(save, 'dujie');
  const resolved = resolveConflict(plane('shihai'), save, rng(1));
  assert.notEqual(resolved.id, 'shihai');
  assert.ok(planeWeight(resolved, save.player) > 0);
});

test('权重规则：已激活 ×2 / 未激活 ×1 / 无路线 ×1', () => {
  const save = freshSave({ totalRuns: 5 });
  assert.equal(planeWeight(plane('dujie'), save.player), 1, '未激活应为 1');
  activateRoute(save, 'dujie');
  assert.equal(planeWeight(plane('dujie'), save.player), 2, '已激活应为 2');
  assert.equal(planeWeight(plane('zhutian'), save.player), 1, '诸天之心恒为 1');
});

// ===== 红线 3：不匹配位面零技能 =====

function dungeonFor(planeId, save) {
  return generateDungeon(plane(planeId), save, 20240815);
}

test('红线3：属性通道 5000 次三选一，不得出现任何路线技能', () => {
  const save = freshSave({ totalRuns: 5 });          // 一条路线都没激活
  const d = dungeonFor('dujie', save);
  assert.equal(d.channel, 'attr');

  const r = rng(5150);
  for (let i = 0; i < 5000; i++) {
    const opts = rollUpgradeOptions(d, save, { learnedSkills: new Set(), takenAttrs: new Set() }, r);
    assert.ok(opts.length > 0, '属性池不应为空');
    for (const o of opts) {
      assert.equal(o.kind, 'attr', `属性通道漏出了技能: ${o.name}`);
      assert.equal(o.route, undefined);
    }
  }
});

test('红线3：属性通道也拿不到「传说」档（平衡表 6.1 只有基础/特色）', () => {
  const save = freshSave({ totalRuns: 5 });
  const d = dungeonFor('dujie', save);
  const r = rng(6);
  for (let i = 0; i < 2000; i++) {
    for (const o of rollUpgradeOptions(d, save, { learnedSkills: new Set(), takenAttrs: new Set() }, r)) {
      assert.ok(o.rarity === 'base' || o.rarity === 'feature');
    }
  }
});

test('红线3：匹配位面才给技能，且只给已解锁段位', () => {
  const save = freshSave({ totalRuns: 5 });
  activateRoute(save, 'dujie');
  save.player.geneLocks.dujie = 3;                    // 只解锁到第 3 段
  const d = dungeonFor('dujie', save);
  assert.equal(d.channel, 'skill');

  const r = rng(31);
  let sawSkill = false;
  for (let i = 0; i < 500; i++) {
    for (const o of rollUpgradeOptions(d, save, { learnedSkills: new Set(), takenAttrs: new Set() }, r)) {
      if (o.kind !== 'skill') continue;
      sawSkill = true;
      assert.equal(o.route, 'dujie');
      assert.ok(o.lv <= 3, `漏出了未解锁段位 Lv${o.lv}`);
    }
  }
  assert.ok(sawSkill, '匹配位面一个技能都没出');
});

test('红线3：装备通道对全位面开放，属性通道掉率 ×1.5', () => {
  const N = 4000000;
  const countDrops = (isAttrChannel) => {
    const r = rng(2468);
    let n = 0;
    for (let i = 0; i < N; i++) if (rollCommonGear('minion', isAttrChannel, false, r)) n += 1;
    return n / N;
  };
  const skillRate = countDrops(false);
  const attrRate = countDrops(true);

  // 小怪基础掉率 0.04%（割草重标，见 drop.js 说明）
  assert.ok(Math.abs(skillRate - 0.0004) < 0.00012, `技能通道掉率异常 ${skillRate}`);
  assert.ok(attrRate > 0, '属性通道必须仍然掉装备（红线 3 的补偿条款）');
  const ratio = attrRate / skillRate;
  assert.ok(
    Math.abs(ratio - ATTR_CHANNEL_GEAR_MULT) < 0.15,
    `属性通道补偿倍率应 ≈1.5，实测 ${ratio.toFixed(3)}`,
  );
});

test('裂缝卡预览会明确告知本次可获奖励类型', () => {
  const save = freshSave({ totalRuns: 5 });
  const attr = previewPlane(plane('dujie'), save);
  assert.equal(attr.channel, 'attr');
  assert.ok(attr.rewards.some((x) => x.includes('装备')), '属性通道也要展示装备奖励');

  activateRoute(save, 'dujie');
  const skill = previewPlane(plane('dujie'), save);
  assert.equal(skill.channel, 'skill');
  assert.ok(skill.rewards.includes('技能'));
});

test('诸天之心按「全路线融合」处理：有已激活路线即为技能通道', () => {
  const save = freshSave({ totalRuns: 5 });
  assert.equal(planeChannel(plane('zhutian'), save), 'attr', '零激活时退化为属性通道');
  activateRoute(save, 'shanhai');
  assert.equal(planeChannel(plane('zhutian'), save), 'skill');
});
