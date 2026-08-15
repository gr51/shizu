// ===== 战力来源的收益方向（基因锁是核心特色，不能是负收益）=====
//
// 起因：一次受控实验发现「只堆基因锁」会让通关率从 61% 崩到 0% ——
// 基因锁每段 +2% 战力 → 抬 D → 敌人变强，但段位本身在战斗中一分数值都不给，
// 于是这条**核心成长线**成了纯负收益：解锁越多，游戏越难。
//
// 修正：基因锁已解锁段位开局全部自动生效，且**不占技能槽**
//（平衡表 4.7「激活即自动生效，无槽位消耗」＋策划裁定：整条线都不受槽位限制）。
// 本文件把「每种战力来源都必须是正收益」锁成回归基线。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { Run, RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { computePower } from '../shizu-cocos/assets/scripts/core/balance.js';
import { generateGear } from '../shizu-cocos/assets/scripts/core/gear.js';
import { activateRoute } from '../shizu-cocos/assets/scripts/core/geneLock.js';
import { SLOT_KEYS } from '../shizu-cocos/assets/scripts/core/skillSlots.js';
import { skillsByRoute } from '../shizu-cocos/assets/scripts/data/skills.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave, rng } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');
/** 互不封印的一组路线（诡术中立 + 仙途 + 武炼，避开互斥） */
const COMPATIBLE = ['mofa', 'qiji', 'dujie', 'gongde', 'xiake', 'shanhai'];

function winRate(makeSave, n = 80) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const save = makeSave();
    const d = generateDungeon(AOFA, save, i);
    const run = new Run(save, d, i * 13 + 5);
    let guard = 0;
    while (run.state !== RunState.WON && run.state !== RunState.LOST && guard++ < 60000) {
      if (run.state === RunState.CHOOSING) run.choose(0);
      else if (run.state === RunState.SLOT_CONFLICT) run.resolveSlotConflict(run.pendingSkill.options[0]);
      else run.step();
    }
    if (run.state === RunState.WON) wins += 1;
  }
  return wins / n;
}

const baseSave = () => freshSave({ totalRuns: 5 });

const withGeneLocks = (level, routeCount = 6) => () => {
  const save = baseSave();
  for (const r of COMPATIBLE.slice(0, routeCount)) save.player.geneLocks[r] = level;
  return save;
};

const withPerm = (pct) => () => {
  const save = baseSave();
  save.player.permAtkPct = pct;
  save.player.permHpPct = pct;
  save.player.permSpeedPct = pct;
  return save;
};

const withGear = () => {
  const save = baseSave();
  const r = rng(9);
  for (const slot of ['claw', 'shell', 'crown', 'legs', 'core', 'trinket']) {
    save.player.gear[slot] = generateGear(r, 'gold', slot);
  }
  return save;
};

// ===== 核心断言：每条成长线都必须是正收益 =====

test('基因锁是正收益：激活路线后通关率必须上升，而不是下降', () => {
  const none = winRate(baseSave);
  const locked = winRate(withGeneLocks(3));
  assert.ok(
    locked > none,
    `零基因锁 ${(none * 100).toFixed(1)}% → 6 路线 Lv3 ${(locked * 100).toFixed(1)}%：`
    + '核心成长线成了负收益 —— 每段 +2% 战力抬了 D，却没兑现成战斗力',
  );
});

test('永久属性是正收益', () => {
  assert.ok(winRate(withPerm(200)) > winRate(baseSave));
});

test('装备是正收益', () => {
  assert.ok(winRate(withGear) > winRate(baseSave));
});

// ===== 机制断言：基因锁怎么生效 =====

test('基因锁已解锁段位开局即全部生效（平衡表 4.7「激活即自动生效」）', () => {
  const save = baseSave();
  activateRoute(save, 'mofa');
  save.player.geneLocks.mofa = 4;

  const run = new Run(save, generateDungeon(AOFA, save, 1), 7);
  const expected = skillsByRoute('mofa').filter((s) => s.lv <= 4).map((s) => s.id);
  for (const id of expected) {
    assert.ok(run.learnedSkills.has(id), `第 ${id} 段没有开局生效`);
  }
  assert.equal(run.geneLockSkills.length, expected.length);
});

test('基因锁**不占**技能槽 —— 槽位只留给局内三选一与隐藏刻印', () => {
  const save = baseSave();
  activateRoute(save, 'mofa');
  activateRoute(save, 'qiji');
  save.player.geneLocks.mofa = 6;
  save.player.geneLocks.qiji = 6;   // 奇技 4 个段位是主动技

  const before = SLOT_KEYS.map((k) => save.player.skillSlots[k]);
  const run = new Run(save, generateDungeon(AOFA, save, 1), 7);
  const after = SLOT_KEYS.map((k) => save.player.skillSlots[k]);

  assert.deepEqual(after, before, '基因锁段位占用了技能槽');
  assert.ok(run.geneLockSkills.length >= 12, '两条满段路线应有 12 个段位生效');
  assert.ok(SLOT_KEYS.every((k) => save.player.skillSlots[k] === null), '开局技能槽应为空');
});

test('已生效的基因锁段位不再出现在三选一池里（不重复给）', () => {
  const save = baseSave();
  activateRoute(save, 'mofa');
  save.player.geneLocks.mofa = 6;
  const run = new Run(save, generateDungeon(AOFA, save, 1), 7);

  const r = rng(31);
  for (let i = 0; i < 300; i++) {
    run.openChoice('测试');
    for (const o of run.pendingOptions?.options ?? []) {
      assert.notEqual(o.route, 'mofa', `已生效的 ${o.name} 又出现在三选一里`);
    }
    run.pendingOptions = null;
    run.state = RunState.FIGHTING;
    void r;
  }
});

test('战力涨幅要与实际战斗收益同向 —— 基因锁段位越深，开局战斗力越强', () => {
  const statsAt = (lv) => {
    const save = baseSave();
    for (const route of COMPATIBLE) save.player.geneLocks[route] = lv;
    const run = new Run(save, generateDungeon(AOFA, save, 1), 7);
    return { power: computePower(save.player), aoe: run.stats.aoe, atk: run.stats.atk };
  };
  const lv1 = statsAt(1);
  const lv6 = statsAt(6);
  assert.ok(lv6.power > lv1.power, '前提：段位深战力更高');
  assert.ok(
    lv6.aoe > lv1.aoe || lv6.atk > lv1.atk,
    '段位加深只抬了战力（→D→敌人变强），却没给任何战斗数值',
  );
});
