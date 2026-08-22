// ===== ui/lobby.js · 虫巢主界面 / 裂缝选择 / 装备背包 / 进化图鉴 =====

import { audio } from '../game/audio.js';
import { DIFFICULTY_COEF, DIFFICULTY_LABEL, computePower, dungeonDifficulty } from '../../../shizu-cocos/assets/scripts/core/balance.js';
import { craftGear, enhanceGear, salvageGear, forgeGear, forgeCost, FORGE_COST } from '../../../shizu-cocos/assets/scripts/core/gear.js';
import { previewPlane, rollPlane } from '../../../shizu-cocos/assets/scripts/core/planePool.js';
import { activatableRoutes, activatedRoutes, geneLockLevel, isSealed } from '../../../shizu-cocos/assets/scripts/core/geneLock.js';
import { GEAR_RARITY, RARITY_ORDER, GEAR_SLOTS, GEAR_SLOT_IDS } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { ALL_ROUTES, ROUTES, mutexOf } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { MECH_INFO, ROUTE_MECHANIC, currentRouteMech } from '../../../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { mechUpgradePool } from '../../../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { nestLine } from '../../../shizu-cocos/assets/scripts/data/lines.js';
import { RELICS, relicById } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { ACHIEVEMENTS, unlockedAchievements, isRewardClaimed } from '../../../shizu-cocos/assets/scripts/data/achievements.js';
import { NEST_UPGRADES, buyNestUpgrade, nestLevel, nextCost } from '../../../shizu-cocos/assets/scripts/data/nestUpgrades.js';
import { RIFT_MODS, aggregateRiftMods } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { findSkill } from '../../../shizu-cocos/assets/scripts/data/skills.js';
import { gearCard, gearItemHtml, geneCard, metaLine, playerCard, slotsCard } from './cards.js';
import * as view from './view.js';

/** 传承被动效果的中文标签（图鉴展示用） */
const RELIC_EFF_LABEL = {
  atkPct: '攻击', hpPct: '生命', aspdPct: '攻速', crit: '暴击', critDmg: '暴伤',
  aoe: '清场范围', lifesteal: '吸血', regen: '回血', dmgReduct: '减伤',
  execute: '斩杀', cooldownPct: '技能冷却缩减',
};

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
  ];
  if (p.totalRuns === 0) {
    lines.unshift({ text: '「诸天崩坏，裂缝涌现。噬祖，醒来。」', cls: 'gold' });
  }
  lines.push({ text: `已开裂缝 <b>${p.totalRuns}</b> 次，噬灭 <b>${p.wins}</b> 个位面。`, cls: 'info' });
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
  // 札记前两条（台词 + 统计）同步上浮到主区：状态面板默认收起，
  // 不上浮的话精心写的回巢文案玩家根本看不到
  view.setNote(lines.slice(0, 2).map((e) => `<div class="evt ${e.cls}">${e.text}</div>`).join(''));
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
    { text: '虫巢强化', icon: ICON('gear'), onClick: () => openNest(ctx) },
    { text: '装备背包', icon: ICON('bag'), onClick: () => openBag(ctx) },
    { text: '进化图鉴', icon: ICON('codex'), onClick: () => openCodex(ctx) },
    { text: '成就', icon: ICON('codex'), onClick: () => openAchievements(ctx) },
    { text: '难度设置', icon: ICON('gear'), onClick: () => openDifficulty(ctx) },
    { text: '重置存档', style: 'danger', icon: ICON('reset'), onClick: () => confirmReset(ctx) },
  ]);
  view.setPanelCollapsed(true);
  view.setHint(save.player.totalRuns === 0 ? '首次裂缝固定为「机关城」，用于熟悉基本操作' : '选择一项行动');
}

// ===== 虫巢强化（局外元进度）=====

export function openNest(ctx) {
  const { save } = ctx;
  // 虫巢强化 v2：内联强化卡片（与黑市 v2 同款交互）——替代「文字行+按钮墙」
  const renderCards = () => {
    const bank = save.inventory.genes ?? 0;
    return NEST_UPGRADES.map((u) => {
      const lv = nestLevel(save, u.id);
      const cost = nextCost(save, u.id);
      const maxed = cost === null;
      const afford = !maxed && bank >= cost;
      return `<div class="shop-item${maxed ? ' bought' : ''}${!afford && !maxed ? ' poor' : ''}">`
        + `<div class="shop-info"><b>${u.name}</b> <span class="small">Lv${lv}/${u.max}</span>`
        + `<div class="small">${u.desc}</div></div>`
        + `<div class="shop-buy">`
        + (maxed
          ? '<span class="small sealed">已满级</span>'
          : `<span class="shop-price ${afford ? 'gold' : 'sealed'}">${cost} 🧬</span>`
            + `<button class="shop-btn" data-nest="${u.id}" ${afford ? '' : 'disabled'}>强化</button>`)
        + `</div></div>`;
    }).join('');
  };
  const bindNest = (root) => {
    root.querySelectorAll('[data-nest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!buyNestUpgrade(save, btn.dataset.nest).ok) return;
        audio.sfx('skill');   // 强化成功音：三连上行音阶，跨局成长的仪式感
        ctx.repo.persist(save);
        root.querySelector('.shop-list').innerHTML = renderCards();
        const bal = root.querySelector('.gene-balance');
        if (bal) bal.textContent = save.inventory.genes ?? 0;
        bindNest(root);
      });
    });
  };

  view.showModal({
    title: '虫巢强化',
    body: `<p class="small">库存基因：<b class="gold gene-balance">${save.inventory.genes ?? 0}</b> 🧬　每局带回的基因都会入库，失败也算推进。</p>`
      + `<div class="shop-list">${renderCards()}</div>`,
    buttons: [{ text: '返回', onClick: () => { view.closeModal(); renderLobby(ctx); } }],
    onMount: bindNest,
  });
}

// ===== 开裂缝 =====

function openRift(ctx, picked = [], legend = null, weapon = null) {
  const { save, rng } = ctx;
  const plane = ctx._riftPlane ?? rollPlane(save, rng);
  ctx._riftPlane = plane;
  const pre = previewPlane(plane, save);
  const power = computePower(save.player);
  const D = dungeonDifficulty(power, save.player.difficultyLevel) * save.player.dynFactor;
  const mods = aggregateRiftMods(picked);
  const legendPool = save.inventory.comboSkills ?? [];
  const legendSkill = legend ? findSkill(legend) : null;

  const routeLine = pre.routes.length
    ? pre.routes.map((r) => `${ROUTES[r].name}${geneLockLevel(save, r) ? `（已激活 Lv${geneLockLevel(save, r)}）` : '（未激活）'}`).join(' / ')
    : '全路线融合';

  // 出征路线：玩家选定的武器来源（未选 = 自动按基因锁最高路线）
  const weaponPool = (ROUTES ? Object.values(ROUTES) : []).filter((r) => r.id && geneLockLevel(save, r.id) > 0);

  // 可点行：选项的「展示」与「切换」合并成同一个对象 —— 原先每个变异/武器/传说
  // 还要再配一个同权重按钮，最多堆出十几行的按钮墙。点击后关窗重开
  // （沿用原按钮的做法），ctx._riftPlane 缓存保证重开的还是同一道裂缝。
  const modRows = RIFT_MODS.map((m) => {
    const on = picked.includes(m.id);
    // 风险等级色点：1 绿 / 2 黄 / 3 红——扫一眼就知道这条变异有多危险
    const riskDot = `<span class="risk-dot rk-${m.risk}" title="风险 ${m.risk}"></span>`;
    return `<div class="diff-row pickable${on ? ' gold' : ''}" data-mod="${m.id}" role="button" tabindex="0">`
      + `${riskDot}${on ? '✔ ' : ''}<b>${m.name}</b><div class="small">${m.desc}</div></div>`;
  }).join('');
  const weaponRows = weaponPool.map((r) => {
    const on = weapon === r.id;
    // 流派卡片（backlog 界面丑/交互弱）：皮肤立绘 + 定位 + 机制说明 + 专属强化池，
    // 替代纯文字行——出征是本作最重要的赛前决策，值得一个真正的操作性界面
    const mech = ROUTE_MECHANIC[r.id];
    const info = MECH_INFO[mech] ?? { name: mech, desc: '' };
    const pool = mechUpgradePool(mech).map((m) => m.name).join(' / ');
    return `<div class="route-card pickable${on ? ' gold' : ''}" data-weapon="${r.id}" role="button" tabindex="0">`
      + `<img class="route-portrait" src="../shizu-cocos/assets/art/units/player_${r.id}.png" alt="${r.name}">`
      + `<div class="route-body"><b>${on ? '✔ ' : ''}${r.name}</b>`
      + `<span class="small">　${r.role}　·　Lv${geneLockLevel(save, r.id)}</span>`
      + `<div class="small">机制：<b class="gold">${info.name}</b> —— ${info.desc}</div>`
      + (pool ? `<div class="small">专属强化：${pool}</div>` : '')
      + `</div></div>`;
  }).join('');
  const legendRows = legendPool.map((id) => {
    const s = findSkill(id);
    const on = legend === id;
    return `<div class="diff-row pickable${on ? ' gold' : ''}" data-legend="${id}" role="button" tabindex="0">`
      + `${on ? '✔ ' : '☆ '}${s ? s.name : id}</div>`;
  }).join('');

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
      <h4 class="gold" style="margin-top:12px">出征武器 · 本局流派</h4>
      <p class="small">选择用哪条路线的武器与机制战斗（决定攻击方式与专属强化池）。</p>
      <div class="diff-row">当前：<b class="gold">${weapon
        ? (ROUTES[weapon]?.name ?? weapon)
        : '自动（按基因锁最高路线）'}</b></div>
      ${weaponPool.length ? weaponRows : '<p class="small">尚未激活任何路线 —— 使用默认巢灵之爪（自动索敌 + 近战冲击）。</p>'}
      ${(() => {
        // 流派预览（backlog #10 遗留项）：出征前看清本局机制与专属强化池
        const previewRoute = weapon
          ?? [...weaponPool].sort((a, b) => geneLockLevel(save, b.id) - geneLockLevel(save, a.id))[0]?.id
          ?? null;
        const mech = previewRoute ? ROUTE_MECHANIC[previewRoute] : null;
        if (!mech) return '';
        const info = MECH_INFO[mech] ?? { name: mech, desc: '' };
        const pool = mechUpgradePool(mech).map((m) => m.name).join(' / ');
        const routeName = ROUTES[previewRoute]?.name ?? previewRoute;
        return `
          <div class="diff-row small">流派机制：<b class="gold">${info.name}</b> —— ${info.desc}</div>
          ${pool ? `<div class="diff-row small">本局专属强化池：${pool}</div>` : ''}`;
      })()}
      <h4 class="gold" style="margin-top:12px">裂缝变异 · 风险 ${mods.risk} · 基因 ×${mods.geneMul.toFixed(2)}</h4>
      <p class="small">自选变异：敌人更强，但基因产出更高（倍率封顶 ×2.5）。</p>
      ${modRows}
      <h4 class="gold" style="margin-top:12px">出征传说技能</h4>
      <p class="small">${legendPool.length
        ? `从收藏的终极技里带一个进本局：<b class="gold">${legendSkill ? legendSkill.name : '未选择'}</b>`
        : '尚无传说技能 —— 噬灭匹配位面之主有机会掉落。'}</p>
      ${legendRows}
      ${pre.firstVisit ? '<p class="small gold">⚠ 首次进入 —— 通关后将永久激活该路线基因锁，并永久封印其互斥路线。此操作不可撤销。</p>' : ''}
    `,
    // 按钮区只留主操作；变异/武器/传说的切换全部走上面的可点行
    buttons: [
      { text: '撕开裂缝，进入', style: 'primary', onClick: () => { view.closeModal(); ctx._riftPlane = null; ctx.startRun(plane, picked, { legendLoadout: legend, weaponLoadout: weapon }); } },
      ...(save.stats.endlessUnlocked ? [{
        text: '★ 无尽模式（通关后续接深渊层）',
        onClick: () => { view.closeModal(); ctx._riftPlane = null; ctx.startRun(plane, picked, { endless: true, legendLoadout: legend, weaponLoadout: weapon }); },
      }] : []),
      { text: '换一道裂缝', onClick: () => { view.closeModal(); ctx._riftPlane = null; openRift(ctx); } },
      { text: '再想想', onClick: () => { view.closeModal(); ctx._riftPlane = null; } },
    ],
    onMount(root) {
      const toggle = (kind, id) => {
        view.closeModal();
        if (kind === 'mod') openRift(ctx, picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id], legend, weapon);
        else if (kind === 'weapon') openRift(ctx, picked, legend, weapon === id ? null : id);
        else openRift(ctx, picked, legend === id ? null : id, weapon);
      };
      for (const el of root.querySelectorAll('[data-mod]')) el.addEventListener('click', () => toggle('mod', el.dataset.mod));
      for (const el of root.querySelectorAll('[data-weapon]')) el.addEventListener('click', () => toggle('weapon', el.dataset.weapon));
      for (const el of root.querySelectorAll('[data-legend]')) el.addEventListener('click', () => toggle('legend', el.dataset.legend));
      // 键盘可达：可点行支持 Enter / 空格（与三选一卡片同一套约定）
      for (const el of root.querySelectorAll('.pickable')) {
        el.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
        });
      }
    },
  });
}

/** 成就页面（backlog #10）：14 条成就的达成状态可视化——长线目标给玩家方向感 */
function openAchievements(ctx) {
  const { save } = ctx;
  const flags = save.stats.achievementFlags ?? {};
  const claimed = ACHIEVEMENTS.filter((a) => flags[a.id]).length;
  // 进度提示（未达成时显示「还差多少」）
  const progressHint = (id) => {
    const st = save.stats ?? {};
    const runs = save.player.totalRuns ?? 0;
    const relics = save.inventory?.relics?.length ?? 0;
    const locks = Object.values(save.player.geneLocks ?? {}).filter((v) => v > 0).length;
    if (id === 'stage5') return `当前最佳 S${st.bestStage ?? 0}`;
    if (id === 'veteran') return `已开裂缝 ${runs}/20 次`;
    if (id === 'ten_relics') return `已收集 ${relics}/10 个传承`;
    if (id === 'three_routes') return `已激活 ${locks}/3 条路线`;
    if (id === 'synergy_master') return `单局最高共鸣 ${st.synergiesThisRun ?? 0}/3`;
    if (id === 'abyss_walker') return `深渊最深层 ${st.deepestAbyss ?? 0}/3`;
    return '';
  };
  const rows = ACHIEVEMENTS.map((a) => {
    const done = flags[a.id];
    let met = false;
    try { met = a.check(save); } catch { /* check 可能抛 */ }
    const icon = done ? '✅' : met ? '★ 可领取' : '○';
    const hint = done ? '' : progressHint(a.id);
    const cls = done ? 'gold' : met ? '' : 'small';
    return `<div class="ach-row${done ? ' done' : ''}">`
      + `<span>${icon}</span>`
      + `<div class="ach-body"><b>${a.name}</b><div class="small">${a.desc}</div>`
      + (hint ? `<div class="small sealed">进度：${hint}</div>` : '')
      + `<div class="small ${done ? 'gold' : 'sealed'}">${a.reward}</div></div></div>`;
  }).join('');
  view.showModal({
    title: `成就 · 已达成 ${claimed}/${ACHIEVEMENTS.length}`,
    body: `<p class="small gold">★ 标记的成就已满足条件，下次结算时自动领取奖励</p>${rows}`,
    buttons: [{ text: '关闭', onClick: () => view.closeModal() }],
  });
}

function openDifficulty(ctx) {
  const { save } = ctx;
  const MECH = {
    easy: '敌人弱 · 成长慢 · 怪少（新手）',
    normal: '基准 · 标准成长 · 标准刷怪',
    hard: '敌人强 · 成长快 · 怪多（挑战）',
  };
  // 难度选择 v2：可点选卡片替代按钮墙——点卡即切换
  const renderCards = () => Object.keys(DIFFICULTY_COEF).map((k) => {
    const on = save.player.difficultyLevel === k;
    return `<div class="diff-card pickable${on ? ' gold' : ''}" data-diff="${k}" role="button" tabindex="0">`
      + `<div class="diff-head"><b>${DIFFICULTY_LABEL[k]}</b><span class="small">系数 ×${DIFFICULTY_COEF[k]}</span>${on ? '<span class="gold"> ✓</span>' : ''}</div>`
      + `<div class="small">${MECH[k]}</div></div>`;
  }).join('');
  const bindDiff = (root) => {
    root.querySelectorAll('[data-diff]').forEach((el) => {
      el.addEventListener('click', () => {
        save.player.difficultyLevel = el.dataset.diff;
        ctx.repo.persist(save);
        root.querySelector('.diff-list').innerHTML = renderCards();
        bindDiff(root);
      });
      // 键盘可达：Enter / 空格 触发（与三选一卡片同一套约定）
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
      });
    });
  };
  view.showModal({
    title: '难度等级',
    body: `<p class="small">难度越高，敌人越强、成长越快、刷怪越多，但掉落越丰厚。</p>`
      + `<div class="diff-list">${renderCards()}</div>`,
    buttons: [{ text: '关闭', onClick: () => view.closeModal() }],
    onMount: bindDiff,
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
      { text: '精华锻造（指定槽位，确定性获取）', style: 'primary', onClick: () => openForge(ctx) },
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

/** 精华锻造：抽不到核心槽位就自己造（确定性兑换路径） */
function openForge(ctx, slot = 'claw') {
  const { save, rng } = ctx;
  const p = save.player;
  // 锻造 v2：内联卡片交互——槽位卡（点选切换）+ 价目卡（内联锻造按钮），替代 9 键按钮墙
  const renderSlotCards = () => GEAR_SLOT_IDS.map((id) => {
    const on = id === slot;
    const worn = p.gear[id];
    return `<div class="diff-card pickable${on ? ' gold' : ''}" data-slot="${id}" role="button" tabindex="0">`
      + `<div class="diff-head"><b>${GEAR_SLOTS[id].name}</b>${on ? '<span class="gold">✓</span>' : ''}</div>`
      + `<div class="small">当前：${worn`
      + ` ? `<span class="r-${worn.rarity}">${worn.name}</span><span class="gear-stars">${'★'.repeat(worn.star)}</span>``
      + ` : '<span class="sealed">空</span>'}</div></div>`;
  }).join('');
  const renderPriceCards = () => Object.keys(FORGE_COST).map((r) => {
    const cost = forgeCost(r);
    const ok = (p.gearEssence ?? 0) >= cost;
    return `<div class="shop-item${ok ? '' : ' poor'}">`
      + `<div class="shop-info"><b class="r-${r}">${GEAR_RARITY[r].name}装备</b>`
      + `<div class="small">随机 ${GEAR_RARITY[r].affixCount} 条词缀</div></div>`
      + `<div class="shop-buy"><span class="shop-price ${ok ? 'gold' : 'sealed'}">${cost} ✨</span>`
      + `<button class="shop-btn" data-forge="${r}" ${ok ? '' : 'disabled'}>锻造</button></div></div>`;
  }).join('');

  view.showModal({
    title: `精华锻造 · ${GEAR_SLOTS[slot].name}`,
    body: `<p class="small">装备精华：<b class="gold">${p.gearEssence ?? 0}</b> ✨　`
      + '分解垫子换取<b>指定槽位</b>的装备，抽不到核心部位也能自己造。</p>'
      + `<h4 class="gold" style="margin:10px 0 6px">目标槽位（点击切换）</h4><div class="forge-slots">${renderSlotCards()}</div>`
      + `<h4 class="gold" style="margin:10px 0 6px">锻造价目</h4><div class="shop-list">${renderPriceCards()}</div>`,
    buttons: [{ text: '返回背包', onClick: () => { view.closeModal(); openBag(ctx); } }],
    onMount(root) {
      for (const el of root.querySelectorAll('[data-slot]')) {
        el.addEventListener('click', () => { view.closeModal(); openForge(ctx, el.dataset.slot); });
        // 键盘可达：Enter / 空格 触发
        el.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
        });
      }
      for (const btn of root.querySelectorAll('[data-forge]')) {
        btn.addEventListener('click', () => {
          const res = forgeGear(save, slot, btn.dataset.forge, rng);
          if (!res.ok) return;
          ctx.repo.persist(save);
          view.closeModal();
          openForge(ctx, slot);
        });
      }
    },
  });
}

function openCraft(ctx) {  const { save, rng } = ctx;
  const bag = save.player.gearBag;
  // 合成 v2：内联卡片替代按钮墙——每档稀有度一张卡，够 3 件即可点
  const renderCards = () => RARITY_ORDER.slice(0, -1).map((r) => {
    const n = bag.filter((x) => x.rarity === r).length;
    const can = n >= 3;
    return `<div class="shop-item${can ? '' : ' poor'}">`
      + `<div class="shop-info"><b class="r-${r}">${GEAR_RARITY[r].name}</b> × ${n}`
      + `<div class="small">3 件 → 1 件高一档随机装备</div></div>`
      + `<div class="shop-buy"><button class="shop-btn" data-craft="${r}" ${can ? '' : 'disabled'}>${can ? '合成' : `还差 ${3 - n} 件`}</button></div></div>`;
  }).join('');
  const bindCraft = (root) => {
    root.querySelectorAll('[data-craft]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = btn.dataset.craft;
        const picks = bag.filter((x) => x.rarity === r).slice(0, 3);
        if (picks.length < 3) return;
        const made = craftGear(picks, rng);
        if (!made) return;
        for (const g of picks) bag.splice(bag.indexOf(g), 1);
        bag.push(made);
        ctx.repo.persist(save);
        root.querySelector('.shop-list').innerHTML = renderCards();
        bindCraft(root);
      });
    });
  };

  view.showModal({
    title: '合成',
    body: '<p class="small">消耗 3 件同稀有度装备，换 1 件高一档的随机装备。</p>'
      + `<div class="shop-list">${renderCards()}</div>`,
    buttons: [{ text: '返回', onClick: () => openBag(ctx) }],
    onMount: bindCraft,
  });
}

function openEnhance(ctx) {
  const { save } = ctx;
  const p = save.player;
  const targets = Object.values(p.gear).filter(Boolean).filter((t) => {
    const fodder = p.gearBag.filter((g) => g.slot === t.slot && g.rarity === t.rarity);
    return t.star < 5 && fodder.length >= 3;
  });

  // 强化 v2：内联卡片替代按钮墙——每件可强化装备一张卡
  view.showModal({
    title: '强化',
    body: targets.length
      ? '<p class="small">消耗背包中 3 件同槽位同稀有度装备，为已装备的该件 +1 星（词条数值 ×1.1/星，上限 5 星）。</p>'
        + `<div class="shop-list">${targets.map((t) => `
          <div class="shop-item">
            <div class="shop-info">${gearItemHtml(t)}</div>
            <div class="shop-buy"><button class="shop-btn" data-enh="${t.slot}">强化 → ${t.star + 1}★</button></div>
          </div>`).join('')}</div>`
      : '<p class="small">没有可强化的装备：需要「已装备的某件」+「背包里 3 件同槽位同稀有度」。</p>',
    buttons: [{ text: '返回', onClick: () => openBag(ctx) }],
    onMount(root) {
      for (const btn of root.querySelectorAll('[data-enh]')) {
        btn.addEventListener('click', () => {
          const t = Object.values(p.gear).find((g) => g && g.slot === btn.dataset.enh);
          if (!t) return;
          const fodder = p.gearBag.filter((g) => g.slot === t.slot && g.rarity === t.rarity).slice(0, 3);
          if (fodder.length < 3 || !enhanceGear(t, fodder)) return;
          for (const g of fodder) p.gearBag.splice(p.gearBag.indexOf(g), 1);
          ctx.repo.persist(save);
          openBag(ctx);
        });
      }
    },
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

  // 传承残影：已收集的传承 + 故事
  const relicRows = save.inventory.relics.length
    ? save.inventory.relics.map((id) => {
        const r = relicById(id);
        const effText = Object.entries(r.eff ?? {}).map(([k, v]) => `${RELIC_EFF_LABEL[k] ?? k} +${Math.round(v * 100)}%`).join('，');
        return `<div class="codex-row"><span>${r.name}</span><span class="small gold">${effText || (r.rare ? '稀有' : '')}</span></div>
          <div class="small" style="padding:0 8px 8px;line-height:1.5">${r.story}</div>`;
      }).join('')
    : '<p class="small">尚未获得传承 —— 噬灭位面之主可得。</p>';

  // 成就：已解锁高亮，未解锁灰；显示里程碑奖励与领取状态
  const unlocked = unlockedAchievements(save);
  const achRows = ACHIEVEMENTS.map((a) => {
    const got = unlocked.has(a.id);
    const claimed = isRewardClaimed(save, a.id);
    const tail = got
      ? `<span class="small ${claimed ? '' : 'gold'}">${a.reward}${claimed ? '（已领取）' : '（下次结算发放）'}</span>`
      : `<span class="small">${a.desc}</span>`;
    return `<div class="codex-row ${got ? 'active' : ''}"><span>${got ? '★' : '·'} ${a.name}</span>${tail}</div>`;
  }).join('');

  view.showModal({
    title: '进化图鉴',
    body: `<h4 class="gold">基因锁 · 10 路线</h4>${routeRows}
      <h4 class="gold" style="margin-top:14px">位面图鉴 · 12 副本</h4>${planeRows}
      <h4 class="gold" style="margin-top:14px">传承残影 · ${save.inventory.relics.length} 已获</h4>${relicRows}
      <h4 class="gold" style="margin-top:14px">成就 · ${unlocked.size}/${ACHIEVEMENTS.length}</h4>${achRows}
      <h4 class="gold" style="margin-top:14px">收藏</h4>
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
