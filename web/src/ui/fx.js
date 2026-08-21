// ===== ui/fx.js · 大厅氛围粒子（悬浮灵火 / 墨尘）=====
// 纯装饰：向上漂移的青色/金色光点，营造「裂缝灵气外溢」的感觉。
// 不碰核心逻辑，可在 Cocos 版替换为原生粒子系统。

let canvas = null;
let ctx = null;
let raf = 0;
let parts = [];
let running = false;
let last = 0;

const PALETTE = [
  { r: 95, g: 184, b: 166 },   // 基因青
  { r: 216, g: 189, b: 106 },  // 位面金
  { r: 158, g: 128, b: 220 },  // 青紫
];

function spawn(w, h) {
  return {
    x: Math.random() * w,
    y: h + 10 + Math.random() * 40,
    r: 1 + Math.random() * 2.2,
    vy: 8 + Math.random() * 18,        // 上升速度
    sway: 10 + Math.random() * 18,     // 横向摆动幅度
    phase: Math.random() * Math.PI * 2,
    c: PALETTE[(Math.random() * PALETTE.length) | 0],
    a: 0.25 + Math.random() * 0.5,
    tw: 0.6 + Math.random() * 1.4,     // 闪烁频率
    star: Math.random() < 0.12,        // 少数粒子带十字星，点缀而不喧宾
  };
}

function resize() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick(t) {
  if (!running) return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.clearRect(0, 0, w, h);
  for (const p of parts) {
    p.y -= p.vy * dt;
    p.phase += dt * p.tw;
    const x = p.x + Math.sin(p.phase) * p.sway * dt * 2;
    const alpha = p.a * (0.6 + 0.4 * Math.sin(p.phase * 3));
    // 像素尘：方块「辉光」+ 方块内核 + 取整坐标 —— 抗锯齿软圆是全页唯一
    // 非像素的运动元素，和像素风打架；方块尘才贴「灵火/墨尘」的设定。
    const s = Math.max(2, Math.round(p.r));            // 内核 2~3px
    const px = Math.round(x);
    const py = Math.round(p.y);
    ctx.fillStyle = `rgb(${p.c.r},${p.c.g},${p.c.b})`;
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillRect(px - s, py - s, s * 2, s * 2);        // 外层淡方块（像素味的辉光）
    ctx.globalAlpha = alpha;
    ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);  // 实心内核
    if (p.star) {                                       // 十字星：横竖两条细矩形
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillRect(px - s * 2, py - 1, s * 4, 2);
      ctx.fillRect(px - 1, py - s * 2, 2, s * 4);
    }

    if (p.y < -12) Object.assign(p, spawn(w, h));
  }
  ctx.globalAlpha = 1;
  raf = requestAnimationFrame(tick);
}

export function startLobbyFx() {
  if (running) return;
  canvas = document.getElementById('lobbyFx');
  if (!canvas) return;
  running = true;
  resize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  parts = Array.from({ length: 42 }, () => spawn(w, h));
  window.addEventListener('resize', resize);
  last = performance.now();
  raf = requestAnimationFrame(tick);
}

export function stopLobbyFx() {
  running = false;
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
}
