// 平衡基线对照：改数值/机制之前先跑一遍存下来，改完再跑一遍比。
// 割草单局方差极大，不固定种子的前后对比毫无意义。
//
// 用法：
//   node tools/contact-baseline.mjs > .tmp/baseline.txt     # 改动前
//   node tools/contact-baseline.mjs > .tmp/after.txt        # 改动后
//   diff .tmp/baseline.txt .tmp/after.txt
//   SEEDS=20 node tools/contact-baseline.mjs                # 加大样本
//
// ⚠ 同种子对照**只在改动不消耗 rng 时成立**。
// 一旦新增了会调 this.rng() 的逻辑（比如给位面加一个招牌事件），
// 整条随机流就会错位，同一种子之后的所有抽取全变 —— 逐局 diff 立刻失去意义，
// 只能看聚合指标，而且要把样本加大到能压住噪声（20 局里 3 胜 vs 5 胜说明不了任何事）。

import { createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { botAct, pickOption } from '../tests/helpers.mjs';

const PLANES = ['aofa', 'shihai', 'shanhai', 'jiguan'];
const SEED_N = Number(process.env.SEEDS ?? 5);
const SEEDS = Array.from({ length: SEED_N }, (_, i) => i + 1);
const DT = 1 / 60;

function run1(planeId, seed) {
  const repo = createSaveRepo(createMemoryStorage());
  const save = repo.load();
  save.player.totalRuns = 5;
  const run = new RealtimeRun(save, generateDungeon(planes.find((p) => p.id === planeId), save, seed), seed * 31);
  let minHp = 1;
  for (let f = 0; f < 60 * 60 * 20; f++) {
    if (run.state === RunState.WON || run.state === RunState.LOST) break;
    if (run.state === RunState.CHOOSING) { run.choose(pickOption(run.pendingOptions.options)); continue; }
    if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
    if (run.state === RunState.SHOPPING) { run.closeShop(); continue; }
    const a = f * 0.02 + seed;
    const mv = { mx: Math.cos(a), my: Math.sin(a) };
    botAct(run, mv);
    run.update(DT, mv);
    run.drainEffects();
    minHp = Math.min(minHp, run.hp / run.stats.maxHp);
  }
  return {
    won: run.state === RunState.WON,
    sec: run.time,
    stage: run.stageNo,
    kills: run.kills,
    minHp,
  };
}

console.log('位面        种子   结局   秒数   阶段   击杀   最低血%');
let wins = 0, n = 0, secSum = 0, minHpSum = 0;
for (const id of PLANES) {
  for (const seed of SEEDS) {
    const r = run1(id, seed);
    n += 1; if (r.won) wins += 1;
    secSum += r.sec; minHpSum += r.minHp;
    console.log(
      id.padEnd(10),
      String(seed).padStart(4),
      (r.won ? '通关' : '身陨').padStart(5),
      r.sec.toFixed(0).padStart(6),
      String(r.stage).padStart(5),
      String(r.kills).padStart(6),
      (r.minHp * 100).toFixed(0).padStart(7),
    );
  }
}
console.log('—'.repeat(52));
console.log(`通关率 ${(wins / n * 100).toFixed(0)}%   平均时长 ${(secSum / n).toFixed(0)}s   平均最低血 ${(minHpSum / n * 100).toFixed(0)}%`);
