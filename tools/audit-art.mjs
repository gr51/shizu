// 全位面资产体检：按渲染层「实际会请求什么」逐个核对磁盘上有没有。
// 缺图不会报错 —— assets.js 的 img.onerror 会静默 resolve(null)，渲染层退化成色块，
// 于是「敌人全是方块」这种问题能一路活到线上。这个脚本就是把静默失败��开。
//
// 用法：node tools/audit-art.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE } from '../shizu-cocos/assets/scripts/core/battle.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(root, 'shizu-cocos/assets/art');

const has = (rel) => fs.existsSync(path.join(ART, rel));

/** PNG 尺寸（不解压，只读 IHDR） */
function size(rel) {
  const b = fs.readFileSync(path.join(ART, rel));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: b.length / 1024 };
}

const FULL_FRAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death'];
const FALLBACK_FRAMES = ['walk0', 'atk0', 'atk1', 'atk2', 'death'];

let problems = 0;
const note = (msg) => { console.log('    ⚠ ' + msg); problems += 1; };

for (const plane of planes) {
  const id = plane.id;
  console.log(`\n【${plane.name}】${id}`);

  // —— 地砖：渲染层强制拉成 256×256 平铺，非正方形 = 必然变形 ——
  const floor = `backgrounds/floor_${id}.png`;
  if (!has(floor)) note(`地砖缺失 ${floor} —— 整片地面退化成纯色`);
  else {
    const { w, h, kb } = size(floor);
    if (w !== h) note(`地砖非正方形 ${w}×${h} —— 会被拉成 256×256 变形（${floor}）`);
    if (kb < 100 && w < 400) note(`地砖疑似不是地砖：${w}×${h} 仅 ${kb.toFixed(0)}KB，像单个 sprite（${floor}）`);
  }

  // —— 阶段表小怪 ——
  const pairs = MINION_SPRITE_BY_STAGE[id];
  if (!pairs?.length) {
    note(`MINION_SPRITE_BY_STAGE 里没有 ${id} —— 全靠 minion_{variant}_${id} 兜底`);
  } else {
    const units = new Set(pairs.flat());
    for (const m of units) {
      const missing = FULL_FRAMES.filter((f) => !has(`units/${m}_${f}.png`));
      if (missing.length) note(`小怪 ${m} 缺 ${missing.length}/${FULL_FRAMES.length} 帧：${missing.join(',')}`);
    }
  }

  // —— 通用兜底族 ——
  // 只有「阶段表里没有这个位面」时渲染层才会走兜底命名：drawEnemy 里
  // `e.sprite || spriteBase(...)`，有阶段表的位面 e.sprite 一定有值，兜底族根本用不到。
  // 所以对有阶段表的位面报「兜底缺失」是误报。
  if (!pairs?.length) {
    for (const v of ['walker', 'charger', 'spitter']) {
      const m = `minion_${v}_${id}`;
      if (!has(`units/${m}.png`)) note(`兜底待机图缺失 units/${m}.png`);
      const missing = FALLBACK_FRAMES.filter((f) => !has(`units/${m}_${f}.png`));
      if (missing.length) note(`兜底 ${m} 缺帧：${missing.join(',')}`);
    }
  }

  // —— 精英 / Boss ——
  if (!has(`units/elite_${id}.png`)) note(`精英贴图缺失 units/elite_${id}.png`);
  const boss = BOSS_BY_PLANE[id];
  if (!boss) note(`BOSS_BY_PLANE 里没有 ${id}`);
  if (!has(`units/boss_${id}.png`) && !(boss && has(`units/${boss}_walk0.png`))) {
    note(`Boss 贴图缺失（既没有 boss_${id}.png，也没有 ${boss} 的帧）`);
  }
}

console.log(problems ? `\n共 ${problems} 处问题` : '\n✓ 全部位面资产齐全');
process.exit(problems ? 1 : 0);
