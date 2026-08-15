// ===== SaveSystem.ts · 跨局存档（sys.localStorage 统一适配）=====

import { sys } from 'cc';
import { SaveData } from './Types';

const KEY = 'shizu_save_v1';

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    player: {
      nestlingName: '噬灵',
      totalRuns: 0,
      wins: 0,
      consecFails: 0,
      difficultyLevel: '中等',
      dynFactor: 1.0,
      permAtkPct: 0, permHpPct: 0, permSpeedPct: 0,
      geneLocks: {},
      sealedRoutes: [],
      skillSlots: { activeA: null, activeB: null, passiveC: null, passiveD: null },
      gear: {},
      gearBag: [],
      gearEssence: 0,
    },
    inventory: { genes: 0, relics: [], comboSkills: [], hiddenSkills: [] },
    stats: {
      relicPity: 0, legendPity: 0, hiddenPity: 0.001, gearPity: 0,
      firstClear: false, endlessUnlocked: false, achievementFlags: {},
    },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = sys.localStorage.getItem(KEY);
    const d: SaveData = raw ? JSON.parse(raw) : createDefaultSave();
    return migrate(d);
  } catch (e) {
    console.error('读档失败，重置', e);
    return createDefaultSave();
  }
}

export function persistSave(d: SaveData): void {
  sys.localStorage.setItem(KEY, JSON.stringify(d));
}

export function resetSave(): void {
  sys.localStorage.removeItem(KEY);
}

function migrate(d: SaveData): SaveData {
  const base = createDefaultSave();
  if (!d.player) d.player = base.player;
  if (!d.inventory) d.inventory = base.inventory;
  if (!d.stats) d.stats = base.stats;
  // 补 player 默认字段
  for (const k of Object.keys(base.player) as (keyof SaveData['player'])[]) {
    if ((d.player as any)[k] === undefined) (d.player as any)[k] = (base.player as any)[k];
  }
  return d;
}
