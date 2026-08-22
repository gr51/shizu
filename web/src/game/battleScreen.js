// ===== game/battleScreen.js · 实时战斗界面（装配层）=====
// 把 core/battle.js 的仿真、game/renderer 的绘制、game/input 的输入接起来，
// 并在三选一 / 槽位冲突 / 结算时挂起循环、弹出既有的 UI 模态。

import { RealtimeRun, ARENA, DEVOUR_CD, DODGE_CD } from '../../../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../../../shizu-cocos/assets/scripts/core/run.js';
import { generateDungeon } from '../../../shizu-cocos/assets/scripts/core/dungeon.js';
import { SLOT_LABEL } from '../../../shizu-cocos/assets/scripts/core/skillSlots.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { MECH_INFO, ROUTE_MECHANIC } from '../../../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { relicById } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { SYNERGIES } from '../../../shizu-cocos/assets/scripts/data/synergies.js';
import { Assets } from './assets.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { gearItemHtml } from '../ui/cards.js';
import * as view from '../ui/view.js';

export async function startBattle(ctx, plane, riftMods = [], opts = {}) {
  const seed = Math.floor(ctx.rng() * 0xffffffff) >>> 0;
  const dungeon = generateDungeon(plane, ctx.save, seed, riftMods, opts);
  const run = new RealtimeRun(ctx.save, dungeon, seed ^ 0x9e3779b9);
  ctx.run = run;

  audio.unlock();
  audio.startBgm(plane.id);

  const root = view.showBattleStage();
  const canvas = root.querySelector('#gameCanvas');
  const hud = root.querySelector('#hud');
  const toast = root.querySelector('#battleToast');
  const stickBase = root.querySelector('#stickBase');
  const stickKnob = root.querySelector('#stickKnob');
  const wrap = root.querySelector('#canvasWrap');
  // 触控可视化：显示摇杆按下位置与推杆量，长按蓄吞噬时变金色
  function drawStick() {
    if (!stickBase || !wrap) return;
    const s = input.stick();
    if (!s) { stickBase.classList.remove('on', 'hold'); return; }
    const box = wrap.getBoundingClientRect();
    stickBase.classList.add('on');
    stickBase.style.left = `${s.ox - box.left}px`;
    stickBase.style.top = `${s.oy - box.top}px`;
    stickKnob.style.transform = `translate(${s.mx * 30}px, ${s.my * 30}px)`;
    stickBase.classList.toggle('hold', input.holdT > 0.12);
  }
  // 战斗中事件提示：core 的日志只在结算面板可见，战斗时玩家看不到预警/事件，
  // 这里把关键事件（预警/事件/进化/掉落）实时浮到画面上，保证可读性。
  let logSeen = 0;
  const TOAST_CLS = new Set(['death', 'wave', 'win', 'gene', 'drop', 'learn', 'stage', 'hidden']);
  function pumpToast() {
    if (!toast) return;
    const log = run.log ?? [];
    if (logSeen > log.length) logSeen = 0;
    for (; logSeen < log.length; logSeen++) {
      const entry = log[logSeen];
      if (!TOAST_CLS.has(entry.cls)) continue;
      const el = document.createElement('div');
      el.className = `toast-line ${entry.cls}`;
      el.innerHTML = entry.text;
      toast.appendChild(el);
      // 两段式退场：到期先淡出（.out 过渡），再摘除 DOM —— 直接 remove() 是「啪一下蒸发」
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 200);
      }, 2400);
    }
    while (toast.childElementCount > 5) toast.firstElementChild.remove();
  }

  // 输入**先于**资产加载接上：否则加载那一两秒内玩家的按键会被整段吞掉
  const input = new Input(canvas);
  hud.innerHTML = '<div class="hud-mid">正在撕开裂缝……</div>';

  // HUD 节点**建一次**，之后只改 textContent / style。
  // 每帧重写 innerHTML 会让浏览器每秒重解析 60 次 DOM ——
  // 实测那样帧率掉到 0.57x（84 秒真实时间只推进 48 秒游戏时间）。
  function buildHud() {
    hud.innerHTML = `
      <div class="hud-left">
        <div class="hud-hp"><i class="hp-ghost"></i><i></i></div><span data-hp></span>
      </div>
      <div class="hud-mid" data-stage></div>
      <div class="sidequest"><span class="sq-bar"><i class="sq-fill"></i></span><span data-quest></span></div>
      <div class="combo-display" data-combo hidden></div>
      <div class="hud-right">
        <b class="gene" data-genes></b> · 噬灭 <b data-kills></b> · 同屏 <span data-screen></span>
        <span class="hud-cd" data-devour></span><span class="hud-cd" data-dodge></span>
        <button class="hud-btn" data-pause type="button">⏸ 暂停</button>
        <button class="hud-btn" data-mute type="button">🔊</button>
        <button class="hud-btn" data-retire type="button" hidden>🚪 撤离</button>
      </div>
      <div class="hud-mech" data-mech></div>
      <div class="hud-active" data-active></div>`;
    return {
      hpBar: hud.querySelector('.hud-hp i:not(.hp-ghost)'),
      hpGhost: hud.querySelector('.hud-hp .hp-ghost'),   // 残影条：延迟过渡的旧血量，掉血量一眼可读
      hp: hud.querySelector('[data-hp]'),
      stage: hud.querySelector('[data-stage]'),
      quest: hud.querySelector('[data-quest]'),
      questFill: hud.querySelector('.sq-fill'),
      combo: hud.querySelector('[data-combo]'),
      genes: hud.querySelector('[data-genes]'),
      kills: hud.querySelector('[data-kills]'),
      screen: hud.querySelector('[data-screen]'),
      devour: hud.querySelector('[data-devour]'),
      dodge: hud.querySelector('[data-dodge]'),
      mech: hud.querySelector('[data-mech]'),
      active: hud.querySelector('[data-active]'),
      pause: hud.querySelector('[data-pause]'),
      mute: hud.querySelector('[data-mute]'),
      retire: hud.querySelector('[data-retire]'),
    };
  }

  const assets = await new Assets().load(plane.id);
  const renderer = new Renderer(canvas, assets, plane.id);

  let last = performance.now();
  let raf = 0;
  let paused = false;
  let lastState = null;
  let timeScale = 1;          // 调试用倍速，见 __shizu.setTimeScale
  const SIM_STEP = 1 / 60;    // 仿真固定步长（与全部平衡测试同基线）
  let simAcc = 0;             // 未消耗的仿真时间累加器
  let hitStop = 0;            // 命中停顿剩余时长：暴击/爆炸瞬间冻结仿真几十毫秒，渲染照跑
  ctx.setTimeScale = (n) => { timeScale = Math.max(0.1, Math.min(60, n)); };

  // 可访问性：暂停与静音。切后台自动暂停，避免回来时已被围死。
  let userPaused = false;
  const setPaused = (v) => {
    userPaused = v;
    paused = v;
    if (v) audio.stopBgm(); else { audio.startBgm(plane.id); last = performance.now(); simAcc = 0; }
    if (H?.pause) H.pause.textContent = v ? '▶ 继续' : '⏸ 暂停';
    if (pauseVeil) pauseVeil.classList.toggle('on', v);
  };
  const onKey = (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); setPaused(!userPaused); }
    else if (e.code === 'KeyM') { e.preventDefault(); toggleMute(); }
  };
  const toggleMute = () => {
    const on = !audio.enabled;
    audio.setEnabled(on);
    if (on && !userPaused) audio.startBgm(plane.id);
    if (H?.mute) H.mute.textContent = on ? '🔊' : '🔇';
  };
  const onVisibility = () => { if (document.hidden && !userPaused) setPaused(true); };
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    input.dispose();
    renderer.dispose();
  };

  // 新手引导：首局显示一次
  if (ctx.save.player.totalRuns === 0) {
    view.showModal({
      title: '第一次苏醒',
      body: `<div class="tut">
        <div class="tut-row"><em>移动</em><span><b>WASD</b> / 方向键，触屏则<b>拖动</b>屏幕</span></div>
        <div class="tut-row"><em>攻击</em><span>自动索敌，靠近敌人就出招</span></div>
        <div class="tut-row"><em>吞噬爆发</em><span><b>空格</b> —— 范围吸取基因 + 回血 + 狂暴</span></div>
        <div class="tut-row"><em>闪避翻滚</em><span><b>Shift</b> —— 0.25 秒无敌，用来穿弹幕</span></div>
        <div class="tut-row"><em>变强</em><span>击杀掉落<b>基因</b>，攒满触发<b>三选一进化</b></span></div>
        <div class="tut-row"><em>目标</em><span>活着击破<b>位面之主</b>，带回战利品回巢</span></div>
      </div>`,
      buttons: [{ text: '醒来，去吞噬', style: 'primary', onClick: () => view.closeModal() }],
    });
  }

  let frameErrCount = 0;
  function frame(now) {
    try {
      frameBody(now);
    } catch (err) {
      // 韧性：单帧异常降级为限流日志，绝不杀死 RAF 循环——
      // 循环一死页面就是硬冻结（用户实测：击杀精英后网页卡死）。
      // 根因仍会以 console.error 暴露给 shots/排查工具。
      frameErrCount++;
      if (frameErrCount <= 5 || frameErrCount % 300 === 0) {
        console.error(`[battleScreen] 帧异常 #${frameErrCount}:`, err);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function frameBody(now) {
    const real = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!paused) {
      // 固定步长推进（fix your timestep）：仿真恒定 1/60 一步。
      // 变步长会让 144Hz / 30Hz 设备打出不同结果，而全部平衡测试都在 1/60 下校准，
      // 这里对齐后线上手感与测试基线一致；余下不足一步的时间留到下一帧累计。
      const move = input.read();
      input.tickHold(real);
      const act = input.takeActions();
      if (act.devour) run.devour();
      if (act.dodge) run.dodge(move);
      // 命中停顿：冻结的是仿真推进，不是渲染 —— 刀刃入肉的顿挫感。
      // 只影响表现节奏（headless 平衡测试跑 core，不经此处），随机序列不受影响。
      if (hitStop > 0) hitStop -= real;
      else {
        simAcc += real * timeScale;
        // 上限 40 步：卡顿或倍速时不追平全部欠账，避免「死亡螺旋」越算越卡
        let steps = Math.min(40, Math.floor(simAcc / SIM_STEP));
        simAcc -= steps * SIM_STEP;
        if (simAcc > SIM_STEP * 40) simAcc = 0;   // 长时间挂起后丢弃积压
        for (; steps > 0 && run.state === RunState.FIGHTING; steps--) run.update(SIM_STEP, move);
      }
      const fx = run.drainEffects();
      // 停顿触发延迟一帧生效：本帧的特效先画出来，下一帧再冻 —— 视觉上是「打中→顿住」
      if (fx.some((e) => e.type === 'crit' || e.type === 'burst')) hitStop = 0.05;
      renderer.pushEffects(fx);
      audio.onEffects(fx);
    }
    const dt = real;
    renderer.draw(run, dt);
    drawHud(dt);
    pumpToast();
    drawStick();
    // 动态音乐：Boss 在场或血量过低时，BGM 提速加层（紧张度驱动）
    const lowHp = run.hp / Math.max(1, run.stats.maxHp) < 0.3;
    const bossOn = (run.enemies ?? []).some((e) => e.kind === 'boss' && !e.dead);
    audio.setIntensity(bossOn || lowHp ? 1 : 0);

    // 只在**状态发生变化**时弹一次窗。
    // 早期版本每帧都调 showChoice()，模态框每秒重建 60 次 ——
    // 玩家点不中（元素一直在销毁重建），帧率也被 DOM 重建拖垮。
    if (run.state !== lastState) {
      lastState = run.state;
      if (run.state === RunState.CHOOSING) { paused = true; audio.sfx('levelup'); renderer.pulse(); showChoice(); }
      else if (run.state === RunState.SLOT_CONFLICT) { paused = true; audio.sfx('levelup'); showSlotConflict(); }
      else if (run.state === RunState.SHOPPING) { paused = true; audio.sfx('gene'); showShop(); }
      else if (run.state === RunState.WON || run.state === RunState.LOST) {
        audio.sfx(run.state === RunState.WON ? 'won' : 'lost');
        showSettle();
        return;
      }
    }

    // RAF 续约由外层 frame() 的韧性包装负责（单帧异常不再杀死循环）
  }
  raf = requestAnimationFrame(frame);

  const H = buildHud();
  const pauseVeil = root.querySelector('#pauseVeil');
  H.pause?.addEventListener('click', () => setPaused(!userPaused));
  H.mute?.addEventListener('click', toggleMute);
  // 无尽模式：随时主动撤离并保住战利品（贪多必死 → 收手也是一种技术）
  if (run.endless && H.retire) {
    H.retire.hidden = false;
    H.retire.addEventListener('click', () => {
      view.showModal({
        title: '撤离深渊？',
        body: `<p>当前深渊第 <b class="gold">${run.endlessLayer}</b> 层，基因 <b class="gold">${run.genes}</b>。</p>`
          + '<p class="small">撤离后立即以胜利结算，保住全部战利品；继续深入则敌人更强、基因更多。</p>',
        buttons: [
          { text: '撤离结算', style: 'primary', onClick: () => { view.closeModal(); run.retire(); } },
          { text: '继续深入', onClick: () => view.closeModal() },
        ],
      });
    });
  }
  let hudTick = 0;
  function drawHud(dt) {
    hudTick += dt;
    if (hudTick < 0.1) return;      // HUD 10Hz 足够，没必要跟着 60fps 刷
    hudTick = 0;
    const mm = String(Math.floor(run.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(run.time % 60)).padStart(2, '0');
    const hpWidth = `${Math.max(0, (run.hp / run.stats.maxHp) * 100)}%`;
    H.hpBar.style.width = hpWidth;
    // 残影条赋同一个宽度：它带 0.3s 延迟的慢过渡，掉血时黄色旧值缓慢追平 ——
    // 「这一下掉了多少」不用心算，格斗游戏血条的标配做法
    H.hpGhost.style.width = hpWidth;
    H.hp.textContent = `${Math.max(0, Math.round(run.hp))} / ${Math.round(run.stats.maxHp)}`;
    H.stage.textContent = run.endless && run.endlessLayer > 0
      ? `深渊 ${run.endlessLayer} 层 · ⏱ ${mm}:${ss}`
      : `阶段 ${run.stageNo}/5 · ⏱ ${mm}:${ss}`;
    // 支线协议进度（无限流任务制）：10Hz 同步，完成打勾、超时划叉
    if (H.quest) {
      const q = run.sideQuest;
      if (!q || run.sideQuestFailed) { H.quest.textContent = ''; if (H.questFill) H.questFill.style.width = '0'; }
      else {
        const prog = run.sideQuestProgress();
        const done = run.isSideQuestDone();
        const pct = Math.min(100, Math.round((prog / q.target) * 100));
        H.quest.textContent = done
          ? `✅ 支线【${q.name}】达成 +${q.reward}基因`
          : `支线【${q.name}】 ${prog}/${q.target}`;
        if (H.questFill) H.questFill.style.width = `${Math.min(100, pct)}%`;
        H.quest.className = `sidequest${done ? ' done' : ''}${run.sideQuestFailed ? ' failed' : ''}`;
      }
    }
    H.genes.textContent = `基因 ${run.genes}`;
    H.kills.textContent = run.kills;
    H.screen.textContent = run.onScreen;
    // 击杀连击可视化：连击数 ≥3 时显示，1.5s 无击杀自动隐藏
    if (H.combo) {
      const combo = run.comboCount ?? 0;
      const active = combo >= 3 && (run.time - (run.lastKillTime ?? -99)) <= 1.5;
      if (active) {
        H.combo.hidden = false;
        H.combo.textContent = `${combo} COMBO`;
        H.combo.style.fontSize = `${Math.min(28, 14 + combo * 0.5)}px`;
      } else {
        H.combo.hidden = true;
      }
    }
    const p = run.player;
    H.devour.textContent = p.devourCd > 0 ? `吞噬 ${p.devourCd.toFixed(0)}s` : '吞噬 就绪';
    H.devour.className = `hud-cd ${p.devourCd > 0 ? '' : 'ready'}`;
    // CD 芯片底部填充（CSS 读 --cd 画 scaleX 进度条）：恢复进度不用心算
    H.devour.style.setProperty('--cd', p.devourCd > 0 ? String(1 - p.devourCd / DEVOUR_CD) : '0');
    H.dodge.textContent = p.dodgeCd > 0 ? '闪避 …' : '闪避 就绪';
    H.dodge.className = `hud-cd ${p.dodgeCd > 0 ? '' : 'ready'}`;
    H.dodge.style.setProperty('--cd', p.dodgeCd > 0 ? String(1 - p.dodgeCd / DODGE_CD) : '0');
    const MECH_LABEL = {
      combo: '⚔️ 连击连招', chain: '⚡ 雷链弹射', corpseBlast: '💀 尸爆连锁', missile: '🚀 周期导弹',
      multishot: '🎯 弹幕翻倍', parasite: '🩸 寄生反水', reflect: '🛡 金身反击', stomp: '👣 践踏震荡', laser: '🔦 机关激光',
    };
    // 没流派、弹体又只有 1 发时这行没有任何信息量，留空（CSS :empty 会整块隐藏）
    const proj = run.projCount ?? 1;
    H.mech.textContent = run.miniRushRemaining > 0
      ? `⚠ 急袭挑战 · 剩余 ${run.miniRushRemaining}`
      : run.routeMech ? `${MECH_LABEL[run.routeMech] ?? ''} · 弹体 ×${proj}`
      : proj > 1 ? `弹体 ×${proj}`
      : '';
    H.active.innerHTML = run.activeSkillStatus.map((s) => {
      // 就绪态不给填充（与吞噬/闪避芯片一致）：绿色 ready 底本身就是「满了」的信号
      const ratio = s.ready || !(s.cd > 0) ? 0 : Math.max(0, Math.min(1, 1 - s.left / s.cd));
      return `<span class="hud-cd ${s.ready ? 'ready' : ''}" style="--cd:${ratio.toFixed(3)}">${s.name} ${s.ready ? '就绪' : `${s.left.toFixed(0)}s`}</span>`;
    }).join('');
  }

  function resume() {
    paused = false;
    lastState = run.state;      // 同步守卫，允许下一次进入 CHOOSING 再弹
    last = performance.now();
    simAcc = 0;                 // 三选一停顿期间不积压仿真时间
  }

  function showChoice() {
    const { reason, options } = run.pendingOptions;
    const s = run.stats;
    // 可读的决策：属性选项展示「改前→改后」的实际数值，而不是抽象百分比
    const deltas = (o) => {
      const e = o.eff ?? {};
      const p = [];
      const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
      if (e.atkPct) p.push(`攻击 ${s.atk.toFixed(1)} → <i>${(s.atk * (1 + e.atkPct)).toFixed(1)}</i>`);
      if (e.hpPct) p.push(`生命 ${Math.round(s.maxHp)} → <i>${Math.round(s.maxHp * (1 + e.hpPct))}</i>`);
      if (e.speedPct) p.push(`移速 ${s.speed.toFixed(0)} → <i>${(s.speed * (1 + e.speedPct)).toFixed(0)}</i>`);
      if (e.aspdPct) p.push(`攻速 ${s.aspd.toFixed(2)} → <i>${(s.aspd * (1 + e.aspdPct)).toFixed(2)}</i>`);
      if (e.crit) p.push(`暴击 ${pct(s.crit)} → <i>${pct(s.crit + e.crit)}</i>`);
      if (e.aoe) p.push(`范围 ${pct(1 + (s.aoe ?? 0))} → <i>${pct(1 + (s.aoe ?? 0) + e.aoe)}</i>`);
      if (e.lifesteal) p.push(`吸血 ${pct(s.lifesteal)} → <i>${pct(s.lifesteal + e.lifesteal)}</i>`);
      return p.join('　');
    };
    // 构筑共鸣提示：告诉玩家「再拿哪一个就能凑成套」，让选择有目标
    const synergyHint = () => {
      const rows = [];
      for (const syn of SYNERGIES) {
        if (run.firedSynergies.has(syn.id)) continue;
        const missing = syn.need.filter((id) => !run.ownedPicks.has(id));
        if (missing.length !== 1) continue;
        const key = missing[0];
        const inThisRoll = options.some((o) => o.id === key);
        rows.push(`<div class="small${inThisRoll ? ' gold' : ''}">${inThisRoll ? '★ ' : ''}${syn.name}：还差 1 件即可成立${inThisRoll ? '（本次可选）' : ''}</div>`);
      }
      const fired = [...run.firedSynergies];
      const head = fired.length ? `<div class="small gold">已成立共鸣 ×${fired.length}</div>` : '';
      return head + rows.slice(0, 3).join('');
    };
    // 卡片本身就是按钮 —— 以前是「3 张卡展示 + 3 个『获得 X』按钮 + 3 个放逐按钮」，
    // 同一件事列三遍，弹窗被撑到需要滚动才看得见选项。
    const TAG = { skill: '技能', mech: '强化', attr: '属性' };
    const card = (o, i) => {
      const detail = o.kind === 'skill'
        ? `${o.desc}　<i class="gold">${o.val}</i>`
        : o.kind === 'mech' ? o.desc
        : (deltas(o) || o.desc);   // 属性只给实数，desc 是同义的抽象百分比
      const sub = o.kind === 'skill'
        ? `<span class="pick-sub">${ROUTES[o.route].name} · 第 ${o.lv} 段</span>` : '';
      return `<div class="pick pick-btn k-${o.kind}" data-pick="${i}" role="button" tabindex="0">
          <span class="pick-head"><em class="pick-tag">${TAG[o.kind] ?? '进化'}</em><b>${o.name}</b>${sub}</span>
          <span class="pick-detail">${detail}</span>
          ${run.banishLeft > 0
            ? `<button type="button" class="pick-banish" data-banish="${i}" title="永久放逐，本局不再出现">✕ 放逐</button>`
            : ''}
        </div>`;
    };
    view.showModal({
      title: `${reason} · 选择你的进化`,
      body: options.map(card).join('')
        + synergyHint()
        + (run.dungeon.channel !== 'skill'
          ? '<p class="small sealed">ℹ 属性通道：三选一只出属性强化——技能需在匹配位面路线的技能通道获取</p>'
          : '')
        + `<p class="small pick-foot">基因 <b class="gold">${run.genes}</b>`
        + `　放逐剩 ${run.banishLeft} 次</p>`,
      buttons: [{
        text: `♻ 重掷（${run.rerollCost} 基因）`,
        disabled: run.genes < run.rerollCost,
        onClick: () => {
          view.closeModal();
          if (run.reroll() && run.pendingOptions) showChoice();
          else resume();
        },
      }],
      onMount: (rootEl) => {
        const pick = (i) => { view.closeModal(); run.choose(i); resume(); };
        for (const el of rootEl.querySelectorAll('[data-pick]')) {
          const i = Number(el.dataset.pick);
          el.addEventListener('click', () => pick(i));
          // 键盘可达：Enter/空格等同点击
          el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(i); }
          });
        }
        for (const el of rootEl.querySelectorAll('[data-banish]')) {
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();   // 别让点击冒泡成「选中这张卡」
            view.closeModal();
            if (run.banish(Number(el.dataset.banish)) && run.pendingOptions) showChoice();
            else resume();
          });
        }
      },
    });
  }

  /** 裂缝黑市：阶段间用基因换即时战力（攒着升级 vs 现在买） */
  function showShop() {
    const items = run.shopItems ?? [];
    // 黑市 v2（backlog 交互弱）：内联购物卡片替代按钮墙——每件商品一张卡，
    // 名称/效果/价格/购买按钮一体化，点卡即买。底部只留「离开」。
    const renderCards = () => {
      return items.map((it, i) => {
        const bought = run.shopBought?.has(it.id);
        const afford = run.genes >= it.price;
        return `<div class="shop-item${bought ? ' bought' : ''}${!afford && !bought ? ' poor' : ''}">`
          + `<div class="shop-info"><b>${it.name}</b><div class="small">${it.desc}</div></div>`
          + `<div class="shop-buy">`
          + `<span class="shop-price ${afford ? 'gold' : 'sealed'}">${it.price} 🧬</span>`
          + (bought
            ? `<span class="small sealed">已购</span>`
            : `<button class="shop-btn" data-shop="${i}" ${(!afford) ? 'disabled' : ''}>购入</button>`)
          + `</div></div>`;
      }).join('');
    };
    const renderBody = () =>
      `<p class="small">当前基因 <b class="gold gene-balance">${run.genes}</b> 🧬　—— 花掉的基因不再计入升级进度，权衡再买。</p>`
      + `<div class="shop-list">${renderCards()}</div>`;

    const bindShop = (root) => {
      root.querySelectorAll('[data-shop]').forEach((btn) => {
        btn.addEventListener('click', () => {
          audio.sfx('crit');   // 购入音：与暴击同款上扬双音，强化「买到」的正反馈
          const idx = Number(btn.dataset.shop);
          run.buyShopItem(idx);
          // 局部刷新：只更新卡片和余额，不重建整个模态
          root.querySelector('.shop-list').innerHTML = renderCards();
          root.querySelector('.gene-balance').textContent = run.genes;
          bindShop(root);   // 重绑（innerHTML 替换了旧按钮）
        });
      });
    };

    view.showModal({
      title: `裂缝黑市 · 阶段 ${run.stageNo}`,
      body: renderBody(),
      buttons: [{ text: '离开黑市', onClick: () => { view.closeModal(); run.closeShop(); resume(); } }],
      onMount: bindShop,
    });
  }

  function showSlotConflict() {
    const { skill, options } = run.pendingSkill;
    view.showModal({
      title: '技能槽已满',
      body: `<p>要装载 <b class="gold">${skill.name}</b>，需替换掉一个已有技能。</p>`
        + `<p class="small">被替换的技能将被销毁。隐藏技能刻印的槽位不可替换。</p>`,
      buttons: [
        ...options.map((k) => ({
          text: `替换 ${SLOT_LABEL[k]}（${ctx.save.player.skillSlots[k]?.name ?? '空'}）`,
          onClick: () => { view.closeModal(); run.resolveSlotConflict(k); resume(); },
        })),
        { text: '放弃新技能', onClick: () => { view.closeModal(); run.resolveSlotConflict(null); resume(); } },
      ],
    });
  }

  function showSettle() {
    cancelAnimationFrame(raf);
    cleanup();
    audio.stopBgm();
    const r = run.finalize(ctx.repo);
    const mm = Math.floor(r.survivedSec / 60);
    const ss = String(r.survivedSec % 60).padStart(2, '0');
    const lines = [
      `<div class="diff-row">评级 <b class="gold" style="font-size:18px">${r.grade}</b>　抵达阶段 ${r.stageReached}/5　存活 ${mm}:${ss}</div>`,
      `<div class="diff-row">噬灭 <b class="gold">${r.kills}</b> 只（杂兵 ${r.minionKills}）</div>`,
      `<div class="diff-row">吞噬基因 <b class="gold">${r.genes}</b></div>`,
    ];
    // 结算分区（backlog 界面丑）：把长列表按「战斗/成长/前瞻」分节，扫读更快
    const section = (t) => lines.push(`<div class="settle-section">${t}</div>`);
    section('成长与收获');
    if (r.growth.grants.length) {
      lines.push(`<div class="diff-row">永久成长：${r.growth.grants.map((g) => `${g.label} +${g.pct}%`).join('，')}</div>`);
    }
    for (const a of r.activations) {
      const route = ROUTES[a.route];
      const mech = MECH_INFO[ROUTE_MECHANIC[a.route]];
      // 基因锁解锁演出（backlog 剧情单薄）：立绘 + 定位 + 机制说明——首次激活是里程碑时刻
      lines.push(`<div class="unlock-card">`
        + `<img class="unlock-portrait" src="../shizu-cocos/assets/art/units/player_${a.route}.png" alt="${route.name}">`
        + `<div class="unlock-body">`
        + `<div class="gold" style="font-size:15px">⟡ 基因锁激活：${route.name}</div>`
        + `<div class="small">${route.role} · ${mech ? `${mech.name} —— ${mech.desc}` : ''}</div>`
        + (a.newlySealed.length ? `<div class="small sealed">⚠ 互斥封印：${a.newlySealed.map((s) => ROUTES[s].name).join('、')}</div>` : '')
        + `</div></div>`);
    }
    for (const c of r.charges) {
      // 基因锁升级反馈（backlog 剧情单薄）：说明每段的实际收益，让「升段」有意义
      lines.push(`<div class="diff-row">${ROUTES[c.route].name} 基因锁：第 ${c.from} → 第 <b class="gold">${c.to}</b> 段`
        + `<span class="small">　战力 +${((c.to - c.from) * 2).toFixed(0)}%</span></div>`);
    }
    if (r.hiddenSkill) lines.push(`<div class="diff-row hidden">🔥 禁忌显现：<b>${r.hiddenSkill.name}</b></div>`);
    for (const a of r.achievements ?? []) {
      lines.push(`<div class="diff-row gold">🏅 成就达成「${a.name}」 —— 奖励：${a.reward}</div>`);
    }
    if (r.relics.length) {
      lines.push(`<div class="diff-row relic">⟡ 传承残影：</div>`);
      for (const id of r.relics) {
        const relic = relicById(id);
        // 故事正文交给 .small 的默认次级灰，不再内联另一个一次性灰
        lines.push(`<div class="small" style="padding:4px 8px;line-height:1.5"><b class="gold">${relic.name}</b>　${relic.story}</div>`);
      }
    }
    if (r.gear.length) {
      lines.push(`<div class="diff-row">装备 ×${r.gear.length}</div>`
        + r.gear.slice(0, 5).map((g) => `<div class="bag-item">${gearItemHtml(g)}</div>`).join(''));
    }
    section('难度与前瞻');
    lines.push(`<div class="diff-row small">难度进化：${r.dyn.before.toFixed(2)} → <b>${r.dyn.after.toFixed(2)}</b></div>`);
    // 结算激励：与历史最佳对比，明确「这局离突破还差多少」
    lines.push(r.newBest
      ? `<div class="diff-row gold">★ 新纪录：阶段 ${r.stageReached}/5（旧纪录 ${r.prevBestStage}）</div>`
      : `<div class="diff-row small">历史最佳 阶段 ${r.prevBestStage}/5 —— 本局 ${r.stageReached}/5，${r.prevBestStage - r.stageReached <= 0 ? '再稳一点就能刷新' : `还差 ${r.prevBestStage - r.stageReached} 阶段`}</div>`);
    // 动态下一局建议（backlog 剧情单薄）：根据本局表现生成针对性策略提示
    const hints = [];
    if (!r.victory && r.stageReached <= 2) hints.push('前期生存不足——回巢优先升级「厚甲之壳」和「血饲之牙」');
    else if (!r.victory) hints.push('后期乏力——尝试换一条出征路线，或叠加「贪婪诅咒」提高收益');
    if (r.victory) hints.push('已通关！试试更高难度位面或无尽模式');
    if (r.gradeBonusGenes > 0) hints.push(`获得 ${r.gradeBonusGenes} 评级加成基因——保持支线完成度可持续触发`);
    if (r.activations.length) hints.push('新路线已激活——下局可用该路线的出征武器体验新机制');
    if (!hints.length) hints.push(r.victory ? '试试无尽模式冲击深渊层' : '回巢强化后再开裂缝');
    lines.push(`<div class="diff-row small">💡 ${hints.slice(0, 2).join('；')}</div>`);

    // 结局演出：首通诸天之心 → 巢灵成新噬祖
    if (r.victory && r.plane.id === 'zhutian' && r.firstClear) {
      view.showModal({
        title: '结局 · 诸天归一',
        body: `
          <p class="gold" style="font-size:17px;line-height:1.7">「诸天又连成一片了。可裂缝还会再开。到时候，记得回来吃饭。」</p>
          <p class="small" style="margin-top:10px">—— 巢灵吞噬了崩坏之影，成为新的噬祖。</p>
          <p class="small">诸天重归完整。而所有的吞噬，都有了归处。</p>
          <p class="small gold" style="margin-top:10px">《噬祖》 · 完　★ 无尽模式已解锁</p>`,
        buttons: [{ text: '回 巢', style: 'primary', onClick: () => { view.closeModal(); ctx.toLobby(); } }],
      });
      return;
    }

    view.showModal({
      title: r.victory ? `噬灭 · ${r.plane.name}` : `身陨 · ${r.plane.name}`,
      body: lines.join(''),
      buttons: [{ text: '回 巢', style: 'primary', onClick: () => { view.closeModal(); ctx.toLobby(); } }],
    });
  }
}

export { ARENA };
