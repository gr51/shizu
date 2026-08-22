// ===== ui/cards.js · 侧栏四张卡的渲染 =====

import { combatStats, computePower, geneLockPowerBonus, DIFFICULTY_LABEL } from '../../../shizu-cocos/assets/scripts/core/balance.js';
import { gearPowerBonus, affixText } from '../../../shizu-cocos/assets/scripts/core/gear.js';
import { activatedRoutes, chargeToNextSegment, geneLockLevel } from '../../../shizu-cocos/assets/scripts/core/geneLock.js';
import { SLOT_KEYS, SLOT_LABEL } from '../../../shizu-cocos/assets/scripts/core/skillSlots.js';
import { GEAR_SLOTS, GEAR_SLOT_IDS, GEAR_RARITY } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { ROUTES } from '../../../shizu-cocos/assets/scripts/data/routes.js';

export function metaLine(save, extra = '') {
  const p = save.player;
  return `战力 <b>${computePower(p).toFixed(2)}</b>`
    + ` · 难度 <b>${DIFFICULTY_LABEL[p.difficultyLevel]}</b>`
    + ` · 最佳 <b>阶段 ${save.stats.bestStage ?? 0}/5</b>`
    + ` · 通关 <b>${p.wins}</b>/${p.totalRuns}`
    + (extra ? ` · ${extra}` : '');
}

export function playerCard(save, run = null) {
  const p = save.player;
  const stats = run ? run.stats : { ...combatStats(p), maxHp: combatStats(p).hp };
  const hp = run ? run.hp : stats.maxHp;
  const pct = Math.max(0, Math.min(100, (hp / stats.maxHp) * 100));
  return `
    <div class="portrait-row"><img class="portrait" src="../shizu-cocos/assets/art/lobby/icons/portrait.png" alt="巢灵"></div>
    <h4>巢灵 · ${p.nestlingName}</h4>
    <div class="hpbar"><i style="width:${pct}%"></i></div>
    <p class="small" style="margin:2px 0 8px">HP ${Math.round(hp)} / ${Math.round(stats.maxHp)}</p>
    <div class="stat-grid">
      <div class="stat-cell"><span class="stat-label">攻击</span><b>${stats.atk.toFixed(1)}</b></div>
      <div class="stat-cell"><span class="stat-label">移速</span><b>${stats.speed.toFixed(0)}</b></div>
      <div class="stat-cell"><span class="stat-label">暴击</span><b>${(stats.crit * 100).toFixed(1)}%</b></div>
      <div class="stat-cell"><span class="stat-label">吸血</span><b>${(stats.lifesteal * 100).toFixed(1)}%</b></div>
      <div class="stat-cell"><span class="stat-label">减伤</span><b>${(stats.dmgReduct * 100).toFixed(1)}%</b></div>
      <div class="stat-cell"><span class="stat-label">回血</span><b>${(stats.regen * 100).toFixed(1)}/s</b></div>
    </div>
    <div class="perm-bonus">
      <div>永久成长：攻+${p.permAtkPct}%　血+${p.permHpPct}%　速+${p.permSpeedPct}%</div>
      <div class="small">基因锁 ×${geneLockPowerBonus(p.geneLocks).toFixed(2)} · 装备 ×${gearPowerBonus(p.gear).toFixed(2)}</div>
    </div>`;
}

export function geneCard(save, run = null) {
  const active = activatedRoutes(save);
  const rows = active.length
    ? active.map((r) => {
        const lv = geneLockLevel(save, r);
        const next = chargeToNextSegment(save, r);
        const tail = next === null ? '（已满）' : `（距下一段 ${next} 基因）`;
        return `<div class="slot"><img class="route-ic" src="../shizu-cocos/assets/art/lobby/icons/route_${r}.png" alt=""> ${ROUTES[r].name} Lv${lv}/6 <span class="small">${tail}</span></div>`;
      }).join('')
    : '<p class="small">尚未激活任何路线。<br>首次进入某位面副本即可永久激活其路线基因锁。</p>';
  const sealed = save.player.sealedRoutes.length
    ? `<p class="small sealed">已封印：${save.player.sealedRoutes.map((r) => ROUTES[r].name).join('、')}</p>`
    : '';
  const runLine = run ? `<p>本局基因 <b class="gold">${run.genes}</b> · 击杀 <b>${run.kills}</b> · 同屏 ${run.onScreen}</p>` : '';
  return `<h4>基因锁</h4>${runLine}${rows}${sealed}`;
}

export function gearCard(save) {
  const gear = save.player.gear;
  const rows = GEAR_SLOT_IDS.map((id) => {
    const item = gear[id];
    return `<div class="gear-slot ${item ? '' : 'empty'}"><img class="route-ic" src="../shizu-cocos/assets/art/items/gear_${id}.png" alt=""> ${GEAR_SLOTS[id].name}：`
      + (item
        ? `<span class="r-${item.rarity}">${item.name}</span>${'★'.repeat(item.star)}`
        : '空')
      + '</div>';
  }).join('');
  return `<h4>装备栏（×${gearPowerBonus(gear).toFixed(2)}）</h4>${rows}`
    + `<p class="small">背包 ${save.player.gearBag.length} 件 · 精华 ${save.player.gearEssence}</p>`;
}

export function slotsCard(save) {
  const slots = save.player.skillSlots;
  const rows = SLOT_KEYS.map((k) => {
    const s = slots[k];
    if (!s) return `<div class="slot empty">${SLOT_LABEL[k]}：<span class="small">空</span></div>`;
    const name = s.hidden ? `<span class="gold">${s.name} ⟡刻印</span>` : s.name;
    return `<div class="slot">${SLOT_LABEL[k]}：${name}</div>`;
  }).join('');
  return `<h4>技能槽位</h4>${rows}`;
}

export function gearItemHtml(item) {
  const r = GEAR_RARITY[item.rarity];
  const stars = item.star > 0 ? `<span class="gear-stars">${'★'.repeat(item.star)}</span>` : '';
  return `<b class="r-${item.rarity}">${item.name}</b>${stars}`
    + `<div class="small">${r.name} · ${item.affixes.map(affixText).join('，')}</div>`;
}
