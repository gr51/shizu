// 测试公共夹具
import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../src/core/save.js';
import { rngFactory } from '../src/core/rng.js';

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
