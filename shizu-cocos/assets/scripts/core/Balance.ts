// ===== Balance.ts · 数值计算（战力/D 值/掉落）=====

import { SaveData, GearSlotId, GearItem } from './Types';
import { gearPowerBonus, gearAffixSum } from '../data/gear';

export interface CombatStats {
  atk: number; hp: number; speed: number;
  crit: number; aspd: number; lifesteal: number;
  dmgReduct: number; regen: number; cooldown: number; suckRadius: number;
  range: number;
}

/** 基础战斗属性（攻10 血100 速220），叠永久属性 + 装备词条 */
export function combatStats(save: SaveData): CombatStats {
  const p = save.player;
  const gear = p.gear;
  return {
    atk:   10  * (1 + p.permAtkPct)   * (1 + gearAffixSum(gear, 'atk')),
    hp:    100 * (1 + p.permHpPct)    * (1 + gearAffixSum(gear, 'hp')),
    speed: 220 * (1 + p.permSpeedPct) * (1 + gearAffixSum(gear, 'speed')),
    crit:  0.05 + gearAffixSum(gear, 'crit'),
    aspd:  1    * (1 + gearAffixSum(gear, 'aspd')),
    lifesteal: 0 + gearAffixSum(gear, 'lifesteal'),
    dmgReduct: 0 + gearAffixSum(gear, 'dmgReduct'),
    regen: 0 + gearAffixSum(gear, 'regen'),
    cooldown: 1 * (1 - gearAffixSum(gear, 'cooldown')),
    suckRadius: 1 * (1 + gearAffixSum(gear, 'suckRadius')),
    range: 1,
  };
}

/** 基因锁战力加成：每段 +2% */
export function geneLockBonus(save: SaveData): number {
  let lv = 0;
  for (const v of Object.values(save.player.geneLocks)) lv += v || 0;
  return 1 + lv * 0.02;
}

/** 战力 = (攻/10 + 血/100 + 速/220) ÷ 3 × 基因锁加成 × 装备加成 */
export function computePower(save: SaveData): number {
  const c = combatStats(save);
  return ((c.atk / 10 + c.hp / 100 + c.speed / 220) / 3) * geneLockBonus(save) * gearPowerBonus(save.player.gear);
}

/** 副本难度值 D = 战力 × 难度等级系数 × 动态系数 */
export function dungeonDifficulty(save: SaveData): number {
  const coef = { 简单: 0.9, 中等: 1.5, 困难: 2.0 }[save.player.difficultyLevel] || 1.5;
  return computePower(save) * coef * save.player.dynFactor;
}

/** 阶段系数（阶段 1-4），阶段 5 位面之主另有加成 */
export const STAGE_COEF = [0.9, 1.0, 1.15, 1.3];
export function bossStageCoef(rng: () => number): number {
  return 1.10 + rng() * 0.05;
}

/** 基因掉落 */
export function geneDrop(kind: 'minion' | 'elite' | 'boss', rng: () => number): number {
  if (kind === 'boss') return 200 + Math.floor(rng() * 101);      // 200-300
  if (kind === 'elite') return 30 + Math.floor(rng() * 21);       // 30-50
  return 5 + Math.floor(rng() * 6);                                // 5-10
}
