// ===== backlog #7 收尾（形态技）+ #8（虫巢规则型强化）=====

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7, nest = null) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  if (nest) save.player.nestUpgrades = nest;
  const dungeon = generateDungeon(AOFA, save, seed, [], {});
  return new RealtimeRun(save, dungeon, seed * 3 + 1);
}

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

test('形态技不再永久改写属性：jijia_6 装备前后属性一致', () => {
  // jijia_6 是 form 形态技：曾在此处永久 +50% 全属性，与施放效果双计。
  // Lv6 与 Lv5 的唯一差异就是这台 form 技——属性必须完全一致。
  const lv5 = buildRun({ jijia: 5 });
  const lv6 = buildRun({ jijia: 6 });
  assert.equal(lv6.stats.atk, lv5.stats.atk, 'form 技不得永久改写攻击');
  assert.equal(lv6.stats.maxHp, lv5.stats.maxHp, 'form 技不得永久改写生命上限');
  assert.ok(lv6.learnedSkills.has('jijia_6'), '技能本身仍被习得（施放时兑现）');
});

test('高达合体：施放兑现为狂暴+机甲护盾（maxHp 不被翻倍）', () => {
  const r = buildRun({ jijia: 6 });
  const p = r.player;
  const maxHp0 = r.stats.maxHp;
  p.invuln = 0;
  r.castSkill({ name: '高达合体', eff: { allStatsPct: 0.5, duration: 8, form: 1 } });
  assert.ok(p.berserk > 0, '施放应进入狂暴');
  assert.ok(r.shield > 0, '机甲装甲应生成护盾');
  assert.equal(r.stats.maxHp, maxHp0, '生命上限不被永久翻倍');
});

test('顶天立地：护盾兑现「生命+100%」+ 全屏攻击清场', () => {
  const r = buildRun({ juhua: 6 });
  r.stats.crit = 0;
  const p = r.player;
  p.invuln = 0;
  mkDummy(r, 60, 30000);
  mkDummy(r, -80, 30000);
  mkDummy(r, 150, 30000);
  const maxHp0 = r.stats.maxHp;
  r.castSkill({ name: '顶天立地', eff: { hpPct: 1.0, aoe: 1, duration: 10, form: 1 } });
  assert.ok(r.shield >= maxHp0 * 0.85, `护盾应兑现「生命+100%」（shield=${Math.round(r.shield)} vs maxHp=${Math.round(maxHp0)}）`);
  assert.equal(r.stats.maxHp, maxHp0, '生命上限不被永久翻倍');
  const damaged = r.enemies.filter((e) => e.hp < 30000).length;
  assert.ok(damaged >= 2, `全屏攻击应波及全场（${damaged}/3 被伤）`);
});

test('巢髓·商路：黑市商品 +1', () => {
  const r = buildRun({}, 7, { nest_shop: 2 });
  r.genes = 9999;
  r.pendingShop = true;
  assert.equal(r.openShop(), true, '黑市应成功开门');
  assert.ok(r.shopItems.length >= 5, `商品应为 3+2=5（实际 ${r.shopItems.length}）`);
});

test('巢髓·先祖：开局自带寒噬之息', () => {
  const r = buildRun({}, 7, { nest_entry: 1 });
  assert.equal(r.stats.chill, 1, '开局应自带 chill=1');
  // 行为可见：命中挂减速
  r.stats.crit = 0;
  r.player.attackCd = 0;
  const dummy = mkDummy(r, 40, 5000);
  void dummy;
  r.updateAttack(1 / 60);
  assert.ok(r.elementalSlows.size > 0, '先祖词条的减速应真实生效');
});

test('未购虫巢规则：无商路加成、无先祖词条（对照）', () => {
  const r = buildRun({}, 7, {});
  assert.ok(!(r.nest.shopExtra > 0), '无商路加成');
  assert.ok(!r.stats.chill, '无先祖词条');
});
