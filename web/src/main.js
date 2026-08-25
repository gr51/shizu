// ===== main.js · 装配（唯一的入口）=====
// 职责边界：本文件与 ui/ 依赖 DOM；src/core 与 src/data 完全不依赖 —— 移植时只换 ui/ 与本文件。

import { createSaveRepo, createWebStorage } from '../../shizu-cocos/assets/scripts/core/save.js';
import { rngFactory } from '../../shizu-cocos/assets/scripts/core/rng.js';
import { findPlaneById } from '../../shizu-cocos/assets/scripts/data/planes.js';
import { renderLobby } from './ui/lobby.js';
import { startBattle } from './game/battleScreen.js';
import { startLobbyFx, stopLobbyFx } from './ui/fx.js';
import * as view from './ui/view.js';
import { applyConfigOverrides, applyOverridesData } from './config/overrides.js';

async function boot() {
  // 后台管理界面的配置覆盖：在装配前改写数据表
  // 来源①localStorage（本机预览，即时生效）
  applyConfigOverrides();
  // 来源②项目持久文件 overrides.data.json（可提交进仓库、随仓库分发）
  try {
    const r = await fetch('src/config/overrides.data.json', { cache: 'no-store' });
    if (r.ok) applyOverridesData(await r.json());
  } catch { /* 文件不存在或不可达 → 忽略 */ }

  view.initView();

  const repo = createSaveRepo(createWebStorage());
  // 大厅侧的随机（抽位面、合成）用时钟播种；副本内随机一律走副本 seed，保证可复现
  const uiRng = rngFactory((Date.now() ^ 0x5f3759df) >>> 0);

  const ctx = {
    repo,
    rng: uiRng,
    save: repo.load(),
    run: null,

    startRun(plane, riftMods = [], opts = {}) {
      stopLobbyFx();
      startBattle(ctx, plane, riftMods, opts);
    },

    toLobby() {
      ctx.run = null;
      view.hideBattleStage();
      ctx.save = repo.load();   // 从落盘结果重读，确保 UI 与存档一致
      renderLobby(ctx);
      startLobbyFx();
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
    /** 调试/自动化用倍速（1 = 正常）。仅影响战斗推进，不影响随机序列的确定性 */
    setTimeScale: (n) => ctx.setTimeScale?.(n),
    /** 调试：直接进入指定位面（id ∈ jiguan/aofa/.../zhutian） */
    startPlane: (id) => { const p = findPlaneById(id); if (p) ctx.startRun(p); else console.warn('未知位面：' + id); },
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
  startLobbyFx();

  // 位面工程编辑器「试玩」：?worldTest=<pid> 跳过大厅直入该位面（编辑→验证闭环）
  const testPid = new URLSearchParams(location.search).get('worldTest');
  if (testPid) {
    const p = findPlaneById(testPid);
    if (p) { stopLobbyFx(); ctx.startRun(p); }
    else console.warn('[worldTest] 未知位面：' + testPid);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
