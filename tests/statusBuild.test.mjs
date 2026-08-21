// ===== 新增 build 轴：出征武器 / 已接线技能效果 =====
//
// 守护两件事：
//  1) 出征武器（weaponLoadout）：玩家开裂缝前选定的路线决定武器/路线机制/皮肤，
//     而不是被元进度里「基因锁最高路线」锁死 —— 这是本作构建多样性的核心杠杆。
//  2) 已声明但此前未接入战斗的技能效果（尸毒 dot / 元素 / 反击 / 护盾 / 攻速窗口）：
//     现在必须真的聚合进 stats，并在战斗里产生可观测效果（不再是死技能）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { currentWeapon, currentRouteMech, currentSkin } from '../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { mechUpgradePool } from '../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { newlyFiredSynergies } from '../shizu-cocos/assets/scripts/data/synergies.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { freshSave } from './helpers.mjs';

const AOFA = planes.find((p) => p.id === 'aofa');

function buildRun(geneLocks, weaponLoadout = null, seed = 7) {
  const save = freshSave({ totalRuns: 5, geneLocks });
  const dungeon = generateDungeon(AOFA, save, seed, [], { weaponLoadout });
  return new RealtimeRun(save, dungeon, seed * 3 + 1);
}

test('出征武器：weaponLoadout 改变武器 / 路线机制 / 皮肤，而非基因锁最高路线', () => {
  // dujie 与 sangshi 同为 Lv3：无出征时取最高（先出现者 dujie）
  const noLoadout = buildRun({ dujie: 3, sangshi: 3 }, null);
  assert.equal(noLoadout.weapon.pattern, 'circle', '默认应取基因锁最高路线 dujie（circle）');
  assert.equal(noLoadout.routeMech, 'chain', 'dujie 对应雷链');

  // 明确出征 sangshi → 武器变丧尸毒雾（aoe），机制变尸爆
  const withLoadout = buildRun({ dujie: 3, sangshi: 3 }, 'sangshi');
  assert.equal(withLoadout.weapon.pattern, 'aoe', '出征 sangshi → aoe 毒雾');
  assert.equal(withLoadout.routeMech, 'corpseBlast', '出征 sangshi → 尸爆连锁');
  assert.equal(withLoadout.skin, 'sangshi', '出征 sangshi → 丧尸皮肤');
  assert.equal(withLoadout.loadoutRoute, 'sangshi');

  // helper 同样遵守出征参数
  assert.equal(currentWeapon({ dujie: 3, sangshi: 3 }, 'sangshi').pattern, 'aoe');
  assert.equal(currentRouteMech({ dujie: 3, sangshi: 3 }, 'sangshi'), 'corpseBlast');
  assert.equal(currentSkin({ dujie: 3, sangshi: 3 }, 'sangshi'), 'sangshi');
});

test('三选一机制强化池跟随出征路线：出征 sangshi → 尸爆强化，而非基因锁最高的 dujie 雷链', () => {
  const save = freshSave({ totalRuns: 5, geneLocks: { dujie: 3, sangshi: 3 } });
  // 出征 sangshi → 机制 corpseBlast，三选一机制池全来自它
  const mech = currentRouteMech(save.player.geneLocks, 'sangshi');
  assert.equal(mech, 'corpseBlast');
  const pool = mechUpgradePool(mech);
  assert.ok(pool.length > 0, '出征路线应有专属机制强化');
  assert.ok(pool.every((o) => o.mech === 'corpseBlast'));
  // 对照：不出征时按基因锁最高路线 dujie → chain
  const autoMech = currentRouteMech(save.player.geneLocks, null);
  assert.equal(autoMech, 'chain');
  assert.ok(mechUpgradePool(autoMech).every((o) => o.mech === 'chain'));
});

test('已声明未接线的效果现在聚合进 stats（尸毒/元素/反击/护盾/攻速窗口）', () => {
  // sangshi Lv4（尸毒 dot）+ mofa Lv3（元素）+ dujie Lv4（反击）+ jijia Lv3（护盾）+ xiake Lv4（身法）
  const r = buildRun({ sangshi: 4, mofa: 3, dujie: 4, jijia: 3, xiake: 4 }, null);
  assert.equal(r.stats.dotMul, 0.3, '尸毒：dotMul = 0.3');
  assert.equal(r.stats.dotDuration, 3, '尸毒：dotDuration = 3');
  assert.ok(r.stats.elemental >= 1, '元素附加已聚合');
  assert.equal(r.stats.counterChance, 0.15, '雷枢护体：反击概率 15%');
  assert.equal(r.stats.shieldMul, 2, '护盾：盾量 = 攻 ×2');
  assert.equal(r.stats.shieldEvery, 20, '护盾：每 20s 刷新');
  assert.equal(r.stats.dodgeAspd, 0.3, '身法：闪避后攻速 +30%');
});

test('尸毒 DoT 真的造成持续伤害（不是死技能）', () => {
  // weak 存档（无基因锁）对照：没有 dot
  const plain = buildRun({}, null);
  assert.ok(!plain.stats.dotMul, '无尸毒时不聚合 dotMul');

  // sangshi Lv4：攻击命中会给敌人叠 DoT，且 statusTick 会持续止血
  const r = buildRun({ sangshi: 4 }, null);
  const p = r.player;
  // 手动放一只敌人贴近，进入自动索敌射程
  r.enemies.push({
    id: r.nextId++, kind: 'minion', variant: 'walker', name: '测试怪',
    hp: 500, maxHp: 500, atk: 1, x: p.x + 60, y: p.y, r: 12,
    speed: 0, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
  });
  p.attackCd = 0;
  r.updateAttack(1 / 60);           // 打一下 → 叠 DoT
  assert.ok(r.dots.length > 0, '命中后应叠上 DoT');
  const before = r.enemies[0].hp;
  // 连跨 2 秒：DoT 应持续掉血
  r.statusTick(1.0);
  r.statusTick(1.0);
  assert.ok(r.enemies[0].hp < before - 2, `DoT 应造成持续伤害（$`);
});

test('元素减速（魔法·附加）会真的挂上并随时间解除', () => {
  const r = buildRun({ mofa: 3 }, null);
  const p = r.player;
  const enemy = {
    id: r.nextId++, kind: 'minion', variant: 'walker', name: '测试怪',
    hp: 800, maxHp: 800, atk: 1, x: p.x + 60, y: p.y, r: 12,
    speed: 100, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
  };
  r.enemies.push(enemy);
  p.attackCd = 0;
  r.updateAttack(1 / 60);           // 命中 → 冰霜减速
  assert.ok(r.elementalSlows.has(enemy.id), '元素附加应给敌人挂减速');
  // 减速有持续时间：跨 3 秒后解除（1.5s 基础窗口）
  r.statusTick(1.0); r.statusTick(1.0); r.statusTick(1.0);
  assert.ok(!r.elementalSlows.has(enemy.id), '减速窗口过后解除');
});

test('护盾吸收伤害：有护盾时生命不掉', () => {
  const r = buildRun({ jijia: 3 }, null);
  r.statusTick(25);                 // 触发护盾刷新（每 20s）
  assert.ok(r.shield > 0, '护盾应在刷新后存在');
  const hpBefore = r.hp;
  // 小伤 <= 盾量 → 完全吸收，生命不掉，盾被消耗
  r.hurtPlayer(10);
  assert.equal(r.hp, hpBefore, '护盾足以吸收时生命不掉');
  assert.ok(r.shield < 1000, '护盾被消耗了一部分');
  // 无敌帧结束后，才测大伤 > 盾量 → 突破护盾，生命才掉
  r.player.invuln = 0;
  const hpBefore2 = r.hp;
  r.hurtPlayer(5000);
  assert.ok(r.hp < hpBefore2, '大伤害突破护盾后生命才掉');
});

test('身法攻速窗口：闪避后开启并随时间解除', () => {
  const r = buildRun({ xiake: 4 }, null);
  assert.equal(r.stats.dodgeAspd, 0.3, '身法聚合进 stats');
  assert.equal(r.dodgeAspdT, 0, '初始无攻速窗口');
  r.dodge({ mx: 1, my: 0 });
  assert.ok(r.dodgeAspdT > 0, '闪避后应开启攻速窗口');
  r.statusTick(0.5); r.statusTick(0.6);
  assert.equal(r.dodgeAspdT, 0, '1s 窗口过后攻速加成解除');
});

test('出征武器融合到完整一局：RealtimeRun 用所选路线（而非最高基因锁）', () => {
  // 出征 sangshi（Lv3），但 dujie 也 Lv3 —— 不出征应取 dujie
  const r = buildRun({ dujie: 3, sangshi: 3 }, 'sangshi');
  assert.equal(r.weapon.pattern, 'aoe', '出征后武器是 sangshi 的 aoe 毒雾');
  assert.equal(r.routeMech, 'corpseBlast', '出征后区块机制是尸爆');
  assert.equal(r.skin, 'sangshi', '出征后皮肤是丧尸');
  // 战斗能正常推进（不崩）
  r.update(1 / 60, { mx: 0, my: 0 });
  assert.ok([RunState.FIGHTING, RunState.CHOOSING, RunState.SLOT_CONFLICT, RunState.SHOPPING].includes(r.state), '出征后战斗可正常推进');
});

test('新增共鸣（燃域/坚垒/诛主/锯齿）在凑齐一对时触发', () => {
  const fired = new Set();
  const fresh = new Set(['attr_aoe', 'attr_crit']);
  const syns = newlyFiredSynergies(fresh, fired);
  assert.ok(syns.some((s) => s.id === 'syn_cinders'), '燃域：范围+暴击 → 灼烧轴');
  assert.ok(syns.every((s) => !fired.has(s.id)), '未重复触发');

  const fired2 = new Set(['syn_cinders']);
  const f2 = new Set(['attr_aoe', 'attr_crit', 'attr_execute', 'attr_aspd']);
  const syns2 = newlyFiredSynergies(f2, fired2);
  assert.ok(syns2.some((s) => s.id === 'syn_sawtooth'), '锯齿：斩杀+攻速 → 击杀回CD');

  const fired3 = new Set();
  const f3 = new Set(['attr_dmgreduct', 'attr_regen']);
  const syns3 = newlyFiredSynergies(f3, fired3);
  assert.ok(syns3.some((s) => s.id === 'syn_bastion'), '坚垒：减伤+再生 → 护盾');

  const fired4 = new Set();
  const f4 = new Set(['attr_execute', 'attr_crit']);
  const syns4 = newlyFiredSynergies(f4, fired4);
  assert.ok(syns4.some((s) => s.id === 'syn_huntsman'), '诛主：斩杀+暴击 → 对精英增伤');
});

test('禅心（玩家控制抗性）不会削弱自己给敌人挂的元素减速', () => {
  // 回归：曾误把玩家的 ccResist 拿去缩短敌人被减速的时长 —— 点防御技能反而削弱自己的冰霜
  const hitAndRead = (r) => {
    const p = r.player;
    r.enemies.push({
      id: r.nextId++, kind: 'minion', variant: 'walker', name: '测试怪',
      hp: 800, maxHp: 800, atk: 1, x: p.x + 60, y: p.y, r: 12,
      speed: 0, spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
    });
    p.attackCd = 0;
    r.updateAttack(1 / 60);
    return r.elementalSlows.get(r.enemies[0].id);
  };
  const plain = hitAndRead(buildRun({ mofa: 3 }, null));
  const chan = hitAndRead(buildRun({ mofa: 3, gongde: 4 }, null));   // gongde_4 禅心：ccResist +50%
  assert.ok(plain > 0, '元素附加应给敌人挂上减速');
  assert.equal(chan, plain, '禅心的受控抗性属于玩家，不应改变敌人被减速的时长');
});

test('元素减速对冲撞怪同样生效（接近阶段），冲刺期保持免控', () => {
  const r = buildRun({ mofa: 3 }, null);
  const mkCharger = () => ({
    id: r.nextId++, kind: 'minion', variant: 'charger', name: '冲撞怪',
    hp: 900, maxHp: 900, atk: 1, x: 0, y: 0, r: 12, speed: 100,
    spitCd: 99, hitFlash: 0, attackT: 0, anim: 0, isCloser: false,
    dashCd: 9999, dashWindup: 0, dashT: 0,   // 永不进冲刺，只走接近阶段
  });
  const free = mkCharger();
  r.updateCharger(free, 1, 0, 1, 1 / 60, 1);        // 未减速
  const slowed = mkCharger();
  r.updateCharger(slowed, 1, 0, 1, 1 / 60, 0.55);   // 被冰冻
  assert.ok(slowed.x < free.x * 0.9, `接近阶段的冲撞怪应被减速（${slowed.x} vs ${free.x}）`);
});