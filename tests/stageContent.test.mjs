// ===== backlog #3/#4：S3 断档修补（词缀阶段化 + 行为词缀）与宝箱事件 =====

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { rollEliteAffix, ELITE_AFFIXES } from '../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { rollUpgradeOptions } from '../shizu-cocos/assets/scripts/core/upgrade.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7, stage = 1) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  const dungeon = generateDungeon(AOFA, save, seed, [], {});
  const r = new RealtimeRun(save, dungeon, seed * 3 + 1);
  while (r.stageNo < stage) { r.advanceStage(); r.state = RunState.FIGHTING; }
  return r;
}

test('新增行为词缀（召唤者/坚壁）已入池且带行为字段', () => {
  const s = ELITE_AFFIXES.find((a) => a.id === 'summoner');
  const g = ELITE_AFFIXES.find((a) => a.id === 'aegis');
  assert.ok(s && s.eff.summonEvery > 0, '召唤者：周期孵化');
  assert.ok(g && g.eff.auraMul < 1 && g.eff.auraRadius > 0, '坚壁：光环减伤');
});

test('rollEliteAffix 尊重阶段化概率（S1 低、S3 高）', () => {
  // 固定伪 rng：第一次调用返回概率判定值，第二次返回词缀下标
  let seq = [];
  const rng = () => seq.shift() ?? 0;
  seq = [0.19, 0];    // 0.19 ≤ 0.2 → S1 也命中；取第 0 条
  assert.ok(rollEliteAffix(rng, 0.2), 'S1 概率 0.2：0.19 应命中');
  seq = [0.25, 0];
  assert.equal(rollEliteAffix(rng, 0.2), null, 'S1 概率 0.2：0.25 应落空');
  seq = [0.25, 0.5];
  assert.ok(rollEliteAffix(rng, 0.5), 'S3 概率 0.5：0.25 应命中（同抽签在 S3 不再落空）');
});

test('召唤者词缀：周期孵化两只杂兵', () => {
  const r = buildRun({});
  const p = r.player;
  r.enemies.length = 0;
  const elite = {
    id: r.nextId++, kind: 'elite', variant: null, name: '召唤精英',
    hp: 9000, maxHp: 9000, atk: 2,
    x: p.x - 150, y: p.y, r: 24, speed: 0,
    spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
    bossSkillCd: 99, telegraphT: 0, phase: 1,
    slamCd: 0, slamWindup: 0, dashCd: 0, dashWindup: 0, dashT: 0, dashVx: 0, dashVy: 0, fuseT: 0,
    affix: { id: 'summoner', name: '召唤者', eff: { summonEvery: 1 } },
    summonT: 0.5,
  };
  r.enemies.push(elite);
  const before = r.enemies.length;
  for (let i = 0; i < 45; i++) r.update(1 / 60, { mx: 0, my: 0 });
  assert.ok(r.enemies.length > before, '召唤者应孵出杂兵');
  const hatchlings = r.enemies.filter((e) => e.name === '孵体');
  assert.ok(hatchlings.length >= 2, `应至少孵出两只（实际 ${hatchlings.length}）`);
});

test('坚壁光环：光环内杂兵受到的近战伤害减半', () => {
  const strike = (aegis) => {
    const r = buildRun({});
    r.stats.crit = 0;
    r.player.attackCd = 0;
    const dummy = mkDummy(r, 40);
    dummy.aegis = aegis;
    r.updateAttack(1 / 60);
    return 5000 - dummy.hp;
  };
  const noAegis = strike(false);
  const withAegis = strike(true);
  assert.ok(noAegis > 0);
  assert.ok(Math.abs(withAegis - noAegis / 2) < Math.max(0.5, noAegis * 0.02),
    `坚壁应使伤害减半（${withAegis} ≈ ${noAegis}/2）`);
});

test('宝箱守卫：S3 阶段中段出现一次，S1/S2 不出现', () => {
  const r3 = buildRun({}, 7, 3);
  r3.stageElapsed = 31;
  r3.chestTick(1 / 60);
  assert.ok(r3.enemies.some((e) => e.eventTag === 'chest'), 'S3 应生成宝箱守卫');
  r3.chestTick(1 / 60);
  assert.equal(r3.enemies.filter((e) => e.eventTag === 'chest').length, 1, '每阶段只生成一只');

  const r1 = buildRun({}, 7, 1);
  r1.stageElapsed = 31;
  r1.chestTick(1 / 60);
  assert.ok(!r1.enemies.some((e) => e.eventTag === 'chest'), 'S1 不出宝箱守卫');
});

test('击破守卫 → 排队开箱 → 高稀有度三选一打开', () => {
  const r = buildRun({}, 7, 3);
  const guard = mkDummy(r, 120);
  guard.eventTag = 'chest';
  r.killEnemy(guard);
  assert.equal(r.chestQueue, true, '击破守卫应排队开箱');
  r.update(1 / 60, { mx: 0, my: 0 });
  assert.equal(r.state, RunState.CHOOSING, '开箱应进入三选一');
  assert.match(r.pendingOptions?.reason ?? '', /宝箱/, '理由应标注为宝箱开启');
  r.choose(0);
});

test('蚀爆体（属性动词）：击杀时小范围爆炸波及邻体', () => {
  const r = buildRun({});
  r.stats.crit = 0;
  r.stats.killBurst = 0.6;   // 模拟已选取该属性
  r.player.attackCd = 0;
  mkDummy(r, 20, 8);         // 主目标（低血：一击必杀触发爆炸）
  const near = mkDummy(r, 50, 5000);    // 爆炸半径内（距爆心 30 < 40）
  const far = mkDummy(r, 300, 5000);    // 半径外
  r.updateAttack(1 / 60);
  assert.ok(near.hp < 5000, `邻体应被爆波及（扣 ${5000 - near.hp}）`);
  assert.equal(far.hp, 5000, '半径外不受影响');
});

test('寒噬之息（属性动词）：攻击命中挂冰霜减速', () => {
  const r = buildRun({});
  r.stats.crit = 0;
  r.stats.chill = 1;
  r.player.attackCd = 0;
  const dummy = mkDummy(r, 40);
  r.updateAttack(1 / 60);
  assert.ok(r.elementalSlows.has(dummy.id), '命中应附带减速');
  assert.equal(r.elementalSlows.get(dummy.id), 0.6, 'chill=1 → 减速 0.6s（时长克制，实测守怪潮压力）');
});

test('rarityBias 生效：宝箱权重显著抬高稀有档', () => {
  // 技能通道 + 锁 4 段：池内出现 rare(lv5)/legend(lv6)（属性通道全是 base/feature）
  const save = freshSave({ totalRuns: 5, geneLocks: { dujie: 4 } });
  const dungeon = generateDungeon(AOFA, save, 7, [], {});
  dungeon.channel = 'skill';
  dungeon.channelRoutes = ['dujie'];
  const draw = (bias) => {
    let hits = 0;
    const rng = (() => { let s = 42; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
    for (let i = 0; i < 600; i++) {
      const opts = rollUpgradeOptions(dungeon, save,
        { learnedSkills: new Set(), takenAttrs: new Set(), level: 6, banished: new Set() }, rng,
        bias ? { rarityBias: bias } : {});
      if (opts.some((o) => o.rarity === 'legend')) hits++;
    }
    return hits;
  };
  const plain = draw(null);
  const biased = draw({ rare: 4, legend: 8, base: 0.25, feature: 0.5 });
  assert.ok(plain >= 0, '基线可绘制');
  assert.ok(biased > plain, `legend 出现次数应显著提升（${biased} vs ${plain}）`);
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
