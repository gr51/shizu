// ===== ai-art/regen-floor.mjs · 单独重做某个位面的无缝地砖 =====
// 渲染层是 drawImage(floor, 0, 0, 256, 256) —— 不论源图多大都会被压成 256×256 平铺，
// 所以直接出 256×256，像素点和屏幕一一对应，最锐。
//
// 用法（key 不入库，只从环境变量读）：
//   SHIZU_IMAGE_API_URL=https://api.67.si/v1/images/generations \
//   SHIZU_IMAGE_API_KEY=sk-xxx SHIZU_IMAGE_MODEL=grok-imagine-image-quality \
//   node tools/ai-art/regen-floor.mjs jiguan [--variants=3]
//
// --variants=N 会出 N 张候选，写成 floor_{id}.cand{n}.png 供挑选，不直接覆盖。
// --prompt="..." 临时覆盖 PLANES 里的 floor 描述，用来试提示词（试好了再写回 generate.mjs）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSprite, writePng } from './pipeline.mjs';
import { PLANES } from './generate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'jiguan';
const variants = Number(args.find((a) => a.startsWith('--variants='))?.split('=')[1] ?? 1);
const promptOverride = args.find((a) => a.startsWith('--prompt='))?.slice('--prompt='.length);

const plane = PLANES.find((p) => p.id === id);
if (!plane) { console.error(`未知位面：${id}（可选：${PLANES.map((p) => p.id).join(', ')}）`); process.exit(1); }
const floorDesc = promptOverride ?? plane.floor;

// 地砖是「地面」不是「角色」：必须显式排除角色/立绘，否则模型会当成 sprite 画个人出来
// —— floor_jiguan.png 之前就是这么变成一张矮人立绘的。
// 同样关键的是「低对比、细节均匀、没有大的居中主体」：一张单看很漂亮但有强烈中心图案的砖，
// 平铺开就是一面棋盘壁纸，比原来的纯黑还难看。
const PX = '16-bit pixel art, retro game texture, seamless tileable pattern, top-down overhead view of the ground,'
  + ' limited color palette, crisp pixels, no dithering, flat even lighting,'
  + ' LOW CONTRAST, dark desaturated tones, fine detail spread evenly across the whole frame,'
  + ' NO large central motif, NO focal point, NO vignette, NO border,'
  + ' NO characters, NO people, NO creatures, NO sprites, texture only, fills the entire frame edge to edge';

console.log(`【${plane.name}】地砖重做 · ${variants} 张候选`);
console.log(`  提示词：${floorDesc}\n`);

for (let i = 0; i < variants; i++) {
  // 每张候选加一句无害的差异化后缀，避开 prompt→缓存命中，拿到不同构图
  const seedNote = i === 0 ? '' : `, variation ${i + 1}`;
  const img = await generateSprite(`${PX}, ${floorDesc}${seedNote}`, {
    bgRemove: false,   // 地砖没有「背景」可抠，抠了会把地面挖空
    crop: false,       // 必须铺满整帧，裁剪会破坏可平铺性
    targetH: 256,      // = 渲染层的 TILE，像素对齐
    maxColors: 16,
    alpha: false,
  });
  const rel = variants === 1
    ? `backgrounds/floor_${id}.png`
    : `backgrounds/floor_${id}.cand${i + 1}.png`;
  writePng(rel, img);
  console.log(`  ✓ ${rel}  ${img.width}×${img.height}`);
}

if (variants > 1) {
  console.log(`\n挑好后：mv shizu-cocos/assets/art/backgrounds/floor_${id}.candN.png `
    + `shizu-cocos/assets/art/backgrounds/floor_${id}.png（resources/art/ 下同名文件一并替换）`);
}
