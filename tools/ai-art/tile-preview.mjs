// 地砖平铺预览：单看一张砖会骗人 —— 好不好看取决于铺开后的样子。
// 按 renderer.js 的规则（奇数列水平镜像、奇数行垂直镜像）拼 4×3 出图。
// 用法：node tools/ai-art/tile-preview.mjs <png...>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './pipeline.mjs';
import { encodePng } from '../pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = process.argv.slice(2);
if (!files.length) { console.error('用法：node tools/ai-art/tile-preview.mjs <png...>'); process.exit(1); }

const COLS = 4, ROWS = 3;
const outDir = path.join(root, '.tmp', 'tile-preview');
fs.mkdirSync(outDir, { recursive: true });

for (const f of files) {
  const src = decodePng(fs.readFileSync(f));
  const { width: tw, height: th } = src;
  const W = tw * COLS, H = th * ROWS;
  const out = new Uint8Array(W * H * 4);

  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const flipX = (gx & 1) === 1;   // 与 renderer.js 的 mx/my 一致
      const flipY = (gy & 1) === 1;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const sx = flipX ? tw - 1 - x : x;
          const sy = flipY ? th - 1 - y : y;
          const si = (sy * tw + sx) * 4;
          const di = ((gy * th + y) * W + gx * tw + x) * 4;
          out[di] = src.data[si];
          out[di + 1] = src.data[si + 1];
          out[di + 2] = src.data[si + 2];
          out[di + 3] = 255;
        }
      }
    }
  }

  const dest = path.join(outDir, path.basename(f).replace('.png', '') + `.tiled.png`);
  fs.writeFileSync(dest, encodePng(W, H, out));
  console.log(`  ▸ ${path.relative(process.cwd(), dest)}  ${W}×${H}`);
}
