// 敌人行为探针：跑一局，统计各变体的**独有行为**实际触发了多少次。
//
// 「加了冲刺状态机」和「玩家真的会遇到冲刺」是两回事：距离带、CD、刷新权重
// 任何一个没配好，行为就写了等于没写。这个脚本用触发次数说话。
//
// 用法：node tools/enemy-behavior.mjs [秒数] [位面id]
//
// 注意：武侠位面的变体是按 sprite 硬派的（battle.js spawnEnemy），不走权重表，
// tank/bomber 只能从涌潮路径刷出来。要看权重表的真实分布得挑别的位面。

import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun, MINION_VARIANTS } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { botAct, pickOption } from '../tests/helpers.mjs';

const SECS = Number(process.argv[2] ?? 180);
const PLANE = process.argv[3] ?? 'wuxia';
const repo = createSaveRepo(createMemoryStorage());
const save = repo.load();
save.player.totalRuns = 5;
const dungeon = generateDungeon(planes.find((p) => p.id === PLANE), save, 991);
const run = new RealtimeRun(save, dungeon, 4242);

const stat = {
  spawned: {}, dashWindup: 0, dashDone: 0, fuseLit: 0, fuseBlast: 0, spit: 0,
};
const wasWindup = new Map();
const wasDash = new Map();
const wasFuse = new Map();

const DT = 1 / 60;
const frames = SECS * 60;
for (let f = 0; f < frames; f++) {
  if (run.state === RunState.WON || run.state === RunState.LOST) break;
  if (run.state === RunState.CHOOSING) { run.choose(pickOption(run.pendingOptions.options)); continue; }
  if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
  if (run.state === RunState.SHOPPING) { run.closeShop(); continue; }

  const before = new Set(run.enemies.map((e) => e.id));
  const a = f * 0.03;
  const move = { mx: Math.cos(a), my: Math.sin(a) };
  botAct(run, move);
  run.update(DT, move);

  for (const e of run.enemies) {
    if (!before.has(e.id) && e.variant) stat.spawned[e.variant] = (stat.spawned[e.variant] ?? 0) + 1;
    // 上升沿计数：从「没在抬手」变成「正在抬手」才算一次
    if (e.dashWindup > 0 && !wasWindup.get(e.id)) stat.dashWindup += 1;
    wasWindup.set(e.id, e.dashWindup > 0);
    if (e.dashT > 0 && !wasDash.get(e.id)) stat.dashDone += 1;
    wasDash.set(e.id, e.dashT > 0);
    if (e.fuseT > 0 && !wasFuse.get(e.id)) stat.fuseLit += 1;
    wasFuse.set(e.id, e.fuseT > 0);
  }
  run.drainEffects();
}

const mins = (run.time / 60).toFixed(1);
console.log(`【${dungeon.plane.name}】跑了 ${mins} 分钟，噬灭 ${run.kills}，状态 ${run.state}\n`);
console.log('变体刷新数：');
for (const [k, v] of Object.entries(MINION_VARIANTS)) {
  const n = stat.spawned[k] ?? 0;
  console.log(`  ${k.padEnd(8)} 权重 ${String(v.weight).padStart(2)}  实际刷出 ${String(n).padStart(4)}`);
}
console.log('\n独有行为触发：');
console.log(`  charger 蓄力抬手   ${stat.dashWindup} 次`);
console.log(`  charger 实际冲刺   ${stat.dashDone} 次`);
console.log(`  bomber  点燃引信   ${stat.fuseLit} 次`);
console.log(`\n判读：冲刺次数为 0 = 距离带/CD 配错，玩家永远遇不到这个行为。`);
