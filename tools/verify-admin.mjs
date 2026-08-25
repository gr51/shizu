// 后台管理页验证脚本：起 serve → 打开 /web/admin.html → 检查标签/字段渲染 →
// 改动一个字段 → 应用 → 刷新主游戏页验证覆盖被运行时消费 → 截图。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
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
  const jsErrors = [];
  const res404 = [];

  try {
    const page = await browser.newPage();
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
    const details = await page.locator('.admin-pane:visible details').count();
    ok('技能标签', `路线分组 details = ${details}`);
    await page.locator('.admin-pane:visible details').first().locator('summary').click();
    await wait(200);
    const skillBoxes = await page.locator('.admin-pane:visible details').first().locator('.cfg-block').count();
    ok('技能展开', `第一条路线技能块 = ${skillBoxes}`);

    // 5b. 编辑第一个技能的效果 eff：合法 JSON 通过、非法 JSON 被拒
    const firstSkillBox = page.locator('.admin-pane:visible details').first().locator('.cfg-block').first();
    const skillNameIn = firstSkillBox.locator('.af-field').filter({ hasText: '名称' }).locator('input');
    await skillNameIn.fill('雷击附魔·后台测试');
    const effTa = firstSkillBox.locator('.af-field').filter({ hasText: '效果 eff' }).locator('textarea');
    const visualTa = firstSkillBox.locator('.af-field').filter({ hasText: '视觉 visual' }).locator('textarea');
    await effTa.fill('{"crit":0.42}');
    await effTa.blur();
    await wait(100);
    const effHintEl = firstSkillBox.locator('.af-field').filter({ hasText: '效果 eff' }).locator('.json-hint');
    const goodHint = await effHintEl.innerText();
    if (goodHint.includes('✓')) ok('eff 合法校验', `提示：${goodHint}`);
    else bad('eff 合法校验', `合法 JSON 被拒：${goodHint}`);
    await effTa.fill('{"crit": broken}');
    await effTa.blur();
    await wait(100);
    const badHint = await effHintEl.innerText();
    if (badHint.includes('✗')) ok('eff 拒绝非法', `提示：${badHint}`);
    else bad('eff 拒绝非法', `非法 JSON 未被拦截：${badHint}`);
    await effTa.fill('{"crit":0.42}');
    await effTa.blur();

    await visualTa.fill('{"fxKind":"heal","color":"#123456"}');
    await visualTa.blur();
    await wait(100);
    const visualHint = await firstSkillBox.locator('.af-field').filter({ hasText: '视觉 visual' }).locator('.json-hint').innerText();
    if (visualHint.includes('✓')) ok('技能 visual 编辑', 'fxKind/color 合法 JSON 通过');
    else bad('技能 visual 编辑', `被拒：${visualHint}`);

    // 5c. 隐藏技标签：eff 编辑（core 已接线，应端到端生效）
    await page.locator('.admin-tabs button[data-key="hidden"]').click();
    await wait(200);
    const hidBox = page.locator('.admin-pane .cfg-block').filter({ hasText: 'wushuang' }).first();
    const hidTa = hidBox.locator('.af-field').filter({ hasText: '效果 eff' }).locator('textarea');
    await hidTa.fill('{"crit":0.33}');
    await hidTa.blur();
    await wait(100);
    const hidHint = await hidBox.locator('.af-field').filter({ hasText: '效果 eff' }).locator('.json-hint').innerText();
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

    // 6d. 新增位面：位面标签点「+ 新增条目」
    await page.locator('.admin-tabs button[data-key="planes"]').click();
    await wait(200);
    await page.locator('button[data-add-for="planes"]').click();
    await wait(200);
    const planeBlocks = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.admin-pane')].find((p) => p.querySelector('[data-add-for="planes"]'));
      return pane ? [...pane.querySelectorAll('.cfg-block')].filter((b) => b.textContent.includes('（新增）')).length : -1;
    });
    if (planeBlocks === 1) ok('新增位面 UI', '出现 1 个「（新增）」位面块');
    else bad('新增位面 UI', `新增块数 = ${planeBlocks}（预期 1）`);

    // 6d2. 位面工程编辑器：创建地图对象实例并编辑检查器
    await page.locator('.admin-tabs button[data-key="world"]').click();
    await wait(400);
    if (await page.locator('#worldCanvas').isVisible()) ok('位面工程编辑器', '三栏工程画布已渲染');
    else bad('位面工程编辑器', '#worldCanvas 不可见');
    await page.locator('#worldObjectType').selectOption('unit');
    await page.locator('#worldAddObject').click();
    let inspector = page.locator('.world-inspector');
    await inspector.locator('.world-field').filter({ hasText: '名称' }).locator('input').fill('地图小怪A');
    await inspector.locator('.world-field').filter({ hasText: '模型 sprite' }).locator('input').fill('anqi');
    await inspector.locator('.world-field').filter({ hasText: '行为' }).locator('select').selectOption('tank');
    await inspector.locator('.world-field').filter({ hasText: 'HP' }).locator('input').fill('88');
    await page.locator('#worldObjectType').selectOption('boss');
    await page.locator('#worldAddObject').click();
    await inspector.locator('.world-field').filter({ hasText: '名称' }).locator('input').fill('地图BossA');
    await inspector.locator('.world-field').filter({ hasText: '模型 sprite' }).locator('input').fill('aofa_boss');
    await inspector.locator('.world-field').filter({ hasText: 'Boss技能' }).locator('select').selectOption('ring');
    await page.locator('#worldObjectType').selectOption('region');
    await page.locator('#worldAddObject').click();
    await inspector.locator('.world-field').filter({ hasText: '名称' }).locator('input').fill('伏击区域');
    await inspector.locator('.world-field').filter({ hasText: '进入事件' }).locator('select').selectOption('onAmbushSpawn');
    const worldRows = await page.locator('.world-object-row').count();
    if (worldRows === 3) ok('位面工程·对象实例', '小怪/Boss/区域共3个对象已创建');
    else bad('位面工程·对象实例', `对象数=${worldRows}（预期3）`);
    // 撤销/重做：新建→Ctrl+D 复制→Ctrl+Z 回退→Ctrl+Y 重做
    await page.locator('#worldObjectType').selectOption('unit');
    await page.locator('#worldAddObject').click();
    await wait(120);
    await page.keyboard.press('Control+d');
    await wait(120);
    const rowsAfterDup = await page.locator('.world-object-row').count();
    if (rowsAfterDup === worldRows + 2) ok('工程·复制对象', `Ctrl+D 后 ${rowsAfterDup} 个`);
    else bad('工程·复制对象', `${rowsAfterDup}（预期 ${worldRows + 2}）`);
    await page.keyboard.press('Control+z');
    await wait(120);
    const rowsAfterUndo = await page.locator('.world-object-row').count();
    await page.keyboard.press('Control+y');
    await wait(120);
    const rowsAfterRedo = await page.locator('.world-object-row').count();
    if (rowsAfterUndo === rowsAfterDup - 1) ok('工程·撤销', `Ctrl+Z 回退到 ${rowsAfterUndo}`);
    else bad('工程·撤销', `${rowsAfterUndo}（预期 ${rowsAfterDup - 1}）`);
    if (rowsAfterRedo === rowsAfterDup) ok('工程·重做', `Ctrl+Y 回到 ${rowsAfterRedo}`);
    else bad('工程·重做', `${rowsAfterRedo}（预期 ${rowsAfterDup}）`);
    // 框选多选：从空白处拖矩形罩住中心簇 → 多选 2 → Delete 批量删 → Ctrl+Z 恢复
    const wb = await page.locator('#worldCanvas').boundingBox();
    const wcx = wb.x + wb.width / 2, wcy = wb.y + wb.height / 2;
    await page.mouse.move(wcx - 120, wcy - 120);
    await page.mouse.down();
    await page.mouse.move(wcx + 60, wcy + 60, { steps: 5 });
    await page.mouse.up();
    await wait(150);
    const statusText = await page.locator('.world-status').innerText();
    if (statusText.includes(`多选 ${rowsAfterRedo}`)) ok('工程·框选多选', `拖框选中全部 ${rowsAfterRedo} 个对象`);
    else bad('工程·框选多选', `状态栏：${statusText}`);
    await page.keyboard.press('Delete');
    await wait(150);
    const rowsAfterBatchDel = await page.locator('.world-object-row').count();
    if (rowsAfterBatchDel === 0) ok('工程·批量删除', '框选对象已全部删除');
    else bad('工程·批量删除', `${rowsAfterBatchDel}（预期 0）`);
    await page.keyboard.press('Control+z');
    await wait(150);
    const rowsAfterRestore = await page.locator('.world-object-row').count();
    if (rowsAfterRestore === rowsAfterRedo) ok('工程·批量撤销', `Ctrl+Z 恢复到 ${rowsAfterRestore}`);
    else bad('工程·批量撤销', `${rowsAfterRestore}（预期 ${rowsAfterRedo}）`);

    // 多选对齐/分布：框选全部 → 水平分布等距 → 垂直居中同 Y
    await page.mouse.move(wcx - 120, wcy - 120);
    await page.mouse.down();
    await page.mouse.move(wcx + 60, wcy + 60, { steps: 5 });
    await page.mouse.up();
    await wait(150);
    const distCheck = await page.evaluate(() => {
      const xs0 = globalThis.__worldEditorApi.objects().map((o) => o.x).sort((a, b) => a - b);
      return { n: xs0.length, span0: xs0[xs0.length - 1] - xs0[0] };
    });
    if (distCheck.n < 3) { bad('工程·水平分布', `对象数 ${distCheck.n}（预期 ≥3）`); }
    else {
      await page.locator('.world-batch button[data-walign="distH"]').click();
      await wait(120);
      const r1 = await page.evaluate(() => {
        const xs = globalThis.__worldEditorApi.objects().map((o) => o.x).sort((a, b) => a - b);
        const step = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
        let eq = true;
        for (let i = 1; i < xs.length; i++) if (Math.abs((xs[i] - xs[i - 1]) - step) > 1.5) eq = false;
        return eq ? `EQ:${xs.join(',')}` : `UNEVEN:${xs.join(',')}`;
      });
      if (String(r1).startsWith('EQ:')) ok('工程·水平分布', r1);
      else bad('工程·水平分布', String(r1));
      await page.locator('.world-batch button[data-walign="cy"]').click();
      await wait(120);
      const cyOk = await page.evaluate(() => {
        const ys = globalThis.__worldEditorApi.objects().map((o) => o.y);
        return Math.max(...ys) - Math.min(...ys) <= 0.2;
      });
      if (cyOk) ok('工程·垂直居中', '全部对象 Y 已对齐');
      else bad('工程·垂直居中', 'Y 未对齐');
    }

    // 模板库：选中对象存为模板 → 行出现 → 点击放置实例 +1 → Ctrl+Z 回退
    await page.locator('.world-inspector button:has-text("存为模板")').click();
    await wait(120);
    const tplRows = await page.locator('.world-tpl-row').count();
    if (tplRows >= 1) ok('工程·存模板', `模板库 ${tplRows} 条`);
    else bad('工程·存模板', '无模板行');
    const objsBeforeTpl = await page.evaluate(() => globalThis.__worldEditorApi.objects().length);
    await page.locator('.world-tpl-place').first().click();
    await wait(120);
    const objsAfterTpl = await page.evaluate(() => globalThis.__worldEditorApi.objects().length);
    if (objsAfterTpl === objsBeforeTpl + 1) ok('工程·模板放置', `${objsBeforeTpl} → ${objsAfterTpl}`);
    else bad('工程·模板放置', `${objsBeforeTpl} → ${objsAfterTpl}`);
    await page.keyboard.press('Control+z');
    await wait(120);
    const objsUndoTpl = await page.evaluate(() => globalThis.__worldEditorApi.objects().length);
    if (objsUndoTpl === objsBeforeTpl) ok('工程·模板放置可撤销', `回退到 ${objsUndoTpl}`);
    else bad('工程·模板放置可撤销', String(objsUndoTpl));

    // 地砖涂刷：开启涂砖模式 → 画笔 floor_dujie → 拖拽覆盖两个单元 → 状态栏计数 → 关闭模式
    await page.locator('#worldTileBrush').fill('floor_dujie');
    await page.locator('#worldPaintToggle').click();
    await wait(120);
    const tb = await page.locator('#worldCanvas').boundingBox();
    const tcx = tb.x + tb.width / 2, tcy = tb.y + tb.height / 2;
    await page.mouse.move(tcx - 140, tcy - 140);
    await page.mouse.down();
    await page.mouse.move(tcx - 20, tcy - 20, { steps: 4 });
    await page.mouse.up();
    await wait(150);
    const tileStatus = await page.locator('.world-status').innerText();
    const tileCount = Number((tileStatus.match(/地砖 (\d+)/) ?? [])[1] ?? 0);
    if (tileCount >= 1 && tileCount <= 9) ok('工程·地砖涂刷', `拖拽写入 ${tileCount} 个地砖单元`);
    else bad('工程·地砖涂刷', tileStatus);
    await page.keyboard.press('KeyB');   // B 键关涂砖（避免影响后续框选/试玩）
    await wait(120);
    // 一键试玩：点击后应先落盘再开新页，URL 带 worldTest=jiguan
    await page.evaluate(() => { globalThis.__capturedOpen = null; window.open = (u) => { globalThis.__capturedOpen = String(u); return null; }; });
    await page.locator('#worldPlaytest').click();
    await wait(150);
    const openUrl = await page.evaluate(() => globalThis.__capturedOpen);
    if (openUrl?.includes('worldTest=jiguan')) ok('工程·一键试玩', openUrl);
    else bad('工程·一键试玩', String(openUrl));

    // 克隆位面工程：深拷贝当前位面为新位面，下拉自动切换，对象/地砖/模板随行
    await page.evaluate(() => { window.prompt = () => '机关城二号'; });
    const planeOptsBefore = await page.locator('#worldPlane option').count();
    await page.locator('#worldClonePlane').click();
    await wait(200);
    const cloneSel = await page.locator('#worldPlane').inputValue();
    if (/^plane_\d+$/.test(cloneSel) && cloneSel !== 'jiguan') ok('工程·克隆位面', `新 id = ${cloneSel}`);
    else bad('工程·克隆位面', `下拉值 = ${cloneSel}`);
    const planeOptsAfter = await page.locator('#worldPlane option').count();
    if (planeOptsAfter === planeOptsBefore + 1) ok('工程·克隆下拉', `选项 ${planeOptsBefore} → ${planeOptsAfter}`);
    else bad('工程·克隆下拉', `${planeOptsBefore} → ${planeOptsAfter}`);
    const clonedState = await page.evaluate(() => globalThis.__worldEditorApi.objects().length);
    if (clonedState === 5) ok('工程·克隆对象随行', `副本对象 ${clonedState} 个`);
    else bad('工程·克隆对象随行', String(clonedState));

    // 6e0. 关卡数量自由度：每阶段常规小怪预算 + 收尾单位数量
    await page.locator('.admin-tabs button[data-key="stages"]').click();
    await wait(250);
    const stagePane = page.locator('.admin-pane:visible');
    await stagePane.locator('input[placeholder="不填=按速率"]').first().fill('3');
    await stagePane.locator('input[placeholder="默认1"]').first().fill('3');
    ok('数量·小怪自定义', 'S1 常规小怪预算 = 3');
    ok('数量·Boss自定义', 'S1 收尾单位数 = 3');

    // 6e. 地图编辑器：切标签 → 画布可见 → 拖拽放一个障碍物 → 出生点工具点击 → 列表同步
    //     注意：page.mouse 用视口坐标而 boundingBox 是页面坐标；每次交互前必须
    //     scrollIntoViewIfNeeded + 重取 bbox，否则滚动后点击会落在折叠线下/saveBar 上。
    await page.locator('.admin-tabs button[data-key="map"]').click();
    await wait(400);
    if (await page.locator('#mapCanvas').isVisible()) ok('地图编辑器', '画布已渲染');
    else bad('地图编辑器', '#mapCanvas 不可见');
    await page.locator('#mapPlane').selectOption('jiguan');
    await wait(200);
    await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
    await wait(200);
    await page.locator('button[data-mtool="obstacle"]').click();
    await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
    await wait(150);
    let mb = await page.locator('#mapCanvas').boundingBox();
    let mcx = mb.x + mb.width / 2, mcy = mb.y + mb.height / 2;
    await page.mouse.move(mcx - 120, mcy - 80);
    await page.mouse.down();
    await page.mouse.move(mcx - 20, mcy + 20, { steps: 6 });
    await page.mouse.up();
    await wait(200);
    const obsRows = await page.locator('.map-obs-row').count();
    if (obsRows === 1) ok('地图·放置障碍物', '拖拽生成 1 条障碍物记录');
    else bad('地图·放置障碍物', `.map-obs-row 行数 = ${obsRows}（预期 1）`);
    await page.locator('button[data-mtool="spawn"]').click();
    await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
    await wait(150);
    mb = await page.locator('#mapCanvas').boundingBox();
    mcx = mb.x + mb.width / 2; mcy = mb.y + mb.height / 2;
    await page.mouse.click(mcx + 140, Math.min(mcy + 90, mb.y + mb.height - 30));
    await wait(150);
    ok('地图·移动出生点', '出生点工具点击已应用（落盘断言见 8f）');

    // 6f. 触发器结构化编辑：位面标签点「＋触发器」→ 默认 onFirstBlood + genes 动作 → 列表同步
    await page.locator('.admin-tabs button[data-key="planes"]').click();
    await wait(250);
    await page.locator('button[data-trg-add]').first().click();
    await wait(150);
    const trgCards = await page.locator('.trg-card').count();
    if (trgCards >= 1) ok('触发器·新增剧本', `生成 ${trgCards} 个触发器卡片`);
    else bad('触发器·新增剧本', `.trg-card = ${trgCards}（预期 ≥1）`);
    const firstAction = page.locator('.trg-action').first();
    const actSelectVal = await firstAction.locator('select').first().inputValue();
    if (actSelectVal === 'genes') ok('触发器·动作下拉', `首个动作 = ${actSelectVal}（结构化生效）`);
    else bad('触发器·动作下拉', `首个动作 = ${actSelectVal}（预期 genes）`);

    // 6g. 位面机制类型下拉：切换机制类型 → 动态参数出现 → 值落盘
    const mechSel = page.locator('.mech-select').first();
    await mechSel.selectOption('bulletHell');
    await wait(150);
    const bulletCountVisible = await page.locator('.mech-select').first().evaluate((el) => {
      // bulletHell 多一个 count 参数输入框
      const sib = el.parentElement.querySelector('input[placeholder="弹幕数"]');
      return !!sib;
    });
    if (bulletCountVisible) ok('机制·类型下拉', '切到 bulletHell 后弹幕数参数出现');
    else bad('机制·类型下拉', '切到 bulletHell 后未见弹幕数参数');
    const bossSkillSel = page.locator('.boss-skill-select').first();
    await bossSkillSel.selectOption('ring');
    ok('Boss技·类型下拉', 'Boss技能样式已切到 ring 环形弹幕');

    // 6h. 资产库标签：加载 serve /api/art-list → 网格渲染条目
    await page.locator('.admin-tabs button[data-key="assets"]').click();
    await wait(600);   // 等 fetch 异步返回并重渲染
    const assetImgs = await page.locator('.asset-cell img').count();
    if (assetImgs > 50) ok('资产库', `网格渲染 ${assetImgs} 个资产（serve /api/art-list 通）`);
    else bad('资产库', `资产图数 = ${assetImgs}（预期 >50）`);
    // 资产库真实绑定：选择 jiguan / 地图地砖，打开 backgrounds 分组，点击第一张图
    await page.locator('#assetPlaneTarget').selectOption('jiguan');
    await page.locator('#assetSlotTarget').selectOption('floor');
    const bgGroup = page.locator('.cfg-details').filter({ hasText: 'backgrounds ·' }).first();
    await bgGroup.locator('summary').click();
    await bgGroup.locator('.asset-cell img').first().click();
    const bindHint = await page.locator('.asset-targets .small-hint').innerText();
    if (bindHint.includes('已绑定')) ok('资产库·绑定地砖', bindHint);
    else bad('资产库·绑定地砖', bindHint);
    // 技能资产绑定：选择 skillIcon + 首个技能，打开 effects 分组点图
    await page.locator('#assetSlotTarget').selectOption('skillIcon');
    await page.locator('#assetSkillTarget').selectOption('dujie_1');
    const fxGroup = page.locator('.cfg-details').filter({ hasText: 'effects ·' }).first();
    await fxGroup.locator('summary').click();
    await fxGroup.locator('.asset-cell img').first().click();
    const skillBindHint = await page.locator('.asset-targets .small-hint').innerText();
    if (skillBindHint.includes('skillIcon')) ok('资产库·绑定技能图标', skillBindHint);
    else bad('资产库·绑定技能图标', skillBindHint);
    await page.locator('#assetSlotTarget').selectOption('boss');
    const unitGroup = page.locator('.cfg-details').filter({ hasText: 'units ·' }).first();
    await unitGroup.locator('summary').click();
    await unitGroup.locator('.asset-cell img').nth(1).click();
    const bossBindHint = await page.locator('.asset-targets .small-hint').innerText();
    if (bossBindHint.includes('/ boss')) ok('资产库·绑定Boss形象', bossBindHint);
    else bad('资产库·绑定Boss形象', bossBindHint);
    // 小怪第二槽绑定：S1-B 必须可独立覆盖，不能只配每阶段第一只
    await page.locator('#assetSlotTarget').selectOption('stage:0:1');
    await unitGroup.locator('.asset-cell img').first().click();
    const minionBindHint = await page.locator('.asset-targets .small-hint').innerText();
    if (minionBindHint.includes('stage:0:1')) ok('资产库·绑定S1-B小怪', minionBindHint);
    else bad('资产库·绑定S1-B小怪', minionBindHint);

    // 7. 回到位面标签，改一个字段并应用
    await page.locator('.admin-tabs button[data-key="planes"]').click();
    await wait(200);
    const firstTheme = page.locator('.admin-pane .cfg-block').first().locator('.af-field input').nth(0);
    await firstTheme.fill('机关齿轮阵（后台测试改）');
    const firstBossName = page.locator('.admin-pane:visible .cfg-block').first().locator('.af-field').filter({ hasText: 'Boss 名' }).locator('input');
    await firstBossName.fill('傀儡巨像·后台测试');
    await page.locator('#applyBtn').click();
    await wait(300);
    ok('应用修改', `#applyBtn 被点击，按钮已禁用=${await page.locator('#applyBtn').isDisabled()}`);

    // 7b. eff 是否落进覆盖对象
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cfg_overrides_v1') ?? '{}'));
    const withEff = (saved.skills ?? []).find((s) => s.eff && Number(s.eff.crit) === 0.42);
    if (withEff) ok('eff 落盘', `${withEff.id}.eff.crit = 0.42 已写入覆盖`);
    else bad('eff 落盘', '覆盖里没找到 eff.crit=0.42');
    const withVisual = (saved.skills ?? []).find((s) => s.visual?.fxKind === 'heal' && s.visual?.color === '#123456');
    if (withVisual) ok('技能 visual 落盘', `${withVisual.id}.visual = ${JSON.stringify(withVisual.visual)}`);
    else bad('技能 visual 落盘', '覆盖里没找到 fxKind/color');
    const withSkillName = (saved.skills ?? []).find((s) => s.name === '雷击附魔·后台测试');
    if (withSkillName) ok('技能名称落盘', `${withSkillName.id}.name = ${withSkillName.name}`);
    else bad('技能名称落盘', '覆盖里没找到后台技能名称');
    const savedPlane = saved.planes?.jiguan;
    if (savedPlane?.boss === '傀儡巨像·后台测试') ok('Boss名称落盘', savedPlane.boss);
    else bad('Boss名称落盘', JSON.stringify(savedPlane?.boss));
    const savedPlan = savedPlane?.stagePlan?.[0];
    if (savedPlan?.minionCount === 3) ok('小怪数量落盘', `S1 minionCount = ${savedPlan.minionCount}`);
    else bad('小怪数量落盘', JSON.stringify(savedPlan));
    if (savedPlan?.closerCount === 3) ok('Boss数量落盘', `S1 closerCount = ${savedPlan.closerCount}`);
    else bad('Boss数量落盘', JSON.stringify(savedPlan));
    const worldObjectsSaved = savedPlane?.editor?.objects ?? [];
    const types = new Set(worldObjectsSaved.map((o) => o.type));
    const regionSaved = worldObjectsSaved.find((o) => o.type === 'region');
    if (worldObjectsSaved.length >= 3 && types.has('unit') && types.has('boss') && types.has('region') && regionSaved?.event === 'onAmbushSpawn') {
      ok('位面工程落盘', `plane.editor.objects ×${worldObjectsSaved.length}（unit/boss/region 齐全，region.event=onAmbushSpawn）`);
    } else bad('位面工程落盘', JSON.stringify(worldObjectsSaved));
    const hidSaved = (saved.hiddenSkills ?? {}).wushuang;
    if (hidSaved?.eff && Number(hidSaved.eff.crit) === 0.33) ok('隐藏技 eff 落盘', 'wushuang.eff.crit=0.33 已写入');
    else bad('隐藏技 eff 落盘', JSON.stringify(hidSaved ?? null));

    // 7c. 保存到项目：经 serve 端点写入 overrides.data.json
    await page.locator('#saveProjectBtn').click();
    await wait(400);
    const projHint = await page.locator('#saveBar .hint').innerText();
    if (projHint.includes('✓ 已写入')) ok('保存到项目', projHint);
    else bad('保存到项目', projHint);
    const fileOk = fs.existsSync(path.join(ROOT, 'web/src/config/overrides.data.json'));
    const cocosFileOk = fs.existsSync(path.join(ROOT, 'shizu-cocos/assets/resources/config/overrides.json'));
    if (fileOk) ok('持久文件落盘', 'web/src/config/overrides.data.json 存在');
    else bad('持久文件落盘', 'Web overrides.data.json 未生成');
    if (cocosFileOk) ok('Cocos配置落盘', 'shizu-cocos/assets/resources/config/overrides.json 存在');
    else bad('Cocos配置落盘', 'Cocos overrides.json 未生成');

    // 8. 刷新主游戏页，验证 overrides 被运行时消费（override 改的是 ESM 模块对象，
    //    主游戏页 boot 时已跑 applyConfigOverrides；读 planes 模块实例看 theme 是否被改）
    await page.goto(`http://localhost:${PORT}/web/?worldTest=jiguan`, { waitUntil: 'networkidle' });
    await wait(600);   // 等待自动入局与资产首帧
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

    // 8b2. 技能 visual 的运行时消费：findSkill 应读到后台配置的 fxKind/color
    const visualT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/skills.js');
        const s = m.findSkill('dujie_1');
        return s ? JSON.stringify(s.visual) : 'NO_SKILL';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (visualT.includes('heal') && visualT.includes('#123456')) ok('技能 visual 运行时消费', `dujie_1.visual = ${visualT}`);
    else bad('技能 visual 运行时消费', visualT);
    const nameT = await page.evaluate(async () => {
      try {
        const sm = await import('/shizu-cocos/assets/scripts/data/skills.js');
        const pm = await import('/shizu-cocos/assets/scripts/data/planes.js');
        return `${sm.findSkill('dujie_1')?.name}|${pm.planes.find((p) => p.id === 'jiguan')?.boss}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (nameT === '雷击附魔·后台测试|傀儡巨像·后台测试') ok('名称运行时消费', nameT);
    else bad('名称运行时消费', nameT);
    const worldT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const objs = m.planes.find((p) => p.id === 'jiguan')?.editor?.objects ?? [];
        const t = new Set(objs.map((o) => o.type));
        return `${objs.length}|${t.has('unit')}|${t.has('boss')}|${t.has('region')}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^[3-9]\|true\|true\|true$/.test(worldT)) ok('位面工程运行时消费', worldT);
    else bad('位面工程运行时消费', worldT);

    // 模板随工程落盘（editor 全量序列化自然携带；分享码导出同源）
    const tplSaved = saved.planes?.jiguan?.editor?.templates ?? [];
    if (tplSaved.length >= 1) ok('工程·模板随落盘', `templates ×${tplSaved.length}（分享码同源）`);
    else bad('工程·模板随落盘', JSON.stringify(tplSaved));


    // 8g2. 一键试玩闭环：?worldTest 直入战斗，且工程对象随局生效
    const playT = await page.evaluate(() => {
      try {
        const s = globalThis.__shizu?.snapshot?.();
        const objs = globalThis.__shizu?.run?.dungeon?.plane?.editor?.objects?.length ?? -1;
        const placedBoss = (globalThis.__shizu?.run?.enemies ?? []).some((e) => e.name === '地图BossA');
        return `${s?.screen}|${s?.plane}|objs${objs}|placedBoss=${placedBoss}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^battle\|机关城\|objs[3-9]\|placedBoss=true$/.test(playT)) ok('一键试玩闭环', playT);
    else bad('一键试玩闭环', playT);

    // 克隆位面运行时注册：新 id 进 planes，工程对象随行
    const cloneT = await page.evaluate(async (cid) => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const np = m.planes.find((x) => x.id === cid);
        return np ? `${np.id}|${np.name}|${np.editor?.objects?.length ?? -1}|${np._new ? 'new' : 'native'}` : 'NO_CLONE';
      } catch (e) { return 'ERR:' + e.message; }
    }, [cloneSel]);
    if (/^plane_\d+\|机关城二号\|5\|new$/.test(cloneT)) ok('克隆位面运行时注册', cloneT);
    else bad('克隆位面运行时注册', cloneT);

    // 地砖运行时消费：涂刷单元应进入 plane.editor.tiles 并随局生效
    const tilesT = await page.evaluate(() => {
      try {
        const tiles = globalThis.__shizu?.run?.dungeon?.plane?.editor?.tiles ?? [];
        return `${tiles.length}|${tiles[0]?.sprite ?? 'NONE'}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^[1-9]\|floor_dujie$/.test(tilesT)) ok('地砖运行时消费', tilesT);
    else bad('地砖运行时消费', tilesT);



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

    // 8e. 新增位面的运行时注册：planes 数组多一条且带完整骨架
    const planeT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const np = m.planes.find((x) => String(x.id).startsWith('plane_'));
        return np ? `${m.planes.length}:${np.id}:codex${np.codex}:waves${Array.isArray(np.waves)}` : `NO_NEW(total ${m.planes.length})`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^1[3-9]:plane_\d+:codex(?:[1-9]\d*):wavestrue$/.test(planeT)) ok('新增位面运行时注册', planeT);
    else bad('新增位面运行时注册', planeT);

    // 8f. 地图编辑器运行时消费：拖出来的障碍物/出生点应写进位面对象，双端 core 直接读
    const mapT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const p = m.planes.find((x) => x.id === 'jiguan');
        if (!p) return 'NO_PLANE';
        return JSON.stringify({ n: (p.obstacles ?? []).length, spawn: p.spawn ?? null });
      } catch (e) { return 'ERR:' + e.message; }
    });
    try {
      const j = JSON.parse(mapT);
      if (j.n >= 1 && j.spawn && Number.isFinite(Number(j.spawn.x))) ok('地图运行时消费', `planes.jiguan.obstacles ×${j.n}，spawn=(${j.spawn.x},${j.spawn.y})`);
      else bad('地图运行时消费', mapT);
    } catch { bad('地图运行时消费', mapT); }

    // 8g. 触发器结构化编辑运行时消费：后台加的触发器剧本应写进 plane.triggers
    const trgT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const p = m.planes.find((x) => x.id === 'jiguan');
        if (!p?.triggers?.length) return 'NO_TRIGGERS';
        const t = p.triggers[0];
        return `${t.on}|${t.actions?.[0]?.type}|${t.actions?.[0]?.amount}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^onFirstBlood\|genes\|50$/.test(trgT)) ok('触发器运行时消费', `jiguan.triggers[0] = ${trgT}`);
    else bad('触发器运行时消费', trgT);

    // 8h. 机制类型运行时消费：bulletHell 应覆盖到 PLANE_MECHANICS（overrides mechanics 分支）
    const mechT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planeModules.js');
        return `${m.PLANE_MECHANICS.jiguan?.type}|${m.PLANE_MECHANICS.jiguan?.count}|${m.PLANE_MECHANICS.jiguan?.bossSkill}`;
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (mechT.startsWith('bulletHell') && mechT.endsWith('|ring')) ok('机制运行时消费', `PLANE_MECHANICS.jiguan = ${mechT}`);
    else bad('机制运行时消费', mechT);

    // 8i. 资产绑定运行时消费：后台点选的地图地砖路径应进入 plane.art
    const artT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planes.js');
        const p = m.planes.find((x) => x.id === 'jiguan');
        return p?.art?.floor ?? 'NO_FLOOR_OVERRIDE';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^backgrounds\/.+\.png$/.test(artT)) ok('资产绑定运行时消费', `planes.jiguan.art.floor = ${artT}`);
    else bad('资产绑定运行时消费', artT);

    // 8j. 技能图标绑定运行时消费
    const iconT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/skills.js');
        return m.findSkill('dujie_1')?.visual?.icon ?? 'NO_ICON';
      } catch (e) { return 'ERR:' + e.message; }
    });
    if (/^effects\/.+\.png$/.test(iconT)) ok('技能图标运行时消费', `dujie_1.visual.icon = ${iconT}`);
    else bad('技能图标运行时消费', iconT);

    // 8k. 小怪第二槽运行时消费
    const minionT = await page.evaluate(async () => {
      try {
        const m = await import('/shizu-cocos/assets/scripts/data/planeModules.js');
        return JSON.stringify({
          v: m.MINION_SPRITE_BY_STAGE.jiguan?.[0]?.[1] ?? 'NO_MINION',
          pm: globalThis.__pmInstances ?? 'NA',
          ov: (globalThis.__ovApply || []).length,
          lsKeys: Object.keys(JSON.parse(localStorage.getItem('cfg_overrides_v1') ?? '{}')).length,
          url: location.href,
        });
      } catch (e) { return 'ERR:' + e.message; }
    });
    let minionVal = minionT; try { minionVal = JSON.parse(minionT).v; } catch {}
    if (minionVal && minionVal !== 'NO_MINION') ok('小怪S1-B运行时消费', `MINION_SPRITE_BY_STAGE.jiguan[0][1] = ${minionT}`);
    else bad('小怪S1-B运行时消费', minionT);
    const bossSpriteT = await page.evaluate(async () => {
      try { const m = await import('/shizu-cocos/assets/scripts/data/planeModules.js'); return m.BOSS_BY_PLANE.jiguan ?? 'NO_BOSS'; }
      catch (e) { return 'ERR:' + e.message; }
    });
    if (bossSpriteT && bossSpriteT !== 'NO_BOSS') ok('Boss形象运行时消费', `BOSS_BY_PLANE.jiguan = ${bossSpriteT}`);
    else bad('Boss形象运行时消费', bossSpriteT);

    // 位面工程导出/导入回环（在试玩断言之后执行，避免导航破坏 __shizu 上下文）
    await page.goto(`http://localhost:${PORT}/web/admin.html`, { waitUntil: 'networkidle' });
    await wait(300);
    await page.locator('.admin-tabs button[data-key="world"]').click();
    await wait(400);
    const rowsBeforeIo = await page.locator('.world-object-row').count();
    await page.evaluate(() => { globalThis.__clip = null; navigator.clipboard.writeText = (t) => { globalThis.__clip = t; return Promise.resolve(); }; });
    await page.locator('.world-toolbar button:has-text("导出工程")').click();
    await wait(150);
    const shareCode = await page.evaluate(() => globalThis.__clip);
    if (shareCode && shareCode.length > 200) {
      const decodedCount = await page.evaluate((c) => { try { const j = JSON.parse(decodeURIComponent(escape(atob(c)))); return String(j?.editor?.objects?.length ?? -1); } catch { return 'DECODE_FAIL'; } }, shareCode);
      if (decodedCount !== 'DECODE_FAIL' && Number(decodedCount) >= 3) ok('工程·导出分享码', `长度 ${shareCode.length}，解码对象 ${decodedCount} 个`);
      else bad('工程·导出分享码', `解码失败：${decodedCount}`);
    } else bad('工程·导出分享码', String(shareCode).slice(0, 60));
    await page.evaluate((c) => { window.prompt = () => c; }, shareCode);
    await page.locator('.world-toolbar button:has-text("导入工程")').click();
    await wait(200);
    const ioHintText = await page.locator('.world-io-hint').innerText();
    if (ioHintText.includes('已导入')) ok('工程·导入回环', ioHintText);
    else bad('工程·导入回环', ioHintText);
    const rowsAfterIo = await page.locator('.world-object-row').count();
    if (rowsAfterIo === rowsBeforeIo) ok('工程·导出导入等价', `对象数不变：${rowsAfterIo}`);
    else bad('工程·导出导入等价', `${rowsAfterIo} vs ${rowsBeforeIo}`);

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
    if (typeof jsErrors !== 'undefined' && jsErrors.length) bad('页面错误详情', jsErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
    // 清理验证产物，保持仓库干净（该文件由使用者按需保存/提交）
    try { fs.unlinkSync(path.join(ROOT, 'web/src/config/overrides.data.json')); } catch {}
    try { fs.unlinkSync(path.join(ROOT, 'shizu-cocos/assets/resources/config/overrides.json')); } catch {}
  }

  console.log('\n==== 汇总 ====');
  const fail = results.filter((r) => r.startsWith('✗'));
  console.log(fail.length ? `有 ${fail.length} 项失败` : '全部通过');
  process.exit(fail.length ? 1 : 0);
})();