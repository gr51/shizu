// ===== PRD 保底：重写前版本的头号 bug，此处重点守护 =====
// 旧实现每次 `new PRDCounter(...)` 就地丢弃 → 概率恒等于基础值，保底完全失效。

import test from 'node:test';
import assert from 'node:assert/strict';
import { PITY_CAP, PRD_PARAMS, prdChance, prdCurrentChance, prdPityCap, prdRoll } from '../src/core/prd.js';
import { freshSave, rng } from './helpers.mjs';

test('PRD 参数与平衡表 7.4 一致', () => {
  assert.deepEqual(
    { baseP: PRD_PARAMS.relicPity.baseP, step: PRD_PARAMS.relicPity.step },
    { baseP: 0.20, step: 0.025 },
  );
  assert.deepEqual(
    { baseP: PRD_PARAMS.legendPity.baseP, step: PRD_PARAMS.legendPity.step },
    { baseP: 0.005, step: 0.001 },
  );
  assert.deepEqual(
    { baseP: PRD_PARAMS.hiddenPity.baseP, step: PRD_PARAMS.hiddenPity.step },
    { baseP: 0.001, step: 0.0004 },
  );
});

test('计数器写进存档：未命中时 stats 上的计数必须真的涨', () => {
  const save = freshSave();
  // 用一个必不命中的 rng（恒返回 0.999…）
  const never = () => 0.9999999;
  for (let i = 1; i <= 10; i++) {
    const hit = prdRoll(save, 'hiddenPity', never);
    assert.equal(hit, false);
    assert.equal(save.stats.hiddenPity, i, '计数器没有被持久化 —— 保底失效');
  }
  assert.ok(
    prdCurrentChance(save, 'hiddenPity') > PRD_PARAMS.hiddenPity.baseP,
    '连续不触发后概率没有递增',
  );
});

test('命中后计数器归零', () => {
  const save = freshSave();
  const always = () => 0;
  save.stats.relicPity = 7;
  assert.equal(prdRoll(save, 'relicPity', always), true);
  assert.equal(save.stats.relicPity, 0);
});

test('概率递增公式：p = base + step × count，且封顶 1', () => {
  assert.equal(prdChance(0.2, 0.025, 0), 0.2);
  assert.equal(prdChance(0.2, 0.025, 4).toFixed(3), '0.300');
  assert.equal(prdChance(0.2, 0.025, 10000), 1);
});

test('保底真的兜得住：每类掉落在理论保底次数内必定命中', () => {
  for (const key of Object.keys(PRD_PARAMS)) {
    const cap = prdPityCap(key);
    const save = freshSave();
    const r = rng(4242);
    let hitAt = -1;
    for (let i = 1; i <= cap; i++) {
      if (prdRoll(save, key, r)) { hitAt = i; break; }
    }
    assert.ok(hitAt > 0, `${PRD_PARAMS[key].label} 在保底次数 ${cap} 内未命中 —— 保底失效`);
  }
});

// ===== 第二层：硬保底（整体策划 4.5 的第二条规则，上一版整个缺失）=====

test('硬保底次数对得上平衡表 7.3 / 4.8 的「保底」列', () => {
  assert.equal(PITY_CAP.relicPity, 8);    // 「8 次内必出」
  assert.equal(PITY_CAP.rareRelic, 35);   // 「30-40 次」
  assert.equal(PITY_CAP.legendPity, 350); // 「300 次内期望 1-2 个」
  assert.equal(PITY_CAP.hiddenPity, 500); // 「500 次内期望 1 个」
  assert.equal(PITY_CAP.gearPity, null);  // 文档未给装备保底次数
});

test('硬保底真的兜底：即使 rng 永不命中，也必须在保底次数内出货', () => {
  const never = () => 0.9999999;
  for (const [key, cap] of Object.entries(PITY_CAP)) {
    if (cap === null) continue;
    const save = freshSave();
    let hitAt = -1;
    for (let i = 1; i <= cap + 5; i++) {
      if (prdRoll(save, key, never)) { hitAt = i; break; }
    }
    assert.equal(hitAt, cap, `${PRD_PARAMS[key].label} 硬保底应在第 ${cap} 次触发，实际 ${hitAt}`);
    assert.equal(save.stats[key], 0, '硬保底命中后计数器应归零');
  }
});

test('无硬保底的类别（装备）不会被强制命中', () => {
  const never = () => 0.9999999;
  const save = freshSave();
  for (let i = 0; i < 200; i++) {
    if (prdRoll(save, 'gearPity', never)) {
      // 只可能因为 PRD 概率涨到 1 而命中，不可能因硬保底
      assert.ok(save.stats.gearPity === 0);
      return;
    }
  }
  assert.ok(save.stats.gearPity > 0);
});

/** 解析法算出「平均多少次命中一发」（几何级数展开，非蒙特卡洛） */
function expectedRolls(baseP, step) {
  let survive = 1;
  let e = 0;
  for (let n = 0; n < 1e6; n++) {
    e += survive;
    survive *= 1 - Math.min(baseP + step * n, 1);
    if (survive < 1e-12) break;
  }
  return e;
}

/**
 * ⚠【文档矛盾 · 已上报，待策划裁定】
 *
 * 平衡表 7.4「PRD 伪随机参数」给的 step，和 7.3 / 4.8 用文字声称的保底目标，
 * 全线对不上 —— 每一类掉落都比文档说的**频繁 3~8 倍**：
 *
 *   类型      base    step     实际期望   文档声称
 *   普通传承  0.20    0.025      3.9 次   「8 次内必出」
 *   稀有传承  0.05    0.008      9.8 次   「30-40 次」
 *   传说技能  0.005   0.001     35.7 次   「300 次内期望 1-2 个」
 *   隐藏技能  0.001   0.0004    60.9 次   「500 次内期望 1 个」
 *
 * 实现取 7.4 的参数表（那张表明确是给编码用的），因为它是唯一可直接落地的数值。
 * 本测试把**当前真实行为**锁成回归基线：日后若有人动 PRD_PARAMS，这里会立刻炸。
 * 若策划裁定应以 7.3 的文字目标为准，改 PRD_PARAMS 的 step 即可，参考值：
 *   传说技能 step ≈ 3.9e-5（期望 200 次）、隐藏技能 step ≈ 6.3e-6（期望 500 次）
 */
test('PRD 期望次数回归基线（并记录与文档文字描述的偏差）', () => {
  const actual = {
    relicPity: expectedRolls(0.20, 0.025),
    rareRelic: expectedRolls(0.05, 0.008),
    legendPity: expectedRolls(0.005, 0.001),
    hiddenPity: expectedRolls(0.001, 0.0004),
  };
  assert.ok(Math.abs(actual.relicPity - 3.9) < 0.2, `普通传承期望漂移: ${actual.relicPity}`);
  assert.ok(Math.abs(actual.rareRelic - 9.8) < 0.3, `稀有传承期望漂移: ${actual.rareRelic}`);
  assert.ok(Math.abs(actual.legendPity - 35.7) < 1, `传说技能期望漂移: ${actual.legendPity}`);
  assert.ok(Math.abs(actual.hiddenPity - 60.9) < 1.5, `隐藏技能期望漂移: ${actual.hiddenPity}`);

  // 蒙特卡洛复核：实跑的平均值要贴合解析值
  const r = rng(20240815);
  let total = 0;
  const trials = 3000;
  for (let t = 0; t < trials; t++) {
    const save = freshSave();
    let n = 1;
    while (!prdRoll(save, 'hiddenPity', r)) n += 1;
    total += n;
  }
  const mean = total / trials;
  assert.ok(
    Math.abs(mean - actual.hiddenPity) < 5,
    `实跑均值 ${mean.toFixed(1)} 与解析值 ${actual.hiddenPity.toFixed(1)} 不符`,
  );
});

test('对照实验：无状态 PRD（旧 bug 写法）平均次数会显著更差', () => {
  const { baseP } = PRD_PARAMS.hiddenPity;
  const r = rng(999);
  // 旧写法等价于每次都用基础概率 → 几何分布，期望 1/0.001 = 1000
  let total = 0;
  const trials = 2000;
  for (let t = 0; t < trials; t++) {
    let n = 1;
    while (r() >= baseP) n += 1;
    total += n;
  }
  const statelessMean = total / trials;

  const r2 = rng(999);
  let total2 = 0;
  for (let t = 0; t < trials; t++) {
    const save = freshSave();
    let n = 1;
    while (!prdRoll(save, 'hiddenPity', r2)) n += 1;
    total2 += n;
  }
  const prdMean = total2 / trials;

  assert.ok(prdMean < statelessMean, `PRD(${prdMean.toFixed(0)}) 应优于无保底(${statelessMean.toFixed(0)})`);
});
