// ===== wire-plane.mjs · 把一个位面的敌人雪碧 + 背景接入游戏 =====
// 用法：node tools/wire-plane.mjs <planeId>
// 依赖：tools/slice-sheet.ps1 已把 enemy sheet 切成 .tmp/sliced/enemy_<plane>/enemy_0..2.png（3×1）
// 输出：art/units/{minion,elite,boss}_<plane>.png + art/backgrounds/plane_NN_<plane>.png
// 去背景 + 紧致裁剪后，renderer 通过 blitSprite 直接按文件名引用，无需 anim.json。

import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');

const PLANE_NUM = {
  jiguan: 1, aofa: 2, qiqiao: 3, dujie: 4, gongde: 5, shihai: 6,
  gongshengchao: 7, wuxia: 8, shanhai: 9, jijia: 10, jushen: 11, zhutian: 12,
};

const planeId = process.env.PLANE_ID ?? process.argv[2];
if (!planeId || !PLANE_NUM[planeId]) {
  console.error('用法：node tools/wire-plane.mjs <planeId>，planeId ∈ ' + Object.keys(PLANE_NUM).join('/'));
  process.exit(1);
}
const num = PLANE_NUM[planeId];

function decodePng(buf) {
  let pos = 8, width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3;
  const bpp = ch * (bitDepth / 8);
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride), rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++];
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) row[i] = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const l = i >= bpp ? row[i - bpp] : 0, u = prev[i], ul = i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (f === 0) v = row[i];
      else if (f === 1) v = row[i] + l;
      else if (f === 2) v = row[i] + u;
      else if (f === 3) v = row[i] + ((l + u) >> 1);
      else { const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul); v = row[i] + (pa <= pb && pa <= pc ? l : pb <= pc ? u : ul); }
      row[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]; out[d + 3] = ch === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }
  return { width, height, data: out };
}

function removeBackground(img, threshold = 90) {
  const { width, height, data } = img;
  const bg = [data[0], data[1], data[2]];
  const seen = new Uint8Array(width * height);
  const q = [];
  const push = (x, y) => { if (x >= 0 && y >= 0 && x < width && y < height) q.push(x, y); };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (q.length) {
    const y = q.pop(), x = q.pop();
    const i = y * width + x;
    if (seen[i]) continue;
    seen[i] = 1;
    const o = i * 4;
    const d = Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);
    if (d > threshold) continue;
    data[o + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return img;
}

function tightCrop(img) {
  const { width, height, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  if (maxX < minX) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = data[((minY + y) * width + (minX + x)) * 4 + k];
  return { width: w, height: h, data: out };
}

function processCell(srcRel, dstRel) {
  const src = path.join(root, srcRel);
  if (!fs.existsSync(src)) { console.log('  缺 ' + srcRel); return null; }
  const decoded = decodePng(fs.readFileSync(src));
  const img = tightCrop(removeBackground(decoded)) ?? removeBackground(decoded);
  const dst = path.join(artDir, dstRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, encodePng(img.width, img.height, img.data));
  return { w: img.width, h: img.height };
}

const kinds = ['minion', 'elite', 'boss'];
for (let i = 0; i < 3; i++) {
  const p = processCell(`.tmp/sliced/enemy_${planeId}/enemy_${i}.png`, `units/${kinds[i]}_${planeId}.png`);
  if (p) console.log(`  OK ${kinds[i]}_${planeId} (${p.w}x${p.h})`);
}

// 背景直接复制（源是 JPEG，浏览器按数据识别格式）
const bgSrc = path.join(root, `.tmp/sheet/bg_${planeId}.png`);
const bgDst = path.join(artDir, `backgrounds/plane_${String(num).padStart(2, '0')}_${planeId}.png`);
if (fs.existsSync(bgSrc)) {
  fs.mkdirSync(path.dirname(bgDst), { recursive: true });
  fs.copyFileSync(bgSrc, bgDst);
  console.log(`  OK background plane_${String(num).padStart(2, '0')}_${planeId}`);
} else {
  console.log('  缺背景 ' + bgSrc);
}
console.log(`✓ 位面 ${planeId} 接入完成`);
