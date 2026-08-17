// ===== pixel/sprite.mjs · 雪碧处理共享工具 =====
// 去背景（边缘 flood-fill）→ 去噪点（去掉零星杂点）→ 紧致裁剪

import { inflateSync } from 'node:zlib';

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
    for (let x = 0; x < width; x++) {
      const s = x * bpp, d = (y * width + x) * 4;
      out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]; out[d + 3] = ch === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }
  return { width, height, data: out };
}

/** 从四边 flood-fill 抠掉「接近角落颜色」的底 */
export function removeBackground(img, threshold = 90) {
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

/** 去噪点：把不透明像素里「连通面积 < minSize」的零散杂点清成透明，只留主体 */
export function removeSpecks(img, minSize = 120) {
  const { width, height, data } = img;
  const label = new Int32Array(width * height).fill(-1);
  const comps = [];
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] <= 10 || label[i] !== -1) continue;
    const id = comps.length;
    const comp = [];
    const q = [i];
    label[i] = id;
    while (q.length) {
      const j = q.pop();
      comp.push(j);
      const x = j % width, y = (j / width) | 0;
      if (x + 1 < width && label[j + 1] === -1 && data[(j + 1) * 4 + 3] > 10) { label[j + 1] = id; q.push(j + 1); }
      if (x - 1 >= 0 && label[j - 1] === -1 && data[(j - 1) * 4 + 3] > 10) { label[j - 1] = id; q.push(j - 1); }
      if (y + 1 < height && label[j + width] === -1 && data[(j + width) * 4 + 3] > 10) { label[j + width] = id; q.push(j + width); }
      if (y - 1 >= 0 && label[j - width] === -1 && data[(j - width) * 4 + 3] > 10) { label[j - width] = id; q.push(j - width); }
    }
    comps.push(comp);
  }
  for (let c = 0; c < comps.length; c++) {
    if (comps[c].length >= minSize) continue;
    for (const j of comps[c]) data[j * 4 + 3] = 0;
  }
  return img;
}

/** 连通域检测：把一张图里互相分离的 sprite 找出来，返回各自包围盒（按上→下、左→右排序） */
export function findSprites(img, minSize = 300) {
  const { width, height, data } = img;
  const label = new Int32Array(width * height).fill(-1);
  const comps = [];
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] <= 10 || label[i] !== -1) continue;
    const id = comps.length;
    const q = [i];
    label[i] = id;
    let minX = width, minY = height, maxX = -1, maxY = -1, size = 0;
    while (q.length) {
      const j = q.pop();
      size++;
      const x = j % width, y = (j / width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x + 1 < width && label[j + 1] === -1 && data[(j + 1) * 4 + 3] > 10) { label[j + 1] = id; q.push(j + 1); }
      if (x - 1 >= 0 && label[j - 1] === -1 && data[(j - 1) * 4 + 3] > 10) { label[j - 1] = id; q.push(j - 1); }
      if (y + 1 < height && label[j + width] === -1 && data[(j + width) * 4 + 3] > 10) { label[j + width] = id; q.push(j + width); }
      if (y - 1 >= 0 && label[j - width] === -1 && data[(j - width) * 4 + 3] > 10) { label[j - width] = id; q.push(j - width); }
    }
    comps.push({ minX, minY, maxX, maxY, size });
  }
  const big = comps.filter((c) => c.size >= minSize).sort((a, b) => a.minY - b.minY);
  // 按行聚类（y 差 < 80 视为同一行），行内按 x 排序，得到稳定的「上→下、左→右」顺序
  const rows = [];
  for (const c of big) {
    const row = rows.find((r) => Math.abs(r[0].minY - c.minY) < 80);
    if (row) row.push(c); else rows.push([c]);
  }
  for (const r of rows) r.sort((a, b) => a.minX - b.minX);
  return rows.flat().map((c) => ({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 }));
}

/** 从原图按包围盒抠出一个子图 */
export function cropRect(img, x, y, w, h) {
  const { width, data } = img;
  const out = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++)
      for (let k = 0; k < 4; k++) out[(yy * w + xx) * 4 + k] = data[((y + yy) * width + (x + xx)) * 4 + k];
  return { width: w, height: h, data: out };
}

/** 紧致裁剪：按不透明像素包围盒裁掉留白，并忽略边缘零星杂点（防噪点撑满整格） */
export function tightCrop(img, minPx = 3) {
  const { width, height, data } = img;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > 10;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (opaque(x, y)) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  if (maxX < minX) return null;
  const rowCnt = (y) => { let c = 0; for (let x = minX; x <= maxX; x++) if (opaque(x, y)) c++; return c; };
  const colCnt = (x) => { let c = 0; for (let y = minY; y <= maxY; y++) if (opaque(x, y)) c++; return c; };
  while (minY < maxY && rowCnt(minY) < minPx) minY++;
  while (maxY > minY && rowCnt(maxY) < minPx) maxY--;
  while (minX < maxX && colCnt(minX) < minPx) minX++;
  while (maxX > minX && colCnt(maxX) < minPx) maxX--;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = data[((minY + y) * width + (minX + x)) * 4 + k];
  return { width: w, height: h, data: out };
}
