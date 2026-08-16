// ===== pixel/anim.mjs · 逐帧动画 =====
//
// ⚠ 老实说明：这里的帧**不是逐帧手绘**，是从基础精灵图**程序化派生**的。
//   100+ 个单位逐帧手绘不现实；而割草游戏里「没有动画 = 没有手感」，
//   所以取中间路线：用像素动画的经典变换（bob / squash-stretch / 抖动 / 溶解）
//   从一张图派生出一套帧。这些变换都是**整像素**的，不会破坏像素网格。
//
//   代价：动作是「整体形变」而非「肢体分解」，走路没有真正的迈腿。
//   要真正的走路循环，得给巢灵和精英手绘 4 帧腿部 —— 列在待办里。
//
// 输出格式：**横向雪碧图**（帧并排）+ art/anim.json 清单，
// Cocos 侧用 SpriteFrame 切分即可。

import { Canvas } from './canvas.mjs';

/** 整体上下浮动（idle 呼吸感）。像素动画里 1-2px 就够，多了会「飘」 */
export function bob(src, dy) {
  const out = new Canvas(src.w, src.h);
  out.blit(src, 0, dy);
  return out;
}

/**
 * 压扁 / 拉伸（走路的重心起伏）。
 * 只在纵向做整数行的复制/丢弃，保证像素对齐。
 */
export function squash(src, amount) {
  const out = new Canvas(src.w, src.h);
  if (amount === 0) return (out.blit(src, 0, 0), out);
  const keep = src.h - Math.abs(amount);
  for (let y = 0; y < keep; y++) {
    const sy = Math.round((y * src.h) / keep);
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, Math.min(src.h - 1, sy));
      if (c[3] > 0) out.px(x, y + (amount > 0 ? Math.abs(amount) : 0), c);
    }
  }
  // 压扁时横向补偿一点，保持体积感
  return out;
}

/** 左右轻摆（爬行 / 漂浮类的横向位移） */
export function sway(src, dx) {
  const out = new Canvas(src.w, src.h);
  out.blit(src, dx, 0);
  return out;
}

/** 受击白闪：整体替换为纯白（保留 alpha 与描边形状） */
export function flash(src, color = [255, 255, 255, 255]) {
  const out = new Canvas(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.get(x, y)[3] > 0) out.px(x, y, color);
    }
  }
  return out;
}

/**
 * 溶解（死亡）：按固定伪随机顺序抹掉像素 + 整体上浮。
 * 用固定 seed 保证可复现；抹除顺序按「从下往上」，像被吸走一样。
 */
export function dissolve(src, t, seed = 1) {
  const out = new Canvas(src.w, src.h);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lift = Math.round(t * 3);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3] === 0) continue;
      // 越靠下越先消失
      const bias = 1 - y / src.h;
      if (rnd() < t * (0.6 + bias * 0.8)) continue;
      out.px(x, y - lift, c);
    }
  }
  return out;
}

/** 缩放脉冲（基因球 / 能量体的呼吸发光）：整数像素的向内收缩 */
export function pulse(src, shrink) {
  if (shrink === 0) {
    const o = new Canvas(src.w, src.h);
    o.blit(src, 0, 0);
    return o;
  }
  const out = new Canvas(src.w, src.h);
  const w = src.w - shrink * 2;
  const h = src.h - shrink * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src.get(Math.round((x * src.w) / w), Math.round((y * src.h) / h));
      if (c[3] > 0) out.px(x + shrink, y + shrink, c);
    }
  }
  return out;
}

// ============================================================
// 动作定义：每个动作 = 一串「从基础图派生帧」的函数
// ============================================================

/** idle：轻微上下浮动。4 帧，正弦式 0/-1/0/+1 —— 循环无跳变 */
export const IDLE = [
  (s) => bob(s, 0),
  (s) => bob(s, -1),
  (s) => bob(s, 0),
  (s) => bob(s, 1),
];

/** float：漂浮类（奥术精灵 / 残影 / 基因球）幅度更大且带横摆 */
export const FLOAT = [
  (s) => bob(s, 0),
  (s) => sway(bob(s, -1), 1),
  (s) => bob(s, -2),
  (s) => sway(bob(s, -1), -1),
];

/**
 * walk：重心起伏 + 横摆（无真正迈腿，见文件头说明）。
 * 幅度取 2px 压扁 + 1px 上抬 + ±1px 横摆 ——
 * 1px 的版本在实机上几乎看不出，像素动画需要「夸张一档」才读得出动作。
 */
export const WALK = [
  (s) => bob(squash(s, 2), 0),
  (s) => sway(bob(s, -1), 1),
  (s) => bob(squash(s, 2), 0),
  (s) => sway(bob(s, -1), -1),
];

/** hit：一帧白闪 + 一帧原样（引擎侧也可以直接用 tint 实现，这里给素材兜底） */
export const HIT = [
  (s) => flash(s),
  (s) => bob(s, 0),
];

/** death：溶解上浮，4 帧 */
export const DEATH = [
  (s) => dissolve(s, 0.15, 7),
  (s) => dissolve(s, 0.4, 7),
  (s) => dissolve(s, 0.68, 7),
  (s) => dissolve(s, 0.9, 7),
];

/** pulse：能量体呼吸，4 帧 */
export const PULSE = [
  (s) => pulse(s, 0),
  (s) => pulse(s, 1),
  (s) => pulse(s, 2),
  (s) => pulse(s, 1),
];

/**
 * 把一串帧拼成横向雪碧图。
 * @returns {{canvas: Canvas, frames: number, frameW: number, frameH: number}}
 */
export function sheet(base, actions) {
  const frames = actions.map((fn) => fn(base));
  const c = new Canvas(base.w * frames.length, base.h);
  frames.forEach((f, i) => c.blit(f, i * base.w, 0));
  return { canvas: c, frames: frames.length, frameW: base.w, frameH: base.h };
}
