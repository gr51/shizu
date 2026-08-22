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
/** 按钮文案：UiKit 把 Label 挂在 Button 的子节点上，按钮自身没有 string */
function buttonText(btn) {
  return btn.children.map((ch) => ch.getComponent(cc.Label)?.string ?? '').join('');
}
function buttonByText(node, keyword) {
  return allButtons(node).find((b) => buttonText(b).includes(keyword));
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

// —— 裂缝配置流：变异开关 + 透传进局（主动审计回归守护）——
const cfgBtn = buttonByText(canvas, '变异与出征武器');
check(!!cfgBtn, '找到「变异与出征武器」入口');
cfgBtn.simulateClick();
const collectLabels = () => { const o = []; (function c2(n) { const l = n.getComponent(cc.Label); if (l) o.push(l.string); n.children.forEach(c2); })(canvas); return o; };
check(collectLabels().some((s) => s.includes('基因倍率')), '配置屏显示基因倍率汇总');
const hordeBtn = buttonByText(canvas, '叠加 虫潮汹涌');
check(!!hordeBtn, '配置屏列出可叠加变异');
hordeBtn.simulateClick();
check(!!buttonByText(canvas, '取消 虫潮汹涌'), '点击后按钮翻转为「取消」（重渲染后重新查找）');
const backBtn2 = buttonByText(canvas, '确认，返回裂缝');
backBtn2.simulateClick();
check(collectLabels().some((s) => s.includes('撕开裂缝')), '确认后回到裂缝信息屏且配置保留');

const enterBtn2 = buttonByText(canvas, '撕开裂缝');   // 重渲染后旧节点引用失效，必须重找
check(!!enterBtn2, '配置返回后仍可撕开裂缝');
enterBtn2.simulateClick();
check(snap().screen === 'battle', '已进入副本');
check(root_.run?.dungeon?.mods?.spawnMul === 1.35, `配置的虫潮变异已透传进局（spawnMul=${root_.run?.dungeon?.mods?.spawnMul}）`);
check(snap().plane === '机关城', `位面 = ${snap().plane}`);

// —— 叙事 toast：开局任务简报必须浮出（主动审计回归守护）——
root_.update(1 / 60);
const battleLabels0 = collectAllLabels(canvas);
check(battleLabels0.some((s) => s.includes('主线：')), '开局任务简报 toast 已显示');
check(battleLabels0.some((s) => s.includes('支线【')), '支线协议 toast 已显示');

// —— 5. 打完整局（实时：直接驱动组件的 update(dt)，模拟游戏循环）——
console.log('\n[4] 实时战斗推进');
const DT = 1 / 60;
let frames = 0;
let modals = 0;
let shops = 0;
let shopTried = false;   // 本次开门是否已试过购入：买不起时别再点同一颗按钮，否则原地打转
// 走位：八方向绕圈，与 tools/probe-battle.mjs / playtest.mjs 的盲走机器人同构
//（那两个是平衡标定用的参照物，CONTACT_DPS_SCALE 就是照它们扫出来的）。
// 不能沿单轴长按直线跑：玩家 220 的移速快过绝大多数小怪，一路直冲会把整场敌人
// 甩在 150 射程之外 —— 于是既杀不动也死不掉，跑满 20 分钟上限都走不到结算。
const KEY = { A: 65, D: 68, S: 83, W: 87 };
const ORBIT = [
  [KEY.D], [KEY.D, KEY.S], [KEY.S], [KEY.A, KEY.S],
  [KEY.A], [KEY.A, KEY.W], [KEY.W], [KEY.D, KEY.W],
];
const ORBIT_HOLD = 40;   // 每个方向按住 40 帧 ⇒ 绕一圈 320 帧，半径约 150，与盲走机器人同量级
const press = (codes) => { root_.keys.clear(); for (const c of codes) root_.keys.add(c); };

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
  // 黑市开门期间 run.update() 直接 return —— 不点掉它，这一局就再也走不到结算
  if (st === 'shopping') {
    const buy = allButtons(canvas).find((b) => buttonText(b).startsWith('购入'));
    if (buy && !shopTried) { shopTried = true; buy.simulateClick(); continue; }
    const leave = buttonByText(canvas, '离开黑市');
    if (!leave) { fail('黑市弹窗没有「离开黑市」出口，卡死'); break; }
    shopTried = false;
    shops += 1;
    leave.simulateClick();
    continue;
  }
  press(ORBIT[Math.floor(frames / ORBIT_HOLD) % ORBIT.length]);
  root_.update(DT);
  frames += 1;
}
ok(`驱动 ${frames} 帧（游戏内 ${(frames / 60 / 60).toFixed(1)} 分钟），处理 ${modals} 次弹窗 / ${shops} 次黑市`);
// 门槛卡**速率**而不是绝对值：机器人活多久是随机的（实测 0.6~13 分钟都出现过），
// 而这条断言要证的是「割草」—— 每分钟能不能成片地噬灭，与活多久无关。
const killsPerMin = root_.run.kills / Math.max(1 / 60, frames / 3600);
check(killsPerMin > 60, `实时战斗产生了击杀：${root_.run.kills} 只（${killsPerMin.toFixed(0)} 只/分钟）`);
check(root_.run.onScreen >= 0, `同屏敌人数可读：${root_.run.onScreen}`);

// —— 6. 结算 ——
console.log('\n[5] 结算与回巢');
const settleLabels = [];
(function collect(n) { const l = n.getComponent(cc.Label); if (l) settleLabels.push(l.string); n.children.forEach(collect); })(canvas);
check(settleLabels.some((s) => /评级\s*[SABCD]/.test(s)), '结算页有评级');
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

// —— 9. 无尽撤离流（主动审计回归守护：新机制必须有运行时验证）——
console.log('\n[7] 无尽撤离流');
root_.save.stats.endlessUnlocked = true;
clickByKeyword2(canvas, '开 启 裂 缝');
const endlessBtn = buttonByText(canvas, '无尽模式');
check(!!endlessBtn, '无尽模式入口已出现（解锁后）');
endlessBtn.simulateClick();
check(root_.run?.endless === true, `进入无尽局（endless=${root_.run?.endless}）`);
check(!!buttonByText(canvas, '撤离结算'), '战斗界面显示撤离按钮');
buttonByText(canvas, '撤离结算').simulateClick();
check(collectAllLabels(canvas).some((s) => s.includes('撤 离 深 渊')), '撤离确认页弹出');
buttonByText(canvas, '撤离结算').simulateClick();   // 确认页里的同名确认按钮
root_.update(1 / 60);   // 驱动一帧：WON → showSettle → finalize 落盘
check(['settled', 'won'].includes(root_.run.state), `撤离后状态=${root_.run.state}`);
check((cc.sys.localStorage.getItem('shizu_save') ? JSON.parse(cc.sys.localStorage.getItem('shizu_save')).player.wins : 0) >= 1, '撤离按胜利落盘');

function clickByKeyword2(node, keyword) {
  const btn = buttonByText(node, keyword);
  if (!btn) throw new Error(`smoke 找不到按钮：${keyword}`);
  btn.simulateClick();
}
function collectAllLabels(node) {
  const o = [];
  (function c3(n) { const l = n.getComponent(cc.Label); if (l && l.string) o.push(l.string); n.children.forEach(c3); })(node);
  return o;
}

// —— 10. 锻造/合成/强化（主动审计回归守护：三件套全链路）——
console.log('\n[8] 锻造/合成/强化');
clickByKeyword2(canvas, '回 巢');
{
  const P = root_.save.player;
  const aff = (k, v) => ({ key: k, value: v });
  // 合成：3 白 → 1 绿
  P.gearBag.push(
    { uid: 'sm1', slot: 'claw', rarity: 'white', star: 0, name: '白一', affixes: [aff('atk', 3)] },
    { uid: 'sm2', slot: 'claw', rarity: 'white', star: 0, name: '白二', affixes: [aff('atk', 3)] },
    { uid: 'sm3', slot: 'claw', rarity: 'white', star: 0, name: '白三', affixes: [aff('atk', 3)] },
  );
  clickByKeyword2(canvas, '装备背包');
  clickByKeyword2(canvas, '合成');
  const wBefore = P.gearBag.filter((g) => g.rarity === 'white').length;
  clickByKeyword2(canvas, '合成 普通');
  const wAfter = P.gearBag.filter((g) => g.rarity === 'white').length;
  check(wAfter === wBefore - 3, `合成消耗 3 件白装（${wBefore}→${wAfter}）`);
  check(P.gearBag.some((g) => g.rarity === 'green'), '合成产出绿装');
  clickByKeyword2(canvas, '返回背包');
  // 锻造：精华 → 指定槽位绿装
  P.gearEssence = (P.gearEssence ?? 0) + 200;
  clickByKeyword2(canvas, '精华锻造');
  clickByKeyword2(canvas, '噬爪');
  clickByKeyword2(canvas, '锻造 精良');
  check(P.gearBag.some((g) => g.slot === 'claw' && g.rarity === 'green'), '锻造绿爪入背包（不自动穿戴）');
  // 强化：装备绿爪 + 3 绿垫 → +1 星
  const clawGreen = P.gearBag.find((g) => g.slot === 'claw' && g.rarity === 'green');
  P.gear.claw = clawGreen;
  P.gearBag.splice(P.gearBag.indexOf(clawGreen), 1);
  P.gearBag.push(
    { uid: 'f1', slot: 'claw', rarity: 'green', star: 0, name: '垫A', affixes: [aff('hp', 5)] },
    { uid: 'f2', slot: 'claw', rarity: 'green', star: 0, name: '垫B', affixes: [aff('hp', 5)] },
    { uid: 'f3', slot: 'claw', rarity: 'green', star: 0, name: '垫C', affixes: [aff('hp', 5)] },
  );
  clickByKeyword2(canvas, '返回背包');
  clickByKeyword2(canvas, '强化（同槽');
  const enhBtn = allButtons(canvas).find((b) => buttonText(b).startsWith('强化 '));
  check(!!enhBtn, '强化屏列出有效目标');
  enhBtn.simulateClick();
  check(P.gear.claw.star === 1, `强化 +1 星（实际 ${P.gear.claw.star}）`);
}

console.log('\n' + '─'.repeat(56));
console.log(errors.length ? `✗ ${errors.length} 项失败` : '✓ Cocos 组件层冒烟测试全部通过');
process.exit(errors.length ? 1 : 0);
