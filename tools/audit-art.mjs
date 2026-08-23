// 全位面资产体检：按渲染层「实际会请求什么」逐个核对磁盘上有没有。
// 缺图不会报错 —— assets.js 的 img.onerror 会静默 resolve(null)，渲染层退化成色块，
// 于是「敌人全是方块」这种问题能一路活到线上。这个脚本就是把静默失败��开。
//
// 用法：node tools/audit-art.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE } from '../shizu-cocos/assets/scripts/core/battle.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { decodePng } from './ai-art/pipeline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(root, 'shizu-cocos/assets/art');

const has = (rel) => fs.existsSync(path.join(ART, rel));

/** PNG 尺寸（不解压，只读 IHDR） */
function size(rel) {
  const b = fs.readFileSync(path.join(ART, rel));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: b.length / 1024 };
}

/**
 * 透明像素占比 —— 用来抓「这张图其实是抠好的角色 sprite」。
 * sprite 走 removeBackground + tightCrop，边角必然透明；
 * 地砖是 alpha:false 生成的，必须不透明地铺满整帧。
 *
 * ⚠ 说清楚它抓不到什么：历史上那张被当成地砖平铺满全场的矮人立绘
 * （381×256）透明占比是 0%，本判据抓不到它 —— 抓到它的是「非正方形」那条。
 * 本判据补的是另一种漏网情形：**正方形**的抠图 sprite。
 *
 * 这里曾经用的是「文件 < 100KB 且宽 < 400 就可疑」，那是照着当时唯一的坏样本
 * 反推出来的规则；而 256×256 恰恰是现在地砖的标准尺寸，于是山海/机甲两张
 * 完全正常的砖被误报。会误报的审计比没有审计更糟：人会学会无视它。
 */
function alphaRatio(rel) {
  const img = decodePng(fs.readFileSync(path.join(ART, rel)));
  let clear = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 8) clear += 1;
  return clear / (img.width * img.height);
}

/**
 * 中心区与边缘环的平均亮度差。大 = 有居中主图案，平铺开会呈规律棋盘（壁纸感）。
 * 这是**审美风险提示**，不是故障 —— 所以只报告、不计入 problems、不影响退出码。
 * 退出码只该代表「有东西是坏的」；把「可能难看」也算成失败，人就会开始无视整个脚本。
 * 真要判断还是得看 `npm run art:tile` 铺开后的样子。
 */
function centerBias(rel) {
  const { width: w, height: h, data: d } = decodePng(fs.readFileSync(path.join(ART, rel)));
  const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let cs = 0, cn = 0, bs = 0, bn = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7) { cs += lum(i); cn += 1; }
      else if (x < w * 0.12 || x > w * 0.88 || y < h * 0.12 || y > h * 0.88) { bs += lum(i); bn += 1; }
    }
  }
  const c = cs / Math.max(1, cn), b = bs / Math.max(1, bn);
  return Math.abs(c - b) / Math.max(1, c, b);
}

const FULL_FRAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death'];
const FALLBACK_FRAMES = ['walk0', 'atk0', 'atk1', 'atk2', 'death'];

let problems = 0;
const note = (msg) => { console.log('    ⚠ ' + msg); problems += 1; };
const tileRisk = [];   // 审美风险提示，不计入 problems

for (const plane of planes) {
  const id = plane.id;
  console.log(`\n【${plane.name}】${id}`);

  // —— 地砖：渲染层强制拉成 256×256 平铺，非正方形 = 必然变形 ——
  const floor = `backgrounds/floor_${id}.png`;
  if (!has(floor)) note(`地砖缺失 ${floor} —— 整片地面退化成纯色`);
  else {
    const { w, h } = size(floor);
    if (w !== h) note(`地砖非正方形 ${w}×${h} —— 会被拉成 256×256 变形（${floor}）`);
    const clear = alphaRatio(floor);
    if (clear > 0.02) {
      note(`地砖有 ${(clear * 100).toFixed(0)}% 透明像素 —— 这是抠好的 sprite，不是铺满整帧的地砖（${floor}）`);
    }
    tileRisk.push({ id, name: plane.name, bias: centerBias(floor) });
  }

  // —— 阶段表小怪 ——
  const pairs = MINION_SPRITE_BY_STAGE[id];
  if (!pairs?.length) {
    note(`MINION_SPRITE_BY_STAGE 里没有 ${id} —— 全靠 minion_{variant}_${id} 兜底`);
  } else {
    const units = new Set(pairs.flat());
    for (const m of units) {
      const missing = FULL_FRAMES.filter((f) => !has(`units/${m}_${f}.png`));
      if (missing.length) note(`小怪 ${m} 缺 ${missing.length}/${FULL_FRAMES.length} 帧：${missing.join(',')}`);
    }
  }

  // —— 通用兜底族 ——
  // 只有「阶段表里没有这个位面」时渲染层才会走兜底命名：drawEnemy 里
  // `e.sprite || spriteBase(...)`，有阶段表的位面 e.sprite 一定有值，兜底族根本用不到。
  // 所以对有阶段表的位面报「兜底缺失」是误报。
  if (!pairs?.length) {
    for (const v of ['walker', 'charger', 'spitter']) {
      const m = `minion_${v}_${id}`;
      if (!has(`units/${m}.png`)) note(`兜底待机图缺失 units/${m}.png`);
      const missing = FALLBACK_FRAMES.filter((f) => !has(`units/${m}_${f}.png`));
      if (missing.length) note(`兜底 ${m} 缺帧：${missing.join(',')}`);
    }
  }

  // —— 精英 / Boss ——
  if (!has(`units/elite_${id}.png`)) note(`精英贴图缺失 units/elite_${id}.png`);
  const boss = BOSS_BY_PLANE[id];
  if (!boss) note(`BOSS_BY_PLANE 里没有 ${id}`);
  if (!has(`units/boss_${id}.png`) && !(boss && has(`units/${boss}_walk0.png`))) {
    note(`Boss 贴图缺失（既没有 boss_${id}.png，也没有 ${boss} 的帧）`);
  }
}

// —— 审美风险提示（不计入 problems、不影响退出码）——
// 「有居中主图案」的砖单看往往很漂亮，铺开却是规律棋盘。这是本仓踩过的坑：
// 当初挑地砖时选了单张最好看的那张（中心一个大齿轮），装进游戏才发现满屏壁纸感。
tileRisk.sort((a, b) => b.bias - a.bias);
const risky = tileRisk.filter((t) => t.bias > 0.20);
if (risky.length) {
  console.log('\n—— 平铺壁纸感风险（提示，非故障）——');
  for (const t of risky) {
    console.log(`  ${t.name}（${t.id}）中心与边缘亮度差 ${(t.bias * 100).toFixed(0)}% —— 可能有居中主图案`);
  }
  console.log('  确认方式：npm run art:tile -- '
    + risky.map((t) => `shizu-cocos/assets/art/backgrounds/floor_${t.id}.png`).join(' '));
}

console.log(problems ? `\n共 ${problems} 处问题` : '\n✓ 全部位面资产齐全');
process.exit(problems ? 1 : 0);
