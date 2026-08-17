// ===== ai-art/pipeline.mjs · AI 像素资产生成管线 =====
//
// 用 grok-imagine-image-lite 生成像素风游戏资产：
//   1. 向 API 发 prompt → 拿到图片 URL
//   2. 下载图片
//   3. 去背景（flood-fill 从边缘抠掉背景色）
//   4. 紧致裁剪（tight crop 到不透明像素包围盒）
//   5. 写入 shizu-cocos/assets/art/ 和 assets/resources/art/
//
// 带磁盘缓存：相同 prompt 不重复调用 API。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { encodePng } from '../pixel/png.mjs';
import jpeg from 'jpeg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_URL = process.env.SHIZU_IMAGE_API_URL ?? 'https://wzw.pp.ua/v1/images/generations';
const API_KEY = process.env.SHIZU_IMAGE_API_KEY ?? process.env.OPENAI_API_KEY;
const MODEL = process.env.SHIZU_IMAGE_MODEL ?? 'grok-imagine-image-lite';

const cacheDir = path.join(root, '.tmp', 'ai-cache');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');
const runtimeArtDir = path.join(root, 'shizu-cocos', 'assets', 'resources', 'art');

fs.mkdirSync(cacheDir, { recursive: true });

// ===== PNG 解码（与 wire-assets.mjs 同源）=====

export function decodePng(buf) {
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
    prev = row;
    for (let x = 0; x < width; x++) {
      const si = x * bpp, di = (y * width + x) * 4;
      out[di] = row[si]; out[di + 1] = row[si + 1]; out[di + 2] = row[si + 2];
      out[di + 3] = ch === 4 ? row[si + 3] : 255;
    }
  }
  return { width, height, data: out };
}

// ===== 图像处理 =====

/** 去背景：从四条边 flood-fill，去掉与边缘色相近的像素 */
export function removeBackground(img, threshold = 80) {
  const { width, height, data } = img;
  // 采样四角平均色作为背景色
  const corners = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]];
  let bg = [0, 0, 0];
  for (const [x, y] of corners) { const o = (y * width + x) * 4; bg[0] += data[o]; bg[1] += data[o+1]; bg[2] += data[o+2]; }
  bg = [bg[0]/4, bg[1]/4, bg[2]/4];

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
    const d = Math.abs(data[o] - bg[0]) + Math.abs(data[o+1] - bg[1]) + Math.abs(data[o+2] - bg[2]);
    if (d > threshold) continue;
    data[o + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  // The generation prompt forbids the chroma color inside subjects. Remove
  // enclosed key-colored pixels too, then harden the edge for pixel art.
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);
    if (d <= threshold) data[o + 3] = 0;
    else if (d <= threshold * 1.8) data[o + 3] = Math.min(data[o + 3], Math.round(255 * (d - threshold) / (threshold * 0.8)));
  }
  return img;
}

/** 紧致裁剪：按不透明像素包围盒裁掉留白 */
export function tightCrop(img, pad = 4) {
  const { width, height, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  if (maxX < minX) return img;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++)
        out[(y * w + x) * 4 + k] = data[((minY + y) * width + (minX + x)) * 4 + k];
  return { width: w, height: h, data: out };
}

/** nearest-neighbor 缩放（像素风铁律：绝不插值） */
export function resizeNearest(img, tw, th) {
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const sx = Math.floor(x * img.width / tw);
      const sy = Math.floor(y * img.height / th);
      const si = (sy * img.width + sx) * 4;
      const di = (y * tw + x) * 4;
      for (let k = 0; k < 4; k++) out[di + k] = img.data[si + k];
    }
  return { width: tw, height: th, data: out };
}

/**
 * 自动检测图片格式并解码：JPEG（ffd8ff）/ PNG（89504e47）。
 * AI API 返回的是 JPEG；wire-assets 里是 PNG；统一收口。
 */
export function decodeImage(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    const d = jpeg.decode(buf, { formatAsRGBA: true, useTArray: false });
    return { width: d.width, height: d.height, data: new Uint8Array(d.data) };
  }
  return decodePng(buf);
}

/**
 * 像素化后处理：把 AI 大图变成干净的有限色阶像素精灵。
 * 步骤：
 *   1. 保持宽高比 box 降采样到 targetH（每块加权平均）
 *   2. alpha 阈值：块内平均不透明度 < alphaCut 的整块变透明，清掉 AI 的半透明毛边
 *   3. 颜色量化：按 5bit/通道归桶取出现频率最高的 maxColors 色，每像素映射最近色
 *      —— 这正是像素画「有限色阶」的来源
 * @param {{width,height,data}} img
 * @param {number} targetH 目标高度（像素）
 * @param {number} maxColors 最多保留几色
 * @param {boolean} alpha 是否做 alpha 阈值化（纹理图传 false）
 */
export function pixelize(img, targetH, maxColors = 10, alpha = true) {
  const { width, height, data } = img;
  const ar = width / height;
  const tw = Math.max(1, Math.round(targetH * ar));
  const th = targetH;
  const small = new Uint8Array(tw * th * 4);

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * width / tw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / tw));
      const y0 = Math.floor(y * height / th);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / th));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          const al = data[i + 3];
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * tw + x) * 4;
      if (a === 0) { small[o + 3] = 0; continue; }
      small[o] = Math.round(r / a);
      small[o + 1] = Math.round(g / a);
      small[o + 2] = Math.round(b / a);
      small[o + 3] = alpha ? (a / n > 0.55 ? 255 : 0) : 255;
    }
  }

  if (!alpha) return { width: tw, height: th, data: small };

  // 收集出现频率最高的颜色（5bit/通道归桶）
  const freq = new Map();
  for (let i = 0; i < tw * th; i++) {
    const o = i * 4;
    if (small[o + 3] === 0) continue;
    const key = `${small[o] >> 3},${small[o + 1] >> 3},${small[o + 2] >> 3}`;
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const palette = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map((e) => e[0].split(',').map((v) => v * 8 + 4));  // 桶中心

  const out = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) {
    const o = i * 4;
    if (small[o + 3] === 0) { out[o + 3] = 0; continue; }
    let best = 0, bd = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const dr = small[o] - palette[p][0];
      const dg = small[o + 1] - palette[p][1];
      const db = small[o + 2] - palette[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = p; }
    }
    out[o] = palette[best][0]; out[o + 1] = palette[best][1]; out[o + 2] = palette[best][2];
    out[o + 3] = 255;
  }
  return { width: tw, height: th, data: out };
}

// ===== API 调用 + 缓存 =====

async function callApi(prompt, { size = '1024x1024', quality = 'low' } = {}) {
  if (!API_KEY) {
    throw new Error('Missing SHIZU_IMAGE_API_KEY (or OPENAI_API_KEY). The key is intentionally not stored in the repository.');
  }
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'b64_json',
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return download(item.url);
  throw new Error('No image payload: ' + JSON.stringify(data).slice(0, 300));
}

async function download(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download ${resp.status}: ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

function cacheKey(prompt, opts = {}) {
  return createHash('sha1')
    .update(JSON.stringify({ model: MODEL, prompt, size: opts.size ?? '1024x1024', quality: opts.quality ?? 'low' }))
    .digest('hex')
    .slice(0, 16);
}

/** Generate or read the cached unprocessed model output. */
export async function generateSource(prompt, opts = {}) {
  const key = cacheKey(prompt, opts);
  const cacheFile = path.join(cacheDir, `${key}.img`);

  let buf;
  if (fs.existsSync(cacheFile)) {
    buf = fs.readFileSync(cacheFile);
    process.stderr.write(`  [cache] ${key}\n`);
  } else {
    process.stderr.write(`  [api] ${key} ...`);
    buf = await callApi(prompt, opts);
    fs.writeFileSync(cacheFile, buf);
    process.stderr.write(' done\n');
  }

  return decodeImage(buf);
}

/**
 * 生成一张资产：prompt → 下载 → 去背景 → 裁剪 → 返回 {width, height, data}
 * 带磁盘缓存：相同 prompt 直接读缓存。
 */
export async function generateSprite(prompt, opts = {}) {
  const { bgRemove = true, crop = true, targetH = null, maxColors = 10, alpha = true } = opts;
  let img = await generateSource(prompt, opts);
  if (bgRemove) img = removeBackground(img, opts.backgroundThreshold ?? 80);
  if (crop) img = tightCrop(img, 4);
  if (targetH) img = pixelize(img, targetH, maxColors, alpha);
  return img;
}

/** Crop an RGBA image without interpolation. */
export function cropRect(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const src = ((y + yy) * img.width + x + xx) * 4;
      const dst = (yy * w + xx) * 4;
      out[dst] = img.data[src];
      out[dst + 1] = img.data[src + 1];
      out[dst + 2] = img.data[src + 2];
      out[dst + 3] = img.data[src + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** 把处理后的图片写入 art/ 和 resources/art/ */
export function writePng(rel, img) {
  const png = encodePng(img.width, img.height, img.data);
  for (const base of [artDir, runtimeArtDir]) {
    const file = path.join(base, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  return { rel, w: img.width, h: img.height };
}

/** Keep source atlases in the editable art tree only; runtime loads slices. */
export function writeSourcePng(rel, img) {
  const file = path.join(artDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(img.width, img.height, img.data));
  return { rel, w: img.width, h: img.height, file };
}

/** 一步到位：生成 + 处理 + 写入 */
export async function genAndWrite(prompt, relPath, opts = {}) {
  const img = await generateSprite(prompt, opts);
  const result = writePng(relPath, img);
  console.log(`  ✓ ${relPath} (${result.w}×${result.h})`);
  return result;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { artDir, runtimeArtDir };
