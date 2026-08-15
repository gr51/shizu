// ===== 红线 1 / 2 / 6 / 8 + 副本生成 / 基因锁 / 存档 =====

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, spawnStyleHpMul, spawnStyleRateMul } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { computePower, STAGE_COEF, UNIT_BASE } from '../shizu-cocos/assets/scripts/core/balance.js';
import { activateRoute, chargeGeneLock, GENE_LOCK_MAX, isSealed, segmentForCharge } from '../shizu-cocos/assets/scripts/core/geneLock.js';
import { applyHiddenSkill, learnSkill, SLOT_KEYS, allSlotsEngraved, rollHiddenSkill } from '../shizu-cocos/assets/scripts/core/skillSlots.js';
import { Run, RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { migrate, createDefaultSave, DYN_FACTOR_MAX } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateGear } from '../shizu-cocos/assets/scripts/core/gear.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { CHARGE_THRESHOLDS, skills, skillsByRoute } from '../shizu-cocos/assets/scripts/data/skills.js';
import { ALL_ROUTES } from '../shizu-cocos/assets/scripts/data/routes.js';
import { ALL_HIDDEN_SKILLS } from '../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { freshSave, repo, rng } from './helpers.mjs';

const plane = (id) => planes.find((p) => p.id === id);

// ===== 配表完整性 =====

test('技能表 = 10 路线 × 6 段 = 60 条，段位无缺漏', () => {
  assert.equal(skills.length, 60);
  for (const route of ALL_ROUTES) {
    const s = skillsByRoute(route);
    assert.equal(s.length, 6, `${route} 段位数不对`);
    assert.deepEqual(s.map((x) => x.lv), [1, 2, 3, 4, 5, 6]);
  }
});

test('隐藏技能表 = 10 路线各 1，路线不重复且都是合法路线 id', () => {
  assert.equal(ALL_HIDDEN_SKILLS.length, 10);
  const routes = ALL_HIDDEN_SKILLS.map((h) => h.route);
  assert.equal(new Set(routes).size, 10);
  for (const r of routes) assert.ok(ALL_ROUTES.includes(r), `非法路线 id: ${r}`);
});

test('位面表 = 12 个，图鉴号 1-12 连续', () => {
  assert.equal(planes.length, 12);
  assert.deepEqual(planes.map((p) => p.codex), [1,2,3,4,5,6,7,8,9,10,11,12]);
});

test('涌潮次数表与平衡表 五章的「波次」列一致', () => {
  assert.deepEqual(plane('jiguan').waves, [3, 5, 3, 4]);
  assert.deepEqual(plane('shihai').waves, [5, 6, 4, 5]);
  assert.deepEqual(plane('shanhai').waves, [4, 4, 3, 4]);
  assert.deepEqual(plane('aofa').waves, [3, 4, 3, 4]);
});

// ===== 红线 1：位面不设固有强度，禁止按位面手写不同强度表 =====

test('红线1：12 个位面在同一 D 下，敌人数值完全相同（不得有位面固有难度）', () => {
  const save = freshSave({ totalRuns: 5 });
  const statsOf = (p) => {
    const d = generateDungeon(p, save, 1);
    const boss = d.stages[4].closer;
    return {
      minion: d.stages[0].minion.hp,
      elite: d.stages[2].closer.hp,
      bossNormalized: Math.round(boss.hp / d.stages[4].coef),
      bossCoef: d.stages[4].coef,
    };
  };
  // 只比标准型：数量型/单体型对小怪 HP 有文档明许的 ×0.75 / ×1.5
  const standard = planes.filter((p) => p.spawnStyle === 'standard');
  const baseline = statsOf(standard[0]);
  for (const p of standard.slice(1)) {
    const s = statsOf(p);
    assert.equal(s.minion, baseline.minion, `${p.name} 小怪出现位面固有难度 —— 违反红线 1`);
    assert.equal(s.elite, baseline.elite, `${p.name} 精英出现位面固有难度 —— 违反红线 1`);
    assert.equal(s.bossNormalized, baseline.bossNormalized, `${p.name} 之主出现位面固有难度 —— 违反红线 1`);
    assert.ok(s.bossCoef >= 1.1 && s.bossCoef < 1.15 + 1e-9, 'BOSS 系数越界');
  }
});

test('红线1：data/planes.js 里的逐位面 HP 表**不得**流入战斗数值', () => {
  const save = freshSave({ totalRuns: 5 });
  const jushen = generateDungeon(plane('jushen'), save, 1).stages[4].closer;
  const jiguan = generateDungeon(plane('jiguan'), save, 1).stages[4].closer;
  assert.notEqual(plane('jushen').bossHp, plane('jiguan').bossHp, '前提：模板值确实不同');
  assert.equal(
    Math.round(jushen.hp / generateDungeon(plane('jushen'), save, 1).stages[4].coef),
    Math.round(jiguan.hp / generateDungeon(plane('jiguan'), save, 1).stages[4].coef),
    '模板值泄漏进了战斗数值 —— 违反红线 1',
  );
});

test('红线1：敌人数值严格等于 通用基准 × D × 阶段系数 × dynFactor', () => {
  const save = freshSave({ totalRuns: 5 });
  const d = generateDungeon(plane('aofa'), save, 1);
  const st = d.stages[0];
  assert.equal(st.minion.hp, Math.ceil(UNIT_BASE.minion.baseHp * d.D * STAGE_COEF[0] * d.dynFactor));
  assert.equal(st.minion.atk, Math.ceil(UNIT_BASE.minion.baseAtk * d.D * STAGE_COEF[0] * d.dynFactor));
  assert.equal(d.stages[4].closer.hp, Math.ceil(UNIT_BASE.boss.baseHp * d.D * d.stages[4].coef * d.dynFactor));
});

test('红线1：精英与位面之主基准仍是平衡表三章的 150/8 与 300/12', () => {
  assert.deepEqual(UNIT_BASE.elite, { baseHp: 150, baseAtk: 8 });
  assert.deepEqual(UNIT_BASE.boss, { baseHp: 300, baseAtk: 12 });
});

test('红线1：数量型/单体型只改小怪 HP 与配套刷怪速率，精英/BOSS 不受影响', () => {
  assert.equal(spawnStyleHpMul('horde'), 0.75);
  assert.equal(spawnStyleHpMul('single'), 1.5);
  assert.equal(spawnStyleHpMul('standard'), 1.0);
  // 速率修正 = 1/HP修正 ⇒ 血量吞吐守恒，位面难度不因类型而变
  assert.equal((spawnStyleHpMul('horde') * spawnStyleRateMul('horde')).toFixed(6), '1.000000');
  assert.equal((spawnStyleHpMul('single') * spawnStyleRateMul('single')).toFixed(6), '1.000000');

  const save = freshSave({ totalRuns: 5 });
  const d = generateDungeon(plane('shihai'), save, 1);
  assert.equal(d.stages[0].minion.hp, Math.ceil(5 * 0.75 * d.D * STAGE_COEF[0] * d.dynFactor));
  const std = generateDungeon(plane('aofa'), save, 1);
  assert.equal(d.stages[2].closer.hp, std.stages[2].closer.hp, '精英不该受 spawnStyle 影响');
});

// ===== 红线 2：D 在开副本时快照 =====

test('红线2：开局后玩家变强，副本 D 与敌人数值一律不变', () => {
  const save = freshSave({ totalRuns: 5 });
  const d = generateDungeon(plane('aofa'), save, 1);
  const snapshotD = d.D;
  const bossHp = d.stages[4].closer.hp;
  const minionHp = d.stages[0].minion.hp;

  save.player.gear.claw = generateGear(rng(1), 'gold', 'claw');
  save.player.permAtkPct = 400;
  assert.ok(computePower(save.player) > d.power, '前提：玩家确实变强了');

  assert.equal(d.D, snapshotD, 'D 被局内成长污染了');
  assert.equal(d.stages[4].closer.hp, bossHp, 'BOSS 数值被局内成长污染了');
  assert.equal(d.stages[0].minion.hp, minionHp, '小怪数值被局内成长污染了');
});

test('同 seed 生成的副本完全一致（每日挑战可比性的前提）', () => {
  const save = freshSave({ totalRuns: 5 });
  const a = generateDungeon(plane('wuxia'), save, 20240815);
  const b = generateDungeon(plane('wuxia'), save, 20240815);
  assert.deepEqual(a.stages, b.stages);
  const c = generateDungeon(plane('wuxia'), save, 20240816);
  assert.notDeepEqual(a.stages, c.stages);
});

// ===== 基因锁 =====

test('激活即解锁第 1 段，并立刻永久封印互斥路线', () => {
  const save = freshSave();
  const ev = activateRoute(save, 'dujie');
  assert.equal(ev.newlyActivated, true);
  assert.equal(save.player.geneLocks.dujie, 1);
  assert.deepEqual(new Set(ev.newlySealed), new Set(['sangshi', 'gongsheng']));
  assert.ok(isSealed(save, 'sangshi') && isSealed(save, 'gongsheng'));
});

test('封印不可逆：被封印路线永远无法激活（无重置机制）', () => {
  const save = freshSave();
  activateRoute(save, 'dujie');
  const ev = activateRoute(save, 'sangshi');
  assert.equal(ev.newlyActivated, false);
  assert.equal(save.player.geneLocks.sangshi ?? 0, 0);
});

test('同组双路线可并行激活（渡劫 + 功德）', () => {
  const save = freshSave();
  activateRoute(save, 'dujie');
  assert.equal(activateRoute(save, 'gongde').newlyActivated, true);
  assert.equal(save.player.geneLocks.gongde, 1);
});

test('充能阈值 = 平衡表 4.6 的 100/200/350/550/800/1200', () => {
  assert.deepEqual(CHARGE_THRESHOLDS, [100, 200, 350, 550, 800, 1200]);
  assert.equal(segmentForCharge(99), 0);
  assert.equal(segmentForCharge(100), 1);
  assert.equal(segmentForCharge(349), 2);
  assert.equal(segmentForCharge(1200), 6);
  assert.equal(segmentForCharge(99999), 6);
});

test('充能推进段位，且封顶 6 段', () => {
  const save = freshSave();
  activateRoute(save, 'dujie');
  // 激活把充能基线拉到阈值[0]=100（= 已解锁第 1 段），再吃 250 → 350 → 第 3 段
  assert.equal(save.player.geneLockCharge.dujie, 100);
  assert.equal(chargeGeneLock(save, 'dujie', 150).to, 2);   // 250 → 第 2 段
  assert.equal(chargeGeneLock(save, 'dujie', 100).to, 3);   // 350 → 第 3 段
  assert.equal(chargeGeneLock(save, 'dujie', 5000).to, GENE_LOCK_MAX);
  assert.equal(chargeGeneLock(save, 'dujie', 5000).to, GENE_LOCK_MAX, '已满段不再上涨');
});

test('未激活路线不吃充能', () => {
  const save = freshSave();
  const c = chargeGeneLock(save, 'dujie', 99999);
  assert.equal(c.to, 0);
});

// ===== 红线 8：隐藏技能唯一性 + 刻印不可被顶掉 =====

test('红线8：同一隐藏技能不可重复获得', () => {
  const save = freshSave();
  assert.equal(applyHiddenSkill(save, 'tianjie').result, 'engraved');
  assert.equal(applyHiddenSkill(save, 'tianjie').result, 'rejected');
  assert.equal(save.inventory.hiddenSkills.filter((x) => x === 'tianjie').length, 1);
});

test('红线8：隐藏刻印槽位不可被局内技能替换', () => {
  const save = freshSave();
  applyHiddenSkill(save, 'tianjie');            // 刻印到 activeA
  const slot = save.player.skillSlots.activeA;
  assert.equal(slot.hidden, true);

  const res = learnSkill(save, { id: 'x', skillKind: 'active', name: '普通主动技', route: 'dujie' }, 'activeA');
  assert.equal(res.result, 'rejected');
  assert.equal(save.player.skillSlots.activeA.skillId, 'tianjie', '刻印被顶掉了');
});

test('红线8：主动槽全被刻印时，新主动技能无处可去而非静默覆盖', () => {
  const save = freshSave();
  applyHiddenSkill(save, 'tianjie');      // activeA
  applyHiddenSkill(save, 'tiangong');     // activeB（文档指定）
  const res = learnSkill(save, { id: 'y', skillKind: 'active', name: '新主动技' });
  assert.equal(res.result, 'rejected');
});

test('红线8：rollHiddenSkill 只出本位面路线的、且未拥有的', () => {
  const save = freshSave();
  const r = rng(8);
  for (let i = 0; i < 200; i++) {
    const h = rollHiddenSkill(plane('dujie'), save, r);
    assert.equal(h.route, 'dujie');
  }
  save.inventory.hiddenSkills.push('tianjie');
  assert.equal(rollHiddenSkill(plane('dujie'), save, r), null, '已拥有后不应再出');
});

test('4 槽全刻印 → 成就「诸天共鸣」条件成立', () => {
  const save = freshSave();
  applyHiddenSkill(save, 'tianjie', 'activeA');
  applyHiddenSkill(save, 'taotie', 'activeB');
  applyHiddenSkill(save, 'wanfo', 'passiveC');
  applyHiddenSkill(save, 'wushuang', 'passiveD');
  assert.ok(allSlotsEngraved(save));
  assert.equal(SLOT_KEYS.length, 4);
});

// ===== 红线 6：存档原子写 =====

test('红线6：整局战斗过程零落盘，只在 finalize 时写一次', () => {
  const save = freshSave({ totalRuns: 5 });
  const r = repo();
  const d = generateDungeon(plane('jiguan'), save, 1);
  const run = new Run(save, d, 7);

  let guard = 0;
  while (run.state !== RunState.WON && run.state !== RunState.LOST && guard++ < 20000) {
    if (run.state === RunState.CHOOSING) run.choose(0);
    else if (run.state === RunState.SLOT_CONFLICT) run.resolveSlotConflict(null);
    else run.step();
  }
  assert.equal(r.persistCount, 0, '战斗中途落盘了 —— 违反红线 6');

  run.finalize(r);
  assert.equal(r.persistCount, 1, 'finalize 应当且仅当落盘一次');
});

// ===== 存档迁移 =====

test('迁移：残缺旧档补齐全部默认字段而不丢玩家数据', () => {
  const old = { version: 1, player: { permAtkPct: 40, geneLocks: { dujie: 3 } } };
  const m = migrate(old);
  assert.equal(m.player.permAtkPct, 40, '玩家数据被覆盖了');
  assert.deepEqual(m.player.geneLocks, { dujie: 3 });
  assert.deepEqual(m.player.skillSlots, createDefaultSave().player.skillSlots);
  assert.deepEqual(m.player.sealedRoutes, []);
  assert.equal(m.stats.hiddenPity, 0);
  assert.ok('geneLockCharge' in m.player);
});

test('迁移：越界的 dynFactor 一律被拉回钳制区间（红线 5 的最后一道闸）', () => {
  assert.equal(migrate({ player: { dynFactor: 99 } }).player.dynFactor, DYN_FACTOR_MAX);
  assert.equal(migrate({ player: { dynFactor: -5 } }).player.dynFactor, 0.7);
  assert.equal(migrate({ player: { dynFactor: 'oops' } }).player.dynFactor, 1);
});

test('迁移：空档 / null 不崩', () => {
  assert.equal(migrate(null).player.totalRuns, 0);
  assert.equal(migrate({}).version, 1);
});
