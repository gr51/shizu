// 成长曲线模拟：用真实 core/ 跑 N 局，对照《噬祖-数值平衡表》八章的成长曲线表。
// 用法：node tools/simulate.mjs [局数]

import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { computePower, dungeonDifficulty } from '../shizu-cocos/assets/scripts/core/balance.js';
import { gearItemPower } from '../shizu-cocos/assets/scripts/core/gear.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { rollPlane } from '../shizu-cocos/assets/scripts/core/planePool.js';
import { Run, RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { rngFactory } from '../shizu-cocos/assets/scripts/core/rng.js';
import { activatedRoutes } from '../shizu-cocos/assets/scripts/core/geneLock.js';
import { ROUTES } from '../shizu-cocos/assets/scripts/data/routes.js';

const RUNS = Number(process.argv[2] ?? 300);
const rng = rngFactory(20240815);

/** 模拟玩家的日常操作：每槽位穿上背包里折算战力最高的那件，其余分解 */
function autoEquip(save) {
  const p = save.player;
  for (const item of [...p.gearBag]) {
    const worn = p.gear[item.slot];
    if (!worn || gearItemPower(item) > gearItemPower(worn)) {
      p.gear[item.slot] = item;
      p.gearBag.splice(p.gearBag.indexOf(item), 1);
      if (worn) p.gearBag.push(worn);
    }
  }
}

const repo = createSaveRepo(createMemoryStorage());
const save = createDefaultSave();
repo.persist(save);

const milestones = [3, 10, 50, 100, 500];
let msIndex = 0;
let wins = 0;
let losses = 0;
const channelCount = { skill: 0, attr: 0 };
let gearDropped = 0;
let hiddenFound = 0;
let totalKills = 0;
let totalSeconds = 0;

console.log(`模拟 ${RUNS} 局（真实 core/ 逻辑，非近似）\n`);
console.log('局数   战力      D值      位面        通道 结果 击杀  只/分 基因   评级');
console.log('─'.repeat(78));

for (let i = 1; i <= RUNS; i++) {
  const plane = rollPlane(save, rng);
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;
  const dungeon = generateDungeon(plane, save, seed);
  const run = new Run(save, dungeon, seed ^ 0x9e3779b9);
  channelCount[dungeon.channel] += 1;

  // 自动打完：三选一恒取第 1 项，槽满恒替换第 1 个槽
  let guard = 0;
  while (run.state !== RunState.WON && run.state !== RunState.LOST && guard++ < 100000) {
    if (run.state === RunState.CHOOSING) run.choose(0);
    else if (run.state === RunState.SLOT_CONFLICT) run.resolveSlotConflict(run.pendingSkill.options[0]);
    else run.step();
  }

  const res = run.finalize(repo);
  if (res.victory) wins += 1; else losses += 1;
  gearDropped += res.gear.length;
  if (res.hiddenSkill) hiddenFound += 1;
  totalKills += res.kills;
  totalSeconds += res.survivedSec;

  autoEquip(save);

  const power = computePower(save.player);
  if (i <= 12 || i % Math.ceil(RUNS / 12) === 0) {
    console.log(
      String(i).padEnd(6),
      power.toFixed(3).padEnd(9),
      dungeon.D.toFixed(1).padEnd(8),
      plane.name.padEnd(11),
      (dungeon.channel === 'skill' ? '技能' : '属性').padEnd(4),
      (res.victory ? '通关' : '身陨').padEnd(4),
      String(res.kills).padStart(5),
      (res.kills / (res.survivedSec / 60)).toFixed(0).padStart(5),
      String(res.genes).padStart(6),
      ' ' + res.grade,
    );
  }

  if (msIndex < milestones.length && power >= milestones[msIndex]) {
    console.log(`   └─ ⚑ 战力突破 ${milestones[msIndex]}，用时 ${i} 局`);
    msIndex += 1;
  }
}

const p = save.player;
const power = computePower(p);
console.log('\n' + '─'.repeat(74));
console.log('终局状态');
console.log(`  战力            ${power.toFixed(3)}（起始 1.000）`);
console.log(`  D 值（中等）    ${dungeonDifficulty(power, 'normal').toFixed(1)}`);
console.log(`  通关 / 身陨     ${wins} / ${losses}`);
console.log(`  割草节奏        平均 ${Math.round(totalKills / RUNS)} 只/局 · ${(totalKills / (totalSeconds / 60)).toFixed(0)} 只/分钟 · 单局 ${(totalSeconds / RUNS / 60).toFixed(1)} 分钟`);
console.log(`  永久属性        攻+${p.permAtkPct}% 血+${p.permHpPct}% 速+${p.permSpeedPct}%`);
console.log(`  已激活路线      ${activatedRoutes(save).map((r) => `${ROUTES[r].name}Lv${p.geneLocks[r]}`).join('、') || '无'}`);
console.log(`  已封印路线      ${p.sealedRoutes.map((r) => ROUTES[r].name).join('、') || '无'}`);
console.log(`  动态难度系数    ${p.dynFactor.toFixed(3)}（钳制区间 0.70~1.50）`);
console.log(`  通道分布        技能 ${channelCount.skill} 局 / 属性 ${channelCount.attr} 局`);
console.log(`  装备掉落        ${gearDropped} 件（背包 ${p.gearBag.length}）`);
console.log(`  隐藏技能        ${hiddenFound} 个 / 已刻印 ${p.inventory?.hiddenSkills?.length ?? save.inventory.hiddenSkills.length}`);
console.log(`  传承            ${save.inventory.relics.length}`);

console.log('\n对照《数值平衡表》八章成长曲线：');
console.log('  文档：新手期 战力 1→3 约需 66 次结算（每次结算 ≈ +1.67%）');
const perRun = Math.pow(power, 1 / RUNS) - 1;
console.log(`  实测：${RUNS} 局后战力 ${power.toFixed(3)}，等效每局 +${(perRun * 100).toFixed(2)}%`);
