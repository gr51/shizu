// ===== slice-sheet.mjs · 把 AI 生成的 sprite sheet 按固定网格切成单个 PNG =====
// 用法：node tools/slice-sheet.mjs <输入.png> <列数> <行数> <输出目录> [名字...]
// 例：node tools/slice-sheet.mjs .tmp/gen/player.png 6 4 .tmp/sliced/player player
// 依赖：生成时提示词里明确「N×M 网格、每格对齐」，这里按均匀网格切。

import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 最小 PNG 解码器（RGBA8，处理 color type 2/6 + 5 种 filter） */
function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('不是 PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;
  const bpp = channels * (bitDepth / 8);
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let rowPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rowPos++];
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) row[i] = raw[rowPos++];
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = row[i]; break;
        case 1: val = row[i] + left; break;
        case 2: val = row[i] + up; break;
        case 3: val = row[i] + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
          val = row[i] + pr; break;
        }
        default: val = row[i];
      }
      row[i] = val & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      if (colorType === 6) { out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]; out[d + 3] = row[s + 3]; }
      else { out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]; out[d + 3] = 255; }
    }
    prev = row;
  }
  return { width, height, data: out };
}

function crop(img, x0, y0, w, h) {
  const cell = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * img.width + (x0 + x)) * 4;
      const d = (y * w + x) * 4;
      cell[d] = img.data[s]; cell[d + 1] = img.data[s + 1]; cell[d + 2] = img.data[s + 2]; cell[d + 3] = img.data[s + 3];
    }
  }
  return cell;
}

const [, , input, colsStr, rowsStr, outDir, prefix = 'cell'] = process.argv;
const cols = parseInt(colsStr, 10);
const rows = parseInt(rowsStr, 10);
if (!input || !cols || !rows) {
  console.error('用法: node slice-sheet.mjs <输入.png> <列数> <行数> <输出目录> [名字前缀]');
  process.exit(1);
}

const file = path.resolve(root, input);
const out = path.resolve(root, outDir);
fs.mkdirSync(out, { recursive: true });

const img = decodePng(fs.readFileSync(file));
const cellW = Math.floor(img.width / cols);
const cellH = Math.floor(img.height / rows);
console.log(`原图 ${img.width}×${img.height} → ${cols}×${rows} 网格，每格 ${cellW}×${cellH}`);

let idx = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const cell = crop(img, c * cellW, r * cellH, cellW, cellH);
    // 跳过完全透明/纯黑空格
    const png = encodePng(cellW, cellH, cell);
    const name = `${prefix}_${idx}.png`;
    fs.writeFileSync(path.join(out, name), png);
    console.log(`  ${name}`);
    idx += 1;
  }
}
console.log(`✓ 切出 ${idx} 张 → ${outDir}`);
