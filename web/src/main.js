// ===== main.js · 装配（唯一的入口）=====
// 职责边界：本文件与 ui/ 依赖 DOM；src/core 与 src/data 完全不依赖 —— 移植时只换 ui/ 与本文件。

import { createSaveRepo, createWebStorage } from '../../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../../shizu-cocos/assets/scripts/core/dungeon.js';
import { Run } from '../../shizu-cocos/assets/scripts/core/run.js';
import { rngFactory } from '../../shizu-cocos/assets/scripts/core/rng.js';
import { renderLobby } from './ui/lobby.js';
import { renderBattle } from './ui/battle.js';
import * as view from './ui/view.js';

function boot() {
  view.initView();

  const repo = createSaveRepo(createWebStorage());
  // 大厅侧的随机（抽位面、合成）用时钟播种；副本内随机一律走副本 seed，保证可复现
  const uiRng = rngFactory((Date.now() ^ 0x5f3759df) >>> 0);

  const ctx = {
    repo,
    rng: uiRng,
    save: repo.load(),
    run: null,

    startRun(plane) {
      const seed = Math.floor(uiRng() * 0xffffffff) >>> 0;
      const dungeon = generateDungeon(plane, ctx.save, seed);
      ctx.run = new Run(ctx.save, dungeon, seed ^ 0x9e3779b9);
      renderBattle(ctx);
    },

    toLobby() {
      ctx.run = null;
      ctx.save = repo.load();   // 从落盘结果重读，确保 UI 与存档一致
      renderLobby(ctx);
    },

    resetSave() {
      repo.reset();
      ctx.save = repo.load();
      ctx.run = null;
      renderLobby(ctx);
    },
  };

  // 供无头浏览器 / 手动调试驱动（与 Cocos 版保持同名接口）
  globalThis.__shizu = {
    ctx,
    get save() { return ctx.save; },
    get run() { return ctx.run; },
    snapshot() {
      const r = ctx.run;
      return {
        screen: r ? 'battle' : 'lobby',
        power: ctx.save.player.wins,
        runs: ctx.save.player.totalRuns,
        state: r?.state ?? null,
        stage: r?.stageNo ?? null,
        hp: r?.hp ?? null,
        genes: r?.genes ?? null,
        channel: r?.dungeon.channel ?? null,
        plane: r?.dungeon.plane.name ?? null,
      };
    },
  };

  renderLobby(ctx);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
