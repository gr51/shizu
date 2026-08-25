// ===== admin.js · 全资产配置后台（编辑 → localStorage 覆盖 → 刷新游戏页生效）=====
// 覆盖维度：位面叙事 / 敌人·Boss 形象 / 技能 / 隐藏技能 / 路线·组合技 / 共鸣 /
// 成就 / 传承 / 危机 / 精英词缀 / 属性池 / 虫巢强化 / 机械强化 / 攻击方式。
// 与 config/overrides.js 配对：这里编辑的字段在那里被应用到运行时数据表。

import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { PLANE_MECHANICS, MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE, RANGED_SPRITES } from '../../../shizu-cocos/assets/scripts/data/planeModules.js';
import { RIFT_MODS } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { SHOP_ITEMS } from '../../../shizu-cocos/assets/scripts/data/shopItems.js';
import { SIDE_QUESTS } from '../../../shizu-cocos/assets/scripts/data/sideQuests.js';
import { skills } from '../../../shizu-cocos/assets/scripts/data/skills.js';
import { HIDDEN_SKILLS, ALL_HIDDEN_SKILLS } from '../../../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { ROUTES, ALL_ROUTES, COMBO_SKILLS } from '../../../shizu-cocos/assets/scripts/data/routes.js';
import { SYNERGIES } from '../../../shizu-cocos/assets/scripts/data/synergies.js';
import { ACHIEVEMENTS } from '../../../shizu-cocos/assets/scripts/data/achievements.js';
import { RELICS } from '../../../shizu-cocos/assets/scripts/data/relics.js';
import { CRISES } from '../../../shizu-cocos/assets/scripts/data/crises.js';
import { ELITE_AFFIXES } from '../../../shizu-cocos/assets/scripts/data/eliteAffixes.js';
import { GENERIC_ATTR_POOL } from '../../../shizu-cocos/assets/scripts/data/attrPool.js';
import { NEST_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/nestUpgrades.js';
import { MECH_UPGRADES } from '../../../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { WEAPON_ATTACK, DEFAULT_WEAPON } from '../../../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { STAGE_SECONDS } from '../../../shizu-cocos/assets/scripts/core/dungeon.js';
import { SCHEMA, schemaNewEntry } from './config/schema.js';
import { buildWorldEditor } from '../editor/worldEditor.js';

const KEY = 'cfg_overrides_v1';
const loadOv = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}; } catch { return {}; } };

// 编辑器状态：从默认值起步，合并已保存覆盖
const state = { planes: {}, mechanics: {}, riftMods: [], shopItems: [], sideQuests: [], skills: [], hiddenSkills: {}, routes: {}, combos: [], synergies: [], achievements: [], relics: {}, crises: [], eliteAffixes: [], attrPool: [], nestUpgrades: [], mechUpgrades: [], weaponAttack: {}, stageSprites: {}, bossSprites: {} };

/** 把一份覆盖对象合并进编辑器状态（启动读档与分享码导入共用） */
function mergeIntoState(o) {
  for (const [pid, patch] of Object.entries(o.planes ?? {})) {
    if (state.planes[pid]) Object.assign(state.planes[pid], patch);
    else state.planes[pid] = { ...patch };
  }
  for (const [pid, mech] of Object.entries(o.mechanics ?? {})) if (state.mechanics[pid]) Object.assign(state.mechanics[pid], mech);
  for (const [pid, pairs] of Object.entries(o.stageSprites ?? {})) if (Array.isArray(pairs)) state.stageSprites[pid] = pairs.map((x) => [...x]);
  for (const [pid, name] of Object.entries(o.bossSprites ?? {})) if (state.bossSprites[pid] != null || String(pid).startsWith('plane_')) state.bossSprites[pid] = name;
  for (const l of [['riftMods', state.riftMods], ['shopItems', state.shopItems], ['sideQuests', state.sideQuests], ['skills', state.skills], ['combos', state.combos], ['synergies', state.synergies], ['achievements', state.achievements], ['crises', state.crises], ['eliteAffixes', state.eliteAffixes], ['attrPool', state.attrPool], ['nestUpgrades', state.nestUpgrades], ['mechUpgrades', state.mechUpgrades]]) {
    const [k, arr] = l;
    for (const patch of o[k] ?? []) {
      const t = arr.find((x) => x.id === patch.id);
      if (t) Object.assign(t, patch);
      else if (patch.id && !['shopItems', 'sideQuests', 'achievements'].includes(k)) arr.push({ ...patch });
    }
  }
  for (const [hid, patch] of Object.entries(o.hiddenSkills ?? {})) if (state.hiddenSkills[hid]) Object.assign(state.hiddenSkills[hid], patch);
  for (const [rid, patch] of Object.entries(o.routes ?? {})) if (state.routes[rid]) Object.assign(state.routes[rid], patch);
  for (const [rid, patch] of Object.entries(o.relics ?? {})) if (state.relics[rid]) Object.assign(state.relics[rid], patch);
  for (const [rid, patch] of Object.entries(o.weaponAttack ?? {})) if (state.weaponAttack[rid]) Object.assign(state.weaponAttack[rid], patch);
}

// —— 默认装载（原生表）→ 再合并已保存覆盖 ——
{
  const o = loadOv();
  for (const p of planes) {
    state.planes[p.id] = {
      name: p.name, theme: p.theme, boss: p.boss, bossDesc: p.bossDesc ?? '', poem: p.poem ?? '',
      codex: p.codex, group: p.group, routes: [...(p.routes ?? [])], waves: [...(p.waves ?? [])],
      eliteStages: [...(p.eliteStages ?? [])], spawnStyle: p.spawnStyle ?? 'standard',
      ...(p.art ? { art: { ...p.art } } : {}),
    };
    // 地形轴原生值：未来 data 直接落库时，编辑器从真源继承而不是从空白起步
    if (p.spawn && Number.isFinite(Number(p.spawn.x))) state.planes[p.id].spawn = { x: Number(p.spawn.x), y: Number(p.spawn.y) };
    if (Array.isArray(p.obstacles) && p.obstacles.length) state.planes[p.id].obstacles = p.obstacles.map((ob) => ({ x: Number(ob.x), y: Number(ob.y), r: Number(ob.r) }));
    if (Array.isArray(p.triggers) && p.triggers.length) state.planes[p.id].triggers = JSON.parse(JSON.stringify(p.triggers));
  }
  for (const pid of Object.keys(MINION_SPRITE_BY_STAGE)) state.stageSprites[pid] = MINION_SPRITE_BY_STAGE[pid].map((x) => [...x]);
  for (const [pid, name] of Object.entries(BOSS_BY_PLANE)) state.bossSprites[pid] = name;
  // 位面机制（Boss技能）原生值播种：此前从不装载，12 位面的机制在后台不可见不可改
  for (const [pid, mech] of Object.entries(PLANE_MECHANICS)) state.mechanics[pid] = { ...mech };

  state.riftMods = RIFT_MODS.map((m) => ({ id: m.id, name: m.name, desc: m.desc, risk: m.risk }));
  state.shopItems = SHOP_ITEMS.map((s) => ({ id: s.id, name: s.name, desc: s.desc, price: s.price }));
  state.sideQuests = SIDE_QUESTS.map((q) => ({ id: q.id, name: q.name, desc: q.desc, reward: q.reward }));
  state.skills = skills.map((s) => ({ id: s.id, route: s.route, lv: s.lv, name: s.name, desc: s.desc, val: s.val ?? '', kind: s.kind, cd: s.cd ?? '', eff: { ...(s.eff ?? {}) }, visual: { ...(s.visual ?? {}) } }));
  for (const h of ALL_HIDDEN_SKILLS) state.hiddenSkills[h.id] = { name: h.name, desc: h.desc, route: h.route, kind: h.kind, cd: h.cd ?? '', slotPrefer: h.slotPrefer ?? '', eff: { ...(h.eff ?? {}) }, visual: { ...(h.visual ?? {}) } };
  for (const r of ALL_ROUTES) state.routes[r] = { name: ROUTES[r].name, role: ROUTES[r].role, skin: ROUTES[r].skin ?? '' };
  state.combos = COMBO_SKILLS.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));
  state.synergies = SYNERGIES.map((s) => ({ id: s.id, name: s.name, desc: s.desc, eff: { ...(s.eff ?? {}) } }));
  state.achievements = ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, reward: a.reward }));
  for (const [rid, r] of Object.entries(RELICS)) state.relics[rid] = { id: rid, name: r.name, story: r.story, eff: { ...(r.eff ?? {}) } };
  state.crises = CRISES.map((c) => ({ id: c.id, name: c.name, desc: c.desc, warn: c.warn }));
  state.eliteAffixes = ELITE_AFFIXES.map((a) => ({ id: a.id, name: a.name, desc: a.desc, color: a.color, eff: { ...(a.eff ?? {}) } }));
  state.attrPool = GENERIC_ATTR_POOL.map((a) => ({ id: a.id, name: a.name, desc: a.desc, rarity: a.rarity, weight: a.weight ?? '', eff: { ...(a.eff ?? {}) } }));
  state.nestUpgrades = NEST_UPGRADES.map((u) => ({ id: u.id, name: u.name, desc: u.desc, max: u.max, eff: { ...(u.eff ?? {}) } }));
  state.mechUpgrades = Object.values(MECH_UPGRADES).flat().map((m) => ({ id: m.id, name: m.name, desc: m.desc, eff: { ...(m.eff ?? {}) } }));
  for (const [rid, w] of Object.entries(WEAPON_ATTACK)) state.weaponAttack[rid] = { projectile: w.projectile, color: w.color, pattern: w.pattern };
  state.weaponAttack.__default = { projectile: DEFAULT_WEAPON.projectile, color: DEFAULT_WEAPON.color, pattern: DEFAULT_WEAPON.pattern };

  // 合并已保存覆盖（未知 id = 上次后台新增的条目，直接并入状态）
  mergeIntoState(o);
}

// ——— 小工具（转义 & 控件）———
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function field(label, value, oninput, ph = '') {
  const wrap = document.createElement('label');
  wrap.className = 'af-field';
  wrap.innerHTML = `<span>${esc(label)}</span>`;
  const input = document.createElement('input');
  input.value = value; input.placeholder = ph;
  input.addEventListener('input', () => oninput(input.value));
  wrap.appendChild(input);
  return wrap;
}
function numField(label, value, oninput) {
  const w = field(label, value, (v) => oninput(Number(v) || 0));
  w.querySelector('input').type = 'number';
  return w;
}
function box(title) {
  const el = document.createElement('div');
  el.className = 'cfg-block';
  el.innerHTML = `<h3>${esc(title)}</h3>`;
  return el;
}
function textarea(label, value, oninput) {
  const wrap = document.createElement('label');
  wrap.className = 'af-field af-ta';
  wrap.innerHTML = `<span>${esc(label)}</span>`;
  const ta = document.createElement('textarea');
  ta.value = value; ta.rows = 2;
  ta.addEventListener('input', () => oninput(ta.value));
  wrap.appendChild(ta);
  return wrap;
}
/**
 * 效果字段（eff）编辑器：JSON 对象，失焦时校验。
 * 合法 → 写回 state 并标脏；非法 → 红字提示且不写回（不污染导出）。
 */
function jsonField(label, obj, onChange, allowArray = false) {
  const wrap = document.createElement('label');
  wrap.className = 'af-field af-ta';
  wrap.innerHTML = `<span>${esc(label)}</span>`;
  const ta = document.createElement('textarea');
  ta.value = JSON.stringify(obj ?? {}, null, 0);
  ta.rows = 1; ta.spellcheck = false;
  ta.style.fontFamily = 'monospace'; ta.style.fontSize = '12px';
  const hint = document.createElement('div');
  hint.className = 'json-hint';
  hint.textContent = '✓ 有效';
  const sync = () => {
    try {
      const v = JSON.parse(ta.value);
      const badType = allowArray ? (!v || typeof v !== 'object') : (!v || typeof v !== 'object' || Array.isArray(v));
      if (badType) throw new Error(allowArray ? '必须是对象或数组' : '必须是 {键:值} 对象');
      onChange(v);
      hint.textContent = '✓ 有效'; hint.style.color = '#6fbb8f'; mark();
    } catch (e) {
      hint.textContent = `✗ ${e.message}（未应用）`; hint.style.color = '#e0653c';
    }
  };
  ta.addEventListener('change', sync);   // 失焦才校验，避免打字中途报错
  wrap.appendChild(ta); wrap.appendChild(hint);
  return wrap;
}

// ——— 触发器/机制结构化编辑：枚举中文标签与参数契约（与 core 唯一真源对齐）———
const EVENT_LABELS = {
  onFirstBlood: '首次击杀', onEliteKill: '击杀精英', onBossKill: '击破位面之主', onChestSpawn: '宝箱出现', onChestOpen: '开宝箱',
  onStageClear: '阶段肃清', onLowHp: '低血量', onTimeTick: '周期计时', onSurgeSpawn: '涌潮来袭', onShopOpen: '黑市开门',
  onChoiceOpen: '三选一弹出', onPlaneEnter: '进入位面', onDevour: '吞噬爆发', onAmbushSpawn: '伏击现身', onBossHalfHp: '之主半血',
  onMiniRushClear: '急袭肃清', onGearDrop: '装备掉落', onCrisis: '危机生效', onEndlessLayer: '无尽层推进', onBossSpawn: '之主现身',
};
const pp = (k, l, min, max, step) => ({ k, l, min, max, step });
const ACTION_DEFS = {
  surge: { label: '涌潮压境', params: [pp('count', '数量', 1, 30, 1)] },
  heal: { label: '回复生命', params: [pp('pct', '上限比例0~1', 0.05, 1, 0.05)] },
  shield: { label: '护盾', params: [pp('pct', '上限比例0~1', 0.05, 1, 0.05)] },
  genes: { label: '基因直入', params: [pp('amount', '数量', 1, 2000, 10)] },
  spawnElite: { label: '触袭精英', params: [pp('count', '只数', 1, 3, 1)] },
  freeze: { label: '全场冰封', params: [pp('duration', '秒≤5', 1, 5, 0.5)] },
  invuln: { label: '无敌帧', params: [pp('duration', '秒≤8', 1, 8, 0.5)] },
  revive: { label: '致死拦截', params: [pp('count', '次数≤2', 1, 2, 1)] },
  freeReroll: { label: '免费重掷', params: [pp('count', '次数≤3', 1, 3, 1)] },
  freeBanish: { label: '放逐次数', params: [pp('count', '次数≤2', 1, 2, 1)] },
  essence: { label: '装备精华', params: [pp('amount', '数量≤300', 5, 300, 5)] },
  permGenes: { label: '跨局基因', params: [pp('amount', '数量≤2000', 10, 2000, 10)] },
  permAtk: { label: '永久攻击%', params: [pp('pct', '%≤10', 1, 10, 1)] },
  permHp: { label: '永久生命%', params: [pp('pct', '%≤10', 1, 10, 1)] },
  permSpeed: { label: '永久移速%', params: [pp('pct', '%≤10', 1, 10, 1)] },
  buffAtk: { label: '攻击乘区', params: [pp('pct', '乘区0~1', 0.05, 1, 0.05)] },
  buffSpeed: { label: '移速乘区', params: [pp('pct', '乘区0~1', 0.05, 1, 0.05)] },
  buffAspd: { label: '攻速乘区', params: [pp('pct', '乘区0~1', 0.05, 1, 0.05)] },
  buffRange: { label: '攻击范围', params: [pp('pct', '乘区0~2', 0.1, 2, 0.1)] },
  buffAoe: { label: '清场范围', params: [pp('pct', '+0~2', 0.1, 2, 0.1)] },
  buffCrit: { label: '暴击率', params: [pp('pct', '+0~0.95', 0.05, 0.95, 0.05)] },
  buffCritDmg: { label: '暴击伤害', params: [pp('pct', '+0~3', 0.1, 3, 0.1)] },
  buffDmg: { label: '总伤害', params: [pp('pct', '乘区0~2', 0.05, 2, 0.05)] },
  buffDmgReduct: { label: '减伤', params: [pp('pct', '+0~0.9', 0.05, 0.9, 0.05)] },
  buffLifesteal: { label: '吸血', params: [pp('pct', '+0~0.3', 0.02, 0.3, 0.02)] },
  buffRegen: { label: '每秒回血', params: [pp('pct', '%上限/秒≤5', 0.5, 5, 0.5)] },
  buffSuck: { label: '吸取半径', params: [pp('pct', '乘区0~2', 0.1, 2, 0.1)] },
  buffReflect: { label: '受击反伤', params: [pp('pct', '0~1', 0.05, 1, 0.05)] },
  buffCounter: { label: '落雷反击', params: [pp('pct', '概率0~1', 0.05, 1, 0.05), pp('mul', '倍率可选', 0.1, 3, 0.1)] },
  buffThorn: { label: '反震', params: [pp('value', '+0~2×攻', 0.05, 2, 0.05)] },
  buffExecute: { label: '斩杀增伤', params: [pp('pct', '+0~2', 0.1, 2, 0.1)] },
  buffDot: { label: '持续伤害', params: [pp('pct', '乘区+0~3', 0.1, 3, 0.1)] },
  buffChain: { label: '雷链弹射', params: [pp('count', '跳数≤5', 1, 5, 1)] },
  buffElemental: { label: '元素附着', params: [pp('count', '等级≤2', 1, 2, 1)] },
  buffVsElite: { label: '对精英增伤', params: [pp('pct', '+0~2', 0.1, 2, 0.1)] },
  buffGeneBonus: { label: '基因产出%', params: [pp('pct', '+0~2', 0.1, 2, 0.1)] },
  buffKillHeal: { label: '击杀回血', params: [pp('pct', '比例≤0.1', 0.01, 0.1, 0.01)] },
  buffDevourHeal: { label: '吞噬回血', params: [pp('pct', '比例≤0.3', 0.02, 0.3, 0.02)] },
  buffCooldown: { label: '冷却缩减', params: [pp('pct', '-0~0.6', 0.05, 0.6, 0.05)] },
};

// 位面机制（Boss技能）类型全集 —— 与 battle.js mechanicsTick / planeModules.js 对齐
const SIG_OPTIONS = [['', '无'], ['lotus', '金光普照'], ['corpseTide', '尸潮拱地'], ['spore', '孢子迸散'], ['swordQi', '剑气纵横']];
const BOSS_SKILL_OPTIONS = [['', '沿用位面默认'], ['fan', '扇形弹幕'], ['ring', '环形弹幕'], ['laser', '直线激光'], ['lightning', '随机落雷'], ['missile', '追踪导弹'], ['summon', '召唤小怪']];
const MECH_DEFS = {
  laser: { label: '激光扫射', params: [pp('interval', '间隔(s)', 3, 60, 1)] },
  bulletHell: { label: '弹幕环', params: [pp('interval', '间隔(s)', 3, 60, 1), pp('count', '弹幕数', 2, 12, 1)] },
  mirrorLaser: { label: '镜面折光', params: [pp('interval', '间隔(s)', 3, 60, 1)] },
  lightning: { label: '天雷引', params: [pp('interval', '间隔(s)', 3, 60, 1)] },
  stomp: { label: '践踏震荡', params: [pp('interval', '间隔(s)', 5, 90, 1), pp('radius', '半径', 40, 260, 10)] },
  missile: { label: '追踪飞弹', params: [pp('interval', '间隔(s)', 3, 60, 1)] },
  titanStep: { label: '巨神步', params: [pp('interval', '间隔(s)', 6, 120, 1), pp('radius', '半径', 60, 320, 10)] },
  mix: { label: '全机制融合', params: [pp('interval', '间隔(s)', 3, 60, 1)] },
  armor: { label: '金身减伤', params: [pp('factor', '减伤比例', 0.05, 0.9, 0.05), pp('interval', '间隔(s)', 5, 90, 1)], sig: true },
  corpseBlast: { label: '尸爆连锁', params: [pp('radius', '半径', 30, 200, 5), pp('mul', '伤害倍率', 1, 3, 0.1), pp('interval', '间隔(s)', 5, 90, 1)], sig: true },
  parasite: { label: '寄生反水', params: [pp('chance', '触发概率', 0.02, 0.5, 0.02), pp('duration', '持续(s)', 2, 15, 1), pp('interval', '间隔(s)', 5, 90, 1)], sig: true },
  combo: { label: '连招增伤', params: [pp('mul', '倍率', 1, 2, 0.05), pp('interval', '间隔(s)', 5, 90, 1)], sig: true },
};

// —— 触发器结构化编辑器：事件下拉 + 动作子行（参数按 ACTION_DEFS 动态渲染）———
function buildTriggerEditor(st) {
  const wrap = document.createElement('div');
  wrap.className = 'af-field af-ta';
  const lbl = document.createElement('span'); lbl.textContent = '触发器剧本（事件 → 动作）';
  wrap.appendChild(lbl);
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  wrap.appendChild(body);
  if (!Array.isArray(st.triggers)) st.triggers = [];

  const renderAll = () => {
    body.innerHTML = '';
    st.triggers.forEach((trg, ti) => {
      const card = document.createElement('div'); card.className = 'trg-card';
      const head = document.createElement('div'); head.className = 'trg-head';
      const evSel = document.createElement('select');
      for (const [v, l] of Object.entries(EVENT_LABELS)) { const o = document.createElement('option'); o.value = v; o.textContent = v + ' · ' + l; evSel.appendChild(o); }
      evSel.value = trg.on;
      evSel.addEventListener('change', () => { trg.on = evSel.value; if (evSel.value !== 'onTimeTick') delete trg.every; mark(); renderAll(); });
      head.appendChild(evSel);
      const mkNum = (ph, get, set) => {
        const i = document.createElement('input'); i.type = 'number'; i.placeholder = ph; i.style.width = '76px';
        i.value = get ?? '';
        i.addEventListener('input', () => set(i.value === '' ? null : Number(i.value)));
        return i;
      };
      head.appendChild(mkNum('限定阶段', trg.stage, (n) => { if (n == null || n < 1) delete trg.stage; else trg.stage = Math.min(5, Math.round(n)); mark(); }));
      const everyIn = mkNum('every 秒', trg.every, (n) => { if (n == null || n <= 0) delete trg.every; else trg.every = Math.max(3, n); mark(); });
      if (trg.on !== 'onTimeTick') everyIn.style.display = 'none';
      head.appendChild(everyIn);
      const delT = document.createElement('button'); delT.type = 'button'; delT.textContent = '删'; delT.className = 'trg-del';
      delT.addEventListener('click', () => { st.triggers.splice(ti, 1); if (!st.triggers.length) delete st.triggers; mark(); renderAll(); });
      head.appendChild(delT);
      card.appendChild(head);

      (trg.actions ?? []).forEach((act, ai) => {
        const row = document.createElement('div'); row.className = 'trg-action';
        const tSel = document.createElement('select');
        for (const [id, def] of Object.entries(ACTION_DEFS)) { const o = document.createElement('option'); o.value = id; o.textContent = id + ' · ' + def.label; tSel.appendChild(o); }
        tSel.value = act.type;
        tSel.addEventListener('change', () => {
          const kept = { type: tSel.value };
          for (const p of ACTION_DEFS[tSel.value].params) { const v = act[p.k]; if (v != null) kept[p.k] = v; }
          trg.actions[ai] = act = kept;
          mark(); renderAll();
        });
        row.appendChild(tSel);
        for (const p of (ACTION_DEFS[act.type]?.params ?? [])) {
          const inp = document.createElement('input'); inp.type = 'number'; inp.title = p.l;
          inp.placeholder = p.l; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.style.width = '96px';
          inp.value = act[p.k] ?? '';
          inp.addEventListener('input', () => { const n = Number(inp.value); if (inp.value === '' || !Number.isFinite(n)) delete act[p.k]; else act[p.k] = n; mark(); });
          row.appendChild(inp);
        }
        const delA = document.createElement('button'); delA.type = 'button'; delA.textContent = '×'; delA.className = 'trg-del';
        delA.addEventListener('click', () => { trg.actions.splice(ai, 1); mark(); renderAll(); });
        row.appendChild(delA);
        card.appendChild(row);
      });

      const addAct = document.createElement('button'); addAct.type = 'button'; addAct.textContent = '＋动作'; addAct.dataset.actAdd = '1';
      addAct.addEventListener('click', () => {
        (trg.actions ??= []).push({ type: 'surge', count: 10 });
        mark(); renderAll();
      });
      card.appendChild(addAct);
      body.appendChild(card);
    });
    // 「＋触发器」按钮——在 renderAll 内重附（renderAll 开头清空 body）
    const addT = document.createElement('button'); addT.type = 'button'; addT.textContent = '＋触发器'; addT.dataset.trgAdd = '1';
    addT.addEventListener('click', () => { st.triggers.push({ on: 'onFirstBlood', actions: [{ type: 'genes', amount: 50 }] }); mark(); renderAll(); });
    body.appendChild(addT);
  };
  renderAll();
  return wrap;
}

// 位面机制（Boss技能）编辑器：类型下拉 + 按类型动态参数 + 可选招牌事件
function buildMechanicEditor(pid) {
  const wrap = document.createElement('div'); wrap.className = 'af-field af-ta';
  const lbl = document.createElement('span'); lbl.textContent = '位面机制（Boss 技能）';
  wrap.appendChild(lbl);
  const mech = state.mechanics[pid] ?? (state.mechanics[pid] = { type: 'laser', interval: 12 });
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center';
  wrap.appendChild(body);
  const render = () => {
    body.innerHTML = '';
    const sel = document.createElement('select'); sel.className = 'mech-select';
    for (const [id, def] of Object.entries(MECH_DEFS)) { const o = document.createElement('option'); o.value = id; o.textContent = id + ' · ' + def.label; sel.appendChild(o); }
    sel.value = mech.type;
    sel.addEventListener('change', () => {
      const def = MECH_DEFS[sel.value];
      const next = { type: sel.value };
      for (const p of def.params) next[p.k] = mech[p.k] ?? p.min;
      if (def.sig && mech.signature) next.signature = mech.signature;
      if (mech.bossSkill) next.bossSkill = mech.bossSkill;
      Object.keys(mech).forEach((k) => delete mech[k]); Object.assign(mech, next);
      mark(); render();
    });
    body.appendChild(sel);
    for (const p of (MECH_DEFS[mech.type]?.params ?? [])) {
      const i = document.createElement('input'); i.type = 'number'; i.placeholder = p.l; i.title = p.l;
      i.min = p.min; i.max = p.max; i.step = p.step; i.style.width = '92px'; i.value = mech[p.k] ?? '';
      i.addEventListener('input', () => { const n = Number(i.value); if (Number.isFinite(n)) { mech[p.k] = n; mark(); } });
      body.appendChild(i);
    }
    const bossSkill = document.createElement('select'); bossSkill.className = 'boss-skill-select'; bossSkill.title = 'Boss技能样式';
    for (const [v, l] of BOSS_SKILL_OPTIONS) { const o = document.createElement('option'); o.value = v; o.textContent = 'Boss技:' + l; bossSkill.appendChild(o); }
    bossSkill.value = mech.bossSkill ?? '';
    bossSkill.addEventListener('change', () => { if (bossSkill.value) mech.bossSkill = bossSkill.value; else delete mech.bossSkill; mark(); });
    body.appendChild(bossSkill);
    if (MECH_DEFS[mech.type]?.sig) {
      const s2 = document.createElement('select'); s2.title = '招牌事件';
      for (const [v, l] of SIG_OPTIONS) { const o = document.createElement('option'); o.value = v; o.textContent = l === '无' ? '无招牌' : '招牌:' + l; s2.appendChild(o); }
      s2.value = mech.signature ?? '';
      s2.addEventListener('change', () => { if (s2.value) mech.signature = s2.value; else delete mech.signature; mark(); });
      body.appendChild(s2);
    }
  };
  render();
  return wrap;
}

// ——— 资产库：serve /api/art-list 清单 → datalist 自动补全 + 网格浏览 ———
let ART = null;
let assetPaneEl = null;
let assetTarget = { pid: '', slot: 'boss', skillId: '' };
let assetBindingHint = null;
function assetPlaneIds() {
  const extra = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
  return [...planes.map((p) => p.id), ...extra];
}
function bindAsset(dir, name) {
  const pid = assetTarget.pid || assetPlaneIds()[0];
  const st = state.planes[pid];
  if (!st) return;
  const rel = `${dir}/${name}.png`;
  if (assetTarget.slot === 'skillIcon' || assetTarget.slot === 'skillProjectile') {
    const skill = state.skills.find((s) => s.id === assetTarget.skillId);
    if (!skill) return;
    skill.visual ??= {};
    skill.visual[assetTarget.slot === 'skillIcon' ? 'icon' : 'projectile'] = rel;
  } else if (dir === 'backgrounds') {
    st.art ??= {};
    st.art[assetTarget.slot === 'background' ? 'background' : 'floor'] = rel;
  } else if (dir === 'units') {
    if (assetTarget.slot === 'boss') state.bossSprites[pid] = name;
    else if (assetTarget.slot.startsWith('stage:')) {
      const [, si, sj] = assetTarget.slot.split(':');
      const i = Number(si), j = Number(sj ?? 0);
      state.stageSprites[pid] ??= Array.from({ length: 5 }, () => ['', '']);
      state.stageSprites[pid][i][j] = name;
    } else if (assetTarget.slot === 'player') {
      st.art ??= {}; st.art.playerSkin = rel;
    }
  }
  mark();
  if (assetBindingHint) assetBindingHint.textContent = `✓ 已绑定 ${rel} → ${pid} / ${assetTarget.slot}`;
}
function renderAssetTargetControls(sec) {
  const controls = document.createElement('div'); controls.className = 'asset-targets';
  const psel = document.createElement('select'); psel.id = 'assetPlaneTarget';
  for (const pid of assetPlaneIds()) { const o = document.createElement('option'); o.value = pid; o.textContent = `${pid} · ${state.planes[pid]?.name ?? pid}`; psel.appendChild(o); }
  psel.value = assetTarget.pid || psel.options[0]?.value || ''; assetTarget.pid = psel.value;
  psel.addEventListener('change', () => { assetTarget.pid = psel.value; });
  const ssel = document.createElement('select'); ssel.id = 'assetSlotTarget';
  const monsterSlots = Array.from({ length: 5 }, (_, i) => [[`stage:${i}:0`, `S${i + 1}-A 小怪形象`], [`stage:${i}:1`, `S${i + 1}-B 小怪形象`]]).flat();
  const slots = [['floor', '地图地砖'], ['background', '地图背景'], ['boss', 'Boss形象'], ['player', '人物皮肤'], ...monsterSlots, ['skillIcon', '技能图标'], ['skillProjectile', '技能弹体']];
  for (const [v, l] of slots) { const o = document.createElement('option'); o.value = v; o.textContent = l; ssel.appendChild(o); }
  ssel.value = assetTarget.slot;
  ssel.addEventListener('change', () => { assetTarget.slot = ssel.value; skillSel.style.display = ssel.value.startsWith('skill') ? '' : 'none'; });
  controls.append('绑定位面 ', psel, ' 目标 ', ssel);
  const skillSel = document.createElement('select'); skillSel.id = 'assetSkillTarget';
  for (const s of state.skills) { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.id} · ${s.name}`; skillSel.appendChild(o); }
  skillSel.value = assetTarget.skillId || state.skills[0]?.id || ''; assetTarget.skillId = skillSel.value;
  skillSel.style.display = assetTarget.slot.startsWith('skill') ? '' : 'none';
  skillSel.addEventListener('change', () => { assetTarget.skillId = skillSel.value; });
  controls.append(' 技能 ', skillSel);
  assetBindingHint = document.createElement('span'); assetBindingHint.className = 'small-hint'; assetBindingHint.textContent = '选择目标后点击资产缩略图即可绑定';
  controls.appendChild(assetBindingHint);
  sec.appendChild(controls);
}
function injectDatalists() {
  if (!ART) return;
  document.getElementById('dl-units')?.remove();
  const dl = document.createElement('datalist'); dl.id = 'dl-units';
  const rawUnits = ART.units ?? [];
  for (const n of rawUnits.filter((x) => rawUnits.includes(`${x}_walk0`))) { const o = document.createElement('option'); o.value = n; dl.appendChild(o); }
  document.head.appendChild(dl);
  document.getElementById('dl-backgrounds')?.remove();
  const db = document.createElement('datalist'); db.id = 'dl-backgrounds';
  for (const n of ART.backgrounds ?? []) { const o2 = document.createElement('option'); o2.value = n; db.appendChild(o2); }
  document.head.appendChild(db);
}
async function loadArt() {
  try {
    ART = await (await fetch('/api/art-list')).json();
    injectDatalists();
    if (assetPaneEl && assetPaneEl.isConnected) { assetPaneEl.innerHTML = ''; buildAssets(assetPaneEl); }
  } catch { /* 非 serve 环境（file:// 直开）静默降级 */ }
}
loadArt();

function buildAssets(root) {
  assetPaneEl = root;
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>资产库 · 加载中……</h2>';
  root.appendChild(sec);
  if (!ART) { sec.innerHTML += '<div class="small-hint">⏳ 正在从 serve 加载清单（需通过 npm run serve 访问；file:// 直开无此端点）</div>'; return; }
  renderAssetTargetControls(sec);
  let total = 0;
  const titles = { units: '单位（_walk0/_atk0/_death 为动作帧）', backgrounds: '背景与地砖（floor_<位面>.png 可平铺）', effects: '特效', items: '物品', lobby: '大厅' };
  for (const dir of ART_DIRS) {
    const rawNames = ART[dir] ?? [];
    // units 目录包含 walk0/atk0/death 等帧文件；对象绑定只能选「基础立绘 + walk0 都存在」的合法 sprite 基名
    const names = dir === 'units' ? rawNames.filter((n) => rawNames.includes(`${n}_walk0`)) : rawNames;
    total += names.length;
    const det = document.createElement('details'); det.className = 'cfg-details';
    det.innerHTML = '<summary>' + dir + ' · ' + names.length + ' 个 —— ' + (titles[dir] ?? '') + '</summary>';
    const grid = document.createElement('div'); grid.className = 'asset-grid';
    for (const n of names) {
      const cell = document.createElement('div'); cell.className = 'asset-cell'; cell.title = dir + '/' + n + '（点击绑定到上方目标）';
      const img = document.createElement('img'); img.loading = 'lazy'; img.src = '../shizu-cocos/assets/art/' + dir + '/' + n + '.png'; img.alt = n;
      img.addEventListener('click', () => bindAsset(dir, n));
      const cap = document.createElement('span'); cap.textContent = n;
      cap.addEventListener('click', () => { navigator.clipboard?.writeText(n); cap.textContent = '✓已复制'; setTimeout(() => { cap.textContent = n; }, 800); });
      cell.appendChild(img); cell.appendChild(cap); grid.appendChild(cell);
    }
    det.appendChild(grid); sec.appendChild(det);
  }
  sec.querySelector('h2').textContent = '资产库 · 共 ' + total + ' 个像素资产（点图绑定到目标；点名称复制）';
}
const ART_DIRS = ['units', 'backgrounds', 'effects', 'items', 'lobby'];

// ——— 新增条目支持：安全集合（纯数据、无函数依赖）可在后台直接加新条目 ———
const PANES = {};
let PANE_DEFS = [];
let _n = 100;
const nn = () => (_n++);
function refreshPane(key) {
  const pane = PANES[key];
  const def = PANE_DEFS.find((d) => d[0] === key);
  if (!pane || !def) return;
  pane.innerHTML = '';
  def[2](pane);
}
function addBtn(sec, key, make) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.addFor = key;
  b.textContent = '+ 新增条目';
  b.addEventListener('click', () => { make(); mark(); refreshPane(key); });
  sec.appendChild(b);
}

// ——— 构建各维度区块 ———
function buildPlanes(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>位面 · 进入事件与叙事</h2>';
  addBtn(sec, 'planes', () => {
    const pid = `plane_${nn()}`;
    state.planes[pid] = {
      _new: true, name: '新位面', theme: '', boss: '新位面之主', bossDesc: '', poem: '',
      codex: 0, group: '自定义', routes: [], waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    };
    // 播种默认切面：敌人阶段表 / Boss / 招牌机制——让新位面在敌人·Boss 标签立即可配
    state.stageSprites[pid] = Array.from({ length: 5 }, () => ['', '']);
    state.bossSprites[pid] = `boss_${pid.replace('plane_', '')}`;
    state.mechanics[pid] = { type: 'laser', interval: 12 };
  });
  // 遍历 原生位面 + 后台新增位面（仅存在于 state 的 id）
  const extraIds = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
  for (const pid of [...planes.map((p) => p.id), ...extraIds]) {
    const st = state.planes[pid];
    const b = box(`${pid} · ${st.name}${st._new ? '（新增）' : ''}`);
    b.appendChild(field('主题', st.theme, (v) => { st.theme = v; mark(); }));
    b.appendChild(field('Boss 名', st.boss, (v) => { st.boss = v; mark(); }));
    b.appendChild(field('Boss 机制词', st.bossDesc, (v) => { st.bossDesc = v; mark(); }));
    b.appendChild(textarea('开场诗', st.poem, (v) => { st.poem = v; mark(); }));
    b.appendChild(buildMechanicEditor(pid));
    if (!st.spawn) st.spawn = {};
    b.appendChild(field('出生点 X（可省）', st.spawn.x ?? '', (v) => { const n = Number(v); if (v !== '' && Number.isFinite(n)) st.spawn.x = n; else delete st.spawn.x; mark(); }));
    b.appendChild(field('出生点 Y（可省）', st.spawn.y ?? '', (v) => { const n = Number(v); if (v !== '' && Number.isFinite(n)) st.spawn.y = n; else delete st.spawn.y; mark(); }));
    b.appendChild(jsonField(
      '障碍物 [{x,y,r}]（圆形碰撞）',
      st.obstacles ?? [],
      (v) => {
        if (Array.isArray(v) && v.length) st.obstacles = v;
        else delete st.obstacles;
      },
      true,
    ));
    b.appendChild(buildTriggerEditor(st));
    {
      const tplBtn = document.createElement('button');
      tplBtn.type = 'button';
      tplBtn.textContent = '插入示例剧本';
      tplBtn.addEventListener('click', () => {
        st.triggers = [
          { on: 'onFirstBlood', actions: [{ type: 'genes', amount: 50 }] },
          { on: 'onChestOpen', actions: [{ type: 'spawnElite', count: 2 }] },
          { on: 'onTimeTick', every: 30, actions: [{ type: 'surge', count: 15 }] },
        ];
        mark(); refreshPane('planes');
      });
      b.appendChild(tplBtn);
    }
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

/**
 * sprite 预览 + 引用校验二合一：按渲染层约定探测 units/<名>_walk0.png。
 * 加载成功显示像素小图；失败画红框并提示缺图路径——改名的悬空引用当场可见。
 */
function spritePreview(getName) {
  const img = document.createElement('img');
  img.className = 'sprite-prev';
  img.width = 44; img.height = 44;
  const update = () => {
    const n = String(getName() ?? '').trim();
    if (!n) { img.removeAttribute('src'); img.classList.add('missing'); img.title = '名称为空'; return; }
    img.src = `../shizu-cocos/assets/art/units/${n}_walk0.png`;
  };
  img.addEventListener('error', () => {
    img.classList.add('missing');
    img.title = `缺图：units/${getName()}_walk0.png（渲染层会退化为色块）`;
  });
  img.addEventListener('load', () => {
    img.classList.remove('missing');
    img.title = `✓ units/${getName()}_walk0.png`;
  });
  update();
  img.updateSprite = update;
  return img;
}

// ——— 地图编辑器（魔兽式地形轴）：无限世界坐标 Canvas，拖拽摆障碍物/出生点 ———
// 世界坐标系与 core/battle.js 完全一致：相机跟随玩家自由漫游，ARENA{960×560} 只是视口；
// 地砖 256×256 无缝镜像；障碍物圆 {x,y,r} 只推玩家；出生点金环 r=28。渲染配色对齐 renderer.js。
function buildMapEditor(root) {
  const TILE = 256, VIEW_W = 960, VIEW_H = 560, PLAYER_R = 14;
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>地图编辑器 · 障碍物与出生点（写入 plane.spawn / plane.obstacles，应用后双端生效）</h2>';

  // —— 工具栏 ——
  const bar = document.createElement('div');
  bar.className = 'map-toolbar';
  const planeSel = document.createElement('select');
  planeSel.id = 'mapPlane';
  {
    const extraIds = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
    for (const pid of [...planes.map((p) => p.id), ...extraIds]) {
      const opt = document.createElement('option');
      opt.value = pid; opt.textContent = `${pid} · ${state.planes[pid]?.name ?? pid}`;
      planeSel.appendChild(opt);
    }
  }
  bar.appendChild(planeSel);
  const TOOLS = [['select', '选择/移动 (V)'], ['obstacle', '放障碍物 (O)'], ['spawn', '出生点 (S)'], ['delete', '删除 (X)']];
  let tool = 'select';
  const toolBtns = {};
  for (const [key, label] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.mtool = key; b.textContent = label;
    b.addEventListener('click', () => setTool(key));
    toolBtns[key] = b; bar.appendChild(b);
  }
  const radiusIn = document.createElement('input');
  radiusIn.type = 'number'; radiusIn.min = '12'; radiusIn.max = '220'; radiusIn.style.width = '64px';
  radiusIn.title = '新障碍物半径 / 选中障碍物半径（实时生效）';
  radiusIn.value = 44;
  radiusIn.addEventListener('input', () => {
    const r = Math.max(12, Number(radiusIn.value) || 44);
    if (selId != null && list()[selId]) { list()[selId].r = r; mark(); }
    draw();
  });
  const radLbl = document.createElement('span'); radLbl.className = 'map-lbl'; radLbl.textContent = '半径';
  bar.appendChild(radLbl); bar.appendChild(radiusIn);
  const snapChk = document.createElement('label'); snapChk.className = 'map-lbl';
  snapChk.innerHTML = '<input type="checkbox" checked> 吸附';
  const snapSel = document.createElement('select');
  for (const g of [16, 32, 64, 128]) { const o2 = document.createElement('option'); o2.value = g; o2.textContent = `${g}px`; snapSel.appendChild(o2); }
  snapSel.style.width = '70px';
  let snapOn = true, snapGrid = 32;
  snapChk.querySelector('input').addEventListener('change', (e) => { snapOn = e.target.checked; draw(); });
  snapSel.addEventListener('change', () => { snapGrid = Number(snapSel.value); });
  bar.appendChild(snapChk); bar.appendChild(snapSel);
  const viewChk = document.createElement('label'); viewChk.className = 'map-lbl';
  viewChk.innerHTML = '<input type="checkbox" checked> 开局视野';
  viewChk.querySelector('input').addEventListener('change', (e) => { showViewport = e.target.checked; draw(); });
  let showViewport = true;
  bar.appendChild(viewChk);
  const fitBtn = document.createElement('button'); fitBtn.type = 'button'; fitBtn.textContent = '重置视图';
  fitBtn.addEventListener('click', () => { resetView(); draw(); });
  bar.appendChild(fitBtn);
  sec.appendChild(bar);

  // —— 画布与状态栏 ——
  const wrap = document.createElement('div'); wrap.className = 'map-wrap';
  const canvas = document.createElement('canvas'); canvas.id = 'mapCanvas';
  wrap.appendChild(canvas); sec.appendChild(wrap);
  const hint = document.createElement('div'); hint.className = 'map-status';
  hint.textContent = 'V 选择 · O 放障碍物(按住拖出半径) · S 出生点 · X 删除 · Del 移除选中 · 右键/空格+左键 平移 · 滚轮缩放';
  sec.appendChild(hint);

  // —— 障碍物精确列表（数值微调 + 删除）——
  const listBox = document.createElement('div'); listBox.className = 'map-list';
  sec.appendChild(listBox);
  root.appendChild(sec);

  let curPid = planeSel.value;
  let cam = { x: -480, y: -280 }, zoom = 0.8;
  let selId = null, hoverId = null;
  let drag = null, spaceDown = false;
  let cssW = 0, cssH = 0, sized = false;
  const rowInputs = [];

  const st = () => state.planes[curPid] ?? (state.planes[curPid] = { name: '新位面' });
  const list = () => { if (!Array.isArray(st().obstacles)) st().obstacles = []; return st().obstacles; };
  const R1 = (v) => Math.round(v * 10) / 10;
  const sn = (v) => (snapOn ? Math.round(v / snapGrid) * snapGrid : v);
  const snapW = (w) => ({ x: sn(w.x), y: sn(w.y) });
  const effSpawn = () => {
    const sp = st().spawn;
    const x = Number(sp?.x), y = Number(sp?.y);
    return Number.isFinite(x) && sp.x !== '' ? { x, y } : { x: VIEW_W / 2, y: VIEW_H / 2 };
  };
  const w2s = (wx, wy) => ({ x: (wx - cam.x) * zoom, y: (wy - cam.y) * zoom });
  const s2w = (sx, sy) => ({ x: cam.x + sx / zoom, y: cam.y + sy / zoom });

  function setTool(key) {
    tool = key;
    for (const [k, b] of Object.entries(toolBtns)) b.classList.toggle('active', k === key);
    canvas.style.cursor = key === 'select' ? 'default' : 'crosshair';
    draw();
  }
  function resetView() {
    zoom = 0.8;
    const sp = effSpawn();
    cam = { x: sp.x - (cssW || 828) / (2 * zoom), y: sp.y - (cssH || 500) / (2 * zoom) };
  }
  function syncSize() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    const dpr = window.devicePixelRatio || 1;
    cssW = Math.round(r.width); cssH = Math.round(r.height);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    canvas._dpr = dpr;
    return true;
  }
  function hitTest(w) {
    const arr = list();
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      const tol = Math.max(o.r, 10 / zoom);
      if (Math.hypot(w.x - o.x, w.y - o.y) <= tol) return i;
    }
    return null;
  }
  function overlapWarn() {
    const sp = effSpawn(), arr = list();
    return arr.findIndex((o) => Math.hypot(o.x - sp.x, o.y - sp.y) < o.r + PLAYER_R);
  }

  function draw() {
    if (!cssW && !syncSize()) return;
    const dpr = canvas._dpr || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#10151b'; ctx.fillRect(0, 0, cssW, cssH);

    // 地砖网格（对齐游戏 TILE=256；棋盘淡填充呼应镜像拼贴）
    const tpx = TILE * zoom;
    const gx0 = Math.floor(cam.x / TILE) * TILE, gy0 = Math.floor(cam.y / TILE) * TILE;
    for (let wy = gy0; ; wy += TILE) {
      const sy = (wy - cam.y) * zoom; if (sy > cssH) break; if (sy + tpx < 0) continue;
      for (let wx = gx0; ; wx += TILE) {
        const sx = (wx - cam.x) * zoom; if (sx > cssW) break; if (sx + tpx < 0) continue;
        const odd = ((wx / TILE) & 1) !== ((wy / TILE) & 1);
        if (odd) { ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(sx, sy, tpx, tpx); }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let wx = gx0; ; wx += TILE) { const sx = (wx - cam.x) * zoom; if (sx > cssW) break; if (sx >= -tpx) { ctx.moveTo(sx, 0); ctx.lineTo(sx, cssH); } }
    for (let wy = gy0; ; wy += TILE) { const sy = (wy - cam.y) * zoom; if (sy > cssH) break; if (sy >= -tpx) { ctx.moveTo(0, sy); ctx.lineTo(cssW, sy); } }
    ctx.stroke();

    // 开局视野参考框：以有效出生点为中心的 960×560（相机初始即玩家所在）
    const sp = effSpawn();
    if (showViewport) {
      const p0 = w2s(sp.x - VIEW_W / 2, sp.y - VIEW_H / 2);
      ctx.strokeStyle = 'rgba(232,196,106,0.30)'; ctx.setLineDash([7, 5]); ctx.lineWidth = 1.5;
      ctx.strokeRect(p0.x, p0.y, VIEW_W * zoom, VIEW_H * zoom);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(232,196,106,0.45)'; ctx.font = '11px system-ui';
      ctx.fillText('开局视野 960×560', p0.x + 6, p0.y + 14);
    }

    // 障碍物：配色/描边与 renderer.js 一致；悬停/选中高亮
    const arr = list();
    arr.forEach((o, i) => {
      const c = w2s(o.x, o.y), rpx = Math.max(2, o.r * zoom);
      ctx.fillStyle = 'rgba(8,12,16,0.82)';
      ctx.beginPath(); ctx.arc(c.x, c.y, rpx, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = i === selId ? '#8fe8cb' : i === hoverId ? 'rgba(143,232,203,0.75)' : 'rgba(143,232,203,0.35)';
      ctx.lineWidth = i === selId ? 2.5 : 2;
      ctx.stroke();
      if (i === selId) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(143,232,203,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x, c.y, rpx + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = '#8fe8cb';
        ctx.beginPath(); ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y); ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(216,221,226,0.6)'; ctx.font = '10px system-ui';
      ctx.fillText(`#${i} r${o.r}`, c.x - 16, c.y - rpx - 5);
    });

    // 出生点：金环 r28 + 圆心（同 renderer.js）
    const sc = w2s(sp.x, sp.y);
    ctx.strokeStyle = 'rgba(232,196,106,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sc.x, sc.y, 28 * zoom, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8c46a';
    ctx.beginPath(); ctx.arc(sc.x, sc.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(232,196,106,0.8)'; ctx.font = '11px system-ui';
    ctx.fillText('出生点', sc.x + 31 * zoom, sc.y - 31 * zoom);

    // 正在拖放的预览圈
    if (drag?.mode === 'place') {
      const p0 = w2s(drag.start.x, drag.start.y);
      const rr = Math.max(12, Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y)) * zoom;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#8fe8cb'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p0.x, p0.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    // 出生点被障碍物压住：红圈警示（core 会把玩家推出去，出生即位移）
    const ow = overlapWarn();
    if (ow >= 0) {
      const c = w2s(arr[ow].x, arr[ow].y);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#e0653c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, arr[ow].r * zoom + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e0653c'; ctx.font = 'bold 11px system-ui';
      ctx.fillText(`⚠ 障碍物 #${ow} 压住出生点`, 10, cssH - 10);
    }
    hint.textContent = `x ${R1(cam.x + cssW / (2 * zoom))} · y ${R1(cam.y + cssH / (2 * zoom))}　|　缩放 ${Math.round(zoom * 100)}%　|　障碍 ${arr.length} 个${ow >= 0 ? '　⚠ 出生点被压' : ''}`;
  }

  // —— 障碍物列表：每行 x/y/r 数字框 + 删除 ——
  function syncList() {
    listBox.innerHTML = '';
    rowInputs.length = 0;
    const arr = list();
    if (!arr.length) { listBox.innerHTML = '<div class="map-empty">暂无障碍物——选「放障碍物 (O)」在画布上按住拖出一个圆。</div>'; return; }
    arr.forEach((o, i) => {
      const row = document.createElement('div'); row.className = 'map-obs-row';
      const tag = document.createElement('span'); tag.textContent = `#${i}`; tag.className = 'map-id';
      row.appendChild(tag);
      const mk = (key, val, min) => {
        const inp = document.createElement('input'); inp.type = 'number'; inp.value = val; inp.step = '8';
        if (min != null) inp.min = String(min);
        inp.addEventListener('input', () => {
          o[key] = key === 'r' ? Math.max(12, Number(inp.value) || 12) : Number(inp.value) || 0;
          mark(); draw();
        });
        row.appendChild(inp); return inp;
      };
      const ix = mk('x', o.x), iy = mk('y', o.y), ir = mk('r', o.r, 12);
      rowInputs.push({ x: ix, y: iy, r: ir });
      const del = document.createElement('button'); del.type = 'button'; del.textContent = '删除';
      del.addEventListener('click', () => removeObstacle(i));
      row.appendChild(del);
      row.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { selId = i; draw(); } });
      listBox.appendChild(row);
    });
  }
  function pushObstacle(ob) { list().push(ob); selId = list().length - 1; mark(); syncList(); }
  function removeObstacle(i) {
    list().splice(i, 1);
    if (selId === i) selId = null; else if (selId > i) selId--;
    mark(); syncList();
  }
  function setSpawn(w) { st().spawn = { x: R1(sn(w.x)), y: R1(sn(w.y)) }; mark(); }

  // —— 鼠标交互 ——
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const s = { x: e.offsetX, y: e.offsetY }, w = s2w(s.x, s.y);
    if (e.button === 1 || e.button === 2 || spaceDown) { drag = { mode: 'pan', last: s }; canvas.style.cursor = 'grabbing'; return; }
    if (tool === 'obstacle') drag = { mode: 'place', start: snapW(w), cur: snapW(w) };
    else if (tool === 'select') {
      const id = hitTest(w);
      if (id != null) { selId = id; const ob = list()[id]; drag = { mode: 'move', id, dx: ob.x - w.x, dy: ob.y - w.y }; }
      else { selId = null; drag = { mode: 'pan', last: s }; }
    } else if (tool === 'spawn') { setSpawn(w); drag = { mode: 'spawn' }; }
    else if (tool === 'delete') { const id = hitTest(w); if (id != null) removeObstacle(id); }
    draw();
  });
  canvas.addEventListener('mousemove', (e) => {
    const s = { x: e.offsetX, y: e.offsetY }, w = s2w(s.x, s.y);
    if (!drag) { const h = hitTest(w); if (h !== hoverId) { hoverId = h; draw(); } return; }
    if (drag.mode === 'pan') { cam.x -= (s.x - drag.last.x) / zoom; cam.y -= (s.y - drag.last.y) / zoom; drag.last = s; }
    else if (drag.mode === 'place') { drag.cur = snapW(w); }
    else if (drag.mode === 'move') {
      const ob = list()[drag.id];
      ob.x = R1(sn(w.x + drag.dx)); ob.y = R1(sn(w.y + drag.dy));
      const ri = rowInputs[drag.id]; if (ri) { ri.x.value = ob.x; ri.y.value = ob.y; }
      mark();
    }
    else if (drag.mode === 'spawn') setSpawn(w);
    draw();
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    const wasPlace = drag.mode === 'place', wasMove = drag.mode === 'move', wasSpawn = drag.mode === 'spawn';
    if (wasPlace) {
      const r = Math.max(12, Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y));
      pushObstacle({ x: R1(drag.start.x), y: R1(drag.start.y), r: R1(Math.min(r, 220)) });
      radiusIn.value = Math.min(r, 220);
    }
    drag = null;
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    if (wasPlace || wasMove || wasSpawn) syncList();
    draw();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0012);
    const nz = Math.min(3, Math.max(0.25, zoom * f));
    const s = { x: e.offsetX, y: e.offsetY }, before = s2w(s.x, s.y);
    zoom = nz;
    const after = s2w(s.x, s.y);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
    draw();
  }, { passive: false });
  canvas.addEventListener('mouseleave', () => { if (!drag && hoverId != null) { hoverId = null; draw(); } });
  canvas.addEventListener('dblclick', (e) => {
    if (tool !== 'select') return;
    const id = hitTest(s2w(e.offsetX, e.offsetY));
    if (id != null && rowInputs[id]) { selId = id; rowInputs[id].r.focus(); rowInputs[id].r.select(); draw(); }
  });

  // —— 键盘快捷键（仅本标签可见且非输入态时响应）——
  const keyHandler = (e) => {
    if (root.closest('body') && root.parentElement?.style.display === 'none') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space') { if (!spaceDown) { spaceDown = true; if (tool === 'select') canvas.style.cursor = 'grab'; } e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    else if (k === 'o') setTool('obstacle');
    else if (k === 's') setTool('spawn');
    else if (k === 'x') setTool('delete');
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selId != null) removeObstacle(selId);
    else if (e.key === 'Escape') { selId = null; draw(); }
  };
  const keyUp = (e) => { if (e.code === 'Space') { spaceDown = false; if (!drag) canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair'; } };
  document.addEventListener('keydown', keyHandler);
  document.addEventListener('keyup', keyUp);

  planeSel.addEventListener('change', () => {
    curPid = planeSel.value; selId = null; hoverId = null;
    resetView(); syncList(); draw();
  });
  new ResizeObserver(() => { const had = sized; if (syncSize()) { sized = true; if (!had) resetView(); draw(); } }).observe(wrap);

  setTool('select');
  syncList();
}

/**
 * 关卡·波次编辑（魔兽式）：每位面 5 阶段的 时长/刷怪率/涌潮表/收尾时点，
 * 外加 变体权重（怪物构成）与 词缀概率。留空 = 用全局默认。
 * 写入 plane.stagePlan / variantWeights / eliteAffixChance，经 overrides 深拷贝进运行时。
 */
function buildStagePlan(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>关卡 · 波次与时间轴（留空 = 全局默认；涌潮格式 at秒:数量，逗号分隔）</h2>';
  const extraIds = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
  for (const pid of [...planes.map((p) => p.id), ...extraIds]) {
    const st = state.planes[pid];
    if (!st.stagePlan) st.stagePlan = [];
    const b = box(`${pid} · ${st.name}`);
    for (let i = 0; i < 5; i++) {
      if (!st.stagePlan[i]) st.stagePlan[i] = {};
      const def = st.stagePlan[i];
      const row = document.createElement('div');
      row.className = 'af-row';
      const mkNum = (label, key, ph) => {
        const lbl = document.createElement('span'); lbl.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.placeholder = ph;
        inp.value = def[key] ?? '';
        inp.addEventListener('input', (e) => {
          const n = Number(e.target.value);
          if (e.target.value === '' || !Number.isFinite(n)) delete def[key];
          else def[key] = n;
          mark();
        });
        inp.style.flex = '1';
        row.appendChild(lbl); row.appendChild(inp);
      };
      mkNum(`S${i + 1}时长(s)`, 'duration', `默认${STAGE_SECONDS[i]}`);
      mkNum('常规小怪数', 'minionCount', '不填=按速率');
      mkNum('收尾单位数', 'closerCount', '默认1');
      mkNum('刷怪率%', 'ratePct', '100');
      mkNum('收尾(s)≥30', 'closerAt', '默认');
      b.appendChild(row);
      b.appendChild(field(
        `S${i + 1}涌潮`,
        (def.surges ?? []).map((s) => `${s.atSec}:${s.count}`).join(','),
        (v) => {
          const list = v.split(',').map((seg) => {
            const [a, c] = seg.trim().split(':').map(Number);
            return { atSec: a, count: c };
          }).filter((s) => Number.isFinite(s.atSec) && s.count > 0);
          if (list.length) def.surges = list;
          else delete def.surges;
          mark();
        },
        '例：30:18,60:26',
      ));
    }
    if (!st.variantWeights) st.variantWeights = {};
    b.appendChild(jsonField('变体权重（walker/charger/tank/spitter/bomber）', st.variantWeights, (v) => { st.variantWeights = v; }));
    b.appendChild(jsonField('指定小怪行为（sprite名 → walker/charger/tank/spitter/bomber）', st.minionVariants ?? {}, (v) => { st.minionVariants = v; }));
    b.appendChild(numField('词缀概率 0~1（可省）', st.eliteAffixChance ?? '', (v) => {
      if (v > 0 && v <= 1) st.eliteAffixChance = v;
      else delete st.eliteAffixChance;
      mark();
    }));
    b.appendChild(field('词缀池（逗号 id，留空=全部）', (st.eliteAffixPool ?? []).join(','), (v) => {
      const list = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) st.eliteAffixPool = list;
      else delete st.eliteAffixPool;
      mark();
    }));
    b.appendChild(numField('词缀条数 1~3（技能组合）', st.eliteAffixCount ?? '', (v) => {
      if (v >= 2) st.eliteAffixCount = Math.min(3, Math.round(v));
      else delete st.eliteAffixCount;
      mark();
    }));
    // —— 数值覆盖（手动配数）：百分比乘区，留空 = 不干预；写入 plane.statMods ——
    if (!st.statMods || typeof st.statMods !== 'object') st.statMods = {};
    const smDef = [
      ['minionHpPct', '小怪HP%'], ['minionAtkPct', '小怪攻击%'],
      ['eliteHpPct', '精英HP%'], ['eliteAtkPct', '精英攻击%'],
      ['bossHpPct', '之主HP%'], ['bossAtkPct', '之主攻击%'],
      ['enemySpeedPct', '全体移速%'],
    ];
    const smRow = document.createElement('div');
    smRow.className = 'af-row'; smRow.style.flexWrap = 'wrap';
    for (const [key, label] of smDef) {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.placeholder = label; inp.title = label + '（正增强/负减弱，留空不干预）';
      inp.style.cssText = 'flex:1;min-width:86px;background:#141a20;color:#e8ecf0;border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:4px 6px;font-size:12px';
      inp.value = st.statMods[key] ?? '';
      inp.addEventListener('input', () => {
        const n = Number(inp.value);
        if (inp.value === '' || !Number.isFinite(n)) delete st.statMods[key];
        else st.statMods[key] = Math.max(-90, Math.min(500, n));
        if (!Object.keys(st.statMods).length) delete st.statMods;
        mark();
      });
      smRow.appendChild(inp);
    }
    b.appendChild(smRow);
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildEnemies(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>敌人 · 形象绑定（5 阶段小怪 / Boss / 远程集）。缩略图红框 = 引用的贴图不存在</h2>';
  const extraIds = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
  for (const pid of [...planes.map((p) => p.id), ...extraIds]) {
    const title = state.planes[pid]?.name ?? pid;
    const b = box(`${pid} · ${title}${state.planes[pid]?._new ? '（新增）' : ''}`);
    const pairs = state.stageSprites[pid];
    if (pairs) {
      pairs.forEach((pair, i) => {
        const row = document.createElement('div');
        row.className = 'af-row';
        const a = document.createElement('input');
        a.setAttribute('list', 'dl-units');
        a.value = pair[0];
        const c = document.createElement('input');
        c.setAttribute('list', 'dl-units');
        c.value = pair[1];
        const pa = spritePreview(() => pair[0]);
        const pc = spritePreview(() => pair[1]);
        a.addEventListener('input', (e) => { pair[0] = e.target.value; mark(); pa.updateSprite(); });
        c.addEventListener('input', (e) => { pair[1] = e.target.value; mark(); pc.updateSprite(); });
        const lbl = document.createElement('span'); lbl.textContent = `阶段${i + 1}:`;
        row.appendChild(lbl); row.appendChild(a); row.appendChild(pa); row.appendChild(c); row.appendChild(pc);
        b.appendChild(row);
      });
    }
    const br = document.createElement('div');
    br.className = 'af-row';
    const bs = document.createElement('input'); bs.setAttribute('list', 'dl-units'); bs.value = state.bossSprites[pid] ?? '';
    const bp = spritePreview(() => state.bossSprites[pid]);
    bs.addEventListener('input', (e) => { state.bossSprites[pid] = e.target.value; mark(); bp.updateSprite(); });
    const bl = document.createElement('span'); bl.textContent = 'Boss:';
    br.appendChild(bl); br.appendChild(bs); br.appendChild(bp);
    b.appendChild(br);
    // 派生美术切面（planeModules.art 约定路径）：地砖 / 背景 / 首路线皮肤——缺图红框
    {
      const src = planes.find((x) => x.id === pid);
      const codex2 = String(src?.codex ?? (state.planes[pid]?.codex ?? 0)).padStart(2, '0');
      const arts = [
        ['地砖', `backgrounds/floor_${pid}.png`],
        ['背景', `backgrounds/plane_${codex2}_${pid}.png`],
        ...((state.planes[pid]?.routes ?? []).slice(0, 1).map((r) => ['皮肤', `units/player_${r}.png`])),
      ];
      const ar = document.createElement('div');
      ar.className = 'af-row';
      for (const [label, rel] of arts) {
        const lbl = document.createElement('span'); lbl.textContent = label;
        const img = document.createElement('img');
        img.className = 'sprite-prev'; img.width = 44; img.height = 44;
        img.src = `../shizu-cocos/assets/art/${rel}`;
        img.addEventListener('error', () => { img.classList.add('missing'); img.title = `缺图：${rel}`; });
        img.addEventListener('load', () => { img.title = `✓ ${rel}`; });
        ar.appendChild(lbl); ar.appendChild(img);
      }
      b.appendChild(ar);
    }
    sec.appendChild(b);
  }
  // 远程集
  const rb = box('远程小怪 sprite 集（追加项）');
  const extra = document.createElement('input');
  extra.placeholder = '逗号分隔的 sprite 名，如：anqi,gongshou';
  rb.appendChild(extra);
  rb.appendChild((() => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '添加这些到远程集';
    btn.addEventListener('click', () => {
      state.rangedExtra = (state.rangedExtra ?? []).concat(extra.value.split(',').map((s) => s.trim()).filter(Boolean));
      extra.value = ''; mark();
    });
    return btn;
  })());
  if (state.rangedExtra?.length) {
    const d = document.createElement('div');
    d.className = 'small-hint';
    d.textContent = `已新增：${state.rangedExtra.join(', ')}`;
    rb.appendChild(d);
  }
  sec.appendChild(rb);
  root.appendChild(sec);
}

function buildSkills(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>技能 · 基因锁（10 路线 × 6 段）</h2>';
  addBtn(sec, 'skills', () => {
    state.skills.push({ id: `skill_${nn()}`, route: 'xiake', lv: 1, kind: 'passive', name: '新技能', desc: '', val: '', cd: '', eff: {} });
  });
  const byRoute = {};
  for (const s of state.skills) { (byRoute[s.route] ??= []).push(s); }
  for (const route of Object.keys(byRoute)) {
    const sec2 = document.createElement('details');
    sec2.className = 'cfg-details';
    sec2.innerHTML = `<summary>${esc(ROUTES[route]?.name ?? route)} · ${byRoute[route].length} 段</summary>`;
    for (const s of byRoute[route]) {
      const b = box(`${s.id} · Lv${s.lv} · ${s.kind}`);
      b.appendChild(field('名称', s.name, (v) => { s.name = v; mark(); }));
      b.appendChild(textarea('描述', s.desc, (v) => { s.desc = v; mark(); }));
      b.appendChild(field('数值文案', s.val, (v) => { s.val = v; mark(); }));
      b.appendChild(numField('CD(s)', s.cd, (v) => { s.cd = v; mark(); }));
      b.appendChild(jsonField('效果 eff', s.eff, (v) => { s.eff = v; }));
      b.appendChild(jsonField('视觉 visual（icon/fxKind/color/projectile）', s.visual ?? {}, (v) => { s.visual = v; }));
      sec2.appendChild(b);
    }
    sec.appendChild(sec2);
  }
  root.appendChild(sec);
}

function buildHiddenSkills(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>隐藏技能 · 禁忌（10 路线各 1）</h2>';
  for (const h of ALL_HIDDEN_SKILLS) {
    const st = state.hiddenSkills[h.id];
    const b = box(`${h.id} · ${st.name}`);
    b.appendChild(field('名称', st.name, (v) => { st.name = v; mark(); }));
    b.appendChild(textarea('描述', st.desc, (v) => { st.desc = v; mark(); }));
    b.appendChild(field('路线', st.route, (v) => { st.route = v; mark(); }));
    b.appendChild(field('类型(kind)', st.kind, (v) => { st.kind = v; mark(); }));
    b.appendChild(field('CD', st.cd, (v) => { st.cd = v; mark(); }));
    b.appendChild(field('槽位偏好', st.slotPrefer, (v) => { st.slotPrefer = v; mark(); }));
    b.appendChild(jsonField('效果 eff（被动型开局装载）', st.eff, (v) => { st.eff = v; }));
    b.appendChild(jsonField('视觉 visual（icon/fxKind/color/projectile）', st.visual ?? {}, (v) => { st.visual = v; }));
    {
      const note = document.createElement('div');
      note.className = 'small-hint';
      note.textContent = '✓ 被动型刻印的效果已由 core 开局装载；主动型走 castSkill CD 循环';
      b.appendChild(note);
    }
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildRoutes(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>进化路线 · 组合技</h2>';
  for (const r of ALL_ROUTES) {
    const st = state.routes[r];
    const b = box(`${r} · ${ROUTES[r].name}`);
    b.appendChild(field('名称', st.name, (v) => { st.name = v; mark(); }));
    b.appendChild(field('定位', st.role, (v) => { st.role = v; mark(); }));
    b.appendChild(field('皮肤', st.skin, (v) => { st.skin = v; mark(); }));
    sec.appendChild(b);
  }
  const cb = box('组合技');
  for (const c of state.combos) {
    cb.appendChild(field(`${c.id} · 名`, c.name, (v) => { c.name = v; mark(); }));
    cb.appendChild(field(`${c.id} · 效果`, c.desc, (v) => { c.desc = v; mark(); }));
  }
  addBtn(cb, 'routes', () => {
    const cid = `combo_${nn()}`;
    state.combos.push({ id: cid, name: '新组合技', desc: '', routes: ['xiake', 'shanhai'] });
  });
  sec.appendChild(cb);
  root.appendChild(sec);
}

function buildSynergies(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>构筑共鸣</h2>';
  addBtn(sec, 'synergies', () => {
    state.synergies.push({ id: `syn_${nn()}`, name: '新共鸣', desc: '', need: ['attr_atk', 'attr_crit'], eff: {} });
  });
  for (const s of state.synergies) {
    const b = box(s.id);
    b.appendChild(field('名称', s.name, (v) => { s.name = v; mark(); }));
    b.appendChild(textarea('描述', s.desc, (v) => { s.desc = v; mark(); }));
    b.appendChild(jsonField('效果 eff', s.eff, (v) => { s.eff = v; }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildAchievements(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>成就 · 里程碑</h2>';
  for (const a of state.achievements) {
    const b = box(a.id);
    b.appendChild(field('名称', a.name, (v) => { a.name = v; mark(); }));
    b.appendChild(field('描述', a.desc, (v) => { a.desc = v; mark(); }));
    b.appendChild(field('奖励文案', a.reward, (v) => { a.reward = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildRelics(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>传承 · 残影</h2>';
  for (const [rid, r] of Object.entries(state.relics)) {
    const b = box(rid);
    b.appendChild(field('名称', r.name, (v) => { r.name = v; mark(); }));
    b.appendChild(textarea('故事', r.story, (v) => { r.story = v; mark(); }));
    b.appendChild(jsonField('效果 eff（稀有残响自动 ×2）', r.eff, (v) => { r.eff = v; }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildCrises(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>危机事件</h2>';
  addBtn(sec, 'crises', () => {
    state.crises.push({ id: `crisis_${nn()}`, name: '新危机', desc: '', warn: '⚠ 危机来袭！', duration: 8 });
  });
  for (const c of state.crises) {
    const b = box(c.id);
    b.appendChild(field('名称', c.name, (v) => { c.name = v; mark(); }));
    b.appendChild(textarea('描述', c.desc, (v) => { c.desc = v; mark(); }));
    b.appendChild(textarea('预警文案', c.warn, (v) => { c.warn = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildEliteAffixes(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>精英词缀</h2>';
  addBtn(sec, 'elite', () => {
    state.eliteAffixes.push({ id: `affix_${nn()}`, name: '新词缀', desc: '', color: '#9ac97f', eff: {} });
  });
  for (const a of state.eliteAffixes) {
    const b = box(a.id);
    b.appendChild(field('名称', a.name, (v) => { a.name = v; mark(); }));
    b.appendChild(field('颜色', a.color, (v) => { a.color = v; mark(); }));
    b.appendChild(textarea('描述', a.desc, (v) => { a.desc = v; mark(); }));
    b.appendChild(jsonField('效果 eff', a.eff, (v) => { a.eff = v; }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildAttrPool(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>通用属性池（三选一属性通道）</h2>';
  addBtn(sec, 'attr', () => {
    state.attrPool.push({ id: `attr_${nn()}`, kind: 'attr', rarity: 'feature', weight: 10, name: '新属性', desc: '', eff: {} });
  });
  for (const a of state.attrPool) {
    const b = box(`${a.id} · ${a.rarity} · 权重 ${a.weight ?? '默认'}`);
    b.appendChild(field('名称', a.name, (v) => { a.name = v; mark(); }));
      b.appendChild(textarea('描述', a.desc, (v) => { a.desc = v; mark(); }));
      b.appendChild(jsonField('效果 eff', a.eff, (v) => { a.eff = v; }));
      b.appendChild(field('稀有度', a.rarity, (v) => { a.rarity = v; mark(); }));
      b.appendChild(numField('权重', a.weight, (v) => { a.weight = v; mark(); }));
      sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildNestUpgrades(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>虫巢强化（局外永久升级）</h2>';
  for (const u of state.nestUpgrades) {
    const b = box(u.id);
    b.appendChild(field('名称', u.name, (v) => { u.name = v; mark(); }));
      b.appendChild(textarea('描述', u.desc, (v) => { u.desc = v; mark(); }));
    b.appendChild(jsonField('效果 eff（每级叠加）', u.eff, (v) => { u.eff = v; }));
    b.appendChild(numField('上限', u.max, (v) => { u.max = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

function buildMechUpgrades(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>机械强化（三选一构筑选项）</h2>';
  const byMech = {};
  for (const m of state.mechUpgrades) {
    const src = Object.values(MECH_UPGRADES).find((arr) => arr.some((x) => x.id === m.id));
    const key = Object.keys(MECH_UPGRADES).find((k) => MECH_UPGRADES[k] === src) ?? '?';
    (byMech[key] ??= []).push(m);
  }
  for (const [k, arr] of Object.entries(byMech)) {
    const d = document.createElement('details');
    d.className = 'cfg-details';
    d.innerHTML = `<summary>${esc(k)} · ${arr.length}</summary>`;
    for (const m of arr) {
      const b = box(m.id);
      b.appendChild(field('名称', m.name, (v) => { m.name = v; mark(); }));
      b.appendChild(textarea('描述', m.desc, (v) => { m.desc = v; mark(); }));
      b.appendChild(jsonField('效果 eff', m.eff, (v) => { m.eff = v; }));
      d.appendChild(b);
    }
    sec.appendChild(d);
  }
  root.appendChild(sec);
}

function buildWeaponAttack(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>攻击方式 · 武器表现（路线 → 弹体/颜色/攻击形态）</h2>';
  for (const [rid, w] of Object.entries(state.weaponAttack)) {
    const b = box(rid === '__default' ? '默认（巢灵本体）' : `路线 ${rid}`);
    b.appendChild(field('弹体', w.projectile, (v) => { w.projectile = v; mark(); }));
    b.appendChild(field('颜色', w.color, (v) => { w.color = v; mark(); }));
    b.appendChild(field('攻击形态', w.pattern, (v) => { w.pattern = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

// ——— 变异 / 黑市 / 支线（沿用老后台，挪进自己的标签）———
function buildRiftMods(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>裂缝变异</h2>';
  addBtn(sec, 'rift', () => {
    state.riftMods.push({ id: `mod_${nn()}`, name: '新变异', desc: '', risk: 2 });
  });
  for (const m of state.riftMods) {
    const b = box(m.id);
    b.appendChild(field('名称', m.name, (v) => { m.name = v; mark(); }));
    b.appendChild(field('描述', m.desc, (v) => { m.desc = v; mark(); }));
    b.appendChild(numField('风险', m.risk, (v) => { m.risk = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}
function buildShop(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>黑市商品</h2>';
  for (const s of state.shopItems) {
    const b = box(s.id);
    b.appendChild(field('名称', s.name, (v) => { s.name = v; mark(); }));
    b.appendChild(field('效果文本', s.desc, (v) => { s.desc = v; mark(); }));
    b.appendChild(numField('价格（基因）', s.price, (v) => { s.price = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}
function buildSideQuests(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>支线协议</h2>';
  for (const q of state.sideQuests) {
    const b = box(q.id);
    b.appendChild(field('名称', q.name, (v) => { q.name = v; mark(); }));
    b.appendChild(field('目标描述', q.desc, (v) => { q.desc = v; mark(); }));
    b.appendChild(numField('奖励基因', q.reward, (v) => { q.reward = v; mark(); }));
    sec.appendChild(b);
  }
  root.appendChild(sec);
}

// ——— 导出 ——
function buildOutput() {
  const out = {};
  // 为新增位面解析真实 codex（现役最大值递增），让文件侧拿到与运行时一致的编号
  let cx = planes.reduce((m, p) => Math.max(m, Number(p.codex) || 0), 0);
  for (const st of Object.values(state.planes)) {
    if (st._new && !(Number(st.codex) >= 1)) st.codex = ++cx;
  }
  out.planes = state.planes;
  out.mechanics = state.mechanics;
  out.stageSprites = state.stageSprites;
  out.bossSprites = state.bossSprites;
  if (state.rangedExtra?.length) out.rangedSprites = state.rangedExtra;
  out.skills = state.skills;
  out.hiddenSkills = state.hiddenSkills;
  out.routes = state.routes;
  out.combos = state.combos;
  out.synergies = state.synergies;
  out.achievements = state.achievements;
  out.relics = state.relics;
  out.crises = state.crises;
  out.eliteAffixes = state.eliteAffixes;
  out.attrPool = state.attrPool;
  out.nestUpgrades = state.nestUpgrades;
  out.mechUpgrades = state.mechUpgrades;
  out.weaponAttack = state.weaponAttack;
  out.riftMods = state.riftMods;
  out.shopItems = state.shopItems;
  out.sideQuests = state.sideQuests;
  return out;
}

let dirty = false;
function mark() {
  dirty = true;
  document.querySelector('#saveBar .hint').textContent = '● 有未应用的修改';
  document.querySelector('#applyBtn').disabled = false;
}

/** schema 驱动的通用维度编辑页：字段渲染按类型分发，新增走 schemaNewEntry 骨架 */
function buildGenericPane(entry) {
  return (root) => {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${esc(entry.label)} · 通用编辑器${entry.restricted ? '（仅白名单字段）' : ''}</h2>`;
    if (!state[entry.key]) state[entry.key] = entry.kind === 'map' ? {} : [];
    const coll = state[entry.key];
    const canAdd = !entry.restricted && !entry.noAdd && (entry.kind === 'list' || entry.prefix);
    if (canAdd) addBtn(sec, `gen_${entry.key}`, () => {
      const e2 = schemaNewEntry(entry, nn);
      if (entry.kind === 'map') coll[e2.id] = e2;
      else coll.push(e2);
    });
    const renderOne = (item) => {
      const b = box(item.id ?? '(未命名)');
      for (const f of entry.fields ?? []) {
        if (f.type === 'json') b.appendChild(jsonField(f.label ?? f.key, item[f.key] ?? {}, (v) => { item[f.key] = v; }));
        else if (f.type === 'num') b.appendChild(numField(f.label ?? f.key, item[f.key] ?? '', (v) => { item[f.key] = v; mark(); }));
        else b.appendChild(field(f.label ?? f.key, item[f.key] ?? '', (v) => { item[f.key] = v; mark(); }));
      }
      sec.appendChild(b);
    };
    if (Array.isArray(coll)) for (const item of coll) renderOne(item);
    else for (const item of Object.values(coll)) renderOne(item);
    root.appendChild(sec);
  };
}

function init() {
  const app = document.querySelector('#app');
  const tabs = document.createElement('nav');
  tabs.className = 'admin-tabs';
  const defs = [
    ['planes', '位面', buildPlanes],
    ['world', '位面工程', (root) => buildWorldEditor(root, { state, planes, mark, getArt: () => ART, applyNow: () => { try { localStorage.setItem(KEY, JSON.stringify(buildOutput())); } catch {} } })],
    ['map', '地图地形', buildMapEditor],
    ['assets', '资产库', buildAssets],
    ['stages', '关卡·波次', buildStagePlan],
    ['enemies', '敌人·Boss', buildEnemies],
    ['skills', '技能', buildSkills],
    ['hidden', '隐藏技', buildHiddenSkills],
    ['routes', '路线·组合', buildRoutes],
    ['synergies', '共鸣', buildSynergies],
    ['achievements', '成就', buildAchievements],
    ['relics', '传承', buildRelics],
    ['crises', '危机', buildCrises],
    ['elite', '词缀', buildEliteAffixes],
    ['attr', '属性池', buildAttrPool],
    ['nest', '虫巢', buildNestUpgrades],
    ['mech', '机械', buildMechUpgrades],
    ['weapon', '攻击', buildWeaponAttack],
    ['rift', '变异', buildRiftMods],
    ['shop', '黑市', buildShop],
    ['quests', '支线', buildSideQuests],
  ];
  // —— 扩展性核心：schema 里声明了但还没有专属构建器的维度，自动获得通用编辑页 ——
  {
    const covered = new Set(defs.map((d) => d[0]));
    for (const entry of SCHEMA) {
      if (covered.has(entry.key)) continue;
      defs.push([`gen_${entry.key}`, `${entry.label}*`, buildGenericPane(entry)]);
    }
  }
  PANE_DEFS = defs;
  const panes = {};
  for (const [key, label, fn] of defs) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = label; btn.dataset.key = key;
    tabs.appendChild(btn);
    const pane = document.createElement('div');
    pane.className = 'admin-pane';
    pane.style.display = 'none';
    fn(pane);
    app.appendChild(pane);
    panes[key] = pane;
    PANES[key] = pane;
  }
  app.prepend(tabs);

  function showTab(key) {
    for (const [k, pane] of Object.entries(panes)) pane.style.display = k === key ? '' : 'none';
    for (const btn of tabs.children) btn.classList.toggle('active', btn.dataset.key === key);
  }
  tabs.addEventListener('click', (e) => { if (e.target.dataset.key) showTab(e.target.dataset.key); });

  const bar = document.querySelector('#saveBar');
  bar.querySelector('#applyBtn').addEventListener('click', () => {
    const out = buildOutput();
    localStorage.setItem(KEY, JSON.stringify(out));
    bar.querySelector('.hint').textContent = '✓ 已应用——刷新游戏页即见效果';
    document.querySelector('#applyBtn').disabled = true;
    dirty = false;
  });
  bar.querySelector('#clearBtn').addEventListener('click', () => {
    localStorage.removeItem(KEY);
    location.reload();
  });
  bar.querySelector('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(buildOutput(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plane-config.json';
    a.click();
  });
  // 保存到项目：经 serve 的受控端点写入 web/src/config/overrides.data.json（可提交进仓库）
  const saveProj = document.createElement('button');
  saveProj.id = 'saveProjectBtn';
  saveProj.textContent = '保存到项目';
  bar.insertBefore(saveProj, bar.querySelector('#exportBtn'));
  saveProj.addEventListener('click', async () => {
    const hint = bar.querySelector('.hint');
    try {
      const res = await fetch('src/config/overrides.data.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildOutput()),
      });
      hint.textContent = res.ok ? '✓ 已写入 web/src/config/overrides.data.json（可提交进仓库）' : `✗ 保存失败（HTTP ${res.status}）`;
    } catch (e) {
      hint.textContent = `✗ 保存失败：${e.message}`;
    }
  });

  // —— 地图分享码：完整配置 ↔ base64 字符串（复制即分发，粘贴即导入）——
  const bGen = document.createElement('button');
  bGen.id = 'shareExportBtn'; bGen.textContent = '生成分享码';
  const bImp = document.createElement('button');
  bImp.id = 'shareImportBtn'; bImp.textContent = '导入分享码';
  bar.insertBefore(bGen, bar.querySelector('#exportBtn'));
  bar.insertBefore(bImp, bar.querySelector('#exportBtn'));
  bGen.addEventListener('click', () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(buildOutput()))));
    navigator.clipboard?.writeText(code).catch(() => {});
    bar.querySelector('.hint').textContent = `✓ 分享码已生成并复制（${code.length} 字符）`;
  });
  bImp.addEventListener('click', () => {
    const code = (prompt('粘贴分享码：') ?? '').trim();
    if (!code) return;
    try {
      mergeIntoState(JSON.parse(decodeURIComponent(escape(atob(code)))));
      for (const def of PANE_DEFS) { PANES[def[0]].innerHTML = ''; def[2](PANES[def[0]]); }
      mark();
      bar.querySelector('.hint').textContent = '✓ 已导入编辑器——检查无误后点「应用修改」生效';
    } catch (e) {
      bar.querySelector('.hint').textContent = `✗ 导入失败：${e.message}`;
    }
  });

  showTab('planes');
}

document.addEventListener('DOMContentLoaded', init);