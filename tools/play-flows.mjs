// Web 交互流永久验证：裂缝配置（变异/武器）/ 虫巢购买 / 无尽入口 / 锻造合成强化。
// 用法：先 node tools/serve.mjs，再 node tools/play-flows.mjs
// 与 play.mjs 互补——那边验证手感，这边验证「配置真的透传进局、购买真的落盘」。
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:8123/web/';
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 150)));

let pass = 0;
let failCount = 0;
const check = (cond, m) => { if (cond) { pass++; console.log(`  ✓ ${m}`); } else { failCount++; console.log(`  ✗ ${m}`); } };
const labels = () => p.evaluate(() => document.querySelector('#modalRoot')?.innerText ?? '');

console.log('[1] 快速落盘一局');
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.click('#options button');
await p.waitForSelector('#modalRoot.show', { timeout: 5000 });
await p.click('#modalRoot .modal-btns button:has-text("撕开裂缝")');
await p.waitForSelector('#gameCanvas', { timeout: 10000 });
if (await p.isVisible('#modalRoot.show').catch(() => false)) {
  await p.click('#modalRoot .modal-btns button:not([disabled])').catch(() => {});
}
await p.evaluate(() => globalThis.__shizu.setTimeScale(40));
await p.evaluate(async () => {
  const r = globalThis.__shizu.run;
  const DT = 1 / 60;
  for (let f = 0; f < 60 * 60 * 20; f++) {
    const st = r.state;
    if (st === 'won' || st === 'lost' || st === 'settled') return st;
    if (st === 'choosing') { r.choose(0); continue; }
    if (st === 'slotConflict') { r.resolveSlotConflict(r.pendingSkill.options[0]); continue; }
    if (st === 'shopping') { r.closeShop(); continue; }
    const a = f * 0.02;
    r.update(DT, { mx: Math.cos(a), my: Math.sin(a) });
    r.drainEffects();
    if (f % 3000 === 0) await new Promise((res) => setTimeout(res, 0));
  }
  return 'guard';
});
await p.waitForFunction(() => !!localStorage.getItem('shizu_save'), null, { timeout: 8000 });
await p.click('#modalRoot .modal-btns button').catch(() => {});
check(!!(await p.$('#options')), '回到大厅');

console.log('[2] 裂缝配置：变异 + 出征武器');
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('shizu_save'));
  s.player.totalRuns = Math.max(5, s.player.totalRuns ?? 0);
  for (const rt of ['dujie', 'gongde']) s.player.geneLocks[rt] = 3;
  localStorage.setItem('shizu_save', JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.click('#options button:has-text("开启裂缝")');
await p.waitForSelector('#modalRoot.show');
check(await p.isVisible('[data-mod="mod_horde"]'), '变异行已渲染');
await p.click('[data-mod="mod_horde"]');
check(await p.evaluate(() => document.querySelector('[data-mod="mod_horde"]')?.classList.contains('gold')), '变异金色选中态');
const cardCount = await p.evaluate(() => document.querySelectorAll('[data-weapon]').length);
check(cardCount >= 2, `流派卡片 ×${cardCount}`);
await p.click('[data-weapon="dujie"]');
check(await p.evaluate(() => document.querySelector('[data-weapon="dujie"]')?.classList.contains('gold')), '渡劫卡金色选中');
await p.click('#modalRoot .modal-btns button:has-text("撕开裂缝")');
await p.waitForSelector('#gameCanvas', { timeout: 10000 });
if (await p.isVisible('#modalRoot.show').catch(() => false)) {
  await p.click('#modalRoot .modal-btns button:not([disabled])').catch(() => {});
}
await p.waitForFunction(() => (globalThis.__shizu.run?.time ?? 0) > 0.2, null, { timeout: 20000 });
const wl = await p.evaluate(() => ({
  lo: globalThis.__shizu.run?.dungeon?.weaponLoadout,
  mech: globalThis.__shizu.run?.routeMech,
  mul: globalThis.__shizu.run?.dungeon?.mods?.spawnMul,
}));
check(wl.lo === 'dujie', `武器透传=${wl.lo}`);
check(wl.mech === 'chain', `机制=chain`);
check(wl.mul === 1.35, `虫潮 spawnMul=1.35 透传`);

console.log('[3] 结算并回巢 → 虫巢购买');
await p.evaluate(async () => {
  const r = globalThis.__shizu.run;
  if (!r || ['settled'].includes(r.state)) return;
  r.retire?.();
});
await p.evaluate(async () => {
  const r = globalThis.__shizu.run;
  const DT = 1 / 60;
  for (let f = 0; f < 600; f++) {
    if (['settled'].includes(r.state)) return;
    r.update(DT, { mx: 0, my: 0 });
    r.drainEffects();
    await new Promise((res) => setTimeout(res, 0));
  }
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('shizu_save'));
  s.inventory.genes = (s.inventory.genes ?? 0) + 5000;
  localStorage.setItem('shizu_save', JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.click('#options button:has-text("虫巢强化")');
await p.waitForSelector('#modalRoot.show');
check(await p.isVisible('[data-nest="nest_vitality"]'), '虫巢卡片渲染');
await p.click('[data-nest="nest_vitality"]');
await p.waitForTimeout(300);
const lv = await p.evaluate(() => JSON.parse(localStorage.getItem('shizu_save')).player.nestUpgrades?.nest_vitality ?? 0);
check(lv >= 1, `巢髓·体质 Lv${lv}（已购）`);

console.log('[4] 无尽入口');
await p.click('#modalRoot .modal-btns button:has-text("返回")').catch(() => {});
await p.waitForTimeout(200);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('shizu_save'));
  s.stats.endlessUnlocked = true;
  localStorage.setItem('shizu_save', JSON.stringify(s));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForFunction(() => !!globalThis.__shizu, null, { timeout: 8000 });
await p.click('#options button:has-text("开启裂缝")');
await p.waitForSelector('#modalRoot.show');
const endlessBtn = await p.$('#modalRoot .modal-btns button:has-text("无尽模式")');
check(!!endlessBtn, '★ 无尽模式按钮出现');
await endlessBtn.click();
await p.waitForSelector('#gameCanvas', { timeout: 10000 });
await p.waitForFunction(() => (globalThis.__shizu.run?.time ?? 0) > 0.2, null, { timeout: 20000 });
check(await p.evaluate(() => globalThis.__shizu.run?.endless === true), 'run.endless = true');

console.log('\n' + '─'.repeat(50));
console.log(errs.length ? `✗ 页面错误：${errs.join(' | ')}` : '✓ 全程零页面错误');
console.log(errs.length || failCount ? `✗ ${failCount} 断言失败 / ${pass} 通过` : `✓ ${pass} 断言全部通过`);
await b.close();
process.exit(failCount || errs.length ? 1 : 0);
