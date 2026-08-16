// ===== wire-assets.mjs · 把切好的 sprite 接入游戏 =====
// 做三件事：① 去背景（从边缘 flood-fill 抠掉暗底）；② 按游戏文件名复制到 assets/art/；
// ③ 生成最小 anim.json（单帧 clip），让 renderer 能直接显示静态 sprite。

import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');

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

/** 从四边 flood-fill 抠掉「接近角落颜色」的底，输出透明 PNG */
function removeBackground(img, threshold = 70) {
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
    if (d > threshold) continue;   // 不是底
    data[o + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return img;
}

/** 紧致裁剪：按不透明像素的包围盒裁掉留白 */
function tightCrop(img) {
  const { width, height, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = data[((minY + y) * width + (minX + x)) * 4 + k];
  return { width: w, height: h, data: out };
}

function process(srcFile, dstRel) {
  const src = path.join(root, srcFile);
  if (!fs.existsSync(src)) { console.log('  缺 ' + srcFile); return null; }
  const img = tightCrop(removeBackground(decodePng(fs.readFileSync(src)))) ?? removeBackground(decodePng(fs.readFileSync(src)));
  const dst = path.join(artDir, dstRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, encodePng(img.width, img.height, img.data));
  return { rel: dstRel.replace(/\.png$/, ''), w: img.width, h: img.height };
}

// —— 玩家：cell 0=基础，1..10=10 皮肤 ——
const PLAYER_ROUTES = ['dujie', 'gongde', 'sangshi', 'gongsheng', 'xiake', 'shanhai', 'mofa', 'qiji', 'jijia', 'juhua'];
const clips = [];
const base = process('.tmp/sliced/player/player_0.png', 'units/player.png');
if (base) {
  for (const n of ['player_idle', 'player_walk', 'player_attack', 'player_hit']) {
    clips.push({ file: 'art/units/player.png', frameWidth: base.w, frameHeight: base.h, frames: 1, fps: 1, loop: true, _name: n });
  }
}
PLAYER_ROUTES.forEach((route, i) => {
  const p = process(`.tmp/sliced/player/player_${i + 1}.png`, `units/player_${route}.png`);
  if (p) console.log('  皮肤 ' + route + ' OK');
});

// —— 机关城敌人：0=小怪 1=精英 2=BOSS ——
const em = process('.tmp/sliced/enemy_jiguan/enemy_0.png', 'units/minion_jiguan.png');
const ee = process('.tmp/sliced/enemy_jiguan/enemy_1.png', 'units/elite_jiguan.png');
const eb = process('.tmp/sliced/enemy_jiguan/enemy_2.png', 'units/boss_jiguan.png');
if (em) { clips.push({ file: 'art/units/minion_jiguan.png', frameWidth: em.w, frameHeight: em.h, frames: 1, fps: 1, loop: true, _name: 'minion_jiguan_move' }); clips.push({ file: 'art/units/minion_jiguan.png', frameWidth: em.w, frameHeight: em.h, frames: 1, fps: 1, loop: true, _name: 'minion_jiguan_death' }); }
if (ee) clips.push({ file: 'art/units/elite_jiguan.png', frameWidth: ee.w, frameHeight: ee.h, frames: 1, fps: 1, loop: true, _name: 'elite_jiguan_idle' });
if (eb) clips.push({ file: 'art/units/boss_jiguan.png', frameWidth: eb.w, frameHeight: eb.h, frames: 1, fps: 1, loop: true, _name: 'boss_jiguan_idle' });

// —— 背景（直接复制；源是 JPEG，浏览器按数据识别格式，无需解码）——
{
  const bgSrc = path.join(root, '.tmp/sheet/bg_jiguan.png');
  const bgDst = path.join(artDir, 'backgrounds/plane_01_jiguan.png');
  fs.mkdirSync(path.dirname(bgDst), { recursive: true });
  fs.copyFileSync(bgSrc, bgDst);
  console.log('  背景 OK');
}

// —— 写 anim.json（renderer 用 clip.file 定位，去掉 _name 字段）——
const manifest = { clips: clips.map(({ _name, ...c }) => c) };
fs.writeFileSync(path.join(artDir, 'anim.json'), JSON.stringify(manifest, null, 2));
console.log('✓ 接入完成，anim.json 有 ' + manifest.clips.length + ' 个 clip');
console.log('  clips: ' + clips.map((c) => c._name).join(', '));
