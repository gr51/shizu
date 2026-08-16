// 像素风美术资产生成器（零依赖，纯 Node）。
// 用法：node tools/gen-pixel-assets.mjs
// 输出：shizu-cocos/assets/art/  —— 与原占位图**同名覆盖**，代码与 .meta 无需改动。
//
// 与 tools/gen-assets.mjs（纯色/渐变占位）的关系：本文件取代它。
// 那一版是「有资源可引」的锚点；这一版是**成品风格的第一版**：
//   · 原生低分辨率手绘 + 整数倍放大（像素风的硬性做法）
//   · 每个角色/位面照各自设定独立绘制轮廓（规范规则 1「剪影可读性」）
//   · 全局只用 深青 + 琥珀 两种强调色（规则 2 / 10）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './pixel/canvas.mjs';
import { encodePng } from './pixel/png.mjs';
import { P, INK, RIM, PLANE_PALETTE, ROUTE_PALETTE, rgb } from './pixel/palette.mjs';
import { NESTLING_BASE, SKIN_OVERLAY, MINIONS } from './pixel/creatures.mjs';
import { BOSSES } from './pixel/bosses.mjs';
import { ELITES } from './pixel/elites.mjs';
import { IDLE, FLOAT, WALK, HIT, DEATH, PULSE, sheet } from './pixel/anim.mjs';
import { makeBackground, ITEMS, ATTR_ICONS, GEAR_ICONS, BG_W, BG_H } from './pixel/scenes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'shizu-cocos', 'assets', 'art');

/** 字符 → 颜色（给定色阶） */
const mapFor = (ramp, accent = null) => ({
  k: INK,
  0: ramp[0], 1: ramp[1], 2: ramp[2], 3: ramp[3],
  t: P.teal[2], a: P.amber[2], r: P.blood[2], w: rgb('#ffffff'),
  s: accent ?? ramp[2], g: P.amber[2],
});

/**
 * 画一个单位。
 * rim（青色轮廓光）**只给玩家和 BOSS** —— 规则 9「特效克制」：
 * 60 只小怪同屏时人人带青边会糊成一片，反而找不到自己。
 */
function unit(art, ramp, { rim = false, overlay = null, overlayColor = null, name = 'unit' } = {}) {
  const { w, h } = Canvas.measure(art);
  const c = new Canvas(w, h);
  c.sprite(art, mapFor(ramp), 0, 0, name);
  if (overlay) c.sprite(overlay, { s: overlayColor ?? ramp[3], g: P.amber[2] }, 0, 0, `${name}:overlay`);
  c.outline(INK);
  if (rim) c.rimLight(RIM);
  return c;
}

const jobs = [];
const add = (rel, canvas, scale) => jobs.push({ rel, canvas, scale });

// ——— 巢灵（玩家）11 形态：96×96（20×20 ×5 ≈ 100，取 ×5）———
add('units/player.png', unit(NESTLING_BASE, P.shell, { rim: true, name: 'player' }), 5);
for (const [route, overlay] of Object.entries(SKIN_OVERLAY)) {
  add(
    `units/player_${route}.png`,
    unit(NESTLING_BASE, P.shell, {
      rim: true, overlay, overlayColor: ROUTE_PALETTE[route][2], name: `player_${route}`,
    }),
    5,
  );
}

// ——— 12 位面小怪：16×16 ×4 = 64px（规范：小怪 48~64）———
for (const [id, art] of Object.entries(MINIONS)) {
  add(`units/minion_${id}.png`, unit(art, PLANE_PALETTE[id], { name: `minion_${id}` }), 4);
}

// ——— 12 位面之主：32×32 ×8 = 256px（规范：BOSS 256 起）———
for (const [id, art] of Object.entries(BOSSES)) {
  add(`units/boss_${id}.png`, unit(art, PLANE_PALETTE[id], { rim: true, name: `boss_${id}` }), 8);
}

// ——— 12 位面精英：24×24 ×5 = 120px（尺寸档位介于小怪与 BOSS 之间）———
for (const [id, art] of Object.entries(ELITES)) {
  add(`units/elite_${id}.png`, unit(art, PLANE_PALETTE[id], { name: `elite_${id}` }), 5);
}

// ——— 道具 ———
add('items/gene_orb.png', unit(ITEMS.gene_orb, P.teal, { rim: true, name: 'gene_orb' }), 4);
add('items/relic.png', unit(ITEMS.relic, P.amber, { rim: true, name: 'relic' }), 4);
add('items/gear.png', unit(GEAR_ICONS.claw, P.stone, { name: 'gear' }), 4);

// ——— 属性图标 8 个 ———
const ATTR_RAMP = {
  atk: P.blood, hp: P.rot, speed: P.amber, aspd: P.steel,
  crit: P.amber, lifesteal: P.blood, regen: P.teal, range: P.steel,
};
for (const [id, art] of Object.entries(ATTR_ICONS)) {
  add(`icons/${id}.png`, unit(art, ATTR_RAMP[id], { name: `icon_${id}` }), 4);
}

// ——— 装备槽图标 6 个 ———
for (const [id, art] of Object.entries(GEAR_ICONS)) {
  add(`icons/gear_${id}.png`, unit(art, P.stone, { name: `gear_${id}` }), 4);
}

// ——— 路线图鉴图标 10 个：用该路线的巢灵皮肤剪影 ———
for (const [route, overlay] of Object.entries(SKIN_OVERLAY)) {
  add(
    `icons/route_${route}.png`,
    unit(NESTLING_BASE, ROUTE_PALETTE[route], { overlay, overlayColor: P.void[0], name: `route_${route}` }),
    3,
  );
}

// ——— 稀有度框 5 个（像素风描边方框，不是圆环）———
const RARITY_RAMP = { white: P.rWhite, green: P.rGreen, blue: P.rBlue, purple: P.rPurple, gold: P.rGold };
for (const [id, ramp] of Object.entries(RARITY_RAMP)) {
  const c = new Canvas(16, 16);
  c.fillRect(0, 0, 16, 16, ramp[1]);
  c.fillRect(1, 1, 14, 14, ramp[2]);
  c.fillRect(2, 2, 12, 12, [0, 0, 0, 0]);
  // 四角加重，像素风框的标志性处理
  for (const [x, y] of [[0, 0], [14, 0], [0, 14], [14, 14]]) c.fillRect(x, y, 2, 2, ramp[3]);
  c.outline(INK);
  add(`ui/rarity_${id}.png`, c, 4);
}

// ——— 技能槽底框 2 个 ———
for (const [id, ramp] of [['active', P.amber], ['passive', P.teal]]) {
  const c = new Canvas(24, 24);
  c.fillRect(0, 0, 24, 24, ramp[0]);
  c.fillRect(1, 1, 22, 22, ramp[1]);
  c.fillRect(3, 3, 18, 18, P.void[1]);
  for (const [x, y] of [[0, 0], [21, 0], [0, 21], [21, 21]]) c.fillRect(x, y, 3, 3, ramp[2]);
  c.outline(INK);
  add(`ui/slot_${id}.png`, c, 4);
}

// ——— 虚拟摇杆（横屏左下）———
{
  const outer = new Canvas(80, 80);
  outer.ellipse(40, 40, 38, 38, [...P.stone[0].slice(0, 3), 150]);
  outer.ellipse(40, 40, 34, 34, [0, 0, 0, 0]);
  outer.ellipse(40, 40, 36, 36, P.stone[2]);
  outer.ellipse(40, 40, 33, 33, [0, 0, 0, 0]);
  add('ui/joystick_base.png', outer, 4);

  const knob = new Canvas(32, 32);
  knob.ellipse(16, 16, 14, 14, P.shell[1]);
  knob.ellipse(14, 14, 9, 9, P.shell[2]);
  knob.ellipse(13, 13, 4, 4, P.shell[3]);
  knob.outline(INK);
  add('ui/joystick_knob.png', knob, 4);
}

// ——— 吞噬爆发按钮（右下，长按）———
{
  const c = new Canvas(32, 32);
  c.ellipse(16, 16, 15, 15, P.teal[0]);
  c.ellipse(16, 16, 13, 13, P.teal[1]);
  c.sprite(ITEMS.gene_orb, mapFor(P.teal), 8, 8, 'burst');
  c.outline(INK);
  c.rimLight(RIM);
  add('ui/btn_devour.png', c, 4);
}

// ——— 战斗 HUD 底栏（横屏 960×90 → 240×22 ×4）———
{
  const c = new Canvas(240, 22);
  c.fillRect(0, 0, 240, 22, P.void[1]);
  c.fillRect(0, 0, 240, 1, P.stone[1]);
  c.ditherFill(0, 1, 240, 21, P.void[1], P.void[0], (x, y) => y / 21);
  add('ui/hud_bar.png', c, 4);
}

// ——— Logo / 入口徽记：虫巢轮廓 + 青色核心 ———
{
  const LOGO = `
........kkkkkkkk........
.....kkk33333333kkk.....
...kk3333333333333 kk...
..k333333aaaaaa333333k..
.k33333aaaaaaaaaa33333k.
.k3333aaa333333aaa3333k.
k33333aa33tttt33aa33333k
k3333aa33tttttt33aa3333k
k3333aa3tttttttt3aa3333k
k3333aa3tttwwttt3aa3333k
k3333aa3tttttttt3aa3333k
k33333aa33tttt33aa33333k
.k3333aaa333333aaa3333k.
.k33333aaaaaaaaaa33333k.
..k333333aaaaaa333333k..
...kk33333333333333kk...
.....kkk33333333kkk.....
........kkkkkkkk........
`.replace(/ /g, '3');
  const c = new Canvas(24, 18);
  c.sprite(LOGO, mapFor(P.shell), 0, 0, 'logo');
  c.outline(INK);
  c.rimLight(RIM);
  add('ui/logo.png', c, 8);
}

// ——— 背景 14 张（480×270 ×4 = 1920×1080）———
const BG_RAMP = { ...PLANE_PALETTE, nest: P.amber, settle: P.arcane };
const BG_FILE = {
  jiguan: 'plane_01_jiguan', aofa: 'plane_02_aofa', qiqiao: 'plane_03_qiqiao',
  dujie: 'plane_04_dujie', gongde: 'plane_05_gongde', shihai: 'plane_06_shihai',
  gongshengchao: 'plane_07_gongshengchao', wuxia: 'plane_08_wuxia', shanhai: 'plane_09_shanhai',
  jijia: 'plane_10_jijia', jushen: 'plane_11_jushen', zhutian: 'plane_12_zhutian',
  nest: 'nest', settle: 'settle',
};
for (const [id, file] of Object.entries(BG_FILE)) {
  add(`backgrounds/${file}.png`, makeBackground(id, BG_RAMP[id]), 4);
}
// 入口/启动背景（用虫巢配色，另存一张）
add('backgrounds/splash.png', makeBackground('nest', P.amber), 4);

// ============================================================
// 逐帧动画雪碧图（横向排列）+ 清单
// ============================================================

const anims = [];
/** @param {string} rel @param {Canvas} base @param {Function[]} action @param {number} scale @param {number} fps */
function addAnim(rel, base, action, scale, fps, loop = true) {
  const s = sheet(base, action);
  add(rel, s.canvas, scale);
  anims.push({
    file: `art/${rel}`,
    frames: s.frames,
    frameWidth: s.frameW * scale,
    frameHeight: s.frameH * scale,
    fps,
    loop,
  });
}

// 巢灵：待机 + 移动 + 受击（11 形态各一套）
const playerForms = [['', null], ...Object.entries(SKIN_OVERLAY).map(([r, o]) => [`_${r}`, [r, o]])];
for (const [suffix, skin] of playerForms) {
  const base = unit(NESTLING_BASE, P.shell, {
    rim: true,
    overlay: skin ? skin[1] : null,
    overlayColor: skin ? ROUTE_PALETTE[skin[0]][2] : null,
    name: `player${suffix}`,
  });
  addAnim(`anim/player${suffix}_idle.png`, base, IDLE, 5, 6);
  addAnim(`anim/player${suffix}_walk.png`, base, WALK, 5, 10);
  addAnim(`anim/player${suffix}_hit.png`, base, HIT, 5, 12, false);
}

// 小怪：移动 + 死亡（漂浮类走 FLOAT）
const FLOATERS = new Set(['aofa', 'zhutian', 'qiqiao']);
for (const [id, art] of Object.entries(MINIONS)) {
  const base = unit(art, PLANE_PALETTE[id], { name: `minion_${id}` });
  addAnim(`anim/minion_${id}_move.png`, base, FLOATERS.has(id) ? FLOAT : WALK, 4, 8);
  addAnim(`anim/minion_${id}_death.png`, base, DEATH, 4, 12, false);
}

// 精英：待机 + 死亡
for (const [id, art] of Object.entries(ELITES)) {
  const base = unit(art, PLANE_PALETTE[id], { name: `elite_${id}` });
  addAnim(`anim/elite_${id}_idle.png`, base, IDLE, 5, 6);
  addAnim(`anim/elite_${id}_death.png`, base, DEATH, 5, 10, false);
}

// 位面之主：待机（BOSS 幅度更小更沉，用 IDLE 不用 WALK）
for (const [id, art] of Object.entries(BOSSES)) {
  const base = unit(art, PLANE_PALETTE[id], { rim: true, name: `boss_${id}` });
  addAnim(`anim/boss_${id}_idle.png`, base, IDLE, 8, 5);
}

// 掉落物：基因球呼吸、传承水晶浮动
addAnim('anim/gene_orb_pulse.png', unit(ITEMS.gene_orb, P.teal, { rim: true, name: 'orb' }), PULSE, 4, 8);
addAnim('anim/relic_float.png', unit(ITEMS.relic, P.amber, { rim: true, name: 'relic' }), FLOAT, 4, 6);

// ——— 写出 ———
let written = 0;
for (const j of jobs) {
  const out = j.canvas.scale(j.scale);
  const file = path.join(outRoot, j.rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(out.w, out.h, out.data));
  written += 1;
}

// 动画清单：Cocos 侧按 frameWidth 切分雪碧图即可
fs.writeFileSync(
  path.join(outRoot, 'anim.json'),
  JSON.stringify({ note: '横向雪碧图；frameWidth/Height 为放大后的单帧尺寸', clips: anims }, null, 2),
);

fs.writeFileSync(path.join(outRoot, 'README.md'), `# 像素风美术资产（由 tools/gen-pixel-assets.mjs 生成）

原生低分辨率手绘 + 整数倍放大（nearest neighbor）。**不要用图像编辑器缩放**，
那会破坏像素网格；要改尺寸请改生成脚本里的 scale 倍率。

- 角色/敌人/图标：ASCII 精灵图，源在 \`tools/pixel/creatures.mjs\` / \`bosses.mjs\` / \`scenes.mjs\`
- 背景：程序化分层剪影，源在 \`tools/pixel/scenes.mjs\`
- 调色板：\`tools/pixel/palette.mjs\`（全局只有 深青 + 琥珀 两种强调色）

重新生成：\`npm run art\`
风格校验对照表：\`npm run art:preview\`（含纯黑剪影验收行）
`);

console.log(`✓ 已生成 ${written} 个像素风 PNG → ${path.relative(root, outRoot)}`);
const byDir = {};
for (const j of jobs) {
  const d = path.dirname(j.rel);
  byDir[d] = (byDir[d] ?? 0) + 1;
}
for (const [d, n] of Object.entries(byDir)) console.log(`   ${d.padEnd(14)} ${n}`);
