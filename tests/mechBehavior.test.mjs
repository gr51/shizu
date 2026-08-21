// ===== backlog #6：路线机制行为强化（9 条，每条一个行为断言）=====
//
// 守护：MECH_UPGRADES 里的行为选项必须真的改变机制行为——
// 此前 17 条强化全是 +X% 数值，「构筑感」只是换皮的数值分配器。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7) {
  const save = freshSave({ totalRuns: 5, geneLocks });
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

test('雷链·过载：弹射不再衰减', () => {
  const strike = (overload) => {
    const r = buildRun({ dujie: 3 });
    r.stats.crit = 0;
    if (overload) r.mechLvl.noDecay = 1;
    r.player.attackCd = 0;
    mkDummy(r, 20, 50000);
    mkDummy(r, 140, 50000);
    mkDummy(r, 255, 50000);
    r.updateAttack(1 / 60);
    const [, b, c] = r.enemies;
    return { d2: 50000 - b.hp, d3: 50000 - c.hp };
  };
  const plain = strike(false);
  assert.ok(plain.d3 < plain.d2 * 0.75, `默认应衰减（${plain.d3} < ${plain.d2}）`);
  const over = strike(true);
  assert.ok(over.d3 > plain.d3 * 1.3, `过载后第二跳不再衰减（${over.d3} > ${plain.d3}×1.3）`);
});

test('尸爆·毒云：爆炸波及的幸存者沾染尸毒', () => {
  const r = buildRun({});
  r.routeMech = 'corpseBlast';
  r.mechLvl.cloud = 1;     // 毒云强化生效
  const dead = mkDummy(r, 0, 1);
  const survivor = mkDummy(r, 50, 5000);
  r.killEnemy(dead);
  assert.ok(survivor.hp < 5000, '尸爆应直接伤害幸存者');
  assert.ok(r.dots.some((d) => d.eid === survivor.id), '毒云应给幸存者叠上 DoT');
});

test('导弹齐射：数量上限 3 发——最近三目标被直击，远处怪毫发无伤', () => {
  const r = buildRun({ jijia: 3 });
  r.routeMech = 'missile';
  // 布局：清掉构造器刷的初始怪，只留测试桩——四个近处目标 + 一个全然无关的远处怪。
  // 齐射 count=3 只打最近三发；第四近的 splashOnly 与远处的 far 都不该被直击。
  r.enemies.length = 0;
  const t1 = mkDummy(r, 50, 5000);
  const t2 = mkDummy(r, 200, 5000);
  const t3 = mkDummy(r, 320, 5000);
  const fourth = mkDummy(r, 400, 5000);
  const far = mkDummy(r, 600, 5000);
  void t1; void t2; void t3; void fourth;
  r.routeMechCd = 0;
  r.routeMechTick(1 / 60);
  assert.equal(t1.hp, 4987, '第 1 近被直击（atk×1.3=13）');
  assert.equal(t2.hp, 4987, '第 2 近被直击');
  assert.equal(t3.hp, 4987, '第 3 近被直击');
  assert.equal(fourth.hp, 5000, '第 4 近超出 count 不被直击');
  assert.equal(far.hp, 5000, '远处的敌人不受任何影响');
});

test('践踏·震慑：被震荡的敌人挂减速', () => {
  const r = buildRun({ shanhai: 3 });
  r.routeMech = 'stomp';
  r.mechLvl.stagger = 1;
  const dummy = mkDummy(r, 50);
  r.routeMechCd = 0;
  r.routeMechTick(1 / 60);
  assert.ok(r.elementalSlows.has(dummy.id), '震荡应给敌人挂减速');
});

test('激光·折射：向后折射成双束（背后敌人也被命中）', () => {
  const r = buildRun({ qiji: 3 });
  r.routeMech = 'laser';
  r.mechLvl.refract = 1;
  const p = r.player;
  const front = mkDummy(r, 120);    // 面向前方
  const back = mkDummy(r, -120);    // 背后（折射束覆盖）
  p.facing = 1;
  r.routeMechCd = 0;
  r.routeMechTick(1 / 60);
  assert.ok(front.hp < 5000, '前方敌人被主束命中');
  assert.ok(back.hp < 5000, '背后敌人被折射束命中');
});

test('弹幕·贯穿：多发弹幕伤害叠加主目标', () => {
  const strike = (pierce) => {
    const r = buildRun({ mofa: 3 });
    r.routeMech = 'multishot';
    r.stats.crit = 0;
    if (pierce) r.mechLvl.pierce = 1;
    r.geneStep = 6;   // projCount = 2
    r.player.attackCd = 0;
    const dummy = mkDummy(r, 40, 5000);
    r.updateAttack(1 / 60);
    return 5000 - dummy.hp;
  };
  const plain = strike(false);
  const pierced = strike(true);
  assert.ok(pierced > plain * 1.15, `贯穿应叠加伤害（${pierced} > ${plain}×1.15）`);
});

test('寄生·再寄生：友军啃死的怪原地再寄生', () => {
  const r = buildRun({ gongshengchao: 3 });
  r.routeMech = 'parasite';
  r.mechLvl.rebind = 1;
  const p = r.player;
  const ally = { x: p.x + 40, y: p.y, atk: 50, life: 10, anim: 0 };
  r.mechAllies.push(ally);
  const prey = mkDummy(r, 42, 1);   // 一咬就死
  prey.x = ally.x + 5; prey.y = ally.y;
  const before = r.mechAllies.length;
  const realRng = r.rng;
  r.rng = () => 0.1;   // 确定性：再寄生必触发
  for (let i = 0; i < 10 && r.mechAllies.length === before; i++) {
    r.updateMechAllies(1 / 60);   // 啃咬是持续伤害，需要多帧
  }
  r.rng = realRng;
  assert.ok(prey.hp <= 0 || prey.dead, '猎物被啃死');
  assert.ok(r.mechAllies.length > before, '再寄生应原地补一只友军');
});

test('金身·震慑：反震命中的敌人被减速', () => {
  const r = buildRun({ gongde: 3 });
  r.routeMech = 'reflect';
  r.mechLvl.stagger = 1;
  r.stats.reflect = 0.5;
  const p = r.player;
  p.invuln = 0;
  const attacker = mkDummy(r, 30);
  const hp0 = r.hp;
  r.hurtPlayer(5, 0.1);
  assert.ok(r.hp < hp0, '玩家受到伤害');
  assert.ok(r.elementalSlows.has(attacker.id), '反震命中应给攻击者挂减速');
});

test('连招·剑气迸发：爆发瞬间周身扫一圈', () => {
  const r = buildRun({ xiake: 3 });
  r.routeMech = 'combo';
  r.mechLvl.wave = 1;
  r.stats.crit = 0;
  r.combo.every = 1;   // 每次命中都爆发
  r.combo.dmgPct = 0.2;
  r.player.attackCd = 0;
  const near = mkDummy(r, 30, 5000);
  r.updateAttack(1 / 60);
  assert.ok(near.hp < 5000 - 5, '迸发应造成额外周身伤害');
});
