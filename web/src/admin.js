// ===== admin.js · 后台管理界面逻辑 =====
// 编辑 → localStorage 覆盖 → 刷新游戏页即生效。导出按钮生成可粘贴的持久化片段。

import { planes } from '../../../shizu-cocos/assets/scripts/data/planes.js';
import { PLANE_MECHANICS, MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE } from '../../../shizu-cocos/assets/scripts/data/planeModules.js';
import { RIFT_MODS } from '../../../shizu-cocos/assets/scripts/data/riftMods.js';
import { SHOP_ITEMS } from '../../../shizu-cocos/assets/scripts/data/shopItems.js';
import { SIDE_QUESTS } from '../../../shizu-cocos/assets/scripts/data/sideQuests.js';

const KEY = 'cfg_overrides_v1';
const loadOv = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}; } catch { return {}; } };
const saveOv = (o) => localStorage.setItem(KEY, JSON.stringify(o));
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

const state = { planes: {}, mechanics: {}, riftMods: [], shopItems: [], sideQuests: [] };
{
  const o = loadOv();
  for (const p of planes) {
    state.planes[p.id] = {
      name: p.name, theme: p.theme, boss: p.boss, bossDesc: p.bossDesc ?? '', poem: p.poem ?? '',
    };
  }
  for (const [pid, m] of Object.entries(PLANE_MECHANICS)) {
    state.mechanics[pid] = { type: m.type, interval: m.interval ?? 12 };
  }
  state.riftMods = RIFT_MODS.map((m) => ({ id: m.id, name: m.name, desc: m.desc }));
  state.shopItems = SHOP_ITEMS.map((s2) => ({ id: s2.id, name: s2.name, desc: s2.desc, price: s2.price }));
  state.sideQuests = SIDE_QUESTS.map((q) => ({ id: q.id, name: q.name, desc: q.desc, reward: q.reward }));
  // 已有覆盖合并进来
  for (const [pid, patch] of Object.entries(o.planes ?? {})) Object.assign(state.planes[pid] ?? {}, patch);
  for (const [pid, mech] of Object.entries(o.mechanics ?? {})) if (state.mechanics[pid]) Object.assign(state.mechanics[pid], mech);
}

function field(label, value, oninput, extra = '') {
  const wrap = document.createElement('label');
  wrap.className = 'af-field';
  wrap.innerHTML = `<span>${esc(label)}</span>`;
  const input = document.createElement('input');
  input.value = value; input.className = extra;
  input.addEventListener('input', () => oninput(input.value));
  wrap.appendChild(input);
  return wrap;
}
function numField(label, value, oninput) {
  const w = field(label, value, (v) => oninput(Number(v) || 0));
  return w;
}

function buildPlanes(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>位面 · 进入事件与叙事</h2>';
  for (const p of planes) {
    const st = state.planes[p.id];
    const box = document.createElement('div');
    box.className = 'cfg-block';
    box.innerHTML = `<h3>${esc(p.id)} · ${esc(p.name)}</h3>`;
    box.appendChild(field('主题', st.theme, (v) => { st.theme = v; mark(); }));
    box.appendChild(field('Boss 名', st.boss, (v) => { st.boss = v; mark(); }));
    box.appendChild(field('Boss 机制词', st.bossDesc, (v) => { st.bossDesc = v; mark(); }));
    box.appendChild(field('开场诗', st.poem, (v) => { st.poem = v; mark(); }));
    // 机制参数
    const mech = state.mechanics[p.id];
    if (mech) {
      const mrow = document.createElement('div');
      mrow.className = 'af-row';
      mrow.appendChild(numField(`机制间隔(s)`, mech.interval, (v) => { mech.interval = v; mark(); }));
      box.appendChild(mrow);
    }
    sec.appendChild(box);
  }
  root.appendChild(sec);
}

function buildRiftMods(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>裂缝变异</h2>';
  for (const m of state.riftMods) {
    const box = document.createElement('div');
    box.className = 'cfg-block';
    box.innerHTML = `<h3>${esc(m.id)}</h3>`;
    box.appendChild(field('名称', m.name, (v) => { m.name = v; mark(); }));
    box.appendChild(field('描述', m.desc, (v) => { m.desc = v; mark(); }));
    sec.appendChild(box);
  }
  root.appendChild(sec);
}

function buildShop(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>黑市商品</h2>';
  for (const s2 of state.shopItems) {
    const box = document.createElement('div');
    box.className = 'cfg-block';
    box.innerHTML = `<h3>${esc(s2.id)}</h3>`;
    box.appendChild(field('名称', s2.name, (v) => { s2.name = v; mark(); }));
    box.appendChild(field('效果文本', s2.desc, (v) => { s2.desc = v; mark(); }));
    box.appendChild(numField('价格（基因）', s2.price, (v) => { s2.price = v; mark(); }));
    sec.appendChild(box);
  }
  root.appendChild(sec);
}

function buildSideQuests(root) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>支线协议</h2>';
  for (const q of state.sideQuests) {
    const box = document.createElement('div');
    box.className = 'cfg-block';
    box.innerHTML = `<h3>${esc(q.id)}</h3>`;
    box.appendChild(field('名称', q.name, (v) => { q.name = v; mark(); }));
    box.appendChild(field('目标描述', q.desc, (v) => { q.desc = v; mark(); }));
    box.appendChild(numField('奖励基因', q.reward, (v) => { q.reward = v; mark(); }));
    sec.appendChild(box);
  }
  root.appendChild(sec);
}

let dirty = false;
function mark() {
  dirty = true;
  document.querySelector('#saveBar .hint').textContent = '● 有未应用的修改';
  document.querySelector('#applyBtn').disabled = false;
}

function init() {
  const app = document.querySelector('#app');
  buildPlanes(app);
  buildRiftMods(app);
  buildShop(app);
  buildSideQuests(app);

  const bar = document.querySelector('#saveBar');
  bar.querySelector('#applyBtn').addEventListener('click', () => {
    saveOv(state);
    bar.querySelector('.hint').textContent = '✓ 已应用——刷新游戏页即见效果';
    document.querySelector('#applyBtn').disabled = true;
  });
  bar.querySelector('#clearBtn').addEventListener('click', () => {
    localStorage.removeItem(KEY);
    location.reload();
  });
  bar.querySelector('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plane-config.json';
    a.click();
  });
}

document.addEventListener('DOMContentLoaded', init);
