// 内容到达率：一条完整成长线打下来，各个内容系统**实际有多少条到达过玩家**。
//
// 「接上了」和「玩家遇得到」是两回事。这个仓库已经栽过两次：
//   · data/skills.js 的 60 个技能因为谓词重叠，可证明恒为空集
//   · data/crises.js 整个系统写完了但全仓零 import
// 两次都是单元测试全绿。这个脚本量的是覆盖率而不是正确性 ——
// 某一列长期是 0/N，就说明那部分内容是玩家永远见不到的死内容。
//
// 用法：node tools/content-reach.mjs [局数]

import { createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';
import { rollPlane } from '../shizu-cocos/assets/scripts/core/planePool.js';
import { rngFactory } from '../shizu-cocos/assets/scripts/core/rng.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { SYNERGIES } from '../shizu-cocos/assets/scripts/data/synergies.js';
import * as relicsMod from '../shizu-cocos/assets/scripts/data/relics.js';
import { ACHIEVEMENTS } from '../shizu-cocos/assets/scripts/data/achievements.js';
import { SHOP_ITEMS } from '../shizu-cocos/assets/scripts/data/shopItems.js';
import { CRISES } from '../shizu-cocos/assets/scripts/data/crises.js';
import { ELITE_AFFIXES } from '../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { SIDE_QUESTS } from '../shizu-cocos/assets/scripts/data/sideQuests.js';
import { ALL_HIDDEN_SKILLS } from '../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { mechUpgradePool } from '../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { GENERIC_ATTR_POOL } from '../shizu-cocos/assets/scripts/data/attrPool.js';
import { botAct, pickOption } from '../tests/helpers.mjs';

// 强化池按流派切分，总数取所有流派的并集。
// ⚠ 这一列会被本脚本**系统性低估**：强化池取决于 currentRouteMech()，
// 而它优先看开裂缝时选的武器（weaponLoadout），没选才回落到基因锁最高的路线。
// 机器人从不选武器 → 整条成长线锁在同一个流派的 2~3 条强化上。
// 真人换武器就能摸到别的池子，所以这里低的数字不等于「死内容」。
const MECH_TOTAL = new Set(
  ['combo', 'chain', 'multishot', 'corpseBlast', 'laser', 'missile', 'parasite', 'reflect', 'stomp']
    .flatMap((t) => mechUpgradePool(t).map((x) => x.id)),
).size;
// RELICS 是以 id 为键的对象，不是数组
const RELIC_TOTAL = Object.keys(relicsMod.RELICS ?? {}).length;

const RUNS = Number(process.argv[2] ?? 12);
const repo = createSaveRepo(createMemoryStorage());
let save = repo.load();
const rng = rngFactory(20260823);
const DT = 1 / 60;

/** 每个系统：见过的 id 集合 */
const seen = {
  synergy: new Set(), crisis: new Set(), affix: new Set(), sideQuest: new Set(),
  skillOpt: new Set(), mechOpt: new Set(), attrOpt: new Set(), shop: new Set(),
};

for (let n = 1; n <= RUNS; n++) {
  const plane = rollPlane(save, rng);
  const run = new RealtimeRun(save, generateDungeon(plane, save, n * 13), n * 31);
  if (run.sideQuest) seen.sideQuest.add(run.sideQuest.id);

  for (let f = 0; f < 60 * 60 * 15; f++) {
    if (run.state === RunState.WON || run.state === RunState.LOST) break;
    if (run.state === RunState.CHOOSING) {
      for (const o of run.pendingOptions.options) {
        if (o.kind === 'skill') seen.skillOpt.add(o.id);
        else if (o.kind === 'mech') seen.mechOpt.add(o.id);
        else seen.attrOpt.add(o.id);
      }
      run.choose(pickOption(run.pendingOptions.options));
      continue;
    }
    if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
    if (run.state === RunState.SHOPPING) {
      for (const it of run.shopItems ?? []) seen.shop.add(it.id);
      run.closeShop();
      continue;
    }
    const a = f * 0.02 + n;
    const mv = { mx: Math.cos(a), my: Math.sin(a) };
    botAct(run, mv);
    run.update(DT, mv);
    run.drainEffects();
    if (run.crisis) seen.crisis.add(run.crisis.def.id);
    for (const e of run.enemies) if (e.affix) seen.affix.add(e.affix.id ?? e.affix.name);
  }
  for (const id of run.firedSynergies ?? []) seen.synergy.add(id);
  run.finalize(repo);
  save = repo.load();
}

const rows = [
  ['共鸣（synergies）', seen.synergy.size, SYNERGIES.length],
  ['危机（crises）', seen.crisis.size, CRISES.length],
  ['精英词缀（eliteAffixes）', seen.affix.size, ELITE_AFFIXES.length],
  ['支线协议（sideQuests）', seen.sideQuest.size, SIDE_QUESTS.length],
  ['三选一·技能（skills）', seen.skillOpt.size, 60],
  ['三选一·强化（mechUpgrades）', seen.mechOpt.size, MECH_TOTAL],
  ['三选一·属性（attrPool）', seen.attrOpt.size, GENERIC_ATTR_POOL.length],
  ['黑市商品（shopItems）', seen.shop.size, SHOP_ITEMS.length],
  ['传承残影（relics）', save.inventory.relics.length, RELIC_TOTAL],
  ['禁忌技能（hiddenSkills）', save.inventory.hiddenSkills.length, ALL_HIDDEN_SKILLS.length],
  ['成就（achievements）', Object.keys(save.stats.achievementFlags ?? {}).length, ACHIEVEMENTS.length],
];

console.log(`打了 ${RUNS} 局，各内容系统的到达情况：\n`);
console.log('系统'.padEnd(26) + '到达/总数   覆盖率');
let dead = 0;
for (const [name, got, total] of rows) {
  const pct = total ? (got / total * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '·');
  const flag = got === 0 ? '  ⚠ 一条都没到达' : pct < 25 ? '  ⚠ 覆盖偏低' : '';
  if (got === 0) dead += 1;
  console.log(`${name.padEnd(24)} ${String(got).padStart(3)}/${String(total).padEnd(3)}  ${bar} ${pct.toFixed(0)}%${flag}`);
}
console.log(`\n判读：覆盖率长期为 0 的系统 = 玩家永远见不到的死内容。`);
process.exit(dead ? 1 : 0);
