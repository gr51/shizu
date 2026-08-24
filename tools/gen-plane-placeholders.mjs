// 占位像素资产生成器：为后台新增的位面补齐渲染层需要的全部贴图帧族。
// 读取 web/src/config/overrides.data.json 里 _new 标记的位面，产出：
//   · 后备三变体全家桶  units/minion_{walker|charger|spitter}_<pid>(+_walk0..3/_atk0..2/_death)
//   · 已绑定的阶段怪/Boss 同款帧族
//   · 精英 units/elite_<pid>.png · 地砖 backgrounds/floor_<pid>.png
// 背景 plane_<codex>_<pid> 暂不生成（codex 由运行时分配，文件侧拿不到）——缺图由渲染层深色回退。
// 用法：node tools/gen-plane-placeholders.mjs [overrides.data.json 路径]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './pixel/canvas.mjs';
import { encodePng } from './pixel/png.mjs';
import { P, INK, RIM } from './pixel/palette.mjs';
import { WALK, DEATH, IDLE } from './pixel/anim.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = path.resolve(root, process.argv[2] ?? 'web/src/config/overrides.data.json');
const outRoots = [
  path.join(root, 'shizu-cocos/assets/art'),
  path.join(root, 'shizu-cocos/assets/resources/art'),
];

if (!fs.existsSync(jsonPath)) {
  console.error(`✗ 找不到 ${path.relative(root, jsonPath)} —— 先在后台点「保存到项目」`);
  process.exit(1);
}
const ov = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));   // 剥 Windows BOM
const newPlaneIds = Object.entries(ov.planes ?? {})
  .filter(([, v]) => v && v._new)
  .map(([id]) => id);

if (!newPlaneIds.length) {
  console.log('没有需要生成占位资产的新增位面。');
  process.exit(0);
}

// 确定性选色：pid 哈希 → 全局色阶池（不引入新颜色，守「深青+琥珀」纪律）
const RAMPS = [P.teal, P.amber, P.blood, P.steel, P.stone, P.arcane, P.rot].filter(Boolean);
const rampOf = (pid) => {
  let h = 0;
  for (const ch of String(pid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RAMPS[h % RAMPS.length];
};

const shift = (src, dx, dy) => { const c = new Canvas(src.w, src.h); c.blit(src, dx, dy); return c; };
const ATK = [(s) => shift(s, 2, 0), (s) => shift(s, 3, 0), (s) => shift(s, 2, 1)];

/** 程序化小怪基底：双色块身体 + 头 + 描边（剪影可读，非纯色块） */
function minionBase(ramp) {
  const c = new Canvas(16, 16);
  c.fillRect(4, 6, 8, 7, ramp[2]);
  c.fillRect(5, 3, 6, 4, ramp[1]);
  c.fillRect(6, 4, 1, 1, [255, 255, 255, 255]);   // 眼
  c.fillRect(9, 4, 1, 1, [255, 255, 255, 255]);
  c.fillRect(3, 13, 10, 1, ramp[0]);
  c.outline(INK);
  return c;
}
function bigBase(ramp, size) {
  const c = new Canvas(size, size);
  const m = Math.floor(size * 0.14);
  c.fillRect(m, m + 2, size - m * 2, size - m * 2 - 2, ramp[2]);
  c.fillRect(m + 1, m, size - m * 2 - 2, 4, ramp[1]);
  c.fillRect(m + 2, m + 1, 2, 2, [255, 255, 255, 255]);
  c.fillRect(size - m - 4, m + 1, 2, 2, [255, 255, 255, 255]);
  c.outline(INK);
  c.rimLight(RIM);
  return c;
}

let written = 0;
function emit(rel, canvas) {
  const png = encodePng(canvas.w, canvas.h, canvas.data);
  for (const baseDir of outRoots) {
    const file = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  written += 1;
}
/** 全帧族：idle×N / walk×N / atk×3 / death / 静态图。size>16 走大体型基底（Boss/精英）。 */
function emitFamily(name, ramp, size = 16) {
  const b = size > 16 ? bigBase(ramp, size) : minionBase(ramp);
  IDLE.forEach((f, i) => emit(`units/${name}_idle${i}.png`, f(b)));
  WALK.forEach((f, i) => emit(`units/${name}_walk${i}.png`, f(b)));
  ATK.forEach((f, i) => emit(`units/${name}_atk${i}.png`, f(b)));
  emit(`units/${name}_death.png`, DEATH[DEATH.length - 1](b));
  emit(`units/${name}.png`, b);
}

for (const pid of newPlaneIds) {
  const ramp = rampOf(pid);
  // ① 后备三变体（阶段表留空时渲染层走这一族）
  for (const variant of ['walker', 'charger', 'spitter']) {
    emitFamily(`minion_${variant}_${pid}`, ramp);
  }
  // ② 已绑定的阶段怪与 Boss
  const names = new Set();
  for (const pair of ov.stageSprites?.[pid] ?? []) for (const n of pair) if (n) names.add(n);
  const bossName = ov.bossSprites?.[pid];
  if (!names.size && !bossName) continue;   // ③ 至少后备族已覆盖
  for (const n of names) emitFamily(n, ramp);
  if (bossName) emitFamily(bossName, ramp, 24);
  // ④ 精英
  emit(`units/elite_${pid}.png`, bigBase(ramp, 20));
  // ⑤ 地砖（无缝：双色调棋盘）
  const floor = new Canvas(64, 64);
  floor.fillRect(0, 0, 64, 64, ramp[0]);
  floor.ditherFill(0, 0, 64, 64, ramp[0], ramp[1], (x, y) => ((x >> 3) + (y >> 3)) % 2 ? 0 : 0.35);
  floor.outline(ramp[1]);
  emit(`backgrounds/floor_${pid}.png`, floor);
  console.log(`✓ ${pid}: 后备三变体${names.size ? ` + 绑定怪 ${names.size}` : ''}${bossName ? ` + Boss ${bossName}` : ''} + 精英 + 地砖`);
}

console.log(`\n共写入 ${written} 个占位 PNG（art 与 resources/art 双目录）。重新绑定形象后重跑即可覆盖。`);
