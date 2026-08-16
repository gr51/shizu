// 实机游玩验证：无头浏览器真的按键操作一局实时战斗。
// 用法：先 node tools/serve.mjs，再 node tools/play.mjs
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:8123/web/';
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });

const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('requestfailed', (r) => errs.push('加载失败: ' + r.url().split('/').slice(-2).join('/')));

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 5000 });
await p.click('#options button');
await p.waitForSelector('#modalRoot.show');
await p.click('.modal-btns button');
await p.waitForSelector('#gameCanvas', { timeout: 8000 });
// 等资产加载完、循环真的开始跑（避免在加载期误判输入无效）
await p.waitForFunction(() => (globalThis.__shizu.run?.time ?? 0) > 0.2, null, { timeout: 15000 });
console.log('✓ 战斗画布已挂载、主循环已启动');

const before = await p.evaluate(() => {
  const r = globalThis.__shizu.run;
  return { x: Math.round(r.player.x), y: Math.round(r.player.y) };
});

// 真的按住方向键跑
await p.keyboard.down('KeyD');
await p.waitForTimeout(1400);
await p.keyboard.up('KeyD');
await p.keyboard.down('KeyS');
await p.waitForTimeout(1100);
await p.keyboard.up('KeyS');

const s1 = await p.evaluate(() => {
  const r = globalThis.__shizu.run;
  return {
    t: +r.time.toFixed(1), hp: Math.round(r.hp), kills: r.kills, genes: r.genes,
    onScreen: r.onScreen, orbs: r.orbs.length,
    x: Math.round(r.player.x), y: Math.round(r.player.y), state: r.player.state,
  };
});
console.log(`  按键前位置 (${before.x},${before.y}) → 按键后 (${s1.x},${s1.y})`);
console.log(`  ${s1.t}s：HP ${s1.hp} · 击杀 ${s1.kills} · 基因 ${s1.genes} · 同屏 ${s1.onScreen} · 地上尸体 ${s1.orbs}`);
if (s1.x === before.x && s1.y === before.y) console.log('  ✗ 玩家没动 —— 输入没接上');
else console.log('  ✓ 玩家响应输入');
if (s1.kills > 0) console.log('  ✓ 自动索敌生效（已有击杀）');
else console.log('  ✗ 零击杀 —— 自动攻击可能没生效');

await p.screenshot({ path: 'tools/shot-battle.png' });

// 自动玩到终局：开倍速 + 长按不松手，减少与页面的往返
await p.evaluate(() => globalThis.__shizu.setTimeScale(12));
let modals = 0;
const dirs = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
let di = 0;
for (let i = 0; i < 120; i++) {
  const st = await p.evaluate(() => globalThis.__shizu.run?.state ?? null);
  if (['won', 'lost', 'settled'].includes(st)) break;
  if (st === 'choosing' || st === 'slotConflict') {
    try { await p.click('#modalRoot .modal-btns button:first-child', { timeout: 1500 }); modals += 1; }
    catch { /* 模态正在切换 */ }
    continue;
  }
  const k = dirs[di++ % dirs.length];
  await p.keyboard.down(k);
  await p.waitForTimeout(700);
  await p.keyboard.up(k);
}

const s2 = await p.evaluate(() => {
  const r = globalThis.__shizu.run;
  return { state: r.state, t: Math.round(r.time), stage: r.stageNo, kills: r.kills, genes: r.genes };
});
console.log(`  终局：${s2.state} · 阶段 ${s2.stage}/5 · ${s2.t}s · 噬灭 ${s2.kills} · 基因 ${s2.genes} · 三选一 ${modals} 次`);

await p.waitForTimeout(500);
await p.screenshot({ path: 'tools/shot-settle.png' });

const saved = await p.evaluate(() => globalThis.localStorage.getItem('shizu_save'));
console.log(saved ? `  ✓ 存档已落盘（${saved.length} 字节）` : '  ✗ 存档没落盘');

console.log(errs.length
  ? '\n✗ ' + errs.length + ' 项报错:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ')
  : '\n✓ 控制台零报错、零资源加载失败');
await b.close();
process.exit(errs.length ? 1 : 0);
