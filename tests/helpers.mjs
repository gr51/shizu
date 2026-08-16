// 测试公共夹具
import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { rngFactory } from '../shizu-cocos/assets/scripts/core/rng.js';

export function freshSave(patch = {}) {
  const s = createDefaultSave();
  Object.assign(s.player, patch);
  return s;
}

export function repo() {
  const storage = createMemoryStorage();
  const r = createSaveRepo(storage);
  let persistCount = 0;
  return {
    ...r,
    persist(d) {
      persistCount += 1;
      r.persist(d);
    },
    get persistCount() {
      return persistCount;
    },
  };
}

export const rng = (seed = 12345) => rngFactory(seed);

/** 把玩家推到指定战力附近：直接设永久属性百分点 */
export function withPower(save, pct) {
  save.player.permAtkPct = pct;
  save.player.permHpPct = pct;
  save.player.permSpeedPct = pct;
  return save;
}

import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';

export const DT = 1 / 60;

/**
 * 用「盲走机器人」自动打完一局：原地绕圈、不会闪避、三选一恒取第一项。
 * 它是**平衡的下限基准** —— 真人应当明显强于它。
 */
export function autoPlay(plane, save, seed, repo = null) {
  const run = new RealtimeRun(save, generateDungeon(plane, save, seed), seed * 13 + 5);
  let f = 0;
  let peak = 0;
  while (run.state !== RunState.WON && run.state !== RunState.LOST && f < 60 * 60 * 20) {
    if (run.state === RunState.CHOOSING) { run.choose(0); continue; }
    if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
    const a = f * 0.02 + seed;
    run.update(DT, { mx: Math.cos(a), my: Math.sin(a) });
    run.drainEffects();
    peak = Math.max(peak, run.onScreen);
    f += 1;
  }
  const result = repo ? run.finalize(repo) : null;
  return { run, result, peak, won: run.state === RunState.WON };
}
