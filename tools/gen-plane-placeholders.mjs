// 占位/修补像素资产生成器 v2 —— 新位面核心资产 + 旧位面配置修补 双用途。
// 扫描「有效绑定」（overrides.data.json 覆盖优先，回落原生配表），对磁盘上缺失的
// 贴图按渲染层帧族约定生成占位 PNG；已存在的文件一律跳过，绝不覆盖真实美术。
//   · 后备三变体 / 绑定阶段怪 / Boss 全帧族（idle/walk/atk/death/静态）
//   · 精英 elite_<pid> · 地砖 floor_<pid> · 背景 plane_<codex2>_<pid>
// 用法：node tools/gen-plane-placeholders.mjs [overrides.data.json 路径]
//   无配置文件时=纯修补模式：只看原生 12 位面的缺图。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './pixel/canvas.mjs';
import { encodePng } from './pixel/png.mjs';
import { P, INK, RIM } from './pixel/palette.mjs';
import { WALK, DEATH, IDLE } from './pixel/anim.mjs';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE } from '../shizu-cocos/assets/scripts/data/planeModules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = path.resolve(root, process.argv[2] ?? 'web/src/config/overrides.data.json');
const outRoots = [
  path.join(root, 'shizu-cocos/assets/art'),
  path.join(root, 'shizu-cocos/assets/resources/art'),
];

let ov = {};
if (fs.existsSync(jsonPath)) {
  ov = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));   // 剥 Windows BOM
} else {
  console.log('ℹ 未找到 overrides.data.json —— 纯修补模式（仅原生位面缺图）。');
}

const RAMPS = [P.teal, P.amber, P.blood, P.steel, P.stone, P.arcane, P.rot].filter(Boolean);
const rampOf = (pid) => {
  let h = 0;
  for (const ch of String(pid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RAMPS[h % RAMPS.length];
};

// —— 有效绑定：覆盖优先，回落原生表；位面全集 = 原生 ∪ 覆盖键 ——
const allIds = new Set([
  ...Object.keys(MINION_SPRITE_BY_STAGE),
  ...Object.keys(BOSS_BY_PLANE),
  ...Object.keys(ov.stageSprites ?? {}),
  ...Object.keys(ov.bossSprites ?? {}),
]);
const effective = (pid) => ({
  pairs: ov.stageSprites?.[pid] ?? MINION_SPRITE_BY_STAGE[pid] ?? [],
  boss: ov.bossSprites?.[pid] ?? BOSS_BY_PLANE[pid] ?? null,
  codex: Number(ov.planes?.[pid]?.codex) || null,
});

// —— 像素基底 ——
const shift = (src, dx, dy) => { const c = new Canvas(src.w, src.h); c.blit(src, dx, dy); return c; };
const ATK = [(s) => shift(s, 2, 0), (s) => shift(s, 3, 0), (s) => shift(s, 2, 1)];
function minionBase(ramp) {
  const c = new Canvas(16, 16);
  c.fillRect(4, 6, 8, 7, ramp[2]);
  c.fillRect(5, 3, 6, 4, ramp[1]);
  c.fillRect(6, 4, 1, 1, [255, 255, 255, 255]);
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
function backdrop(ramp, w = 480, h = 270) {
  const c = new Canvas(w, h);
  c.fillRect(0, 0, w, h, ramp[0]);
  // 三段天：上亮下暗 + 抖动过渡 + 远山剪影带
  c.ditherFill(0, 0, w, Math.floor(h * 0.55), ramp[0], ramp[1], (_x, y) => y / (h * 0.55));
  c.fillRect(0, Math.floor(h * 0.72), w, h, ramp[1]);
  for (let i = 0; i < 7; i++) {
    const bw = 60 + ((i * 97) % 90);
    const bh = 26 + ((i * 53) % 30);
    c.fillRect(i * 70 - 20, h - bh, bw, bh, ramp[2]);
  }
  return c;
}

let written = 0;
const existsAny = (rel) => outRoots.some((d) => fs.existsSync(path.join(d, rel)));
function emitIfMissing(rel, canvas) {
  if (existsAny(rel)) return false;                     // ★ 已有真美术 → 永不覆盖
  const png = encodePng(canvas.w, canvas.h, canvas.data);
  for (const baseDir of outRoots) {
    const file = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  written += 1;
  return true;
}
function emitFamily(name, ramp, size = 16) {
  if (!existsAny(`units/${name}.png`)) {
    const b = size > 16 ? bigBase(ramp, size) : minionBase(ramp);
    IDLE.forEach((f, i) => emitIfMissing(`units/${name}_idle${i}.png`, f(b)));
    WALK.forEach((f, i) => emitIfMissing(`units/${name}_walk${i}.png`, f(b)));
    ATK.forEach((f, i) => emitIfMissing(`units/${name}_atk${i}.png`, f(b)));
    emitIfMissing(`units/${name}_death.png`, DEATH[DEATH.length - 1](b));
    emitIfMissing(`units/${name}.png`, b);
    return true;
  }
  // 静态图在但缺帧 → 只补缺的帧
  const b = size > 16 ? bigBase(ramp, size) : minionBase(ramp);
  let patched = false;
  IDLE.forEach((f, i) => { patched = emitIfMissing(`units/${name}_idle${i}.png`, f(b)) || patched; });
  WALK.forEach((f, i) => { patched = emitIfMissing(`units/${name}_walk${i}.png`, f(b)) || patched; });
  ATK.forEach((f, i) => { patched = emitIfMissing(`units/${name}_atk${i}.png`, f(b)) || patched; });
  patched = emitIfMissing(`units/${name}_death.png`, DEATH[DEATH.length - 1](b)) || patched;
  return patched;
}

for (const pid of allIds) {
  const { pairs, boss, codex } = effective(pid);
  const ramp = rampOf(pid);
  const touched = [];

  // ① 后备三变体（阶段表为空/缺失时渲染层的兜底族）
  const hasPairs = Array.isArray(pairs) && pairs.some((pr) => pr?.some(Boolean));
  if (!hasPairs && !existsAny(`units/minion_walker_${pid}.png`)) {
    for (const variant of ['walker', 'charger', 'spitter']) emitFamily(`minion_${variant}_${pid}`, ramp);
    touched.push('后备三变体');
  }
  // ② 绑定的阶段怪与 Boss（含旧位面改名后的悬空引用修补）
  const names = new Set();
  for (const pair of pairs ?? []) for (const n of pair ?? []) if (n) names.add(n);
  for (const n of names) {
    if (emitFamily(n, ramp)) touched.push(n);
  }
  if (boss && emitFamily(boss, ramp, 24)) touched.push(`Boss:${boss}`);
  // ③ 精英
  {
    const c = bigBase(ramp, 20);
    if (emitIfMissing(`units/elite_${pid}.png`, c)) touched.push('精英');
  }
  // ④ 地砖
  {
    const floor = new Canvas(64, 64);
    floor.fillRect(0, 0, 64, 64, ramp[0]);
    floor.ditherFill(0, 0, 64, 64, ramp[0], ramp[1], (x, y) => (((x >> 3) + (y >> 3)) % 2) ? 0 : 0.35);
    if (emitIfMissing(`backgrounds/floor_${pid}.png`, floor)) touched.push('地砖');
  }
  // ⑤ 背景（codex 已由后台导出解析；无 codex 的悬空新位面跳过并提示）
  if (codex) {
    const codex2 = String(codex).padStart(2, '0');
    if (emitIfMissing(`backgrounds/plane_${codex2}_${pid}.png`, backdrop(ramp))) touched.push('背景');
  } else if (ov.planes?.[pid]?._new) {
    console.log(`⚠ ${pid}: 尚未解析 codex（先在后台重新「保存到项目」），背景跳过`);
  }

  if (touched.length) console.log(`✓ ${pid}: ${touched.join('、')}`);
}

console.log(`\n完成：新写 ${written} 个 PNG（art 与 resources/art 双目录）；已有文件一律未动。`);
console.log('提示：这是占位风格。正式美术请走 tools/ai-art 管线后重跑本命令查漏。');
