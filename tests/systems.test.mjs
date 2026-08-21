// ===== 红线 1 / 2 / 6 / 8 + 副本生成 / 基因锁 / 存档 =====

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, spawnStyleHpMul, spawnStyleRateMul } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { computePower, STAGE_COEF, UNIT_BASE } from '../shizu-cocos/assets/scripts/core/balance.js';
import { activateRoute, chargeGeneLock, GENE_LOCK_MAX, isSealed, segmentForCharge } from '../shizu-cocos/assets/scripts/core/geneLock.js';
import { applyHiddenSkill, learnSkill, SLOT_KEYS, allSlotsEngraved, rollHiddenSkill } from '../shizu-cocos/assets/scripts/core/skillSlots.js';
import { Run, RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { migrate, createDefaultSave, DYN_FACTOR_MAX } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateGear } from '../shizu-cocos/assets/scripts/core/gear.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { CHARGE_THRESHOLDS, skills, skillsByRoute } from '../shizu-cocos/assets/scripts/data/skills.js';
import { ALL_ROUTES } from '../shizu-cocos/assets/scripts/data/routes.js';
import { ALL_HIDDEN_SKILLS } from '../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { NEST_UPGRADES, buyNestUpgrade, nestLevel, nextCost } from '../shizu-cocos/assets/scripts/data/nestUpgrades.js';
import { RIFT_MODS } from '../shizu-cocos/assets/scripts/data/riftMods.js';
import { autoPlay, freshSave, repo, rng } from './helpers.mjs';

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
  // 速率修正补偿秒杀悬崖，上调方向封顶 1.25（见 dungeon.js 说明）
  for (const st of ['horde', 'single']) {
    const hp = spawnStyleHpMul(st);
    assert.equal(spawnStyleRateMul(st), Math.min(1.25, 1 / (hp * hp)));
  }

  const save = freshSave({ totalRuns: 5 });
  const d = generateDungeon(plane('shihai'), save, 1);
  assert.equal(d.stages[0].minion.hp, Math.ceil(UNIT_BASE.minion.baseHp * 0.75 * d.D * STAGE_COEF[0] * d.dynFactor));
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
  const { run } = autoPlay(plane('jiguan'), save, 3);
  assert.ok(run.time > 5, '前提：这局确实打了一段时间');
  assert.equal(r.persistCount, 0, '战斗中途落盘了 —— 违反红线 6');
  run.finalize(r);
  assert.equal(r.persistCount, 1, 'finalize 应当且仅当落盘一次');
});

// ===== 三选一的玩家能动性：重掷 / 放逐 =====

test('重掷：花基因换一批新选项，价格递增且余额不足时拒绝', () => {
  const save = freshSave({ totalRuns: 5 });
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  run.genes = 200;
  run.openChoice('测试');
  assert.equal(run.state, RunState.CHOOSING, '应进入三选一');
  assert.equal(run.rerollCost, 20, '首次重掷价 20');
  assert.ok(run.reroll(), '有余额应重掷成功');
  assert.equal(run.genes, 180, '应扣除基因');
  assert.equal(run.rerollCost, 35, '价格应递增到 35');
  assert.equal(run.state, RunState.CHOOSING, '重掷后仍在三选一');

  run.genes = 0;
  assert.equal(run.reroll(), false, '余额不足必须拒绝');
});

test('放逐：被放逐的选项本局不再出现，且次数有限', () => {
  const save = freshSave({ totalRuns: 5 });
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  run.openChoice('测试');
  const target = run.pendingOptions.options[0];
  assert.equal(run.banishLeft, 2, '一局 2 次放逐');
  assert.ok(run.banish(0), '应放逐成功');
  assert.equal(run.banishLeft, 1, '放逐次数应减少');
  assert.ok(run.banished.has(target.id), '应记录被放逐的 id');

  for (let i = 0; i < 30; i++) {
    run.state = RunState.FIGHTING;
    run.openChoice('测试');
    if (!run.pendingOptions) continue;
    assert.ok(
      !run.pendingOptions.options.some((o) => o.id === target.id),
      `被放逐的 ${target.id} 不应再出现`,
    );
  }

  run.state = RunState.CHOOSING;
  run.openChoice('测试');
  assert.ok(run.banish(0), '第二次放逐仍可用');
  run.state = RunState.CHOOSING;
  run.openChoice('测试');
  assert.equal(run.banish(0), false, '用完后必须拒绝');
});

test('构筑共鸣：凑齐组合触发一次性强化，且不重复触发', () => {
  const save = freshSave({ totalRuns: 5 });
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  const critBefore = run.stats.critDmg ?? 0;

  // 只拿到暴击率，不该触发
  run.checkSynergies('attr_crit');
  assert.equal(run.firedSynergies.size, 0, '只集齐一半不得触发');
  assert.equal(run.stats.critDmg ?? 0, critBefore, '未触发时不应改数值');

  // 补上暴击伤害 → 共鸣成立
  run.checkSynergies('attr_critdmg');
  assert.ok(run.firedSynergies.has('syn_crit'), '凑齐后应触发共鸣');
  const afterFire = run.stats.critDmg;
  assert.ok(afterFire > critBefore, '共鸣应实际提升暴击伤害');

  // 再次获得同类不得重复触发
  run.checkSynergies('attr_crit');
  assert.equal(run.stats.critDmg, afterFire, '同一条共鸣不得重复结算');
  assert.equal(run.firedSynergies.size, 1, '仍只触发一条');
});

// ===== 局外元进度：虫巢强化 =====

test('虫巢强化：买断式扣库存基因、满级拒绝、效果开局生效', () => {
  const save = freshSave({ totalRuns: 5 });
  save.inventory.genes = 10000;

  // 买不起时拒绝
  const poor = freshSave({ totalRuns: 5 });
  poor.inventory.genes = 0;
  assert.equal(buyNestUpgrade(poor, 'nest_fang').ok, false, '基因不足必须拒绝');

  const before = save.inventory.genes;
  const r1 = buyNestUpgrade(save, 'nest_fang');
  assert.ok(r1.ok, '有余额应购买成功');
  assert.equal(save.inventory.genes, before - r1.cost, '应扣除库存基因');
  assert.equal(nestLevel(save, 'nest_fang'), 1, '等级应为 1');
  // 价格递增
  assert.ok(nextCost(save, 'nest_fang') > r1.cost, '下一级更贵');

  // 效果必须真的进开局属性
  const plainRun = new RealtimeRun(freshSave({ totalRuns: 5 }), generateDungeon(plane('aofa'), save, 3), 11);
  const buffRun = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  assert.ok(buffRun.stats.atk > plainRun.stats.atk, '巢髓·利齿应提升开局攻击');

  // 满级拒绝
  const capSave = freshSave({ totalRuns: 5 });
  capSave.inventory.genes = 999999;
  const u = NEST_UPGRADES.find((x) => x.id === 'nest_revive');
  for (let i = 0; i < u.max; i++) assert.ok(buyNestUpgrade(capSave, u.id).ok);
  assert.equal(buyNestUpgrade(capSave, u.id).ok, false, '满级后必须拒绝');
  assert.equal(nextCost(capSave, u.id), null, '满级后无下一级价格');
});

test('巢髓·残命：致死伤害拦截一次，第二次真死', () => {
  const save = freshSave({ totalRuns: 5 });
  save.inventory.genes = 999999;
  assert.ok(buyNestUpgrade(save, 'nest_revive').ok);
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3), 11);
  assert.equal(run.reviveLeft, 1, '解锁后每局一次');

  run.player.invuln = 0;
  run.hurtPlayer(999999, 0);
  assert.equal(run.state, RunState.FIGHTING, '首次致死应被残命拦截');
  assert.ok(run.hp > 0, '应保留生命');
  assert.equal(run.reviveLeft, 0, '拦截后次数用尽');

  run.player.invuln = 0;
  run.hurtPlayer(999999, 0);
  assert.equal(run.state, RunState.LOST, '第二次致死应真死');
});

test('局外货币：结算时本局基因入库', () => {
  const save = freshSave({ totalRuns: 5 });
  save.inventory.genes = 100;
  const r = repo();
  const { run } = autoPlay(plane('jiguan'), save, 3);
  const earned = run.genes;
  run.finalize(r);
  assert.equal(save.inventory.genes, 100 + earned, '本局基因应入库供虫巢消费');
});

// ===== 裂缝变异：高风险高回报 =====

test('裂缝变异：刷怪/血量/移速修正生效，基因倍率封顶 2.5', () => {
  const save = freshSave({ totalRuns: 5 });
  const base = generateDungeon(plane('aofa'), save, 3);
  const horde = generateDungeon(plane('aofa'), save, 3, ['mod_horde']);
  assert.ok(horde.stages[0].spawnRate > base.stages[0].spawnRate, '虫潮应提高刷怪率');
  assert.ok(horde.mods.geneMul > 1, '变异应提高基因倍率');

  const iron = generateDungeon(plane('aofa'), save, 3, ['mod_ironhide']);
  assert.ok(iron.stages[0].minion.hp > base.stages[0].minion.hp, '铁皮化应提高杂兵血量');
  assert.equal(iron.stages[0].closer.hp, base.stages[0].closer.hp, '红线1：不得改精英/BOSS 基准');

  const all = generateDungeon(plane('aofa'), save, 3, RIFT_MODS.map((m) => m.id));
  assert.ok(all.mods.geneMul <= 2.5 + 1e-9, '基因倍率必须封顶 2.5');
  assert.ok(all.mods.risk >= 5, '风险应累加');

  // 薄命：玩家生命上限下降
  const glassRun = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3, ['mod_glass']), 11);
  const plainRun = new RealtimeRun(save, base, 11);
  assert.ok(glassRun.stats.maxHp < plainRun.stats.maxHp, '薄命应降低生命上限');

  // 基因倍率作用于入账口
  const before = glassRun.genes;
  glassRun.addGenes(100, false);
  assert.ok(glassRun.genes - before > 100, '基因倍率应在入账时生效');
});

// ===== 无尽模式：通关后续接深渊层 =====

test('无尽模式：击破BOSS后续接深渊层，敌人与基因倍率递增', () => {
  const save = freshSave({ totalRuns: 5 });
  save.stats.endlessUnlocked = true;
  const d = generateDungeon(plane('aofa'), save, 3, [], { endless: true });
  const run = new RealtimeRun(save, d, 11);
  assert.equal(run.endless, true, '解锁后应启用无尽');
  assert.equal(run.endlessLayer, 0, '起始层为 0');

  const stagesBefore = run.dungeon.stages.length;
  const geneMulBefore = run.geneMul;
  run.onKill({ kind: 'boss', name: 'B' });
  assert.equal(run.state, RunState.CHOOSING, '无尽下击破BOSS应进入升级而非结束');
  assert.equal(run.endlessLayer, 1, '应进入第 1 层');
  assert.equal(run.dungeon.stages.length, stagesBefore + 1, '应追加一层');
  assert.ok(run.geneMul > geneMulBefore, '基因倍率应递增');

  const layer1 = run.dungeon.stages[run.dungeon.stages.length - 1];
  assert.ok(layer1.minion.hp > run.dungeon.stages[4].minion.hp, '深渊杂兵应更硬');
  assert.ok(layer1.spawnRate > run.dungeon.stages[4].spawnRate, '深渊刷怪应更快');
});

test('无尽模式：未解锁时不启用；主动撤离以胜利结算', () => {
  const locked = freshSave({ totalRuns: 5 });
  const lockedRun = new RealtimeRun(locked, generateDungeon(plane('aofa'), locked, 3, [], { endless: true }), 11);
  assert.equal(lockedRun.endless, false, '未解锁不得启用无尽');
  lockedRun.onKill({ kind: 'boss', name: 'B' });
  assert.equal(lockedRun.state, RunState.WON, '未解锁应正常结束');
  assert.equal(lockedRun.retire(), false, '非无尽不可撤离');

  const save = freshSave({ totalRuns: 5 });
  save.stats.endlessUnlocked = true;
  const run = new RealtimeRun(save, generateDungeon(plane('aofa'), save, 3, [], { endless: true }), 11);
  assert.ok(run.retire(), '无尽模式可主动撤离');
  assert.equal(run.state, RunState.WON, '撤离应以胜利结算');
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
