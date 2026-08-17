// ===== wire-frames.mjs · 通用走路帧表接入 =====
// 用法（env）：
//   SRC_DIR  切片目录（含 walk_0..3.png），默认 .tmp/sliced/minion_<PLANE_ID>
//   UNIT     输出 basename，如 player / minion_walker_wuxia
//   BASE     可选：把第 0 帧再复制一份到这个 basename（做静态/待机帧）
//   PLANE_ID 占位（SRC_DIR 未给时用）
// 输出：art/units/<UNIT>_f0..f3.png（统一画布尺寸居中）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';
import { decodePng, removeBackground, removeSpecks, tightCrop } from './pixel/sprite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');
const planeId = process.env.PLANE_ID;
const unit = process.env.UNIT;
const srcDir = process.env.SRC_DIR ?? `.tmp/sliced/minion_${planeId}`;
const base = process.env.BASE ?? '';

const N = 4;
const frames = [];
for (let i = 0; i < N; i++) {
  const src = path.join(root, srcDir, `walk_${i}.png`);
  if (!fs.existsSync(src)) { console.log('  缺 ' + src); continue; }
  let img = decodePng(fs.readFileSync(src));
  img = removeBackground(img);
  img = removeSpecks(img);
  img = tightCrop(img) ?? img;
  frames.push(img);
}
if (!frames.length) { console.error('没有可用帧'); process.exit(1); }

const maxW = Math.max(...frames.map((f) => f.width));
const maxH = Math.max(...frames.map((f) => f.height));
fs.mkdirSync(path.join(artDir, 'units'), { recursive: true });

frames.forEach((img, i) => {
  const out = new Uint8Array(maxW * maxH * 4);
  const ox = (maxW - img.width) >> 1, oy = (maxH - img.height) >> 1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      for (let k = 0; k < 4; k++) out[((oy + y) * maxW + (ox + x)) * 4 + k] = img.data[(y * img.width + x) * 4 + k];
  const dst = path.join(artDir, `units/${unit}_f${i}.png`);
  fs.writeFileSync(dst, encodePng(maxW, maxH, out));
});

// 第 0 帧复制为静态/待机帧
if (base) {
  const b0 = path.join(artDir, `units/${unit}_f0.png`);
  fs.copyFileSync(b0, path.join(artDir, `units/${base}.png`));
}
console.log(`✓ ${unit} 接入完成（统一 ${maxW}x${maxH}${base ? '，BASE=' + base : ''}）`);
