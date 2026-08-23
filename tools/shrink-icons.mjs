// 大厅图标降采样：源图 600~990px、每张 600~800KB，而实际显示只有 20~64px。
//
// 后果有两层：
//   1) 体积 —— 光大厅图标就要加载约 5MB，全是白烧的流量与解码时间
//   2) 观感 —— CSS 上挂着 image-rendering: pixelated，那是给**放大**像素图用的；
//      25 倍缩小时它会直接丢像素，边缘碎成一团。这就是图标看起来糊的原因。
//
// 把每张按显示尺寸的 2 倍（HiDPI）重采样，且让缩放比落在整数倍附近，
// pixelated 才是对的渲染方式。用盒式平均而不是最近邻 —— 缩小时最近邻会丢细节。
//
// 用法：node tools/shrink-icons.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './ai-art/pipeline.mjs';
import { encodePng } from './pixel/png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/** 目录 → 目标最长边（= CSS 显示尺寸 ×2，留 HiDPI 余量） */
const TARGETS = [
  { dir: 'lobby/icons', match: /^(bag|codex|gear|reset|rift|achieve|difficulty)\.png$/, max: 56 },
  { dir: 'lobby/icons', match: /^portrait\.png$/, max: 128 },
  { dir: 'lobby/icons', match: /^route_.*\.png$/, max: 40 },
];

/** 盒式平均降采样：缩小时按源像素块取均值，比最近邻保细节 */
function boxDownscale(img, tw, th) {
  const { width: sw, height: sh, data: sd } = img;
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * sh) / th), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / th));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * sw) / tw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / tw));
      // 按 alpha 加权累加颜色（预乘），否则全透明像素的 RGB 会把边缘拖脏
      let r = 0, g = 0, b = 0, aSum = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sw + xx) * 4;
          const al = sd[i + 3] / 255;
          r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al;
          aSum += al;
          n += 1;
        }
      }
      const o = (y * tw + x) * 4;
      if (aSum > 0) {
        out[o] = Math.round(r / aSum);         // 除以 alpha 权重和 = 还原非预乘色
        out[o + 1] = Math.round(g / aSum);
        out[o + 2] = Math.round(b / aSum);
      }
      out[o + 3] = Math.round((aSum / n) * 255);
    }
  }
  return { width: tw, height: th, data: out };
}

let saved = 0, count = 0;
for (const base of ['shizu-cocos/assets/art', 'shizu-cocos/assets/resources/art']) {
  for (const t of TARGETS) {
    const dir = path.join(root, base, t.dir);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!t.match.test(name)) continue;
      const file = path.join(dir, name);
      const before = fs.statSync(file).size;
      const img = decodePng(fs.readFileSync(file));
      if (Math.max(img.width, img.height) <= t.max) continue;   // 已经够小
      const scale = t.max / Math.max(img.width, img.height);
      const tw = Math.max(1, Math.round(img.width * scale));
      const th = Math.max(1, Math.round(img.height * scale));
      const small = boxDownscale(img, tw, th);
      const png = encodePng(small.width, small.height, small.data);
      if (!DRY) fs.writeFileSync(file, png);
      saved += before - png.length;
      count += 1;
      if (base.includes('resources')) continue;   // 只报告一次
      console.log(`  ${name.padEnd(22)} ${img.width}×${img.height} → ${tw}×${th}   ${(before / 1024).toFixed(0)}KB → ${(png.length / 1024).toFixed(1)}KB`);
    }
  }
}
console.log(`\n${DRY ? '（试运行）' : ''}共处理 ${count} 个文件，省下 ${(saved / 1024 / 1024).toFixed(2)} MB`);
