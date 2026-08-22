// ===== ai-art/apply-themed.mjs · 把通用命名的生成物分发到位面主题命名 =====
// 用法：node tools/ai-art/apply-themed.mjs <planeId>
//
// 背景：generate.mjs 产出 minion_{walker,spitter,charger}_{plane}*.png（通用命名），
// 但除机关城外各位面的阶段表用的是主题化命名（如奥法的 yuan_jingling/huo_bing）。
// 本脚本按阶段表 + RANGED_SPRITES 把 A/B 两套生成物分发到全部主题名：
//   · RANGED_SPRITES 内的名字 → spitter(B) 套
//   · 其余 → walker(A) 套
// Boss 单图 → BOSS_BY_PLANE[plane] 的 8 帧副本。美术源与运行时副本双写。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE, RANGED_SPRITES } from '../../shizu-cocos/assets/scripts/core/battle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art', 'units');
const rtDir = path.join(root, 'shizu-cocos', 'assets', 'resources', 'art', 'units');
const plane = process.argv[2];

if (!plane) { console.error('用法: node apply-themed.mjs <planeId>'); process.exit(1); }
const pairs = MINION_SPRITE_BY_STAGE[plane];
if (!pairs) { console.error(`阶段表里没有 ${plane}——该位面走通用命名，无需分发`); process.exit(1); }

const FRAMES = ['walk0', 'atk0', 'atk1', 'atk2', 'death'];
const SETS = { A: `minion_walker_${plane}`, B: `minion_spitter_${plane}` };
let copied = 0, missing = 0;

const themedNames = [...new Set(pairs.flat())];
for (const name of themedNames) {
  // 远程名分到 B（spitter）套，近战名分到 A（walker）套
  const setKey = RANGED_SPRITES.has(name) ? 'B' : 'A';
  const setDir = artDir;
  const setBase = SETS[setKey];
  for (const dir of [artDir, rtDir]) {
    // 基础立绘（无后缀）
    const baseSrc = path.join(setDir, `${setBase}.png`);
    if (fs.existsSync(baseSrc)) { fs.copyFileSync(baseSrc, path.join(dir, `${name}.png`)); copied++; }
    else missing++;
    // 动作帧
    for (const f of FRAMES) {
      const frameSrc = path.join(setDir, `${setBase}_${f}.png`);
      if (fs.existsSync(frameSrc)) { fs.copyFileSync(frameSrc, path.join(dir, `${name}_${f}.png`)); copied++; }
      else missing++;
    }
  }
}

// Boss：单图 → 8 帧副本（双目录）
const bossName = BOSS_BY_PLANE[plane];
if (bossName) {
  for (const dir of [artDir, rtDir]) {
    const src = path.join(dir, `boss_${plane}.png`);
    if (fs.existsSync(src)) {
      for (const f of ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death']) {
        fs.copyFileSync(src, path.join(dir, `${bossName}_${f}.png`));
        copied++;
      }
    } else missing++;
  }
}

console.log(`[${plane}] 分发完成：复制 ${copied} 份，缺源 ${missing} 份`);
if (missing > 0) process.exitCode = 1;
