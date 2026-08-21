// 界面体检：把关键界面逐张截下来，供人眼/模型看「好不好看」。
// 用法：先 node tools/serve.mjs，再 node tools/shots.mjs [输出目录]
// 产物默认落在 .tmp/shots/（已 gitignore），不污染仓库。

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:8123/web/';
const OUT = path.resolve(process.argv[2] ?? '.tmp/shots');
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
p.on('requestfailed', (r) => errs.push('加载失败: ' + r.url().split('/').slice(-2).join('/')));
// 404 单独报出具体 URL —— 只说「Failed to load resource」根本没法查是哪张图缺了
p.on('response', (r) => {
  if (r.status() === 404) errs.push(`404: ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
});

let n = 0;
const shot = async (name, wait = 400) => {
  await p.waitForTimeout(wait);
  const file = path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`);
  await p.screenshot({ path: file });
  console.log('  ▸ ' + path.relative(process.cwd(), file));
};

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await shot('lobby', 1200);                       // 大厅（含粒子特效跑起来后）

// 大厅右侧状态面板展开态
await p.click('#panelToggle').catch(() => {});
await shot('lobby-panel');
await p.click('#panelToggle').catch(() => {});

// 出征：点第一个位面 → 确认弹窗
await p.click('#options button');
await p.waitForSelector('#modalRoot.show', { timeout: 5000 });
await shot('modal-confirm');

await p.click('.modal-btns button');
await p.waitForSelector('#gameCanvas', { timeout: 10000 });
await p.waitForFunction(() => (globalThis.__shizu.run?.time ?? 0) > 0.2, null, { timeout: 20000 });
await shot('battle-start', 800);

// 关掉「第一次苏醒」教学弹窗 —— 它会盖住整个战场，不关就没法看战斗画面
if (await p.isVisible('#modalRoot.show').catch(() => false)) {
  await p.click('#modalRoot .modal-btns button').catch(() => {});
  await p.waitForTimeout(300);
}

// 打一会儿，让敌人铺开、特效出现
await p.evaluate(() => globalThis.__shizu.setTimeScale(3));
await p.keyboard.down('KeyD');
await p.waitForTimeout(2500);
await p.keyboard.up('KeyD');
await shot('battle-mid');

// 推进弹窗：三选一的选项是卡片（[data-pick]），.modal-btns 里现在只剩「重掷」，
// 点后者会原地打转推不动流程。
const advanceModal = async () => {
  const pick = await p.$('#modalRoot [data-pick]');
  if (pick) { await pick.click().catch(() => {}); return; }
  await p.click('#modalRoot .modal-btns button:not([disabled])', { timeout: 1500 }).catch(() => {});
};

// 抓一次三选一
await p.evaluate(() => globalThis.__shizu.setTimeScale(12));
for (let i = 0; i < 60; i++) {
  const st = await p.evaluate(() => globalThis.__shizu.run?.state ?? null);
  if (st === 'choosing') break;
  if (st === 'slotConflict') { await advanceModal(); continue; }
  if (['won', 'lost', 'settled'].includes(st)) break;
  await p.keyboard.down('KeyD'); await p.waitForTimeout(400); await p.keyboard.up('KeyD');
}
if (await p.evaluate(() => globalThis.__shizu.run?.state) === 'choosing') await shot('battle-levelup');

// 跑到终局看结算
const dirs = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < 150; i++) {
  const st = await p.evaluate(() => globalThis.__shizu.run?.state ?? null);
  if (st === null || ['won', 'lost', 'settled'].includes(st)) break;
  if (st === 'choosing' || st === 'slotConflict') { await advanceModal(); continue; }
  await p.keyboard.down(dirs[i % 4]); await p.waitForTimeout(500); await p.keyboard.up(dirs[i % 4]);
}
await shot('settle', 900);

// —— 技能通道的三选一 ——
// 上面那局是首周目：位面路线未激活 → 属性通道 → 三选一全是属性（设计如此）。
// 技能内容只在「匹配位面」才出得来，所以这里预置一份已激活渡劫的存档重新进页面。
// 用重载而不是接着上一局切位面：结算态下还挂着模态与旧循环，直接 startPlane 会被吞掉。
await p.evaluate(() => {
  const raw = globalThis.localStorage.getItem('shizu_save');
  const s = JSON.parse(raw);
  s.player.totalRuns = 5;
  s.player.geneLocks.dujie = 3;   // 渡劫解锁到第 3 段 → 三选一应给第 4-5 段
  globalThis.localStorage.setItem('shizu_save', JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.evaluate(() => globalThis.__shizu.startPlane('dujie'));
await p.waitForFunction(() => (globalThis.__shizu.run?.time ?? 0) > 0.2, null, { timeout: 20000 });

const ch = await p.evaluate(() => globalThis.__shizu.run.dungeon.channel);
console.log(`  （渡劫位面通道：${ch}）`);

if (await p.isVisible('#modalRoot.show').catch(() => false)) {
  await p.click('#modalRoot .modal-btns button').catch(() => {});
}
await p.evaluate(() => globalThis.__shizu.setTimeScale(12));
for (let i = 0; i < 80; i++) {
  const st = await p.evaluate(() => globalThis.__shizu.run?.state ?? null);
  if (st === 'choosing') break;
  if (st === null || ['won', 'lost', 'settled'].includes(st)) break;
  if (st === 'slotConflict') { await advanceModal(); continue; }
  await p.keyboard.down('KeyD'); await p.waitForTimeout(400); await p.keyboard.up('KeyD');
}
if (await p.evaluate(() => globalThis.__shizu.run?.state) === 'choosing') {
  const kinds = await p.evaluate(() =>
    globalThis.__shizu.run.pendingOptions.options.map((o) => `${o.kind}${o.lv ? '/Lv' + o.lv : ''}`).join(' '));
  console.log(`  （技能通道三选一构成：${kinds}）`);
  await shot('levelup-skill');
} else {
  console.log('  ⚠ 没抓到技能通道的三选一');
}

console.log('\n' + (errs.length
  ? '✗ ' + errs.length + ' 项报错:\n  ' + [...new Set(errs)].slice(0, 10).join('\n  ')
  : '✓ 控制台零报错、零资源加载失败'));
await b.close();
