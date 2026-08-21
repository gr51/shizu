// ===== tank 变体独有行为：蓄力践踏（AOE + 玩家踉跄） =====
//
// tank 曾是五种变体里唯一「只有数值差异、没有行为」的（开发说明·已知问题 #1）。
// 现在它是「区域拒绝」：贴脸就原地蓄力 0.6s（收缩圈预警）→ AOE 震地，
// 被震到掉血 + 踉跄减速。禅心（ccResist）作为玩家控制抗性在此首次有了消费者
// （开发说明·已知问题 #5 一并闭环）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun, SLAM_RANGE, SLAM_WINDUP, SLAM_PLAYER_SLOW } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks = {}, seed = 7, stage = 1) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  const dungeon = generateDungeon(AOFA, save, seed, [], {});
  const r = new RealtimeRun(save, dungeon, seed * 3 + 1);
  // advanceStage 会 openChoice 把状态切到 CHOOSING；单测直接操纵核心，拨回战斗态
  while (r.stageNo < stage) { r.advanceStage(); r.state = RunState.FIGHTING; }
  return r;
}

function mkTank(r, over = {}) {
  const p = r.player;
  return {
    id: r.nextId++, kind: 'minion', variant: 'tank', name: '重装怪',
    hp: 3000, maxHp: 3000, atk: 10, x: p.x + 60, y: p.y, r: 14,
    speed: 50, spitCd: 0, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
    slamCd: 0, slamWindup: 0,
    ...over,
  };
}

test('tank 贴脸起脚：进入距离带 → 蓄力预警，蓄力期站定不动（可读窗口）', () => {
  const r = buildRun({}, 7, 2);   // 践踏从第 2 阶段起启用
  const tank = mkTank(r, { x: r.player.x + 60 });   // d=60 ≤ SLAM_RANGE
  r.enemies.push(tank);
  tank.slamCd = 0;
  r.updateTank(tank, -1, 0, 60, 1 / 60, 1);
  assert.equal(tank.slamWindup, SLAM_WINDUP, '进入距离带应立即起脚蓄力');

  const x0 = tank.x;
  for (let i = 0; i < 10; i++) r.updateTank(tank, -1, 0, 60, 1 / 60, 1);
  assert.equal(tank.x, x0, '蓄力期必须站定 —— 抬手期移动等于没有预警');

  // 远距离不蓄力：远处它只是个肉沙包，只会慢慢逼近
  const far = mkTank(r, { x: r.player.x + 400 });
  r.enemies.push(far);
  far.slamCd = 0;
  const fx0 = far.x;
  r.updateTank(far, -1, 0, 400, 1 / 60, 1);
  assert.equal(far.slamWindup, 0, '超出 SLAM_RANGE 不应蓄力');
  assert.ok(far.x < fx0, '超距离时应正常追击（靠近玩家）');
});

test('践踏落地：圈内玩家掉血 + 进入踉跄，踉跄期间移速打折', () => {
  const r = buildRun({}, 7, 2);
  const p = r.player;
  p.invuln = 0;
  const hp0 = r.hp;
  const tank = mkTank(r, { x: p.x + 60, slamWindup: 0.01 });
  r.enemies.push(tank);
  r.updateTank(tank, -1, 0, 60, 1 / 60, 1);   // 蓄力走完 → 落地
  assert.equal(tank.slamWindup, 0, '落地后蓄力清零');
  assert.ok(tank.slamCd >= 5.0, '落地后进入长 CD（收招）');
  assert.ok(r.hp < hp0, '圈内玩家应受到践踏伤害');
  assert.ok(r.playerSlowT > 0, '被震到应进入踉跄');
  assert.ok(r.playerSlowT <= SLAM_PLAYER_SLOW + 1e-9);

  // 踉跄期间移速减半
  const x0 = p.x;
  p.invuln = 0;
  r.updatePlayer(1 / 60, { mx: 1, my: 0 });
  const dxSlow = p.x - x0;
  p.x = x0;
  r.playerSlowT = 0;
  r.updatePlayer(1 / 60, { mx: 1, my: 0 });
  const dxFast = p.x - x0;
  assert.ok(Math.abs(dxSlow - dxFast * 0.6) < 1e-9, `踉跄移速应 ×0.6（${dxSlow} vs ${dxFast}）`);
});

test('禅心（ccResist）缩短践踏踉跄 —— 玩家控制抗性终于有消费者', () => {
  const slamSlow = (geneLocks) => {
    const r = buildRun(geneLocks, 7, 2);
    const p = r.player;
    p.invuln = 0;
    const tank = mkTank(r, { x: p.x + 60, slamWindup: 0.01 });
    r.enemies.push(tank);
    r.updateTank(tank, -1, 0, 60, 1 / 60, 1);
    return r.playerSlowT;
  };
  const plain = slamSlow({});
  const chan = slamSlow({ gongde: 4 });   // gongde_4 禅心：ccResist +50%
  assert.ok(Math.abs(plain - SLAM_PLAYER_SLOW) < 1e-9, `无抗性踉跄应等于基础时长（${plain}）`);
  assert.ok(chan > 0 && chan < plain, `禅心应缩短踉跄（${chan} < ${plain}）`);
  assert.ok(Math.abs(chan - SLAM_PLAYER_SLOW * 0.5) < 1e-9, 'ccResist 0.5 → 踉跄减半');
});

test('圈外与无敌帧都不吃践踏', () => {
  // 圈外：距离 > SLAM_RADIUS，落地不掉血不踉跄
  const far = buildRun({}, 7, 2);
  far.player.invuln = 0;
  const hpFar = far.hp;
  const t1 = mkTank(far, { x: far.player.x + 300, slamWindup: 0.01 });
  far.enemies.push(t1);
  far.updateTank(t1, -1, 0, 300, 1 / 60, 1);
  assert.equal(far.hp, hpFar, '圈外不掉血');
  assert.equal(far.playerSlowT, 0, '圈外不踉跄');

  // 无敌帧：躲开了就是躲开了 —— 不掉血也不吃踉跄
  const inv = buildRun({}, 7, 2);
  inv.player.invuln = 1;
  const hpInv = inv.hp;
  const t2 = mkTank(inv, { x: inv.player.x + 60, slamWindup: 0.01 });
  inv.enemies.push(t2);
  inv.updateTank(t2, -1, 0, 60, 1 / 60, 1);
  assert.equal(inv.hp, hpInv, '无敌帧内不掉血');
  assert.equal(inv.playerSlowT, 0, '无敌帧内不踉跄（躲开践踏有真实收益）');
});

test('第 1 阶段不践踏：教学期温和（复杂度按阶段引入）', () => {
  const r = buildRun({});
  assert.equal(r.stageNo, 1, '新局从第 1 阶段开始');
  const tank = mkTank(r, { x: r.player.x + 60 });
  r.enemies.push(tank);
  tank.slamCd = 0;
  const x0 = tank.x;
  r.updateTank(tank, -1, 0, 60, 1 / 60, 1);
  assert.equal(tank.slamWindup, 0, '第 1 阶段不得起脚蓄力');
  assert.ok(tank.x < x0, '第 1 阶段的 tank 只是慢速追击');
});
