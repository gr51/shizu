// 多局 Build 体检：连着打 N 局，看三选一的选项构成随周目怎么变。
// 「局内 Build 空洞」到底是首周目特有（设计如此：首进属性通道、跨局才转技能通道），
// 还是打到第 5 局技能仍然出不来 —— 这个脚本用数据回答，不靠猜。
//
// 用法：node tools/build-depth.mjs [局数]

import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { rollPlane } from '../shizu-cocos/assets/scripts/core/planePool.js';
import { rngFactory } from '../shizu-cocos/assets/scripts/core/rng.js';
import { botAct, pickOption } from '../tests/helpers.mjs';

const RUNS = Number(process.argv[2] ?? 6);
const repo = createSaveRepo(createMemoryStorage());
let save = repo.load();
const rng = rngFactory(20260821);

console.log('局 │ 位面           │ 通道   │ 三选一 │ 技能 强化 属性 │ 已激活路线（段位）');
console.log('───┼────────────────┼────────┼────────┼───────────────┼──────────────────');

for (let n = 1; n <= RUNS; n++) {
  const plane = rollPlane(save, rng);
  const dungeon = generateDungeon(plane, save, 3);
  const run = new RealtimeRun(save, dungeon, 17 + n);

  const kinds = { skill: 0, mech: 0, attr: 0 };
  let rolls = 0;
  const DT = 1 / 60;
  let f = 0;

  while (run.state !== RunState.WON && run.state !== RunState.LOST && f < 60 * 60 * 12) {
    if (run.state === RunState.CHOOSING) {
      rolls += 1;
      for (const o of run.pendingOptions.options) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
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
  }
  run.finalize(repo);
  save = repo.load();

  const locks = Object.entries(save.player.geneLocks)
    .filter(([, v]) => v > 0).map(([r, v]) => `${r}${v}`).join(' ') || '（无）';
  console.log(
    `${String(n).padStart(2)} │ ${plane.name.padEnd(12)} │ ${dungeon.channel === 'skill' ? '技能  ' : '属性  '} │`
    + ` ${String(rolls).padStart(4)}   │ ${String(kinds.skill).padStart(3)} ${String(kinds.mech).padStart(4)} ${String(kinds.attr).padStart(4)} │ ${locks}`,
  );
}

console.log('\n判读：若第 2 局起「技能」一列仍长期为 0，说明技能内容实际进不了池，');
console.log('      而不只是「首进属性通道」的设计预期。');
