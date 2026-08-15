// ===== ui/battle.js · 局内战斗界面 / 三选一 / 槽位冲突 / 结算 =====

import { RunState } from '../../../shizu-cocos/assets/scripts/core/run.js';
import { SLOT_LABEL } from '../../../shizu-cocos/assets/scripts/core/skillSlots.js';
import { DIFFICULTY_LABEL } from '../../../shizu-cocos/assets/scripts/core/balance.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { gearCard, gearItemHtml, geneCard, metaLine, playerCard, slotsCard } from './cards.js';
import * as view from './view.js';

export function renderBattle(ctx) {
  const { save, run } = ctx;
  const d = run.dungeon;
  const target = run.target;

  view.setMeta(metaLine(save, `副本 D <b>${d.D.toFixed(1)}</b>`));
  view.setTitle(`${d.plane.name} · ${d.plane.theme}`);

  const channelText = d.channel === 'skill'
    ? `<b class="gold">技能通道</b>（${d.channelRoutes.map((r) => ROUTES[r].name).join('/')}）`
    : '<b>属性通道</b>（零技能 · 装备掉率 ×1.5）';
  const targetText = target
    ? `　当前目标：<b>${target.name}</b> HP ${Math.max(0, Math.round(target.hp))}/${target.maxHp}`
      + (target.kind === 'boss' ? ' <span class="gold">【位面之主】</span>' : target.kind === 'elite' ? ' 【精英】' : '')
    : '';
  view.setDesc(
    `阶段 ${run.stageNo}/5 · 波次 ${run.waveIndex + 1}/${run.stage.waves.length}`
    + ` · ${DIFFICULTY_LABEL[d.difficultyLevel]} · ${channelText}${targetText}`,
  );

  view.setCards({
    playerCard: playerCard(save, run),
    geneCard: geneCard(save, run),
    gearCard: gearCard(save),
    slotsCard: slotsCard(save),
  });
  view.renderLog(run.log);
  view.setOptions([]);

  switch (run.state) {
    case RunState.FIGHTING:
      view.setAdvance(true, '前 进 ▶', () => { run.step(); renderBattle(ctx); });
      view.setHint('点击「前进」推进一次交锋');
      break;
    case RunState.CHOOSING:
      view.setAdvance(false);
      showChoice(ctx);
      break;
    case RunState.SLOT_CONFLICT:
      view.setAdvance(false);
      showSlotConflict(ctx);
      break;
    case RunState.WON:
    case RunState.LOST:
      view.setAdvance(false);
      showSettle(ctx);
      break;
    default:
      view.setAdvance(false);
  }
}

function showChoice(ctx) {
  const { run } = ctx;
  const { reason, options } = run.pendingOptions;
  view.showModal({
    title: `${reason} · 选择你的进化`,
    body: options.map((o) => {
      if (o.kind === 'skill') {
        return `<div class="pick"><b>【技能】${o.name}</b> <span class="small">${ROUTES[o.route].name}·第 ${o.lv} 段 · ${o.skillKind === 'active' ? '主动' : '被动'}${o.cd ? ` CD${o.cd}s` : ''}</span>
          <span>${o.desc}　<i class="gold">${o.val}</i></span></div>`;
      }
      return `<div class="pick attr"><b>【属性】${o.name}</b><span>${o.desc}</span></div>`;
    }).join(''),
    buttons: options.map((o, i) => ({
      text: o.kind === 'skill' ? `习得 ${o.name}` : `获得 ${o.name}`,
      style: o.kind === 'skill' ? 'primary' : '',
      onClick: () => { view.closeModal(); run.choose(i); renderBattle(ctx); },
    })),
  });
}

function showSlotConflict(ctx) {
  const { save, run } = ctx;
  const { skill, options } = run.pendingSkill;
  view.showModal({
    title: '技能槽已满',
    body: `<p>要装载 <b class="gold">${skill.name}</b>，需替换掉一个已有技能。</p>`
      + `<p class="small">被替换的技能将被销毁，不进入传承库。隐藏技能刻印的槽位不可替换。</p>`
      + options.map((k) => `<div class="diff-row">${SLOT_LABEL[k]}：${save.player.skillSlots[k]?.name ?? '空'}</div>`).join(''),
    buttons: [
      ...options.map((k) => ({
        text: `替换 ${SLOT_LABEL[k]}（${save.player.skillSlots[k]?.name ?? '空'}）`,
        onClick: () => { view.closeModal(); run.resolveSlotConflict(k); renderBattle(ctx); },
      })),
      { text: '放弃新技能', onClick: () => { view.closeModal(); run.resolveSlotConflict(null); renderBattle(ctx); } },
    ],
  });
}

function showSettle(ctx) {
  const { run, repo } = ctx;
  const r = run.finalize(repo);

  const lines = [];
  lines.push(`<div class="diff-row">评级 <b class="gold" style="font-size:18px">${r.grade}</b>　抵达阶段 ${r.stageReached}/5　击杀 ${r.kills}</div>`);
  lines.push(`<div class="diff-row">吞噬基因 <b class="gold">${r.genes}</b></div>`);

  if (r.growth.grants.length) {
    lines.push(`<div class="diff-row">永久成长：${r.growth.grants.map((g) => `${g.label} +${g.pct}%`).join('，')}</div>`);
  } else {
    lines.push(`<div class="diff-row small">基因不足以兑换永久成长（每 600 基因 1 次）</div>`);
  }

  for (const a of r.activations) {
    lines.push(`<div class="diff-row gold">⟡ 永久激活基因锁：${ROUTES[a.route].name}</div>`);
    if (a.newlySealed.length) {
      lines.push(`<div class="diff-row" style="color:#a5717c">✕ 永久封印：${a.newlySealed.map((s) => ROUTES[s].name).join('、')} —— 你的血脉拒绝了它</div>`);
    }
  }
  for (const c of r.charges) {
    lines.push(`<div class="diff-row">${ROUTES[c.route].name} 基因锁充能：第 ${c.from} 段 → 第 ${c.to} 段</div>`);
  }
  if (r.relics.length) lines.push(`<div class="diff-row">传承 ×${r.relics.length}</div>`);
  if (r.legendSkillId) lines.push(`<div class="diff-row gold">✦ 传说技能：${r.legendSkillId}</div>`);
  if (r.hiddenSkill) {
    lines.push(`<div class="diff-row" style="color:#e0a3d8">🔥 禁忌显现：<b>${r.hiddenSkill.name}</b>`
      + (r.engraveResult?.slotKey ? ` —— 永久刻印于 ${SLOT_LABEL[r.engraveResult.slotKey]}` : '') + '</div>');
  }
  if (r.gear.length) {
    lines.push(`<div class="diff-row">装备 ×${r.gear.length}</div>`
      + r.gear.map((g) => `<div class="bag-item">${gearItemHtml(g)}</div>`).join(''));
  }
  lines.push(`<div class="diff-row small">难度进化：动态系数 ${r.dyn.before.toFixed(2)} → <b>${r.dyn.after.toFixed(2)}</b>`
    + (r.dyn.deltaPct > 0 ? `（裂缝感到你的强大，难度提升了 ${r.dyn.deltaPct}%）` : r.dyn.deltaPct < 0 ? `（裂缝对你松了手，难度下降 ${-r.dyn.deltaPct}%）` : '') + '</div>');
  if (r.firstClear) lines.push('<div class="diff-row gold">★ 首通诸天之心 —— 无尽模式已解锁</div>');

  view.showModal({
    title: r.victory ? `噬灭 · ${r.plane.name}` : `身陨 · ${r.plane.name}`,
    body: lines.join(''),
    buttons: [
      { text: '再开一道裂缝', style: 'primary', onClick: () => { view.closeModal(); ctx.toLobby(); } },
      { text: '回巢', onClick: () => { view.closeModal(); ctx.toLobby(); } },
    ],
  });
}
