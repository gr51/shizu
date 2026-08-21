// ===== 死字段还债 + COMBO_SKILLS 组合技（backlog #1/#2）=====
//
// 守护：skills.js / routes.js 里声明过的效果必须有真实战斗行为。
// 此前 aspdSteal/parasiteChance/extraLife/rangedMul/missileEvery/chainDecay/inherit/
// summonDuration 八个字段零消费者，COMBO_SKILLS 整表零引用——「死技能」重演。

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

function mkDummy(r, dx, hp = 10000) {
  const p = r.player;
  const e = {
    id: r.nextId++, kind: 'minion', variant: 'walker', name: '木桩',
    hp, maxHp: hp, atk: 0, x: p.x + dx, y: p.y, r: 12,
    speed: 0, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
  };
  r.enemies.push(e);
  return e;
}

test('extraLife（母体分裂）：复活次数 +1', () => {
  const plain = buildRun({});
  const withMother = buildRun({ gongsheng: 5 });
  const base = plain.reviveLeft;
  assert.equal(withMother.reviveLeft, base + 1, '母体分裂应额外提供一次复活');
});

test('aspdSteal（汲取）：命中刷新攻速窗口，窗口内攻击更快', () => {
  const r = buildRun({ gongsheng: 1 });
  assert.equal(r.stats.aspdSteal, 0.03, '聚合进 stats');
  assert.equal(r.aspdStealT, 0, '初始无窗口');
  const p = r.player;
  mkDummy(r, 60);
  p.attackCd = 0;
  r.updateAttack(1 / 60);
  assert.ok(r.aspdStealT > 0, '命中后开启攻速夺取窗口');

  // 窗口内攻击间隔缩短
  p.attackCd = 0;
  const t0 = p.attackCd;
  p.invuln = 0;
  r.enemies.length = 0;
  mkDummy(r, 60);
  r.updateAttack(1 / 60);
  const cdWithSteal = p.attackCd;
  p.attackCd = 0;
  r.aspdStealT = 0;
  r.enemies.length = 0;
  mkDummy(r, 60);
  r.updateAttack(1 / 60);
  const cdWithout = p.attackCd;
  void t0;
  assert.ok(cdWithSteal < cdWithout, `汲取窗口内攻击间隔应更短（${cdWithSteal} < ${cdWithout}）`);
});

test('parasiteChance（寄生）：击杀精英概率反水，概率 1 时必出', () => {
  const r = buildRun({ gongsheng: 3 });
  assert.equal(r.stats.parasiteChance, 0.15, '聚合进 stats');
  r.stats.parasiteChance = 1;   // 必现
  const elite = mkDummy(r, 200);
  elite.kind = 'elite';
  elite.name = '测试精英';
  const before = r.mechAllies.length;
  r.killEnemy(elite);
  assert.equal(r.mechAllies.length, before + 1, '击杀精英应反水一只友军');
});

test('missileEvery/missileMul（机甲_5 导弹）：周期齐射打最近目标', () => {
  const r = buildRun({ jijia: 5 });
  assert.equal(r.stats.missileEvery, 10, '每 10s 一轮');
  assert.equal(r.stats.missileMul, 1.5, '单发攻 ×1.5');
  const dummy = mkDummy(r, 80, 5000);
  const hp0 = dummy.hp;
  r.statusTick(10);   // 齐射计时到期
  assert.ok(dummy.hp < hp0, '齐射应命中最近目标');
  assert.ok(Math.abs(r.missileSalvoT) < 1e-9, '计时归零重新累积');
});

test('chainDecay/chainJumps（渡劫_3 雷链）：+2 跳且伤害逐跳衰减', () => {
  const r = buildRun({ dujie: 3 });
  assert.equal(r.stats.chainJumps, 2, 'chain +2 计入跳数');
  assert.equal(r.stats.chainDecay, 0.5, '衰减比例聚合');

  // 行为验证：三个木桩排成一列（首个在近战溅射半径内；间距设计成
  // 「下一跳的最近目标」不会回跳——e2→e3(115) 严格近于 e2→e1(120)）
  const p = r.player;
  r.stats.crit = 0;              // 关暴击，保证伤害可比
  p.attackCd = 0;
  mkDummy(r, 20, 5000);
  mkDummy(r, 140, 5000);
  mkDummy(r, 255, 5000);
  r.updateAttack(1 / 60);
  const [a, b, c] = r.enemies;
  const d1 = 5000 - a.hp;        // 主目标
  const d2 = 5000 - b.hp;        // 第一跳（decay^0 = 全额 0.5）
  const d3 = 5000 - c.hp;        // 第二跳（decay^1 = 0.25）
  assert.ok(d2 > 0 && d3 > 0, '两跳都应命中');
  assert.ok(Math.abs(d3 - d2 / 2) < Math.max(0.5, d2 * 0.02), `第二跳应衰减为一半（${d3} ≈ ${d2}/2）`);
});

test('inherit/summonDuration（奇巧召唤）：真随从继承属性并持续存在', () => {
  const r = buildRun({});
  // qiji 的召唤技是主动技：字段随技能 eff 直达 castSkill（不经 applySkillEff）
  const before = r.mechAllies.length;
  r.castSkill({ name: '傀儡分身', eff: { summon: 1, inherit: 0.5, summonDuration: 20 } });
  assert.equal(r.mechAllies.length, before + 1, '召唤出真随从');
  const ally = r.mechAllies[r.mechAllies.length - 1];
  assert.equal(ally.atk, r.stats.atk * 0.5, '随从攻击 = 玩家攻 × 继承比');
  assert.equal(ally.life, 20, '随从存在 20s');
});

test('奇法傀儡（魔法+奇巧）：机关随从继承元素附加（攻击挂减速）', () => {
  const r = buildRun({ mofa: 3, qiji: 5 });
  assert.ok(r.hasCombo('qifa_kuilei'), '魔法+奇巧 → 奇法傀儡');
  r.castSkill({ name: '机关哨兵', eff: { summon: 1, inherit: 0.3 } });
  const ally = r.mechAllies[r.mechAllies.length - 1];
  assert.equal(ally.el, true, '元素在场时随从应带元素标记');
  // 随从啃咬目标 → 目标挂上元素减速（多跑几帧让随从贴到咬合距离）
  const foe = mkDummy(r, 8, 5000);
  for (let i = 0; i < 12; i++) r.updateMechAllies(1 / 60);
  assert.ok(r.elementalSlows.has(foe.id), '随从攻击应给目标挂冰霜减速');
});

test('COMBO_SKILLS 复活：双激活路线组合技生效', () => {
  const r = buildRun({ dujie: 3, gongde: 3 });
  assert.ok(r.hasCombo('dujie_jinshen'), '渡劫+功德 → 渡劫金身');
  const solo = buildRun({ dujie: 3 });
  assert.ok(!solo.hasCombo('dujie_jinshen'), '单路线不触发组合技');
});

test('尸生共融：尸爆范围 +50%（邻接 100px 处从打不到变为打得到）', () => {
  // 100px 恰好落在基础半径 70 之外、共融加成 105 之内
  const killAt = (geneLocks) => {
    const r = buildRun(geneLocks);
    r.routeMech = 'corpseBlast';
    r.player.invuln = 0;
    const dead = mkDummy(r, 0, 1);
    const near = mkDummy(r, 100, 5000);
    r.killEnemy(dead);
    return 5000 - near.hp;
  };
  const without = killAt({ sangshi: 3 });
  const withCombo = killAt({ sangshi: 3, gongsheng: 3 });
  assert.equal(without, 0, '基础半径 70 打不到 100px 外');
  assert.ok(withCombo > 0, `尸生共融 +50% 半径后应波及（造成 ${withCombo} 伤）`);
});

test('钢铁巨神：狂暴期间导弹齐射加速为 3s 一轮', () => {
  const r = buildRun({ jijia: 5, juhua: 3 });
  assert.ok(r.hasCombo('gangtie_jushen'), '机甲+巨神 → 钢铁巨神');
  const dummy = mkDummy(r, 90, 50000);
  r.player.berserk = 9999;   // 巨化/狂暴态
  const hp0 = dummy.hp;
  r.statusTick(3.05);        // 组合技间隔 3s
  assert.ok(dummy.hp < hp0, '狂暴期间 3s 即应齐射');
});
