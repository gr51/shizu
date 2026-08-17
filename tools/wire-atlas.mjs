// ===== wire-atlas.mjs · 一张资产图自动切出多个 sprite（连通域检测）=====
// 用法（env）：
//   SHEET   已转成 PNG 的资产图路径（相对仓库根），如 .tmp/sheet/maozei_atlas_conv.png
//   UNIT    输出 basename，如 maozei → 输出 maozei_s0.png ... maozei_sN.png 到 art/units/
//   NAMES   可选，逗号分隔的帧名（与切片顺序一一对应），如 walk0,walk1,walk2,walk3,atk0,atk1,atk2,death
// 流程：去背景 → 去噪点 → 连通域检测（每个分离的 sprite 一个包围盒）→ 逐块抠出

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './pixel/png.mjs';
import { decodePng, removeBackground, removeSpecks, findSprites, cropRect } from './pixel/sprite.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');
const sheet = process.env.SHEET;
const unit = process.env.UNIT;
const names = (process.env.NAMES ?? '').split(',').filter(Boolean);

let img = decodePng(fs.readFileSync(path.join(root, sheet)));
img = removeBackground(img, 140);
img = removeSpecks(img, 200);
const sprites = findSprites(img, 4000);

fs.mkdirSync(path.join(artDir, 'units'), { recursive: true });
sprites.forEach((r, i) => {
  const name = names[i] ?? `s${i}`;
  // 外扩 8px 留白，避免角色贴边/描边被裁
  const pad = 8;
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  const w = Math.min(img.width - x, r.w + pad * 2);
  const h = Math.min(img.height - y, r.h + pad * 2);
  const sub = cropRect(img, x, y, w, h);
  fs.writeFileSync(path.join(artDir, `units/${unit}_${name}.png`), encodePng(sub.width, sub.height, sub.data));
});
console.log(`✓ ${unit} 切出 ${sprites.length} 个 sprite（顺序: ${(names.length ? names : sprites.map((_, i) => 's' + i)).join(', ')}）`);
for (const r of sprites) console.log(`    [${r.x},${r.y}] ${r.w}x${r.h}`);
