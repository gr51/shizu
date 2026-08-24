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
  for (const p of planes) state.planes[p.id] = { name: p.name, theme: p.theme, boss: p.boss, bossDesc: p.bossDesc ?? '', poem: p.poem ?? '' };
  for (const pid of Object.keys(MINION_SPRITE_BY_STAGE)) state.stageSprites[pid] = MINION_SPRITE_BY_STAGE[pid].map((x) => [...x]);
  for (const [pid, name] of Object.entries(BOSS_BY_PLANE)) state.bossSprites[pid] = name;

  state.riftMods = RIFT_MODS.map((m) => ({ id: m.id, name: m.name, desc: m.desc, risk: m.risk }));
  state.shopItems = SHOP_ITEMS.map((s) => ({ id: s.id, name: s.name, desc: s.desc, price: s.price }));
  state.sideQuests = SIDE_QUESTS.map((q) => ({ id: q.id, name: q.name, desc: q.desc, reward: q.reward }));
  state.skills = skills.map((s) => ({ id: s.id, route: s.route, lv: s.lv, name: s.name, desc: s.desc, val: s.val ?? '', kind: s.kind, cd: s.cd ?? '', eff: { ...(s.eff ?? {}) } }));
  for (const h of ALL_HIDDEN_SKILLS) state.hiddenSkills[h.id] = { name: h.name, desc: h.desc, route: h.route, kind: h.kind, cd: h.cd ?? '', slotPrefer: h.slotPrefer ?? '', eff: { ...(h.eff ?? {}) } };
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
    const mech = state.mechanics[pid];
    if (mech) b.appendChild(numField('机制间隔(s)', mech.interval, (v) => { mech.interval = v; mark(); }));
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
    b.appendChild(jsonField(
      '触发器 [{on,stage?,every?,actions:[{type,count|pct|amount|duration}]}] —— 事件(13):PlaneEnter/FirstBlood/EliteKill/AmbushSpawn/BossKill/ChestOpen/StageClear/LowHp/TimeTick(every秒)/SurgeSpawn/ShopOpen/ChoiceOpen/Devour；动作(17):surge/heal/shield/genes/spawnElite/freeze/buffAtk/buffSpeed/buffCrit/buffCritDmg/buffLifesteal/buffDmgReduct/buffAoe/buffRange/buffAspd/buffSuck/buffRegen/buffDot/buffChain/buffGeneBonus/buffVsElite/buffKillHeal/buffDevourHeal/buffElemental/buffCounter/buffReflect/revive/freeReroll/freeBanish/essence/permAtk/permHp/permSpeed/permGenes',
      st.triggers ?? [],
      (v) => {
        if (Array.isArray(v) && v.length) st.triggers = v;
        else delete st.triggers;
      },
      true,
    ));
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
    b.appendChild(jsonField('变体权重（怪物构成，可省）', st.variantWeights, (v) => { st.variantWeights = v; }));
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
        a.value = pair[0];
        const c = document.createElement('input');
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
    const bs = document.createElement('input'); bs.value = state.bossSprites[pid] ?? '';
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