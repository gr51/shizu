// ===== game/battleScreen.js · 实时战斗界面（装配层）=====
// 把 core/battle.js 的仿真、game/renderer 的绘制、game/input 的输入接起来，
// 并在三选一 / 槽位冲突 / 结算时挂起循环、弹出既有的 UI 模态。

import { RealtimeRun, ARENA } from '../../../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../../../shizu-cocos/assets/scripts/core/run.js';
import { generateDungeon } from '../../../shizu-cocos/assets/scripts/core/dungeon.js';
import { SLOT_LABEL } from '../../../shizu-cocos/assets/scripts/core/skillSlots.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { relicById } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { Assets } from './assets.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { gearItemHtml } from '../ui/cards.js';
import * as view from '../ui/view.js';

export async function startBattle(ctx, plane) {
  const seed = Math.floor(ctx.rng() * 0xffffffff) >>> 0;
  const dungeon = generateDungeon(plane, ctx.save, seed);
  const run = new RealtimeRun(ctx.save, dungeon, seed ^ 0x9e3779b9);
  ctx.run = run;

  audio.unlock();
  audio.startBgm(plane.id);

  const root = view.showBattleStage();
  const canvas = root.querySelector('#gameCanvas');
  const hud = root.querySelector('#hud');

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
      </div>
      <div class="hud-mech" data-mech></div>`;
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
    };
  }

  const assets = await new Assets().load(plane.id);
  const renderer = new Renderer(canvas, assets, plane.id);

  let last = performance.now();
  let raf = 0;
  let paused = false;
  let lastState = null;
  let timeScale = 1;          // 调试用倍速，见 __shizu.setTimeScale
  ctx.setTimeScale = (n) => { timeScale = Math.max(0.1, Math.min(60, n)); };

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
      // 倍速时切成多个小步长推进，避免一帧跨太多导致碰撞穿透
      const total = real * timeScale;
      const steps = Math.min(40, Math.ceil(total / 0.05));
      const dt = total / steps;
      const move = input.read();
      input.tickHold(real);
      const act = input.takeActions();
      if (act.devour) run.devour();
      if (act.dodge) run.dodge(move);
      for (let i = 0; i < steps && run.state === RunState.FIGHTING; i++) run.update(dt, move);
      const fx = run.drainEffects();
      renderer.pushEffects(fx);
      audio.onEffects(fx);
    }
    const dt = real;
    renderer.draw(run, dt);
    drawHud(dt);

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
  let hudTick = 0;
  function drawHud(dt) {
    hudTick += dt;
    if (hudTick < 0.1) return;      // HUD 10Hz 足够，没必要跟着 60fps 刷
    hudTick = 0;
    const mm = String(Math.floor(run.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(run.time % 60)).padStart(2, '0');
    H.hpBar.style.width = `${Math.max(0, (run.hp / run.stats.maxHp) * 100)}%`;
    H.hp.textContent = `${Math.max(0, Math.round(run.hp))} / ${Math.round(run.stats.maxHp)}`;
    H.stage.textContent = `阶段 ${run.stageNo}/5 · ⏱ ${mm}:${ss}`;
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
    H.mech.textContent = run.routeMech ? MECH_LABEL[run.routeMech] ?? '' : '';
  }

  function resume() {
    paused = false;
    lastState = run.state;      // 同步守卫，允许下一次进入 CHOOSING 再弹
    last = performance.now();
  }

  function showChoice() {
    const { reason, options } = run.pendingOptions;
    view.showModal({
      title: `${reason} · 选择你的进化`,
      body: options.map((o) => (o.kind === 'skill'
        ? `<div class="pick"><b>【技能】${o.name}</b> <span class="small">${ROUTES[o.route].name}·第 ${o.lv} 段</span><span>${o.desc}　<i class="gold">${o.val}</i></span></div>`
        : `<div class="pick attr"><b>【属性】${o.name}</b><span>${o.desc}</span></div>`)).join(''),
      buttons: options.map((o, i) => ({
        text: o.kind === 'skill' ? `习得 ${o.name}` : `获得 ${o.name}`,
        style: o.kind === 'skill' ? 'primary' : '',
        onClick: () => { view.closeModal(); run.choose(i); resume(); },
      })),
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
