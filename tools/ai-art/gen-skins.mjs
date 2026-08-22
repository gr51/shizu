// ===== ai-art/gen-skins.mjs · 10 路线进化皮肤立绘（backlog：进化的资产）=====
// 用法：node tools/ai-art/gen-skins.mjs [routeId...]   # 无参 = 全部未生成/全部重出
//
// 产出 units/player_<route>.png（美术源 + 运行时副本各一）。
// 进化皮肤在游戏内=该路线的「变身形态」外观（图鉴/出战卡片也用它当立绘）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../../shizu-cocos/assets/scripts/data/routes.js';
import { genAndWrite, sleep } from './pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PX = '16-bit pixel art, retro game sprite, single character centered, black outline, limited color palette, crisp pixels, no dithering, full body standing pose facing right, solid dark gray background';

const args = process.argv.slice(2);
const targets = args.length ? args : Object.keys(ROUTES);

console.log(`路线皮肤生成：${targets.length} 张`);
for (let i = 0; i < targets.length; i++) {
  const id = targets[i];
  const r = ROUTES[id];
  if (!r) { console.log(`跳过未知路线 ${id}`); continue; }
  const prompt = `${PX}, ${r.skin}, ${r.role} theme, mystical aura matching ${r.groupName} faction, heroic stance`;
  await genAndWrite(prompt, `units/player_${id}.png`, { targetH: 48, maxColors: 12 });
  await sleep(300);
}
console.log('完成');
