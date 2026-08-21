// ===== game/battleScreen.js · 实时战斗界面（装配层）=====
// 把 core/battle.js 的仿真、game/renderer 的绘制、game/input 的输入接起来，
// 并在三选一 / 槽位冲突 / 结算时挂起循环、弹出既有的 UI 模态。

import { RealtimeRun, ARENA } from '../../../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../../../shizu-cocos/assets/scripts/core/run.js';
import { generateDungeon } from '../../../shizu-cocos/assets/scripts/core/dungeon.js';
import { SLOT_LABEL } from '../../../shizu-cocos/assets/scripts/core/skillSlots.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';
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
      setTimeout(() => el.remove(), 2600);
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
        <div class="hud-hp"><i></i></div><span data-hp></span>
      </div>
      <div class="hud-mid" data-stage></div>
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
      hpBar: hud.querySelector('.hud-hp i'),
      hp: hud.querySelector('[data-hp]'),
      stage: hud.querySelector('[data-stage]'),
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
      body: `<div class="small" style="line-height:1.9">
        · <b>拖动</b>屏幕移动你的巢灵<br>
        · <b>自动攻击</b>：靠近敌人就出招<br>
        · 击杀掉落<b>基因</b>，靠近自动吸收<br>
        · 基因攒满触发<b>三选一升级</b>，越升越强<br>
        · 活着击破<b>位面之主</b>，带回战利品回巢
      </div>`,
      buttons: [{ text: '醒来，去吞噬', style: 'primary', onClick: () => view.closeModal() }],
    });
  }

  function frame(now) {
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
      simAcc += real * timeScale;
      // 上限 40 步：卡顿或倍速时不追平全部欠账，避免「死亡螺旋」越算越卡
      let steps = Math.min(40, Math.floor(simAcc / SIM_STEP));
      simAcc -= steps * SIM_STEP;
      if (simAcc > SIM_STEP * 40) simAcc = 0;   // 长时间挂起后丢弃积压
      for (; steps > 0 && run.state === RunState.FIGHTING; steps--) run.update(SIM_STEP, move);
      const fx = run.drainEffects();
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
      else if (run.state === RunState.WON || run.state === RunState.LOST) {
        audio.sfx(run.state === RunState.WON ? 'won' : 'lost');
        showSettle();
        return;
      }
    }

    raf = requestAnimationFrame(frame);
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
    H.hpBar.style.width = `${Math.max(0, (run.hp / run.stats.maxHp) * 100)}%`;
    H.hp.textContent = `${Math.max(0, Math.round(run.hp))} / ${Math.round(run.stats.maxHp)}`;
    H.stage.textContent = run.endless && run.endlessLayer > 0
      ? `深渊 ${run.endlessLayer} 层 · ⏱ ${mm}:${ss}`
      : `阶段 ${run.stageNo}/5 · ⏱ ${mm}:${ss}`;
    H.genes.textContent = `基因 ${run.genes}`;
    H.kills.textContent = run.kills;
    H.screen.textContent = run.onScreen;
    const p = run.player;
    H.devour.textContent = p.devourCd > 0 ? `吞噬 ${p.devourCd.toFixed(0)}s` : '吞噬 就绪';
    H.devour.className = `hud-cd ${p.devourCd > 0 ? '' : 'ready'}`;
    H.dodge.textContent = p.dodgeCd > 0 ? '闪避 …' : '闪避 就绪';
    H.dodge.className = `hud-cd ${p.dodgeCd > 0 ? '' : 'ready'}`;
    const MECH_LABEL = {
      combo: '⚔️ 连击连招', chain: '⚡ 雷链弹射', corpseBlast: '💀 尸爆连锁', missile: '🚀 周期导弹',
      multishot: '🎯 弹幕翻倍', parasite: '🩸 寄生反水', reflect: '🛡 金身反击', stomp: '👣 践踏震荡', laser: '🔦 机关激光',
    };
    H.mech.textContent = run.miniRushRemaining > 0
      ? `⚠ 急袭挑战 · 剩余 ${run.miniRushRemaining}`
      : run.routeMech ? `${MECH_LABEL[run.routeMech] ?? ''} · 弹体×${run.projCount ?? 1}` : `弹体×${run.projCount ?? 1}`;
    H.active.innerHTML = run.activeSkillStatus.map((s) =>
      `<span class="hud-cd ${s.ready ? 'ready' : ''}">${s.name} ${s.ready ? '就绪' : `${s.left.toFixed(0)}s`}</span>`).join('');
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
      if (e.atkPct) p.push(`攻击 ${s.atk.toFixed(1)}→${(s.atk * (1 + e.atkPct)).toFixed(1)}`);
      if (e.hpPct) p.push(`生命 ${Math.round(s.maxHp)}→${Math.round(s.maxHp * (1 + e.hpPct))}`);
      if (e.speedPct) p.push(`移速 +${Math.round(e.speedPct * 100)}%`);
      if (e.aspdPct) p.push(`攻速 +${Math.round(e.aspdPct * 100)}%`);
      if (e.crit) p.push(`暴击 +${Math.round(e.crit * 100)}%`);
      if (e.aoe) p.push(`范围 +${Math.round(e.aoe * 100)}%`);
      if (e.lifesteal) p.push(`吸血 +${Math.round(e.lifesteal * 100)}%`);
      return p.join(' · ');
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
    view.showModal({
      title: `${reason} · 选择你的进化`,      body: options.map((o) => {
        if (o.kind === 'skill') return `<div class="pick"><b>【技能】${o.name}</b> <span class="small">${ROUTES[o.route].name}·第 ${o.lv} 段</span><span>${o.desc}　<i class="gold">${o.val}</i></span></div>`;
        if (o.kind === 'mech') return `<div class="pick attr"><b>【强化】${o.name}</b><span>${o.desc}</span></div>`;
        return `<div class="pick attr"><b>【属性】${o.name}</b><span>${o.desc}</span><span class="gold">${deltas(o)}</span></div>`;
      }).join('')
        + synergyHint()
        + `<p class="small">基因 <b class="gold">${run.genes}</b>　重掷 ${run.rerollCost} 基因　放逐剩 ${run.banishLeft} 次</p>`,
      buttons: [
        ...options.map((o, i) => ({
          text: o.kind === 'skill' ? `习得 ${o.name}` : o.kind === 'mech' ? `强化 ${o.name}` : `获得 ${o.name}`,
          style: o.kind !== 'attr' ? 'primary' : '',
          onClick: () => { view.closeModal(); run.choose(i); resume(); },
        })),
        // 玩家能动性：三个都不想要时可花基因重掷，或永久放逐一个（本局不再出现）
        {
          text: `♻ 重掷（${run.rerollCost} 基因）`,
          disabled: run.genes < run.rerollCost,
          onClick: () => {
            view.closeModal();
            if (run.reroll() && run.pendingOptions) showChoice();
            else resume();
          },
        },
        ...(run.banishLeft > 0 ? options.map((o, i) => ({
          text: `🚫 放逐「${o.name}」（剩 ${run.banishLeft}）`,
          onClick: () => {
            view.closeModal();
            if (run.banish(i) && run.pendingOptions) showChoice();
            else resume();
          },
        })) : []),
      ],
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
    if (r.growth.grants.length) {
      lines.push(`<div class="diff-row">永久成长：${r.growth.grants.map((g) => `${g.label} +${g.pct}%`).join('，')}</div>`);
    }
    for (const a of r.activations) {
      lines.push(`<div class="diff-row gold">⟡ 永久激活基因锁：${ROUTES[a.route].name}</div>`);
      if (a.newlySealed.length) {
        lines.push(`<div class="diff-row" style="color:#a5717c">✕ 永久封印：${a.newlySealed.map((s) => ROUTES[s].name).join('、')}</div>`);
      }
    }
    for (const c of r.charges) {
      lines.push(`<div class="diff-row">${ROUTES[c.route].name} 基因锁：第 ${c.from} → 第 ${c.to} 段</div>`);
    }
    if (r.hiddenSkill) lines.push(`<div class="diff-row" style="color:#e0a3d8">🔥 禁忌显现：<b>${r.hiddenSkill.name}</b></div>`);
    for (const a of r.achievements ?? []) {
      lines.push(`<div class="diff-row gold">🏅 成就达成「${a.name}」 —— 奖励：${a.reward}</div>`);
    }
    if (r.relics.length) {
      lines.push(`<div class="diff-row" style="color:#c9b8ff">⟡ 传承残影：</div>`);
      for (const id of r.relics) {
        const relic = relicById(id);
        lines.push(`<div class="small" style="padding:4px 8px;line-height:1.5;color:#9aa4af"><b class="gold">${relic.name}</b>　${relic.story}</div>`);
      }
    }
    if (r.gear.length) {
      lines.push(`<div class="diff-row">装备 ×${r.gear.length}</div>`
        + r.gear.slice(0, 5).map((g) => `<div class="bag-item">${gearItemHtml(g)}</div>`).join(''));
    }
    lines.push(`<div class="diff-row small">难度进化：${r.dyn.before.toFixed(2)} → <b>${r.dyn.after.toFixed(2)}</b></div>`);
    // 结算激励：与历史最佳对比，明确「这局离突破还差多少」
    lines.push(r.newBest
      ? `<div class="diff-row gold">★ 新纪录：阶段 ${r.stageReached}/5（旧纪录 ${r.prevBestStage}）</div>`
      : `<div class="diff-row small">历史最佳 阶段 ${r.prevBestStage}/5 —— 本局 ${r.stageReached}/5，${r.prevBestStage - r.stageReached <= 0 ? '再稳一点就能刷新' : `还差 ${r.prevBestStage - r.stageReached} 阶段`}</div>`);
    lines.push(`<div class="diff-row small">下一局建议：${r.victory ? '难度已上调，可尝试更深阶段或换位面收集传承' : '带回的永久成长已入账，回巢强化后再开裂缝'}</div>`);

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
