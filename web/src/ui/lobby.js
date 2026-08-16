// ===== ui/lobby.js · 虫巢主界面 / 裂缝选择 / 装备背包 / 进化图鉴 =====

import { DIFFICULTY_COEF, DIFFICULTY_LABEL, computePower, dungeonDifficulty } from '../../../shizu-cocos/assets/scripts/core/balance.js';
import { craftGear, enhanceGear, salvageGear } from '../../../shizu-cocos/assets/scripts/core/gear.js';
import { previewPlane, rollPlane } from '../../../shizu-cocos/assets/scripts/core/planePool.js';
import { activatableRoutes, activatedRoutes, geneLockLevel, isSealed } from '../../../shizu-cocos/assets/scripts/core/geneLock.js';
import { GEAR_RARITY, RARITY_ORDER } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { ALL_ROUTES, ROUTES, mutexOf } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { nestLine } from '../../../shizu-cocos/assets/scripts/data/lines.js';
import { gearCard, gearItemHtml, geneCard, metaLine, playerCard, slotsCard } from './cards.js';
import * as view from './view.js';

export function renderLobby(ctx) {
  const { save, rng } = ctx;
  view.setAdvance(false);
  view.setMeta(metaLine(save));
  view.setTitle('噬祖');
  view.setDesc('诸天噬灵 · 每一次吞噬，都让下一次更强大 —— 也让裂缝那头的东西更强大。');

  // 回巢状态摘要（顺带填满主区，避免大厅一片空白）
  const p = save.player;
  const lines = [
    { text: `「${nestLine(save, rng)}」　—— 噬祖`, cls: 'hidden' },
    { text: `已开裂缝 <b>${p.totalRuns}</b> 次，噬灭 <b>${p.wins}</b> 个位面。`, cls: 'info' },
  ];
  const active = activatedRoutes(save);
  if (active.length) {
    lines.push({ text: `已激活基因锁：${active.map((r) => `${ROUTES[r].name} Lv${geneLockLevel(save, r)}`).join('、')}`, cls: 'learn' });
  } else {
    lines.push({ text: '尚未激活任何路线 —— 首次进入某位面副本即可永久激活其基因锁。', cls: 'info' });
  }
  if (p.sealedRoutes.length) {
    lines.push({ text: `已永久封印：${p.sealedRoutes.map((r) => ROUTES[r].name).join('、')}　你的血脉拒绝了它们。`, cls: 'dmg' });
  }
  const collectible = activatableRoutes(save);
  if (collectible.length) {
    lines.push({ text: `仍可争取：${collectible.map((r) => ROUTES[r].name).join('、')}`, cls: 'info' });
  }
  lines.push({ text: `传承 ${save.inventory.relics.length} · 传说技能 ${save.inventory.comboSkills.length} · 禁忌 ${save.inventory.hiddenSkills.length}/10`, cls: 'gene' });
  if (save.stats.endlessUnlocked) lines.push({ text: '★ 无尽模式已解锁', cls: 'win' });
  view.renderLog(lines, '回巢札记');

  view.setCards({
    playerCard: playerCard(save),
    geneCard: geneCard(save),
    gearCard: gearCard(save),
    slotsCard: slotsCard(save),
  });
  const ICON = (id) => `../shizu-cocos/assets/art/lobby/icons/${id}.png`;
  view.setOptions([
    { text: '开启裂缝', style: 'primary', icon: ICON('rift'), onClick: () => openRift(ctx) },
    { text: '装备背包', icon: ICON('bag'), onClick: () => openBag(ctx) },
    { text: '进化图鉴', icon: ICON('codex'), onClick: () => openCodex(ctx) },
    { text: '难度设置', icon: ICON('gear'), onClick: () => openDifficulty(ctx) },
    { text: '重置存档', style: 'danger', icon: ICON('reset'), onClick: () => confirmReset(ctx) },
  ]);
  view.setPanelCollapsed(true);
  view.setHint(save.player.totalRuns === 0 ? '首次裂缝固定为「机关城」，用于熟悉基本操作' : '选择一项行动');
}

// ===== 开裂缝 =====

function openRift(ctx) {
  const { save, rng } = ctx;
  const plane = rollPlane(save, rng);
  const pre = previewPlane(plane, save);
  const power = computePower(save.player);
  const D = dungeonDifficulty(power, save.player.difficultyLevel) * save.player.dynFactor;

  const routeLine = pre.routes.length
    ? pre.routes.map((r) => `${ROUTES[r].name}${geneLockLevel(save, r) ? `（已激活 Lv${geneLockLevel(save, r)}）` : '（未激活）'}`).join(' / ')
    : '全路线融合';

  view.showModal({
    title: `裂缝 · ${pre.name}`,
    body: `
      <p class="gold" style="font-size:15px">「${pre.poem}」</p>
      <div class="diff-row">位面主题：${pre.theme}　位面之主：${pre.boss}</div>
      <div class="diff-row">路线基因：${routeLine}</div>
      <div class="diff-row">本次通道：<b class="${pre.channel === 'skill' ? 'gold' : ''}">${
        pre.channel === 'skill' ? '技能通道 —— 三选一可学该路线技能' : '属性通道 —— 学不到技能，但装备掉率 ×1.5'
      }</b></div>
      <div class="diff-row">可获奖励：${pre.rewards.join(' / ')}</div>
      <div class="diff-row">难度：${DIFFICULTY_LABEL[save.player.difficultyLevel]} · 副本难度值 D ≈ <b>${D.toFixed(1)}</b></div>
      ${pre.firstVisit ? '<p class="small gold">⚠ 首次进入 —— 通关后将永久激活该路线基因锁，并永久封印其互斥路线。此操作不可撤销。</p>' : ''}
    `,
    buttons: [
      { text: '撕开裂缝，进入', style: 'primary', onClick: () => { view.closeModal(); ctx.startRun(plane); } },
      { text: '换一道裂缝', onClick: () => { view.closeModal(); openRift(ctx); } },
      { text: '再想想', onClick: () => view.closeModal() },
    ],
  });
}

function openDifficulty(ctx) {
  const { save } = ctx;
  view.showModal({
    title: '难度等级',
    body: `<p class="small">副本敌人数值 = 你的战力 × 难度系数 × 动态系数。难度越高，掉落越丰厚。</p>`
      + Object.keys(DIFFICULTY_COEF).map((k) =>
        `<div class="diff-row"><b>${DIFFICULTY_LABEL[k]}</b> 系数 ${DIFFICULTY_COEF[k]}`
        + (save.player.difficultyLevel === k ? ' <span class="gold">← 当前</span>' : '') + '</div>').join(''),
    buttons: [
      ...Object.keys(DIFFICULTY_COEF).map((k) => ({
        text: `选择【${DIFFICULTY_LABEL[k]}】`,
        onClick: () => {
          save.player.difficultyLevel = k;
          ctx.repo.persist(save);
          view.closeModal();
          renderLobby(ctx);
        },
      })),
      { text: '关闭', onClick: () => view.closeModal() },
    ],
  });
}

// ===== 装备背包 =====

export function openBag(ctx) {
  const { save } = ctx;
  const p = save.player;
  let body = `<p class="small">装备精华：<b>${p.gearEssence}</b>　背包：${p.gearBag.length} 件</p>`;
  if (!p.gearBag.length) body += '<p class="small">背包空空如也 —— 去位面里带点东西回来。</p>';
  p.gearBag.forEach((item, i) => {
    body += `<div class="bag-item">${gearItemHtml(item)}
      <div class="bag-btns">
        <button type="button" data-act="equip" data-i="${i}">穿戴</button>
        <button type="button" data-act="salvage" data-i="${i}">分解 +${salvageGear(item)}</button>
      </div></div>`;
  });

  view.showModal({
    title: '装备背包',
    body,
    buttons: [
      { text: '合成（3 件同稀有度 → 升 1 档）', onClick: () => openCraft(ctx) },
      { text: '强化（同槽同稀有度 3 件 → +1 星）', onClick: () => openEnhance(ctx) },
      { text: '关闭', onClick: () => { view.closeModal(); renderLobby(ctx); } },
    ],
    onMount(root) {
      for (const btn of root.querySelectorAll('.bag-btns button')) {
        btn.addEventListener('click', () => {
          const i = Number(btn.dataset.i);
          const item = p.gearBag[i];
          if (!item) return;
          if (btn.dataset.act === 'equip') {
            const worn = p.gear[item.slot];
            p.gear[item.slot] = item;
            p.gearBag.splice(i, 1);
            if (worn) p.gearBag.push(worn);
          } else {
            p.gearEssence += salvageGear(item);
            p.gearBag.splice(i, 1);
          }
          ctx.repo.persist(save);
          openBag(ctx);
        });
      }
    },
  });
}

function openCraft(ctx) {
  const { save, rng } = ctx;
  const bag = save.player.gearBag;
  const body = RARITY_ORDER.slice(0, -1).map((r) => {
    const n = bag.filter((x) => x.rarity === r).length;
    return `<div class="diff-row"><span class="r-${r}">${GEAR_RARITY[r].name}</span> × ${n} ${n >= 3 ? '<b class="gold">✔ 可合成</b>' : '（不足 3 件）'}</div>`;
  }).join('');

  view.showModal({
    title: '合成',
    body: '<p class="small">消耗 3 件同稀有度装备，换 1 件高一档的随机装备。</p>' + body,
    buttons: [
      ...RARITY_ORDER.slice(0, -1)
        .filter((r) => bag.filter((x) => x.rarity === r).length >= 3)
        .map((r) => ({
          text: `合成 ${GEAR_RARITY[r].name} × 3`,
          style: 'primary',
          onClick: () => {
            const picks = bag.filter((x) => x.rarity === r).slice(0, 3);
            const made = craftGear(picks, rng);
            if (made) {
              for (const g of picks) bag.splice(bag.indexOf(g), 1);
              bag.push(made);
              ctx.repo.persist(save);
            }
            openBag(ctx);
          },
        })),
      { text: '返回', onClick: () => openBag(ctx) },
    ],
  });
}

function openEnhance(ctx) {
  const { save } = ctx;
  const p = save.player;
  const targets = Object.values(p.gear).filter(Boolean).filter((t) => {
    const fodder = p.gearBag.filter((g) => g.slot === t.slot && g.rarity === t.rarity);
    return t.star < 5 && fodder.length >= 3;
  });

  view.showModal({
    title: '强化',
    body: targets.length
      ? '<p class="small">消耗背包中 3 件同槽位同稀有度装备，为已装备的该件 +1 星（词条数值 ×1.1/星，上限 5 星）。</p>'
        + targets.map((t) => `<div class="diff-row">${gearItemHtml(t)}</div>`).join('')
      : '<p class="small">没有可强化的装备：需要「已装备的某件」+「背包里 3 件同槽位同稀有度」。</p>',
    buttons: [
      ...targets.map((t) => ({
        text: `强化 ${t.name} → ${t.star + 1} 星`,
        style: 'primary',
        onClick: () => {
          const fodder = p.gearBag.filter((g) => g.slot === t.slot && g.rarity === t.rarity).slice(0, 3);
          if (enhanceGear(t, fodder)) {
            for (const g of fodder) p.gearBag.splice(p.gearBag.indexOf(g), 1);
            ctx.repo.persist(save);
          }
          openBag(ctx);
        },
      })),
      { text: '返回', onClick: () => openBag(ctx) },
    ],
  });
}

// ===== 进化图鉴 =====

export function openCodex(ctx) {
  const { save } = ctx;
  const routeRows = ALL_ROUTES.map((r) => {
    const lv = geneLockLevel(save, r);
    const sealed = isSealed(save, r);
    const cls = sealed ? 'sealed' : lv > 0 ? 'active' : '';
    const status = sealed
      ? '已封印 · 你的血脉拒绝了它'
      : lv > 0 ? `Lv${lv}/6` : '未激活';
    const mutex = mutexOf(r).map((m) => ROUTES[m].name).join('、') || '中立';
    return `<div class="codex-row ${cls}"><span>${ROUTES[r].groupName} · ${ROUTES[r].name}<span class="small">（互斥：${mutex}）</span></span><span>${status}</span></div>`;
  }).join('');

  const planeRows = planes.map((p) => {
    const visited = (p.routes ?? []).some((r) => geneLockLevel(save, r) > 0);
    return `<div class="codex-row ${visited ? 'active' : ''}"><span>${String(p.codex).padStart(2, '0')} ${p.name}</span><span class="small">${p.boss}</span></div>`;
  }).join('');

  view.showModal({
    title: '进化图鉴',
    body: `<h4 class="gold">基因锁 · 10 路线</h4>${routeRows}
      <h4 class="gold" style="margin-top:14px">位面图鉴 · 12 副本</h4>${planeRows}
      <h4 class="gold" style="margin-top:14px">收藏</h4>
      <div class="codex-row"><span>传承</span><span>${save.inventory.relics.length}</span></div>
      <div class="codex-row"><span>传说技能</span><span>${save.inventory.comboSkills.length}</span></div>
      <div class="codex-row"><span>隐藏技能（禁忌）</span><span>${save.inventory.hiddenSkills.length} / 10</span></div>`,
    buttons: [{ text: '关闭', onClick: () => { view.closeModal(); renderLobby(ctx); } }],
  });
}

function confirmReset(ctx) {
  view.showModal({
    title: '重置存档',
    body: '<p>将清空全部永久财产：基因锁、封印记录、装备、隐藏技能刻印。</p><p class="small">此操作不可撤销。</p>',
    buttons: [
      { text: '确认重置', style: 'danger', onClick: () => { view.closeModal(); ctx.resetSave(); } },
      { text: '取消', onClick: () => view.closeModal() },
    ],
  });
}
