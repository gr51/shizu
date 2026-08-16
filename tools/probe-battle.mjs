// 纯 Node 性能与正确性探针：不开浏览器，直接压 core/battle.js
import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';

const repo = createSaveRepo(createMemoryStorage());
const save = createDefaultSave();
save.player.totalRuns = 5;
const plane = planes.find((p) => p.id === (process.argv[2] ?? 'aofa'));
const run = new RealtimeRun(save, generateDungeon(plane, save, 7), 11);

const DT = 1 / 60;
let steps = 0;
let peak = 0;
let choices = 0;
const t0 = Date.now();

while (run.state !== RunState.WON && run.state !== RunState.LOST && steps < 60 * 60 * 20) {
  if (run.state === RunState.CHOOSING) { run.choose(0); choices += 1; continue; }
  if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
  // 绕圈走位，模拟真人
  const a = steps * 0.02;
  run.update(DT, { mx: Math.cos(a), my: Math.sin(a) });
  run.drainEffects();
  peak = Math.max(peak, run.onScreen);
  steps += 1;
}

const wall = Date.now() - t0;
const gameSec = steps * DT;
const r = run.finalize(repo);
console.log(`位面         ${plane.name}`);
console.log(`模拟帧数     ${steps}（游戏内 ${(gameSec / 60).toFixed(1)} 分钟）`);
console.log(`真实耗时     ${wall} ms  →  ${(steps / (wall / 1000)).toFixed(0)} 帧/秒（纯逻辑，不含渲染）`);
console.log(`结果         ${r.victory ? '通关' : '身陨'} · 阶段 ${r.stageReached}/5 · 评级 ${r.grade}`);
console.log(`噬灭         ${r.kills} 只（杂兵 ${r.minionKills}）· ${(r.kills / (gameSec / 60)).toFixed(0)} 只/分钟`);
console.log(`基因         ${r.genes}   三选一 ${choices} 次   装备 ${r.gear.length} 件`);
console.log(`同屏峰值     ${peak} / 60`);
if (steps / (wall / 1000) < 600) {
  console.log('\n⚠ 逻辑帧率低于 600fps —— 开倍速或低端机会掉帧，需要优化');
}
