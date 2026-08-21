// 无头浏览器端到端验证：真的开一局、打一局、看结算。
// 用法：先 node tools/serve.mjs，再 node tools/e2e.mjs
// 依赖 playwright（仅开发期验证用，不进游戏运行时）。

import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:8123/web/';
const errors = [];
let step = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  ✗ ${msg}`); };

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });
page.on('requestfailed', (r) => consoleErrors.push(`requestfailed: ${r.url()}`));

console.log(`\n▶ 打开 ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

// —— 1. 页面加载 ——
console.log('\n[1] 页面加载与大厅');
await page.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 5000 });
const title = await page.$eval('#sceneTitle', (el) => el.textContent);
title === '虫巢' ? ok(`大厅渲染：${title}`) : fail(`大厅标题异常：${title}`);

const optCount = await page.$$eval('#options button', (b) => b.length);
optCount === 5 ? ok(`大厅 5 个操作入口`) : fail(`大厅入口数异常：${optCount}`);

const power = await page.$eval('#meta', (el) => el.textContent);
power.includes('战力 1.00') ? ok(`新档战力 1.00`) : fail(`新档战力异常：${power}`);

// —— 2. 开裂缝 ——
console.log('\n[2] 开裂缝');
await page.click('#options button');            // ⚔ 开启裂缝
await page.waitForSelector('#modalRoot.show', { timeout: 3000 });
const riftTitle = await page.$eval('.modal h3', (el) => el.textContent);
riftTitle.includes('机关城') ? ok(`首进固定机关城（红线 7）：${riftTitle}`) : fail(`首进位面异常：${riftTitle}`);
const riftBody = await page.$eval('.modal-body', (el) => el.textContent);
riftBody.includes('通道') ? ok('裂缝卡展示通道类型') : fail('裂缝卡缺通道信息');
riftBody.includes('首次进入') ? ok('首进警告已展示（激活+封印不可撤销）') : fail('缺首进警告');

await page.click('.modal-btns button');         // 撕开裂缝，进入
await page.waitForFunction(() => !!globalThis.__shizu.ctx.run, null, { timeout: 3000 });
await page.waitForSelector('#btnAdvance', { state: 'visible', timeout: 3000 });
ok('已进入副本');
await page.screenshot({ path: 'tools/screenshot-battle.png' });

// —— 3. 打完整局 ——
console.log('\n[3] 战斗推进（自动点「前进」/ 三选一取第一项）');
let choices = 0;
let advances = 0;
for (let i = 0; i < 6000; i++) {
  const snap = await page.evaluate(() => globalThis.__shizu.snapshot());
  // 'settled' = renderBattle 已弹出结算框（showSettle 内部会立刻 finalize）
  if (['won', 'lost', 'settled'].includes(snap.state) || snap.state === null) break;

  const modalOpen = await page.$('#modalRoot.show');
  if (modalOpen) {
    // 三选一的选项是卡片（[data-pick]），不是 .modal-btns 里的按钮 ——
    // .modal-btns 现在只剩「重掷」，点它会原地打转、推不动流程。
    const pick = await page.$('#modalRoot [data-pick]');
    if (pick) {
      await pick.click();
    } else {
      const btns = await page.$$('#modalRoot .modal-btns button:not([disabled])');
      if (!btns.length) { fail('模态框没有可点按钮，卡死'); break; }
      await btns[0].click();
    }
    choices += 1;
  } else {
    await page.click('#btnAdvance');
    advances += 1;
  }
  step = i;
}
ok(`推进 ${advances} 次交锋，处理 ${choices} 次弹窗`);

const snap = await page.evaluate(() => globalThis.__shizu.snapshot());
const victory = await page.evaluate(() => globalThis.__shizu.run?.result?.victory ?? null);
console.log(`     终局：state=${snap.state} 阶段=${snap.stage}/5 基因=${snap.genes} HP=${Math.round(snap.hp ?? 0)}`);
snap.state === 'settled' ? ok(`一局正常结束（${victory ? '通关' : '身陨'}）`) : fail(`未走到终局：${snap.state}`);
snap.genes > 0 ? ok(`吞噬到基因：${snap.genes}`) : fail('全程零基因，掉落链可能断了');

// —— 4. 结算 ——
console.log('\n[4] 结算');
await page.waitForSelector('#modalRoot.show', { timeout: 3000 });
const settleBody = await page.$eval('.modal-body', (el) => el.textContent);
/评级\s*[SABC]/.test(settleBody) ? ok('结算页有评级') : fail('结算页缺评级');
settleBody.includes('动态系数') ? ok('结算页展示难度进化') : fail('结算页缺难度进化');
if (settleBody.includes('永久激活基因锁')) ok('首进激活基因锁已触发');
if (settleBody.includes('永久封印')) ok('互斥封印提示已展示');

await page.click('.modal-btns button');         // 回大厅
await page.waitForFunction(() => globalThis.__shizu.ctx.run === null, null, { timeout: 3000 });

// —— 5. 存档持久化 ——
console.log('\n[5] 存档落盘与重载');
const after = await page.evaluate(() => ({
  runs: globalThis.__shizu.save.player.totalRuns,
  locks: globalThis.__shizu.save.player.geneLocks,
  sealed: globalThis.__shizu.save.player.sealedRoutes,
  bag: globalThis.__shizu.save.player.gearBag.length,
  raw: globalThis.localStorage.getItem('shizu_save'),
}));
after.runs === 1 ? ok('totalRuns = 1') : fail(`totalRuns 异常：${after.runs}`);
after.raw ? ok(`已写入 localStorage（${after.raw.length} 字节）`) : fail('存档没落盘');
after.locks.qiji >= 1 ? ok(`奇技基因锁已激活 Lv${after.locks.qiji}`) : fail('机关城通关/身陨后未激活奇技');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 5000 });
const reloaded = await page.evaluate(() => globalThis.__shizu.save.player.totalRuns);
reloaded === after.runs ? ok(`刷新后存档保留（totalRuns=${reloaded}）`) : fail(`刷新后存档丢失：${reloaded}`);

// —— 6. 图鉴 / 背包 ——
console.log('\n[6] 图鉴与背包');
const buttons = await page.$$('#options button');
await buttons[2].click();                        // 📖 进化图鉴
await page.waitForSelector('#modalRoot.show', { timeout: 3000 });
const codex = await page.$eval('.modal-body', (el) => el.textContent);
codex.includes('基因锁 · 10 路线') ? ok('图鉴列出 10 路线') : fail('图鉴缺路线');
codex.includes('位面图鉴 · 12 副本') ? ok('图鉴列出 12 位面') : fail('图鉴缺位面');
if (codex.includes('你的血脉拒绝了它')) ok('封印文案已展示');
await page.click('.modal-btns button');

const buttons2 = await page.$$('#options button');
await buttons2[1].click();                       // 🎒 装备背包
await page.waitForSelector('#modalRoot.show', { timeout: 3000 });
const bag = await page.$eval('.modal-body', (el) => el.textContent);
ok(`背包打开（${after.bag} 件装备）`);
if (after.bag > 0) {
  const equipBtn = await page.$('.bag-btns button[data-act="equip"]');
  if (equipBtn) {
    await equipBtn.click();
    await new Promise((r) => setTimeout(r, 120));
    const worn = await page.evaluate(() => Object.keys(globalThis.__shizu.save.player.gear).length);
    worn > 0 ? ok('穿戴装备成功') : fail('穿戴无效');
  }
}

// —— 7. 截图 ——
await page.click('.modal-btns button[data-i="2"]').catch(() => {});
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: 'tools/screenshot-lobby.png' });
ok('已截图 tools/screenshot-lobby.png');

// —— 汇总 ——
console.log('\n' + '─'.repeat(56));
if (consoleErrors.length) {
  console.log('浏览器控制台报错：');
  for (const e of [...new Set(consoleErrors)]) console.log('  ✗ ' + e);
  errors.push(...consoleErrors);
} else {
  console.log('✓ 浏览器控制台零报错、零资源加载失败');
}
console.log(errors.length ? `\n✗ ${errors.length} 项失败` : '\n✓ 端到端验证全部通过');

await browser.close();
process.exit(errors.length ? 1 : 0);
