// ===== ui/view.js · DOM 渲染层（唯一碰 document 的地方）=====
// core/ 完全不依赖本文件；移植到 Cocos 时整层替换即可。

const els = {};

export function initView() {
  for (const id of [
    'meta', 'sceneTitle', 'sceneDesc', 'events', 'options',
    'playerCard', 'geneCard', 'gearCard', 'slotsCard',
    'btnAdvance', 'hint', 'modalRoot',
  ]) {
    els[id] = document.getElementById(id);
  }
}

export function setMeta(html) { els.meta.innerHTML = html; }
export function setTitle(text) { els.sceneTitle.textContent = text; }
export function setDesc(html) { els.sceneDesc.innerHTML = html; }
export function setHint(text) { els.hint.textContent = text; }

export function setCards({ playerCard = '', geneCard = '', gearCard = '', slotsCard = '' }) {
  els.playerCard.innerHTML = playerCard;
  els.geneCard.innerHTML = geneCard;
  els.gearCard.innerHTML = gearCard;
  els.slotsCard.innerHTML = slotsCard;
}

export function renderLog(entries) {
  els.events.innerHTML = entries.map((e) => `<div class="evt ${e.cls}">${e.text}</div>`).join('');
  els.events.scrollTop = els.events.scrollHeight;
}

export function clearLog() {
  els.events.innerHTML = '';
}

/** options: [{ text, style, onClick }] */
export function setOptions(options) {
  els.options.innerHTML = options
    .map((o, i) => `<button type="button" class="${o.style ?? ''}" data-i="${i}">${o.text}</button>`)
    .join('');
  for (const btn of els.options.querySelectorAll('button')) {
    btn.addEventListener('click', () => options[Number(btn.dataset.i)]?.onClick?.());
  }
}

export function setAdvance(visible, label = '前 进 ▶', onClick = null) {
  els.btnAdvance.style.display = visible ? '' : 'none';
  els.btnAdvance.textContent = label;
  els.btnAdvance.onclick = onClick;
}

/** modal: { title, body, buttons:[{text,style,onClick}], onMount } | null */
export function showModal(modal) {
  if (!modal) {
    els.modalRoot.className = '';
    els.modalRoot.innerHTML = '';
    return;
  }
  els.modalRoot.innerHTML = `
    <div class="modal">
      <h3>${modal.title ?? ''}</h3>
      <div class="modal-body">${modal.body ?? ''}</div>
      <div class="modal-btns">
        ${(modal.buttons ?? [])
          .map((b, i) => `<button type="button" class="${b.style ?? ''}" data-i="${i}">${b.text}</button>`)
          .join('')}
      </div>
    </div>`;
  els.modalRoot.className = 'show';
  for (const btn of els.modalRoot.querySelectorAll('.modal-btns button')) {
    btn.addEventListener('click', () => modal.buttons[Number(btn.dataset.i)]?.onClick?.());
  }
  modal.onMount?.(els.modalRoot);
}

export function closeModal() { showModal(null); }

/**
 * 切到实时战斗舞台：把大厅那套 DOM 换成一块画布 + HUD。
 * 返回舞台根节点，供 battleScreen 取 canvas / hud。
 */
export function showBattleStage() {
  const app = document.getElementById('app');
  let stage = document.getElementById('battleStage');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'battleStage';
    stage.innerHTML = '<div id="hud"></div><div id="canvasWrap"><canvas id="gameCanvas"></canvas></div>'
      + '<div id="battleHint">WASD / 方向键移动 · 自动索敌攻击 · 靠近尸体吸取基因</div>';
    app.appendChild(stage);
  }
  app.classList.add('in-battle');
  stage.style.display = '';
  return stage;
}

export function hideBattleStage() {
  const app = document.getElementById('app');
  app.classList.remove('in-battle');
  const stage = document.getElementById('battleStage');
  if (stage) stage.style.display = 'none';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
