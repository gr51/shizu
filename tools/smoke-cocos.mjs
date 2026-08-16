// Cocos 组件层冒烟测试：把 assets/scripts/game/ 在 Node 里真的跑一遍。
// 用法：node tools/smoke-cocos.mjs
//
// 流程：tsc 编译到 .tmp/ → 用 tools/cc-shim 顶替 'cc' → 实例化 GameRoot →
//       驱动「开裂缝 → 打完整局 → 结算 → 回巢」，全程断言。
//
// 它验证不了像素，验证得了：API 用法成立、界面切换正确、整局状态机跑得通、
// 存档真的落盘。也就是上一版工程最缺的那件事 —— 代码被执行过。

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.tmp/cocos-smoke');
// tsc 的 include/rootDir 需用正斜杠，否则 Windows 反斜杠会被 JSON 读成转义、匹配不到文件
const fwd = (p) => p.replace(/\\/g, '/');

const errors = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { errors.push(m); console.log(`  ✗ ${m}`); };
const check = (cond, m) => (cond ? ok(m) : fail(m));

// —— 1. 编译（CommonJS，便于无扩展名 import 在 Node 里解析）——
console.log('\n[1] 编译 Cocos 脚本层');
fs.rmSync(outDir, { recursive: true, force: true });
const tsconfig = {
  compilerOptions: {
    target: 'ES2021', module: 'commonjs', moduleResolution: 'node',
    strict: false, experimentalDecorators: true, esModuleInterop: true,
    allowJs: true, checkJs: false, skipLibCheck: true,
    outDir: fwd(outDir), rootDir: fwd(path.join(root, 'shizu-cocos')),
    baseUrl: fwd(path.join(root, 'shizu-cocos')),
    paths: { cc: [fwd(path.join(root, 'shizu-cocos/types/cc.d.ts'))] },
  },
  include: [
    fwd(path.join(root, 'shizu-cocos/assets/**/*.ts')),
    fwd(path.join(root, 'shizu-cocos/assets/**/*.js')),
    fwd(path.join(root, 'shizu-cocos/types/**/*.d.ts')),
  ],
};
const tmpConfig = path.join(root, '.tmp/tsconfig.smoke.json');
fs.mkdirSync(path.dirname(tmpConfig), { recursive: true });
fs.writeFileSync(tmpConfig, JSON.stringify(tsconfig, null, 2));

try {
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/typescript/bin/tsc'), '-p', tmpConfig,
  ], { stdio: 'pipe' });
  ok('tsc 编译通过');
} catch (e) {
  const out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '');
  fail('tsc 编译失败:\n' + out.split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}

// —— 2. 装 'cc' 替身 ——
// 仓库根 package.json 是 "type": "module"，而这里编译产物是 CommonJS，
// 故在输出目录放一个 type:commonjs 的 package.json 把作用域切回来。
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

const ccDir = path.join(root, 'node_modules/cc');
fs.mkdirSync(ccDir, { recursive: true });
fs.copyFileSync(path.join(root, 'tools/cc-shim/index.js'), path.join(ccDir, 'index.js'));
fs.writeFileSync(path.join(ccDir, 'package.json'), JSON.stringify({ name: 'cc', version: '0.0.0', main: 'index.js' }));
ok("已挂载 'cc' 运行时替身");

// —— 3. 起 GameRoot ——
console.log('\n[2] 实例化 GameRoot');
const require_ = createRequire(import.meta.url);
const cc = require_('cc');
const { GameRoot } = require_(path.join(outDir, 'assets/scripts/game/GameRoot.js'));

const canvas = new cc.Node('Canvas');
const root_ = canvas.addComponent(GameRoot);   // addComponent 会调用 onLoad
check(!!root_, 'GameRoot 组件已挂载');
check(canvas.children.length > 0, `已构建界面节点树（${canvas.children.length} 个顶层节点）`);

const snap = () => globalThis.__shizu.snapshot();
check(snap().screen === 'lobby', '初始处于大厅');
check(snap().runs === 0, '新档 totalRuns = 0');

/** 深度优先找出所有按钮（UiKit 里按钮节点名为 Button） */
function allButtons(node, out = []) {
  for (const c of node.children) {
    if (c.name === 'Button') out.push(c);
    allButtons(c, out);
  }
  return out;
}
function buttonByText(node, keyword) {
  return allButtons(node).find((b) =>
    b.children.some((ch) => ch.getComponent(cc.Label)?.string?.includes(keyword)));
}

const lobbyButtons = allButtons(canvas);
check(lobbyButtons.length >= 5, `大厅 ${lobbyButtons.length} 个按钮`);

// —— 4. 开裂缝 ——
console.log('\n[3] 开裂缝');
const riftBtn = buttonByText(canvas, '开 启 裂 缝');
check(!!riftBtn, '找到「开启裂缝」按钮');
riftBtn.simulateClick();

const enterBtn = buttonByText(canvas, '撕开裂缝');
check(!!enterBtn, '裂缝卡已弹出，含「撕开裂缝，进入」');
const riftLabels = [];
(function collect(n) { const l = n.getComponent(cc.Label); if (l) riftLabels.push(l.string); n.children.forEach(collect); })(canvas);
check(riftLabels.some((s) => s.includes('机关城')), '首进固定机关城（红线 7）');
check(riftLabels.some((s) => s.includes('通道')), '裂缝卡展示通道类型');
check(riftLabels.some((s) => s.includes('首次进入')), '首进不可撤销警告已展示');

enterBtn.simulateClick();
check(snap().screen === 'battle', '已进入副本');
check(snap().plane === '机关城', `位面 = ${snap().plane}`);

// —— 5. 打完整局（实时：直接驱动组件的 update(dt)，模拟游戏循环）——
console.log('\n[4] 实时战斗推进');
const DT = 1 / 60;
let frames = 0;
let modals = 0;
// 按住方向键：往 cc 替身的键盘事件里塞 KeyD/KeyS 轮换
const KEY = { A: 65, D: 68, S: 83, W: 87 };
const press = (code) => { root_.keys.clear(); root_.keys.add(code); };

for (let i = 0; i < 60 * 60 * 20; i++) {
  const st = snap().state;
  if (['won', 'lost', 'settled'].includes(st) || st === null) break;

  if (st === 'choosing' || st === 'slotConflict') {
    const btns = allButtons(canvas);
    if (!btns.length) { fail('三选一弹窗没有可点按钮，卡死'); break; }
    btns[0].simulateClick();
    modals += 1;
    continue;
  }
  press([KEY.D, KEY.S, KEY.A, KEY.W][Math.floor(i / 180) % 4]);
  root_.update(DT);
  frames += 1;
}
ok(`驱动 ${frames} 帧（游戏内 ${(frames / 60 / 60).toFixed(1)} 分钟），处理 ${modals} 次弹窗`);
check(root_.run.kills > 100, `实时战斗产生了击杀：${root_.run.kills} 只`);
check(root_.run.onScreen >= 0, `同屏敌人数可读：${root_.run.onScreen}`);

// —— 6. 结算 ——
console.log('\n[5] 结算与回巢');
const settleLabels = [];
(function collect(n) { const l = n.getComponent(cc.Label); if (l) settleLabels.push(l.string); n.children.forEach(collect); })(canvas);
check(settleLabels.some((s) => /评级\s*[SABC]/.test(s)), '结算页有评级');
check(settleLabels.some((s) => s.includes('难度进化')), '结算页展示难度进化');
check(settleLabels.some((s) => s.includes('永久激活基因锁')), '首进激活基因锁已触发');

const backBtn = buttonByText(canvas, '回 巢');
check(!!backBtn, '找到「回巢」按钮');
backBtn.simulateClick();
check(snap().screen === 'lobby', '已回到大厅');
check(snap().runs === 1, `totalRuns = ${snap().runs}`);

// —— 7. 存档确实落到平台存储 ——
const raw = cc.sys.localStorage.getItem('shizu_save');
check(!!raw, `存档已落盘（${raw?.length ?? 0} 字节）`);
const parsed = raw ? JSON.parse(raw) : {};
check((parsed.player?.geneLocks?.qiji ?? 0) >= 1, `奇技基因锁已激活 Lv${parsed.player?.geneLocks?.qiji}`);
check(Array.isArray(parsed.player?.sealedRoutes), '封印路线字段已持久化');

// —— 8. 子界面 ——
console.log('\n[6] 图鉴 / 背包 / 难度');
for (const [key, expect] of [['进化图鉴', '基因锁 · 10 路线'], ['装备背包', '已装备'], ['难度设置', '难度等级']]) {
  const btn = buttonByText(canvas, key);
  if (!btn) { fail(`找不到「${key}」按钮`); continue; }
  btn.simulateClick();
  const texts = [];
  (function collect(n) { const l = n.getComponent(cc.Label); if (l) texts.push(l.string); n.children.forEach(collect); })(canvas);
  check(texts.some((s) => s.includes(expect)), `${key} 打开正常`);
  const close = buttonByText(canvas, '关闭') ?? buttonByText(canvas, '取消');
  if (close) close.simulateClick();
}

console.log('\n' + '─'.repeat(56));
console.log(errors.length ? `✗ ${errors.length} 项失败` : '✓ Cocos 组件层冒烟测试全部通过');
process.exit(errors.length ? 1 : 0);
