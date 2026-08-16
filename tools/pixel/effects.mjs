// ===== pixel/effects.mjs · 特效帧（程序化，天然适合像素风）=====
//
// 与角色不同，特效**本来就该程序化**：爆环、火花、闪电、剑气这些
// 在像素画里就是几何图形按帧演进，手绘反而不如公式稳定。
//
// 规范规则 9「特效克制 + 色编码」是硬约束：
//   基因吸取 = 青   吞噬爆发 = 青漩涡   暴击 = 金
//   禁忌 = 紫       受击 = 白闪 + 红边
//   **一个特效一个色**，同屏特效数量受控 —— 所以每个生成器只吃一条色阶。

import { Canvas } from './canvas.mjs';
import { P } from './palette.mjs';

/** 像素画的圆环：用逐像素距离判定，不做抗锯齿 */
function ring(c, cx, cy, r, thickness, col) {
  const outer = r;
  const inner = Math.max(0, r - thickness);
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= outer && d >= inner) c.px(x, y, col);
    }
  }
}

/** 放射状火花：固定角度射线，避免逐帧随机造成闪烁 */
function spokes(c, cx, cy, r0, r1, count, col, phase = 0) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let r = r0; r <= r1; r++) {
      c.px(Math.round(cx + dx * r), Math.round(cy + dy * r), col);
    }
  }
}

/**
 * 爆环：由内向外扩散 + 变淡。割草里最通用的一个特效
 * （击杀、尸爆、震地、导弹命中全用它，只换色阶）。
 */
export function burst(size, ramp, frames = 5) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const r = 2 + t * (size / 2 - 2);
    // 外环亮、内环暗，最后一帧只剩残影
    ring(c, size / 2, size / 2, r, 2, ramp[t < 0.5 ? 3 : 2]);
    if (t < 0.7) ring(c, size / 2, size / 2, r * 0.6, 1, ramp[1]);
    if (t < 0.4) c.ellipse(size / 2, size / 2, r * 0.35, r * 0.35, ramp[3]);
    out.push(c);
  }
  return out;
}

/** 暴击星芒（金）：八角星扩散，规范规则 9「暴击 = 金」 */
export function critStar(size, frames = 4) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const r = 3 + t * (size / 2 - 3);
    spokes(c, size / 2, size / 2, 1, r, 8, P.amber[3], 0);
    spokes(c, size / 2, size / 2, 1, r * 0.6, 8, P.amber[2], Math.PI / 8);
    if (t < 0.5) c.ellipse(size / 2, size / 2, 2, 2, [255, 255, 255, 255]);
    out.push(c);
  }
  return out;
}

/** 受击：白闪 + 红边碎片（规范：受击 = 白闪 + 红边） */
export function hitSpark(size, frames = 3) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const r = 2 + t * (size / 2 - 2);
    spokes(c, size / 2, size / 2, r * 0.4, r, 6, t < 0.5 ? [255, 255, 255, 255] : P.blood[2], 0.3);
    ring(c, size / 2, size / 2, r, 1, P.blood[2]);
    out.push(c);
  }
  return out;
}

/**
 * 吞噬爆发：青色漩涡（整体策划 2.3 长按 0.4s 触发，范围吸取 + 回血 + 狂暴）。
 * 用三条旋转的螺旋臂表达「吸」，方向向内。
 */
export function devourVortex(size, frames = 6) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const phase = (f / frames) * Math.PI * 2;
    const cx = size / 2;
    const cy = size / 2;
    for (let arm = 0; arm < 3; arm++) {
      const a0 = phase + (arm / 3) * Math.PI * 2;
      for (let r = 3; r < size / 2 - 1; r++) {
        const a = a0 + r * 0.28;              // 螺旋
        const shade = r > size / 3 ? P.teal[1] : P.teal[3];
        c.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), shade);
      }
    }
    ring(c, cx, cy, 2 + (f % 2), 1, P.teal[3]);
    out.push(c);
  }
  return out;
}

/** 基因吸取拖尾：一个小青球带残影，向左上（玩家方向）收 */
export function genePickup(size, frames = 4) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const x = size - 3 - t * (size - 6);
    const y = size - 3 - t * (size - 6);
    c.ellipse(x, y, 2.5, 2.5, P.teal[3]);
    c.ellipse(x, y, 1.2, 1.2, [255, 255, 255, 255]);
    // 残影
    for (let k = 1; k <= 3; k++) {
      const tx = x + k * 2.2;
      const ty = y + k * 2.2;
      if (tx < size && ty < size) c.ellipse(tx, ty, 1.6 - k * 0.3, 1.6 - k * 0.3, P.teal[k === 1 ? 2 : 1]);
    }
    out.push(c);
  }
  return out;
}

/** 落雷（渡劫位面主题机制）：自上而下的折线闪电 + 落点爆环 */
export function lightning(w, h, frames = 4) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(w, h);
    if (f < 3) {
      let x = w / 2;
      const col = f === 0 ? P.thunder[3] : P.thunder[2];
      for (let y = 0; y < h - 6; y += 3) {
        const nx = x + (((y / 3) % 2 === 0 ? 1 : -1) * (2 + (f % 2)));
        c.line(x, y, nx, y + 3, col);
        c.line(x + 1, y, nx + 1, y + 3, col);
        x = nx;
      }
      c.ellipse(x, h - 4, 4, 2, col);
    }
    if (f > 0) ring(c, w / 2, h - 4, 3 + f * 3, 2, P.thunder[2]);
    out.push(c);
  }
  return out;
}

/** 剑气（武侠位面）：一道弧形斩击 */
export function slash(size, frames = 4) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const span = 0.9 + t * 0.6;               // 弧张开
    const r = size / 2 - 2;
    for (let i = 0; i <= 40; i++) {
      const a = -span / 2 + (i / 40) * span - Math.PI / 4;
      const rr = r - (t * 2);
      const col = i < 6 || i > 34 ? P.ink[2] : P.ink[3];
      c.px(Math.round(size / 2 + Math.cos(a) * rr), Math.round(size / 2 + Math.sin(a) * rr), col);
      c.px(Math.round(size / 2 + Math.cos(a) * (rr - 1)), Math.round(size / 2 + Math.sin(a) * (rr - 1)), col);
    }
    out.push(c);
  }
  return out;
}

/** 升级 / 里程碑金光（整体策划 6.2 里程碑级反馈） */
export function levelUp(size, frames = 5) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    // 由下向上的光柱 + 扩散环
    const w = Math.max(2, (1 - t) * size * 0.35);
    c.fillRect(size / 2 - w / 2, size * (1 - t) * 0.8, w, size - size * (1 - t) * 0.8, P.amber[t < 0.5 ? 3 : 2]);
    ring(c, size / 2, size - 4, 3 + t * (size / 2), 2, P.amber[2]);
    out.push(c);
  }
  return out;
}

/** 禁忌显现（隐藏技能，规范：禁忌 = 紫） */
export function forbidden(size, frames = 5) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = new Canvas(size, size);
    const t = f / (frames - 1);
    const r = 2 + t * (size / 2 - 3);
    ring(c, size / 2, size / 2, r, 2, P.chaos[3]);
    ring(c, size / 2, size / 2, r * 0.55, 1, P.chaos[2]);
    spokes(c, size / 2, size / 2, r * 0.3, r * 0.8, 6, P.chaos[3], t * 1.2);
    out.push(c);
  }
  return out;
}
