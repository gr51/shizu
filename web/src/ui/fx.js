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
    // 光晕 + 内核
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = `rgb(${p.c.r},${p.c.g},${p.c.b})`;
    ctx.beginPath();
    ctx.arc(x, p.y, p.r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

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
