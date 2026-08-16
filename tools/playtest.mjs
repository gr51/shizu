// 玩法内核体检：不看「能不能跑」，看「好不好玩」。
// 用法：node tools/playtest.mjs [位面id]
//
// 量的是节奏，不是正确性：
//   · 首次升级要等多久（前 60 秒有没有事情发生）
//   · 升级间隔（整体策划 4.3：首次 30-60s，之后每 60-90s，单局 6-12 次）
//   · 局内战力曲线（有没有「变强的实感」）
//   · 玩家的**有效操作**占比（只有走位 = 内核太薄）
//   · 压力曲线（同屏敌人 / 掉血节奏，有没有张弛）

import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';

const repo = createSaveRepo(createMemoryStorage());
const save = createDefaultSave();
save.player.totalRuns = 5;
const plane = planes.find((p) => p.id === (process.argv[2] ?? 'aofa'));
const run = new RealtimeRun(save, generateDungeon(plane, save, 3), 17);

const DT = 1 / 60;
import { botAct, pickOption } from '../tests/helpers.mjs';
const upgrades = [];       // 每次三选一的时间点与选项构成
const samples = [];        // 每 5 秒采样一次
let f = 0;
let lastSample = 0;

while (run.state !== RunState.WON && run.state !== RunState.LOST && f < 60 * 60 * 20) {
  if (run.state === RunState.CHOOSING) {
    upgrades.push({
      t: run.time,
      kinds: run.pendingOptions.options.map((o) => o.kind),
      names: run.pendingOptions.options.map((o) => o.name),
    });
    run.choose(pickOption(run.pendingOptions.options));
    continue;
  }
  if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }

  const a = f * 0.02;
  const move = { mx: Math.cos(a), my: Math.sin(a) };
  botAct(run, move);
  run.update(DT, move);
  run.drainEffects();
  f += 1;

  if (run.time - lastSample >= 5) {
    lastSample = run.time;
    samples.push({
      t: run.time, hp: run.hp / run.stats.maxHp, onScreen: run.onScreen,
      atk: run.stats.atk, aoe: run.stats.aoe, kills: run.kills, orbs: run.orbs.length,
    });
  }
}

const mins = run.time / 60;
console.log(`【${plane.name}】${run.state === RunState.WON ? '通关' : '身陨'} · ${mins.toFixed(1)} 分钟 · 噬灭 ${run.kills}\n`);

// —— 升级节奏 ——
console.log('升级节奏（整体策划 4.3：首次 30-60s，之后每 60-90s，单局 6-12 次）');
if (!upgrades.length) console.log('  ⚠ 整局零次升级 —— 局内 Build 完全没发生');
else {
  console.log(`  首次升级 ${upgrades[0].t.toFixed(0)}s ${upgrades[0].t > 60 ? '⚠ 超过 60s，开局太干' : '✓'}`);
  const gaps = upgrades.slice(1).map((u, i) => u.t - upgrades[i].t);
  const avg = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
  console.log(`  共 ${upgrades.length} 次 ${upgrades.length >= 6 && upgrades.length <= 12 ? '✓' : '⚠ 偏离 6-12 次'}`
    + `　平均间隔 ${avg.toFixed(0)}s ${avg >= 40 && avg <= 100 ? '✓' : '⚠'}`);
  const skillOpts = upgrades.flatMap((u) => u.kinds).filter((k) => k === 'skill').length;
  const total = upgrades.flatMap((u) => u.kinds).length;
  console.log(`  选项构成：技能 ${skillOpts}/${total}，属性 ${total - skillOpts}/${total}`
    + (skillOpts === 0 ? '　⚠ 一个技能都没出（本局是属性通道？）' : ''));
}

// —— 局内成长实感 ——
console.log('\n局内成长（「越滚越强」是割草的核心快感）');
if (samples.length > 2) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const atkGain = last.atk / first.atk;
  const aoeGain = (1 + last.aoe) / (1 + first.aoe);
  console.log(`  攻击 ${first.atk.toFixed(1)} → ${last.atk.toFixed(1)}（×${atkGain.toFixed(2)}）`
    + `　清场范围 ×${aoeGain.toFixed(2)}`);
  if (atkGain < 1.5 && aoeGain < 1.5) console.log('  ⚠ 一局下来几乎没变强 —— 没有「滚雪球」的爽感');
}

// —— 压力曲线 ——
console.log('\n压力曲线（每 60 秒）');
const perMin = [];
for (const s of samples) {
  const m = Math.floor(s.t / 60);
  perMin[m] = perMin[m] ?? { hp: [], on: [] };
  perMin[m].hp.push(s.hp);
  perMin[m].on.push(s.onScreen);
}
perMin.forEach((v, m) => {
  if (!v) return;
  const hp = v.hp.reduce((a, b) => a + b, 0) / v.hp.length;
  const on = v.on.reduce((a, b) => a + b, 0) / v.on.length;
  const bar = '█'.repeat(Math.round(on / 3)).padEnd(21);
  console.log(`  ${String(m).padStart(2)}分 同屏${bar}${on.toFixed(0).padStart(3)}  HP ${(hp * 100).toFixed(0).padStart(3)}%`);
});

// —— 玩家动词清单 ——
console.log('\n玩家可用动词（整体策划 2.3 规定了 5 个）');
const verbs = [
  ['移动（单摇杆）', true],
  ['自动索敌攻击', true],
  ['闪避翻滚（0.25s 无敌）', typeof run.dodge === 'function'],
  ['吞噬爆发（长按，范围吸取+回血+狂暴）', typeof run.devour === 'function'],
  ['主动技能自动释放（主动槽 ×2）', typeof run.updateActiveSkills === 'function'],
];
for (const [name, has] of verbs) console.log(`  ${has ? '✓' : '✗'} ${name}`);
const missing = verbs.filter(([, h]) => !h).length;
if (missing) console.log(`  ⚠ ${missing}/5 个核心动词未实现 —— 内核偏薄，玩家全程只能走位`);

run.finalize(repo);
