// ===== 数值层：战力 / D 值 / 阶段系数 / 敌人数值 =====
// 对照《噬祖-数值平衡表》一、二、九章（含官方自检示例）

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_STATS, DIFFICULTY_COEF, STAGE_COEF, buildEnemy, computePower,
  dungeonDifficulty, geneLockPowerBonus, bossStageCoef, applyPermGrowth,
  adjustDynamicFactor, GENES_PER_GROWTH,
} from '../shizu-cocos/assets/scripts/core/balance.js';
import { generateGear, gearPowerBonus } from '../shizu-cocos/assets/scripts/core/gear.js';
import { DYN_FACTOR_MAX, DYN_FACTOR_MIN, PERM_GROWTH_CAP_PCT } from '../shizu-cocos/assets/scripts/core/save.js';
import { freshSave, rng, withPower } from './helpers.mjs';

test('新档战力 = 1.0（平衡表 一章「巢灵初始战力 1」）', () => {
  assert.equal(computePower(freshSave().player), 1);
});

test('基础数值基准 = 攻10 / 血100 / 速220', () => {
  assert.deepEqual(
    { atk: BASE_STATS.atk, hp: BASE_STATS.hp, speed: BASE_STATS.speed },
    { atk: 10, hp: 100, speed: 220 },
  );
});

test('难度等级系数 = 简单0.9 / 中等1.5 / 困难2.0（平衡表 2.1）', () => {
  assert.deepEqual(DIFFICULTY_COEF, { easy: 0.9, normal: 1.5, hard: 2.0 });
});

test('D 值总表：战力 100 → 简单90 / 中等150 / 困难200', () => {
  const power = 100;
  assert.equal(dungeonDifficulty(power, 'easy'), 90);
  assert.equal(dungeonDifficulty(power, 'normal'), 150);
  assert.equal(dungeonDifficulty(power, 'hard'), 200);
});

test('平衡表 九章 自检示例：战力100 中等 D=150 的三个数值全部对上', () => {
  const D = 150;
  const dyn = 1.0;
  // 阶段 1 小怪：HP = 20×150×0.9 = 2700，攻 = 3×150×0.9 = 405
  const minion = buildEnemy({ baseHp: 20, baseAtk: 3 }, D, STAGE_COEF[0], dyn);
  assert.deepEqual(minion, { hp: 2700, atk: 405 });

  // 阶段 4 精英：HP = 150×150×1.3 = 29250，攻 = 8×150×1.3 = 1560
  const elite = buildEnemy({ baseHp: 150, baseAtk: 8 }, D, STAGE_COEF[3], dyn);
  assert.deepEqual(elite, { hp: 29250, atk: 1560 });

  // 阶段 5 位面之主：HP = 300×150×1.10 = 49500
  const boss = buildEnemy({ baseHp: 300, baseAtk: 12 }, D, 1.1, dyn);
  assert.equal(boss.hp, 49500);
});

test('阶段系数 = 0.9 / 1.0 / 1.15 / 1.3，BOSS 恒在 1.10~1.15', () => {
  assert.deepEqual(STAGE_COEF, [0.9, 1.0, 1.15, 1.3]);
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const c = bossStageCoef(r);
    assert.ok(c >= 1.1 && c < 1.15 + 1e-9, `BOSS 系数越界: ${c}`);
  }
});

test('基因锁每段 +2%：单路线满 6 段 = +12%', () => {
  assert.equal(geneLockPowerBonus({ dujie: 6 }).toFixed(4), '1.1200');
  assert.equal(geneLockPowerBonus({ dujie: 6, gongde: 6 }).toFixed(4), '1.2400');
});

test('装备战力：6 槽全传说 ≈ +187.5%（平衡表 7.5）', () => {
  const r = rng(3);
  const gear = {};
  for (const slot of ['claw', 'shell', 'crown', 'legs', 'core', 'trinket']) {
    gear[slot] = generateGear(r, 'gold', slot);
  }
  // 每件：5 词条 × 2.5 倍率 × 2.5% = 31.25%；6 件 = 187.5%
  assert.equal((gearPowerBonus(gear) - 1).toFixed(4), '1.8750');
});

// ===== 红线 5：dynFactor 必须恒在 [0.70, 1.50] =====

test('红线5：连胜 200 次后 dynFactor 仍被钳制在 1.50', () => {
  const save = freshSave();
  const r = rng(99);
  for (let i = 0; i < 200; i++) adjustDynamicFactor(save, true, r);
  assert.equal(save.player.dynFactor, DYN_FACTOR_MAX);
});

test('红线5：连败 200 次后 dynFactor 仍被钳制在 0.70', () => {
  const save = freshSave();
  const r = rng(99);
  for (let i = 0; i < 200; i++) adjustDynamicFactor(save, false, r);
  assert.equal(save.player.dynFactor, DYN_FACTOR_MIN);
});

test('红线5：胜败混合 5000 次，dynFactor 从不越界', () => {
  const save = freshSave();
  const r = rng(2024);
  for (let i = 0; i < 5000; i++) {
    adjustDynamicFactor(save, r() < 0.5, r);
    assert.ok(
      save.player.dynFactor >= DYN_FACTOR_MIN && save.player.dynFactor <= DYN_FACTOR_MAX,
      `越界: ${save.player.dynFactor}`,
    );
  }
});

test('难度进化：通关涨 5%~15%，连败 2 次才降', () => {
  const save = freshSave();
  const r = rng(5);
  const win = adjustDynamicFactor(save, true, r);
  assert.ok(win.after > win.before && win.after / win.before <= 1.15 + 1e-9);

  const s2 = freshSave();
  const first = adjustDynamicFactor(s2, false, r);
  assert.equal(first.after, first.before, '首败不应调整难度');
  assert.equal(s2.player.consecFails, 1);
  const second = adjustDynamicFactor(s2, false, r);
  assert.ok(second.after < second.before, '连败 2 次应降难度');
  assert.equal(s2.player.consecFails, 0, '触发后计数归零');
});

// ===== 永久成长 =====

test('永久成长：按 攻+2/血+2/速+1 轮转，单局合计不超过 +3 个百分点', () => {
  const save = freshSave();
  const res = applyPermGrowth(save, GENES_PER_GROWTH * 10); // 给足预算
  assert.ok(res.totalPct <= 3, `单局上限被突破: ${res.totalPct}`);
  assert.equal(save.player.permAtkPct + save.player.permHpPct + save.player.permSpeedPct, res.totalPct);
});

test('永久成长：基因不足一次兑换则无成长', () => {
  const save = freshSave();
  const res = applyPermGrowth(save, GENES_PER_GROWTH - 1);
  assert.equal(res.totalPct, 0);
  assert.equal(res.grants.length, 0);
});

test('永久成长：单维封顶 +500%（平衡表 一章）', () => {
  const save = withPower(freshSave(), PERM_GROWTH_CAP_PCT);
  for (let i = 0; i < 100; i++) applyPermGrowth(save, GENES_PER_GROWTH * 3);
  assert.equal(save.player.permAtkPct, PERM_GROWTH_CAP_PCT);
  assert.equal(save.player.permHpPct, PERM_GROWTH_CAP_PCT);
  assert.equal(save.player.permSpeedPct, PERM_GROWTH_CAP_PCT);
});

// ===== 红线 9：装备加成必须进 computePower，闭环抬 D =====

test('红线9：穿上装备 → 战力上升 → D 同步上升（不是局外碾压常量）', () => {
  const save = freshSave();
  const beforePower = computePower(save.player);
  const beforeD = dungeonDifficulty(beforePower, 'normal');

  save.player.gear.claw = generateGear(rng(11), 'gold', 'claw');
  const afterPower = computePower(save.player);
  const afterD = dungeonDifficulty(afterPower, 'normal');

  assert.ok(afterPower > beforePower, '装备未抬升战力');
  assert.ok(afterD > beforeD, '装备未抬升副本难度 D —— 难度进化闭环被破坏');
  assert.equal((afterPower / beforePower).toFixed(4), '1.3125'); // 5×2.5×2.5% = +31.25%
});
