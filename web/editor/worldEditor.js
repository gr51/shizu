// ===== web/editor/worldEditor.js · 位面工程编辑器（World Editor 垂直切片）=====
// 目标不是再加一个数值表，而是把「地图对象实例」建模为可选、可摆放、可检查、可保存的工程数据。
// 对象类型：unit / boss / doodad / spawn / region / skillFx。
import { TRIGGER_EVENTS } from '../../shizu-cocos/assets/scripts/core/run.js';

const WORLD_W = 1920;
const WORLD_H = 1080;
const TYPES = {
  unit: '小怪实例',
  boss: 'Boss实例',
  doodad: '装饰物',
  spawn: '出生点',
  region: '区域触发器',
  skillFx: '技能特效点',
};
const VARIANTS = ['walker', 'charger', 'tank', 'spitter', 'bomber'];
const FX_KINDS = ['nuke', 'blast', 'summon', 'heal', 'invuln', 'berserk', 'form', 'generic'];

const n1 = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : fallback;
const escText = (v) => String(v ?? '');

function ensureEditor(st) {
  st.editor ??= {};
  st.editor.version ??= 1;
  st.editor.size ??= { w: WORLD_W, h: WORLD_H };
  st.editor.objects ??= [];
  st.editor.tiles ??= [];   // 区块地砖涂刷：[{x,y,sprite}]，x/y 为 256px 单元左上角
  st.editor.templates ??= []; // 模板库：[{id,name,payload}]，payload 为完整对象快照
  return st.editor;
}

function makeObject(type, x, y, nextId) {
  const base = { id: `obj_${nextId}`, type, x: n1(x), y: n1(y), rotation: 0, scale: 1, name: TYPES[type] };
  if (type === 'unit') return { ...base, name: '小怪实例', sprite: '', variant: 'walker', hp: 20, atk: 3, skill: '' };
  if (type === 'boss') return { ...base, name: 'Boss实例', sprite: '', hp: 300, atk: 12, skill: '', bossSkill: '' };
  if (type === 'doodad') return { ...base, name: '装饰物', sprite: '', scale: 1 };
  if (type === 'spawn') return { ...base, name: '出生点', role: 'player', radius: 28 };
  if (type === 'region') return { ...base, name: '新区域', width: 240, height: 160, event: '' };
  return { ...base, name: '技能特效点', fxKind: 'generic', color: '#d8bd6a', radius: 80 };
}

export function buildWorldEditor(root, { state, planes, mark, getArt = () => null, applyNow = () => {}, makeId = () => Date.now() % 1000000 }) {
  const sec = document.createElement('section');
  sec.className = 'world-editor';
  sec.innerHTML = '<h2>位面工程编辑器 · 对象层 / 地图层 / 检查器</h2>';

  const toolbar = document.createElement('div');
  toolbar.className = 'world-toolbar';
  const plane = document.createElement('select'); plane.id = 'worldPlane';
  const extra = Object.keys(state.planes).filter((id) => !planes.some((p) => p.id === id));
  for (const id of [...planes.map((p) => p.id), ...extra]) {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = `${id} · ${state.planes[id]?.name ?? id}`; plane.appendChild(opt);
  }
  const type = document.createElement('select'); type.id = 'worldObjectType';
  for (const [id, label] of Object.entries(TYPES)) { const opt = document.createElement('option'); opt.value = id; opt.textContent = label; type.appendChild(opt); }
  const add = document.createElement('button'); add.type = 'button'; add.id = 'worldAddObject'; add.textContent = '＋新建对象';
  const fit = document.createElement('button'); fit.type = 'button'; fit.textContent = '适配视图';
  const play = document.createElement('button'); play.type = 'button'; play.id = 'worldPlaytest'; play.title = '在新标签页直接进入该位面战斗（含当前全部工程对象）'; play.textContent = '▶ 试玩此位面';
  const exp = document.createElement('button'); exp.type = 'button'; exp.textContent = '导出工程';
  const cloneBtn = document.createElement('button'); cloneBtn.type = 'button'; cloneBtn.id = 'worldClonePlane'; cloneBtn.title = '深拷贝当前位面全部工程数据为新位面（多地图管理起步）'; cloneBtn.textContent = '⧉ 克隆此位面';
  const imp = document.createElement('button'); imp.type = 'button'; imp.textContent = '导入工程';
  const ioHint = document.createElement('span'); ioHint.className = 'world-io-hint';
  const tileBrush = document.createElement('input'); tileBrush.id = 'worldTileBrush'; tileBrush.placeholder = '地砖画笔名(如 floor_dujie)'; tileBrush.setAttribute('list', 'dl-backgrounds'); tileBrush.style.width = '150px';
  const paintBtn = document.createElement('button'); paintBtn.type = 'button'; paintBtn.id = 'worldPaintToggle'; paintBtn.title = '开启后左键拖拽涂刷/右键或选 __erase 擦除 (B)'; paintBtn.textContent = '🪣 涂砖模式 (B)';
  const grid = document.createElement('label'); grid.className = 'map-lbl'; grid.innerHTML = '<input type="checkbox" checked> 网格';
  toolbar.append('位面 ', plane, ' 对象类型 ', type, add, fit, play, exp, cloneBtn, imp, ioHint, grid);
  toolbar.append(tileBrush, paintBtn);
  sec.appendChild(toolbar);

  const layout = document.createElement('div'); layout.className = 'world-layout';
  const objectPane = document.createElement('aside'); objectPane.className = 'world-objects';
  objectPane.innerHTML = '<h3>对象层</h3>';
  const objectList = document.createElement('div'); objectList.className = 'world-object-list';
  objectPane.appendChild(objectList);
  objectPane.insertAdjacentHTML('beforeend', '<h3 style="margin-top:10px">模板库</h3>');
  const tplList = document.createElement('div'); tplList.className = 'world-object-list';
  objectPane.appendChild(tplList);
  const canvasWrap = document.createElement('div'); canvasWrap.className = 'world-canvas-wrap';
  const canvas = document.createElement('canvas'); canvas.id = 'worldCanvas'; canvasWrap.appendChild(canvas);
  const status = document.createElement('div'); status.className = 'world-status';
  canvasWrap.appendChild(status);
  const inspector = document.createElement('aside'); inspector.className = 'world-inspector';
  inspector.innerHTML = '<h3>对象检查器</h3><div class="world-empty">未选择对象</div>';
  const batchBar = document.createElement('div'); batchBar.className = 'world-batch'; batchBar.style.display = 'none';
  for (const [label, mode] of [['⇤ 左对齐', 'left'], ['⇥ 右对齐', 'right'], ['↔ 水平居中', 'cx'], ['⇡ 顶对齐', 'top'], ['⇣ 底对齐', 'bottom'], ['↕ 垂直居中', 'cy'], ['⋯ 水平分布', 'distH'], ['⋮ 垂直分布', 'distV']]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.walign = mode;
    b.addEventListener('click', () => applyAlign(mode));
    batchBar.appendChild(b);
  }
  layout.append(objectPane, canvasWrap, inspector); sec.appendChild(toolbar); sec.appendChild(batchBar); sec.appendChild(layout); root.appendChild(sec);

  let pid = plane.value;
  let objectType = type.value;
  let selected = null;
  let multiSel = new Set();   // 多选成员 id 集合（Shift/Ctrl+单击切换；框选批量填充）
  let marquee = null;         // 框选拖拽中：屏幕坐标 {x0,y0,x1,y1}
  let drag = null;
  let cam = { x: 0, y: 0 };
  let zoom = 0.48;
  let cssW = 0, cssH = 0;
  let fitted = false;
  let showGrid = true;
  let paintMode = false, paintDrag = false, hoverCell = null;
  const TILE = 256;
  const tiles = () => editor().tiles;
  function cellKey(gx, gy) { return gx + ',' + gy; }
  function paintAt(w, erase) {
    const gx = Math.floor(w.x / TILE), gy = Math.floor(w.y / TILE);
    const arr = tiles();
    const idx = arr.findIndex((t) => t.x === gx * TILE && t.y === gy * TILE);
    if (erase) { if (idx >= 0) { arr.splice(idx, 1); mark(); } return true; }
    const brush = String(document.querySelector('#worldTileBrush')?.value ?? '').trim();
    if (!brush || brush === '__erase') return false;
    if (idx >= 0) { if (arr[idx].sprite === brush) return false; arr[idx].sprite = brush; } else arr.push({ x: gx * TILE, y: gy * TILE, sprite: brush });
    mark(); return true;
  }
  function togglePaint() {
    paintMode = !paintMode;
    paintBtn.classList.toggle('active', paintMode);
    canvas.style.cursor = paintMode ? 'cell' : 'default';
    draw();
  }
  const imageCache = new Map();

  const st = () => state.planes[pid] ?? (state.planes[pid] = { name: '新位面' });
  const editor = () => ensureEditor(st());
  const objects = () => editor().objects;

  // —— 撤销/重做（快照式）：离散变更完成后调 commit()；
  //    连续 input（打字）不进栈，失焦 change 才 commit，避免历史被逐字符淹没。
  let undoStack = [];
  let redoStack = [];
  let currentSnap = null;
  // 快照包含对象+地砖：任何一层的变更都可撤销
  const snapNow = () => JSON.stringify({ objects: objects(), tiles: tiles() });
  function initHistory() { currentSnap = snapNow(); undoStack = []; redoStack = []; }
  function commit() {
    if (currentSnap === null) currentSnap = snapNow();
    if (currentSnap === snapNow()) return;   // 无实际变化不占栈
    undoStack.push(currentSnap);
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    currentSnap = snapNow();
  }
  function applySnapshot(json) {
    const s = JSON.parse(json);
    editor().objects = Array.isArray(s) ? s : (s.objects ?? []);
    editor().tiles = Array.isArray(s?.tiles) ? s.tiles : [];
    selected = objects().some((o) => o.id === selected) ? selected : null;
    mark(); renderList(); renderInspector(); draw();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(currentSnap); currentSnap = undoStack.pop(); applySnapshot(currentSnap); }
  function redo() { if (!redoStack.length) return; undoStack.push(currentSnap); currentSnap = redoStack.pop(); applySnapshot(currentSnap); }
  const worldToScreen = (x, y) => ({ x: (x - cam.x) * zoom, y: (y - cam.y) * zoom });
  const screenToWorld = (x, y) => ({ x: cam.x + x / zoom, y: cam.y + y / zoom });
  const clampWorld = (x, y) => ({ x: Math.max(0, Math.min(WORLD_W, n1(x))), y: Math.max(0, Math.min(WORLD_H, n1(y))) });

  function syncCanvas() {
    const r = canvasWrap.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    const dpr = window.devicePixelRatio || 1;
    cssW = Math.round(r.width); cssH = Math.round(r.height);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr); canvas._dpr = dpr;
    return true;
  }
  function fitView() {
    if (!cssW || !cssH) return;
    zoom = Math.max(0.1, Math.min(cssW / WORLD_W, cssH / WORLD_H) * 0.9);
    cam = { x: (WORLD_W - cssW / zoom) / 2, y: (WORLD_H - cssH / zoom) / 2 };
  }
  function nextObjectId() {
    return objects().reduce((m, o) => Math.max(m, Number(String(o.id).replace(/\D/g, '')) || 0), 0) + 1;
  }
  function selectedObject() { return objects().find((o) => o.id === selected) ?? null; }
  function selIds() { return multiSel.size ? [...multiSel] : (selected ? [selected] : []); }
  function normRect(m) { return { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) }; }
  function idsInRect(rScreen) {
    // 屏幕矩形 → 世界坐标后再包含判定（框选命中标准规则：中心点落在矩形内）
    const a = screenToWorld(rScreen.x, rScreen.y);
    const b = screenToWorld(rScreen.x + rScreen.w, rScreen.y + rScreen.h);
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    return objects().filter((o) => o.x >= x1 && o.x <= x2 && o.y >= y1 && o.y <= y2).map((o) => o.id);
  }

  function loadImage(rel) {
    if (!rel) return null;
    if (imageCache.has(rel)) return imageCache.get(rel);
    const img = new Image(); img.src = `../shizu-cocos/assets/art/${rel.replace(/^.*?art\//, '')}`;
    img.onload = () => draw(); imageCache.set(rel, img); return img;
  }
  function objectHit(w) {
    for (let i = objects().length - 1; i >= 0; i--) {
      const o = objects()[i];
      const rr = o.type === 'region' ? Math.max(o.width, o.height) / 2 : (o.type === 'spawn' || o.type === 'skillFx' ? (o.radius ?? 28) : 38);
      if (Math.hypot(w.x - o.x, w.y - o.y) <= rr) return o;
    }
    return null;
  }
  function colorFor(o) {
    if (o.type === 'boss') return '#c9556a';
    if (o.type === 'unit') return '#8fe8cb';
    if (o.type === 'spawn') return '#e8c46a';
    if (o.type === 'region') return '#a678d4';
    if (o.type === 'skillFx') return o.color || '#d8bd6a';
    return '#7fa8c9';
  }
  function drawObject(ctx, o) {
    const p = worldToScreen(o.x, o.y); const c = colorFor(o);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((Number(o.rotation) || 0) * Math.PI / 180);
    if (o.type === 'region') {
      ctx.strokeStyle = c; ctx.setLineDash([7, 4]); ctx.strokeRect(-(o.width || 240) * zoom / 2, -(o.height || 160) * zoom / 2, (o.width || 240) * zoom, (o.height || 160) * zoom); ctx.setLineDash([]);
    } else if (o.type === 'spawn') {
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, (o.radius || 28) * zoom, 0, Math.PI * 2); ctx.stroke();
    } else if (o.type === 'skillFx') {
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, (o.radius || 80) * zoom, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
    } else {
      const img = loadImage(o.type === 'doodad' ? o.sprite : `units/${o.sprite}.png`);
      const size = (o.type === 'boss' ? 64 : 46) * (Number(o.scale) || 1) * zoom;
      if (img?.complete && img.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, -size / 2, -size / 2, size, size); }
      else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    if (o.id === selected || multiSel.has(o.id)) { ctx.strokeStyle = '#ffffff'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeRect(-34 * zoom, -34 * zoom, 68 * zoom, 68 * zoom); ctx.setLineDash([]); }
    if (o.id === selected) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -40 * zoom, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = c; ctx.font = '11px system-ui'; ctx.fillText(`${o.name || TYPES[o.type]} · ${o.id}`, p.x + 8, p.y - 10);
  }
  function draw() {
    if (!cssW && !syncCanvas()) return;
    const ctx = canvas.getContext('2d'); const dpr = canvas._dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssW, cssH); ctx.fillStyle = '#0d1116'; ctx.fillRect(0, 0, cssW, cssH);
    if (showGrid) {
      const step = 128 * zoom; ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = -((cam.x * zoom) % step); x < cssW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, cssH); }
      for (let y = -((cam.y * zoom) % step); y < cssH; y += step) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
      ctx.stroke();
    }
    const arena = worldToScreen(480, 280); ctx.strokeStyle = 'rgba(232,196,106,.25)'; ctx.setLineDash([8, 5]); ctx.strokeRect(arena.x, arena.y, 960 * zoom, 560 * zoom); ctx.setLineDash([]);

    // 工程地砖层：涂刷单元覆盖基础地面（与游戏内 renderer 同尺寸 256）
    for (const t of tiles()) {
      const img = loadImage(`backgrounds/${t.sprite}.png`);
      if (!img || !img.complete || !img.naturalWidth) continue;
      const p0 = worldToScreen(t.x, t.y);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, p0.x, p0.y, TILE * zoom, TILE * zoom);
    }
    if (paintMode && hoverCell) {
      const p0 = worldToScreen(hoverCell.gx * TILE, hoverCell.gy * TILE);
      ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.strokeRect(p0.x, p0.y, TILE * zoom, TILE * zoom); ctx.setLineDash([]);
    }
    for (const o of objects()) drawObject(ctx, o);
    if (marquee) {
      const r = normRect(marquee);
      ctx.strokeStyle = '#8fe8cb'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(143,232,203,0.08)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    status.textContent = `${pid} · 世界 ${WORLD_W}×${WORLD_H} · 对象 ${objects().length} · 地砖 ${tiles().length} · 缩放 ${Math.round(zoom * 100)}% · 多选 ${multiSel.size} · 撤销${undoStack.length}/重做${redoStack.length}${paintMode ? ' · 🪣涂刷中' : ''}`;
  }
  function renderList() {
    objectList.innerHTML = '';
    batchBar.style.display = multiSel.size >= 2 ? 'flex' : 'none';
    if (!objects().length) { objectList.innerHTML = '<div class="world-empty">还没有对象。选择类型后点击“新建对象”。</div>'; return; }
    for (const o of objects()) {
      const row = document.createElement('button'); row.type = 'button'; row.className = `world-object-row${multiSel.has(o.id) ? ' active' : ''}`;
      row.textContent = `${TYPES[o.type] || o.type} · ${o.name || o.id}`; row.addEventListener('click', () => { selected = o.id; renderList(); renderInspector(); draw(); }); objectList.appendChild(row);
    }
    renderTplList();
  }

  const tpls = () => editor().templates;
  function renderTplList() {
    tplList.innerHTML = '';
    if (!tpls().length) { tplList.innerHTML = '<div class="world-empty">选中对象后点「存为模板」。</div>'; return; }
    for (const t of tpls()) {
      const row = document.createElement('div'); row.className = 'world-tpl-row';
      const nm = document.createElement('button'); nm.type = 'button'; nm.className = 'world-tpl-place'; nm.title = '点击在视图中心放置实例';
      nm.textContent = `${t.payload?.type === 'boss' ? '👑' : '🐾'} ${t.name}`;
      nm.addEventListener('click', () => placeTemplate(t));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'world-tpl-del'; del.textContent = '×'; del.title = '删除模板（不影响已放置实例）';
      del.addEventListener('click', () => { editor().templates = tpls().filter((x) => x.id !== t.id); mark(); renderTplList(); });
      row.append(nm, del); tplList.appendChild(row);
    }
  }
  function saveSelectedAsTemplate() {
    const o = selectedObject(); if (!o) return;
    tpls().push({ id: `tpl_${nextObjectId()}`, name: o.name || TYPES[o.type], payload: JSON.parse(JSON.stringify(o)) });
    mark(); renderTplList();
  }
  function placeTemplate(t) {
    const inst = { ...JSON.parse(JSON.stringify(t.payload)), id: `obj_${nextObjectId()}`, x: n1(cam.x + cssW / zoom / 2), y: n1(cam.y + cssH / zoom / 2) };
    objects().push(inst); selected = inst.id; multiSel = new Set([inst.id]);
    mark(); commit(); renderList(); renderInspector(); draw();
  }
  function inputField(label, key, type = 'text', min, max) {
    const wrap = document.createElement('label'); wrap.className = 'world-field'; const span = document.createElement('span'); span.textContent = label; const input = document.createElement('input'); input.type = type; input.value = selectedObject()?.[key] ?? ''; if (key === 'sprite') input.setAttribute('list', 'dl-units'); if (min != null) input.min = min; if (max != null) input.max = max;
    input.addEventListener('input', () => { const o = selectedObject(); if (!o) return; o[key] = type === 'number' ? n1(input.value) : input.value; mark(); draw(); renderList(); });
    input.addEventListener('change', () => commit());   // 失焦才算一次完整编辑
    wrap.append(span, input); return wrap;
  }
  function selectField(label, key, values) {
    const wrap = document.createElement('label'); wrap.className = 'world-field'; const span = document.createElement('span'); span.textContent = label; const select = document.createElement('select'); for (const [v, l] of values) { const opt = document.createElement('option'); opt.value = v; opt.textContent = l; select.appendChild(opt); } select.value = selectedObject()?.[key] ?? ''; select.addEventListener('change', () => { const o = selectedObject(); if (!o) return; o[key] = select.value; mark(); draw(); commit(); }); wrap.append(span, select); return wrap;
  }
  function checkField(label, key) {
    const wrap = document.createElement('label'); wrap.className = 'world-field'; const span = document.createElement('span'); span.textContent = label; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selectedObject()?.[key] === true;
    input.addEventListener('change', () => { const o = selectedObject(); if (!o) return; o[key] = input.checked; mark(); commit(); }); wrap.append(span, input); return wrap;
  }
  function renderInspector() {
    inspector.innerHTML = '<h3>对象检查器</h3>'; const o = selectedObject(); if (!o) { inspector.innerHTML += '<div class="world-empty">未选择对象</div>'; return; }
    inspector.append(inputField('名称', 'name'), inputField('X', 'x', 'number', 0, WORLD_W), inputField('Y', 'y', 'number', 0, WORLD_H), inputField('旋转', 'rotation', 'number', -360, 360), inputField('缩放', 'scale', 'number', 0.1, 10));
    if (o.type === 'unit') inspector.append(inputField('模型 sprite', 'sprite'), selectField('行为', 'variant', VARIANTS.map((v) => [v, v])), inputField('HP', 'hp', 'number', 1, 999999), inputField('攻击', 'atk', 'number', 0, 999999), inputField('技能ID', 'skill'));
    if (o.type === 'boss') inspector.append(inputField('模型 sprite', 'sprite'), inputField('HP', 'hp', 'number', 1, 999999), inputField('攻击', 'atk', 'number', 0, 999999), inputField('技能ID', 'skill'), selectField('Boss技能', 'bossSkill', [['', '默认'], ['fan', '扇形'], ['ring', '环形'], ['laser', '激光'], ['lightning', '落雷'], ['missile', '导弹'], ['summon', '召唤']]), checkField('死亡即通关', 'winOnDeath'));
    if (o.type === 'doodad') inspector.append(inputField('模型/资产', 'sprite'));
    if (o.type === 'spawn') inspector.append(selectField('出生角色', 'role', [['player', '玩家'], ['minion', '小怪'], ['boss', 'Boss']]));
    if (o.type === 'region') {
      // 进入事件与触发器真源同源：19 枚举下拉；历史自定义值追加为额外选项不丢失
      const evVals = [...TRIGGER_EVENTS].map((v) => [v, v]);
      const cur = String(o.event ?? '');
      if (cur && !evVals.some(([v]) => v === cur)) evVals.push([cur, `${cur}（自定义）`]);
      inspector.append(inputField('宽', 'width', 'number', 1, WORLD_W), inputField('高', 'height', 'number', 1, WORLD_H), selectField('进入事件', 'event', evVals));
    }
    if (o.type === 'skillFx') inspector.append(selectField('特效类型', 'fxKind', FX_KINDS.map((v) => [v, v])), inputField('颜色', 'color'), inputField('半径', 'radius', 'number', 1, 999));
    const stb = document.createElement('button'); stb.type = 'button'; stb.className = 'world-dup'; stb.textContent = '存为模板';
    stb.addEventListener('click', () => saveSelectedAsTemplate()); inspector.appendChild(stb);
    const dup = document.createElement('button'); dup.type = 'button'; dup.className = 'world-dup'; dup.textContent = '复制对象 (Ctrl+D)';
    dup.addEventListener('click', () => duplicateSelected()); inspector.appendChild(dup);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'world-delete'; del.textContent = '删除对象'; del.addEventListener('click', () => { editor().objects = objects().filter((x) => x.id !== o.id); selected = null; mark(); renderList(); renderInspector(); draw(); commit(); }); inspector.appendChild(del);
  }

  function applyAlign(mode) {
    const objs = objects().filter((o) => multiSel.has(o.id));
    if (objs.length < 2) return;
    const xs = objs.map((o) => o.x), ys = objs.map((o) => o.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (mode === 'left') objs.forEach((o) => o.x = minX);
    else if (mode === 'right') objs.forEach((o) => o.x = maxX);
    else if (mode === 'cx') objs.forEach((o) => o.x = n1((minX + maxX) / 2));
    else if (mode === 'top') objs.forEach((o) => o.y = minY);
    else if (mode === 'bottom') objs.forEach((o) => o.y = maxY);
    else if (mode === 'cy') objs.forEach((o) => o.y = n1((minY + maxY) / 2));
    else if (mode === 'distH' || mode === 'distV') {
      const horiz = mode === 'distH';
      const arr = [...objs].sort((a, b) => (horiz ? a.x : a.y) - (horiz ? b.x : b.y));
      const lo = horiz ? arr[0].x : arr[0].y, hi = horiz ? arr[arr.length - 1].x : arr[arr.length - 1].y;
      const stepN = arr.length - 1; if (stepN < 1) return;
      const stepV = (hi - lo) / stepN;
      arr.forEach((o, i) => { const v = lo + stepV * i; if (horiz) o.x = n1(v); else o.y = n1(v); });
    }
    mark(); commit(); draw(); renderList(); renderInspector();
  }

  function addObject() { const o = makeObject(objectType, cam.x + cssW / zoom / 2, cam.y + cssH / zoom / 2, nextObjectId()); objects().push(o); selected = o.id; mark(); renderList(); renderInspector(); draw(); commit(); }
  function duplicateSelected() {
    const srcs = objects().filter((o) => selIds().includes(o.id));
    if (!srcs.length) return;
    const copies = [];
    for (const src of srcs) {
      const copy = { ...src, id: `obj_${nextObjectId()}`, x: n1(src.x) + 32, y: n1(src.y) + 32 };
      objects().push(copy); copies.push(copy);
    }
    selected = copies[copies.length - 1].id; multiSel = new Set(copies.map((c) => c.id));
    mark(); renderList(); renderInspector(); draw(); commit();
  }
  add.addEventListener('click', addObject);
  type.addEventListener('change', () => { objectType = type.value; });
  fit.addEventListener('click', () => { fitView(); draw(); });
  play.addEventListener('click', () => { applyNow(); window.open(`../?worldTest=${encodeURIComponent(pid)}&t=${Date.now()}`, '_blank'); });
  exp.addEventListener('click', () => {
    const data = { pid, name: st().name, spawn: st().spawn ?? null, obstacles: Array.isArray(st().obstacles) ? st().obstacles : [], editor: editor() };
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    navigator.clipboard?.writeText(code).catch(() => {});
    ioHint.textContent = `✓ 分享码已复制（${code.length} 字符，含 ${objects().length} 对象）`;
    globalThis.__lastPlaneExport = code;   // 自动化/调试取用
  });
  imp.addEventListener('click', () => {
    const code = prompt('粘贴位面工程分享码：'); if (!code) return;
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!d?.editor || !Array.isArray(d.editor.objects)) throw new Error('格式不符（缺 editor.objects）');
      ensureEditor(st());
      st().editor = JSON.parse(JSON.stringify(d.editor));
      if (d.spawn) st().spawn = d.spawn;
      if (Array.isArray(d.obstacles)) st().obstacles = JSON.parse(JSON.stringify(d.obstacles));
      if (d.name) st().name = d.name;
      selected = null; multiSel.clear(); initHistory();
      mark(); renderList(); renderInspector(); fitView(); draw();
      ioHint.textContent = `✓ 已导入 ${st().editor.objects.length} 个对象`;
    } catch (err) { ioHint.textContent = `✗ 导入失败：${err.message}`; }
  });
  grid.querySelector('input').addEventListener('change', (e) => { showGrid = e.target.checked; draw(); });
  paintBtn.addEventListener('click', togglePaint);
  plane.addEventListener('change', () => { pid = plane.value; selected = null; fitView(); initHistory(); renderList(); renderInspector(); draw(); });
  cloneBtn.addEventListener('click', () => {
    const newName = prompt(`克隆位面「${st().name}」为新位面，请命名：`, st().name + '·副本');
    if (!newName) return;
    const newId = `plane_${makeId()}`;
    const src = JSON.parse(JSON.stringify(st()));
    delete src._new; src.id = newId; src._new = true; src.name = newName; src.codex = 0;   // 导出时自动递增分配
    state.planes[newId] = src;
    // 播种衍生切面（与「新增条目」同口径）：敌人阶段表/Boss/机制默认
    state.stageSprites[newId] = Array.from({ length: 5 }, () => ['', '']);
    state.bossSprites[newId] = `boss_${newId.replace('plane_', '')}`;
    state.mechanics[newId] = { type: 'laser', interval: 12 };
    // 下拉注册新选项并切换过去
    const opt = document.createElement('option'); opt.value = newId; opt.textContent = `${newId} · ${newName}`;
    plane.appendChild(opt); plane.value = newId;
    pid = newId; selected = null; multiSel.clear(); initHistory();
    mark(); applyNow(); renderList(); renderInspector(); fitView(); draw();
    ioHint.textContent = `✓ 已克隆为 ${newId}（应用后大厅可见可进）`;
  });
  canvas.addEventListener('mousedown', (e) => {
    const w = screenToWorld(e.offsetX, e.offsetY); const hit = objectHit(w);
    if (paintMode && !hit) {
      const erase = e.button === 2 || String(tileBrush.value ?? '') === '__erase';
      paintAt(w, erase);
      drag = { mode: 'paint', erase };
      draw(); return;
    }
    if (!hit) {
      // 空白处左键拖拽＝框选（选择意图决策树：未命中→marquee）
      multiSel.clear(); marquee = { x0: e.offsetX, y0: e.offsetY, x1: e.offsetX, y1: e.offsetY };
      renderList(); renderInspector(); draw(); return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (multiSel.has(hit.id)) multiSel.delete(hit.id); else multiSel.add(hit.id);
      selected = [...multiSel][multiSel.size - 1] ?? hit.id;
    } else if (!multiSel.has(hit.id)) {
      multiSel = new Set([hit.id]); selected = hit.id;
    }
    const items = [...multiSel].map((id) => objects().find((x) => x.id === id)).filter(Boolean)
      .map((o) => ({ o, dx: o.x - w.x, dy: o.y - w.y }));
    drag = { mode: 'moveAll', items };
    renderList(); renderInspector(); draw();
  });
  canvas.addEventListener('mousemove', (e) => {
    const wHover = screenToWorld(e.offsetX, e.offsetY);
    if (paintMode) {
      const hc = { gx: Math.floor(wHover.x / TILE), gy: Math.floor(wHover.y / TILE) };
      if (!hoverCell || hoverCell.gx !== hc.gx || hoverCell.gy !== hc.gy) hoverCell = hc;
      if (drag?.mode === 'paint') paintAt(wHover, drag.erase);
      draw(); return;
    }
    if (marquee) {
      marquee.x1 = e.offsetX; marquee.y1 = e.offsetY;
      multiSel = new Set(idsInRect(normRect(marquee)));
      if (!multiSel.has(selected)) selected = [...multiSel][0] ?? null;
      renderList(); draw(); return;
    }
    if (!drag) return;
    const w = screenToWorld(e.offsetX, e.offsetY);
    let movedAny = false;
    for (const it of drag.items ?? []) {
      const p = clampWorld(w.x + it.dx, w.y + it.dy);
      if (p.x !== it.o.x || p.y !== it.o.y) movedAny = true;
      it.o.x = p.x; it.o.y = p.y;
    }
    if (movedAny) drag.moved = true;
    mark(); draw(); renderInspector();
  });
  window.addEventListener('mouseup', () => { if (drag?.mode === 'paint') commit(); if (drag?.moved) commit(); drag = null; marquee = null; draw(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('dblclick', (e) => {
    const w = screenToWorld(e.offsetX, e.offsetY); const hit = objectHit(w);
    if (hit) { selected = hit.id; renderList(); renderInspector(); draw(); return; }
    const p = clampWorld(w.x, w.y); const o = makeObject(objectType, p.x, p.y, nextObjectId()); objects().push(o); selected = o.id; mark(); renderList(); renderInspector(); draw(); commit();
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.15, Math.min(2.5, zoom * Math.exp(-e.deltaY * 0.001))); draw(); }, { passive: false });
  document.addEventListener('keydown', (e) => { if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return; if ((e.key === 'Delete' || e.key === 'Backspace') && selIds().length) { const ids = new Set(selIds()); editor().objects = objects().filter((o2) => !ids.has(o2.id)); selected = null; multiSel.clear(); mark(); renderList(); renderInspector(); draw(); commit(); } else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); duplicateSelected(); } else if (e.key.toLowerCase() === 'b' && !(e.ctrlKey || e.metaKey)) { togglePaint(); } else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo(); } });
  new ResizeObserver(() => { if (syncCanvas()) { if (!fitted) { fitView(); fitted = true; } draw(); } }).observe(canvasWrap);
  if (syncCanvas()) { fitView(); fitted = true; } initHistory(); renderList(); renderInspector(); draw();
  // 自动化/调试钩子：只读快照，供 e2e 断言对象几何
  globalThis.__worldEditorApi = { objects: () => JSON.parse(JSON.stringify(objects())), tiles: () => JSON.parse(JSON.stringify(tiles())), templates: () => JSON.parse(JSON.stringify(tpls())) };
}
