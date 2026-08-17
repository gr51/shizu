// ===== wire-walk.mjs · 把小怪走路帧表（4 帧）接入游戏 =====
// 用法：$env:PLANE_ID=<planeId>; node tools/wire-walk.mjs
// 依赖：tools/slice-sheet.ps1 已切成 .tmp/sliced/minion_<plane>/walk_0..3.png（4×1）
// 输出：art/units/minion_<plane>_f0..f3.png（每帧去背景 + 去噪点 + 紧致裁剪）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';
import { decodePng, removeBackground, removeSpecks, tightCrop } from './pixel/sprite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');
const planeId = process.env.PLANE_ID;

const N = 4;

// 处理成紧致裁剪帧
const frames = [];
for (let i = 0; i < N; i++) {
  const src = path.join(root, `.tmp/sliced/minion_${planeId}/walk_${i}.png`);
  if (!fs.existsSync(src)) { console.log('  缺 ' + src); continue; }
  let img = decodePng(fs.readFileSync(src));
  img = removeBackground(img);
  img = removeSpecks(img);
  img = tightCrop(img) ?? img;
  frames.push(img);
}

// 统一画布：所有帧 pad 到相同的最大尺寸并居中，避免逐帧尺寸抖动（走路时角色忽大忽小）
const maxW = Math.max(...frames.map((f) => f.width));
const maxH = Math.max(...frames.map((f) => f.height));
frames.forEach((img, i) => {
  if (img.width === maxW && img.height === maxH) {
    fs.writeFileSync(path.join(artDir, `units/minion_${planeId}_f${i}.png`), encodePng(img.width, img.height, img.data));
    console.log(`  OK minion_${planeId}_f${i} (${img.width}x${img.height})`);
    return;
  }
  const out = new Uint8Array(maxW * maxH * 4);
  const ox = (maxW - img.width) >> 1, oy = (maxH - img.height) >> 1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      for (let k = 0; k < 4; k++) out[((oy + y) * maxW + (ox + x)) * 4 + k] = img.data[(y * img.width + x) * 4 + k];
  const dst = path.join(artDir, `units/minion_${planeId}_f${i}.png`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, encodePng(maxW, maxH, out));
  console.log(`  OK minion_${planeId}_f${i} (${maxW}x${maxH} 原 ${img.width}x${img.height})`);
});
console.log(`✓ 小怪走路帧 ${planeId} 接入完成（统一 ${maxW}x${maxH}）`);
