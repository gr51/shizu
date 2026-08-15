// 占位美术资源生成器（零依赖，纯 Node）。
// 用法：node tools/gen-assets.mjs
// 输出：shizu-cocos/assets/art/ 下的纯色/渐变占位 PNG（可直接被 Cocos 导入）。
// 目的：给工程「有资源可引」的锚点，并给美术一个 1:1 尺寸/命名对照表。
// 成品替换时同名覆盖即可，代码无需改。

import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'shizu-cocos', 'assets', 'art');

// ---------- 最小 PNG 编码器（RGBA8） ----------
let _crcTable;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ _crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}
function encodePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 像素函数 ----------
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/** 垂直渐变背景 */
function vGrad(top, bottom) {
  const t = hex(top), b = hex(bottom);
  return (x, y, w, h) => {
    const c = mix(t, b, y / Math.max(1, h - 1));
    return [c[0], c[1], c[2], 255];
  };
}
/** 实心圆 + 描边 */
function circle(fill, outline, edge = 4) {
  const f = hex(fill), o = hex(outline);
  return (x, y, w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d > r) return [0, 0, 0, 0];
    if (d > r - edge) return [o[0], o[1], o[2], 255];
    // 内圈略亮，做出立体感
    const k = 1 - (d / r) * 0.25;
    return [f[0] * k, f[1] * k, f[2] * k, 255];
  };
}
/** 圆环（稀有度框） */
function ring(color, thickness = 10) {
  const c = hex(color);
  return (x, y, w, h) => {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d > r || d < r - thickness) return [0, 0, 0, 0];
    return [c[0], c[1], c[2], 255];
  };
}
/** 圆角方形图标底 */
function roundedSquare(fill, outline) {
  const f = hex(fill), o = hex(outline);
  const rad = 0.22;
  return (x, y, w, h) => {
    const rx = (w - 1) / 2, ry = (h - 1) / 2;
    const dx = Math.abs(x - rx) / rx, dy = Math.abs(y - ry) / ry;
    const corner = Math.hypot(Math.max(0, (dx - (1 - rad)) * rx), Math.max(0, (dy - (1 - rad)) * ry));
    const inside = corner <= rad * Math.min(rx, ry);
    if (!inside) return [0, 0, 0, 0];
    const edge = Math.min(rx, ry) * 0.06;
    const isEdge = (Math.abs(Math.abs(x - rx) - rx) < edge) || (Math.abs(Math.abs(y - ry) - ry) < edge);
    return isEdge ? [o[0], o[1], o[2], 255] : [f[0], f[1], f[2], 255];
  };
}

// ---------- 资源清单 ----------
const BACKGROUNDS = {
  plane_01_jiguan: ['#d9b04a', '#4a3410'],
  plane_02_aofa: ['#8a6ae0', '#24164a'],
  plane_03_qiqiao: ['#5ac48a', '#10341a'],
  plane_04_dujie: ['#9a6ae0', '#1a0a34'],
  plane_05_gongde: ['#e0c46a', '#3a2a0a'],
  plane_06_shihai: ['#7a8a5a', '#141a10'],
  plane_07_gongshengchao: ['#d06aa0', '#34101a'],
  plane_08_wuxia: ['#9aa8a8', '#14201e'],
  plane_09_shanhai: ['#b06a3a', '#2a1008'],
  plane_10_jijia: ['#6a8ab0', '#0a1424'],
  plane_11_jushen: ['#d6e4ec', '#24323e'],
  plane_12_zhutian: ['#9a6ae0', '#0a0a16'],
  nest: ['#d68a4a', '#241008'],
  settle: ['#4a4a7a', '#0a0a14'],
};

const UNITS = {
  player: [96, circle('#e8e2d6', '#8a7a5a')],
  enemy_minion: [64, circle('#c9556a', '#5a1a24')],
  enemy_elite: [96, circle('#d6a04a', '#5a3a0a')],
  enemy_boss: [144, circle('#8a4ad6', '#2a0a4a')],
};

const ITEMS = {
  gene_orb: [48, circle('#5fb8a6', '#1a4a40', 3)],
  relic: [64, circle('#d8bd6a', '#6a4a1a', 4)],
  gear: [64, roundedSquare('#8a9aa0', '#3a444e')],
};

const ICONS = {
  atk: '#d06a5a', hp: '#6fb98a', speed: '#d6c04a', aspd: '#6aa0d6',
  crit: '#e0a04a', lifesteal: '#a04a5a', regen: '#4aa06a', range: '#5a8ad6',
};

const RARITY = { white: '#b9c0c6', green: '#6db76d', blue: '#5b9bd5', purple: '#a678d4', gold: '#d8bd6a' };

// ---------- 写出 ----------
const jobs = [];
const add = (rel, w, h, fn) => jobs.push({ rel, w, h, fn });

for (const [name, [top, bottom]] of Object.entries(BACKGROUNDS)) {
  add(path.join('backgrounds', `${name}.png`), 1334, 750, vGrad(top, bottom));
}
for (const [name, [size, fn]] of Object.entries(UNITS)) {
  add(path.join('units', `${name}.png`), size, size, fn);
}
for (const [name, [size, fn]] of Object.entries(ITEMS)) {
  add(path.join('items', `${name}.png`), size, size, fn);
}
for (const [name, color] of Object.entries(ICONS)) {
  add(path.join('icons', `${name}.png`), 64, 64, roundedSquare(color, '#1a2027'));
}
for (const [name, color] of Object.entries(RARITY)) {
  add(path.join('ui', `rarity_${name}.png`), 64, 64, ring(color, 10));
}
add(path.join('ui', 'slot_active.png'), 96, 96, ring('#d8bd6a', 8));
add(path.join('ui', 'slot_passive.png'), 96, 96, ring('#5fb8a6', 8));

let written = 0;
for (const j of jobs) {
  const file = path.join(outRoot, j.rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(j.w, j.h, (x, y) => j.fn(x, y, j.w, j.h)));
  written += 1;
}

const readme = [
  '# 占位美术资源（由 tools/gen-assets.mjs 生成）',
  '',
  '纯色/渐变占位 PNG，供 Cocos 导入与代码引用。',
  '成品替换时**同名覆盖**即可，代码无需改。',
  '尺寸/命名对照见仓库根目录《美术资源清单-横屏.md》。',
  '',
].join('\n');
fs.writeFileSync(path.join(outRoot, 'README.md'), readme);

console.log(`✓ 已生成 ${written} 个占位 PNG → ${path.relative(root, outRoot)}`);
