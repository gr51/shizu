// 风格验证：把已画的精灵拼成一张对照表，肉眼确认剪影是否可辨。
// 用法：node tools/preview-pixel.mjs [输出路径]
import fs from 'node:fs';
import { Canvas } from './pixel/canvas.mjs';
import { encodePng } from './pixel/png.mjs';
import { P, INK, RIM, PLANE_PALETTE, ROUTE_PALETTE, rgb } from './pixel/palette.mjs';
import { NESTLING_BASE, SKIN_OVERLAY, MINIONS } from './pixel/creatures.mjs';

/** 字符 → 颜色映射（给定一条色阶） */
export function mapFor(ramp, accent = null) {
  return {
    k: INK,
    0: ramp[0], 1: ramp[1], 2: ramp[2], 3: ramp[3],
    t: P.teal[2], a: P.amber[2], r: P.blood[2], w: rgb('#ffffff'),
    s: accent ?? ramp[2],
    g: P.amber[2],
  };
}

function drawUnit(art, ramp, { rim = false, overlay = null, overlayColor = null } = {}) {
  const { w, h } = Canvas.measure(art);
  const c = new Canvas(w, h);
  c.sprite(art, mapFor(ramp));
  if (overlay) c.sprite(overlay, { s: overlayColor ?? ramp[3], g: P.amber[2] });
  c.outline(INK);
  if (rim) c.rimLight(RIM);
  return c;
}

// —— 拼对照表 ——
const CELL = 26;         // 原生格子
const SCALE = 4;
const cols = 12;
const rows = 4;
const sheet = new Canvas(CELL * cols, CELL * rows, P.void[1]);

// 第 1 行：巢灵基础 + 10 皮肤
const routes = Object.keys(SKIN_OVERLAY);
sheet.blit(drawUnit(NESTLING_BASE, P.shell, { rim: true }), 2, 2);
routes.forEach((r, i) => {
  const c = drawUnit(NESTLING_BASE, P.shell, {
    rim: true,
    overlay: SKIN_OVERLAY[r],
    overlayColor: ROUTE_PALETTE[r][2],
  });
  sheet.blit(c, (i + 1) * CELL + 2, 2);
});

// 第 2-3 行：12 位面小怪（放在 16×16 格里居中）
Object.entries(MINIONS).forEach(([id, art], i) => {
  const c = drawUnit(art, PLANE_PALETTE[id] ?? P.stone);
  const col = i % cols;
  sheet.blit(c, col * CELL + 5, CELL + 5);
});

// 第 4 行：纯黑剪影验收（规范 五-5：压成剪影还认得出吗）
Object.entries(MINIONS).forEach(([id, art], i) => {
  const c = drawUnit(art, PLANE_PALETTE[id] ?? P.stone);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (c.get(x, y)[3] > 0) c.px(x, y, [0, 0, 0, 255]);
    }
  }
  sheet.blit(c, (i % cols) * CELL + 5, CELL * 2 + 5);
});

const out = sheet.scale(SCALE);
const file = process.argv[2] ?? '/tmp/pixel-preview.png';
fs.writeFileSync(file, encodePng(out.w, out.h, out.data));
console.log(`✓ ${out.w}×${out.h} → ${file}`);
