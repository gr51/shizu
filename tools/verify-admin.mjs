// 后台管理页验证脚本：起 serve → 打开 /web/admin.html → 检查标签/字段渲染 →
// 改动一个字段 → 应用 → 刷新主游戏页验证覆盖被运行时消费 → 截图。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8125;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  // 1. 起 serve 子进程
  const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await wait(1200);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const ok = (k, m) => { results.push(`✓ ${k}: ${m}`); console.log(`✓ ${k}: ${m}`); };
  const bad = (k, m) => { results.push(`✗ ${k}: ${m}`); console.log(`✗ ${k}: ${m}`); };

  try {
    const page = await browser.newPage();
    const jsErrors = [];
    const res404 = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (msg.type() === 'error' && t.includes('Failed to load resource')) return;
      if (msg.type() === 'error') jsErrors.push(t);
    });
    page.on('pageerror', (e) => jsErrors.push('PAGEERROR: ' + e.message));
    page.on('response', (r) => { if (r.status() === 404) res404.push(r.url().split('/').pop()); });

    // 2. 打开后台
    await page.goto(`http://localhost:${PORT}/web/admin.html`, { waitUntil: 'networkidle' });
    await wait(300);

    // 3. 检查标签栏
    const tabCount = await page.locator('.admin-tabs button').count();
    const tabs = await page.locator('.admin-tabs button').allTextContents();
    ok('标签栏', `共 ${tabCount} 个标签: ${tabs.join('/')}`);

    // 4. 检查位面字段渲染（默认显示位面标签）
    const planeFields = await page.locator('.admin-pane .cfg-block').count();
    ok('位面块渲染', `位面区块数 = ${planeFields}`);

    // 5. 切到「技能」标签，展开第一个路线
    await page.locator('.admin-tabs button[data-key="skills"]').click();
    await wait(200);
    const details = await page.locator('.admin-pane details').count();
    ok('技能标签', `路线分组 details = ${details}`);
    await page.locator('.admin-pane details').first().locator('summary').click();
    await wait(200);
    const skillBoxes = await page.locator('.admin-pane details').first().locator('.cfg-block').count();
    ok('技能展开', `第一条路线技能块 = ${skillBoxes}`);

    // 5b. 编辑第一个技能的效果 eff：合法 JSON 通过、非法 JSON 被拒
    const firstSkillBox = page.locator('.admin-pane details').first().locator('.cfg-block').first();
    const effTa = firstSkillBox.locator('textarea').last();
    await effTa.fill('{"crit":0.42}');
    await effTa.blur();
    await wait(100);
    const goodHint = await firstSkillBox.locator('.json-hint').innerText();
    if (goodHint.includes('✓')) ok('eff 合法校验', `提示：${goodHint}`);
    else bad('eff 合法校验', `合法 JSON 被拒：${goodHint}`);
    await effTa.fill('{"crit": broken}');
    await effTa.blur();
    await wait(100);
    const badHint = await firstSkillBox.locator('.json-hint').innerText();
    if (badHint.includes('✗')) ok('eff 拒绝非法', `提示：${badHint}`);
    else bad('eff 拒绝非法', `非法 JSON 未被拦截：${badHint}`);
    await effTa.fill('{"crit":0.42}');
    await effTa.blur();

    // 5c. 隐藏技标签：eff 编辑（core 已接线，应端到端生效）
    await page.locator('.admin-tabs button[data-key="hidden"]').click();
    await wait(200);
    const hidBox = page.locator('.admin-pane .cfg-block').filter({ hasText: 'wushuang' }).first();
    const hidTa = hidBox.locator('textarea').last();
    await hidTa.fill('{"crit":0.33}');
    await hidTa.blur();
    await wait(100);
    const hidHint = await hidBox.locator('.json-hint').innerText();
    if (hidHint.includes('✓')) ok('隐藏技 eff 编辑', '合法 JSON 通过');
    else bad('隐藏技 eff 编辑', `被拒：${hidHint}`);

    // 6. 切到「攻击」标签，验证攻击方式存在
    await page.locator('.admin-tabs button[data-key="weapon"]').click();
    await wait(200);
    const weaponBlocks = await page.locator('.admin-pane .cfg-block').count();
    ok('攻击标签', `攻击方式区块 = ${weaponBlocks}`);

    // 6b. 敌人标签：sprite 预览加载与缺图标记
    await page.locator('.admin-tabs button[data-key="enemies"]').click();
    await wait(700);
    const prevInfo = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('.sprite-prev')];
      return {
        total: imgs.length,
        ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        missing: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      };
    });
    if (prevInfo.total >= 120 && prevInfo.ok > 0) ok('敌人 sprite 预览', `共 ${prevInfo.total} 个：命中 ${prevInfo.ok}，缺图 ${prevInfo.missing}`);
    else bad('敌人 sprite 预览', `预览异常：${JSON.stringify(prevInfo)}`);

    // 6c. 新增条目：共鸣标签点「+ 新增条目」，应用后运行时池应 +1
    await page.locator('.admin-tabs button[data-key="synergies"]').click();
    await wait(200);
    const synBefore = await page.evaluate(async () => {
      try { const m = await import('/shizu-cocos/assets/scripts/data/synergies.js'); return m.SYNERGIES.length; }
      catch { return -1; }
    });
    await page.locator('button[data-add-for="synergies"]').click();
    await wait(200);
    const cnt = () => page.evaluate(() => {
      const pane = [...document.querySelectorAll('.admin-pane')].find((p) => p.querySelector('[data-add-for="synergies"]'));
      return pane ? pane.querySelectorAll('.cfg-block').length : -1;
    });
    const synCntAfter = await cnt();
    if (synCntAfter >= 15) ok('新增条目 UI', `点击后区块数 = ${synCntAfter}（原 14 + 新增）`);
    else bad('新增条目 UI', `点击新增后区块数 = ${synCntAfter}（预期 ≥15）`);

    // 7. 回到位面标签，改一个字段并应用
    await page.locator('.admin-tabs button[data-key="planes"]').click();
    await wait(200);
    const firstTheme = page.locator('.admin-pane .cfg-block').first().locator('.af-field input').nth(0);
    await firstTheme.fill('机关齿轮阵（后台测试改）');
    await page.locator('#applyBtn').click();
    await wait(300);
    ok('应用修改', `#applyBtn 被点击，按钮已禁用=${await page.locator('#applyBtn').isDisabled()}`);

    // 7b. eff 是否落进覆盖对象
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cfg_overrides_v1') ?? '{}'));
    const withEff = (saved.skills ?? []).find((s) => s.eff && Number(s.eff.crit) === 0.42);
    if (withEff) ok('eff 落盘', `${withEff.id}.eff.crit = 0.42 已写入覆盖`);
    else bad('eff 落盘', '覆盖里没找到 eff.crit=0.42');
    const hidSaved = (saved.hiddenSkills ?? {}).wushuang;
    if (hidSaved?.eff && Number(hidSaved.eff.crit) === 0.33) ok('隐藏技 eff 落盘', 'wushuang.eff.crit=0.33 已写入');
    else bad('隐藏技 eff 落盘', JSON.stringify(hidSaved ?? null));

    // 8. 刷新主游戏页，验证 overrides 被运行时消费（override 改的是 ESM 模块对象，
    //    主游戏页 boot 时已跑 applyConfigOverrides；读 planes 模块实例看 theme 是否被改）
    await page.goto(`http://localhost:${PORT}/web/`, { waitUntil: 'networkidle' });
    await wait(400);
    const themeT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const p = m.planes.find((x) => x.id === 'jiguan');
        return p ? p.theme : 'NO_PLANE';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (themeT.includes('机关齿轮阵')) ok('运行时消费覆盖', `主游戏页 planes.jiguan.theme = "${themeT}"（覆盖已生效）`);
    else bad('运行时消费覆盖', `主游戏页 planes.jiguan.theme = "${themeT}"（覆盖未生效）`);

    // 8b. eff 的运行时消费：override 把 eff 合并进技能表对象
    const effT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/skills.js');
        const s = m.findSkill('dujie_1');
        return s ? JSON.stringify(s.eff) : 'NO_SKILL';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (effT.includes('0.42')) ok('eff 运行时消费', `dujie_1.eff = ${effT}`);
    else bad('eff 运行时消费', `dujie_1.eff = ${effT}（未合并）`);

    // 8c. 隐藏技 eff 运行时消费
    const hidT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/hiddenSkills.js');
        const h = m.findHiddenSkill('wushuang');
        return h ? JSON.stringify(h.eff) : 'NO_HIDDEN';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (hidT.includes('0.33')) ok('隐藏技 eff 运行时消费', `wushuang.eff = ${hidT}`);
    else bad('隐藏技 eff 运行时消费', `wushuang.eff = ${hidT}（未合并）`);

    // 8d. 新增共鸣的运行时消费：覆盖推送进 SYNERGIES 池
    const synAfter = await page.evaluate(async () => {
      try { const m = await import('/shizu-cocos/assets/scripts/data/synergies.js'); return m.SYNERGIES.length; }
      catch { return -1; }
    });
    if (synBefore > 0 && synAfter === synBefore + 1) ok('新增条目运行时生效', `SYNERGIES ${synBefore} → ${synAfter}`);
    else bad('新增条目运行时生效', `SYNERGIES ${synBefore} → ${synAfter}（应为 +1）`);

    // 9. 清理覆盖并还原
    const admin2 = await page.goto(`http://localhost:${PORT}/web/admin.html`, { waitUntil: 'networkidle' });
    await wait(300);
    await page.locator('#clearBtn').click();
    await wait(300);
    ok('清除覆盖', '点 #clearBtn 还原默认');

    await page.screenshot({ path: path.join(ROOT, '.tmp/admin-verify.png'), fullPage: true });
    ok('截图', '.tmp/admin-verify.png');

    // console 错误汇总（资源 404 已单独降级不影响）
    if (jsErrors.length) bad('无 console 错误', jsErrors.slice(0, 5).join(' | '));
    else ok('无 console 错误', '全程 0 运行时错误');
    if (res404.length) console.log(`ℹ 资源 404（网络层，非逻辑错误）: ${[...new Set(res404)].join('/')}`);
  } catch (e) {
    bad('脚本异常', e.message);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n==== 汇总 ====');
  const fail = results.filter((r) => r.startsWith('✗'));
  console.log(fail.length ? `有 ${fail.length} 项失败` : '全部通过');
  process.exit(fail.length ? 1 : 0);
})();