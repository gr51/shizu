// ===== ui/view.js · DOM 渲染层（唯一碰 document 的地方）=====
// core/ 完全不依赖本文件；移植到 Cocos 时整层替换即可。

const els = {};

export function initView() {
  for (const id of [
    'meta', 'sceneTitle', 'sceneDesc', 'events', 'options',
    'playerCard', 'geneCard', 'gearCard', 'slotsCard',
    'btnAdvance', 'hint', 'modalRoot', 'panelToggle', 'stage',
  ]) {
    els[id] = document.getElementById(id);
  }
  // 右侧状态面板：默认收起，点击展开
  els.panelToggle?.addEventListener('click', () => {
    setPanelCollapsed(!els.stage.classList.contains('panel-hidden'));
  });
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

export function renderLog(entries, title = '') {
  els.events.innerHTML = (title ? `<h4>${title}</h4>` : '')
    + entries.map((e) => `<div class="evt ${e.cls}">${e.text}</div>`).join('');
  els.events.scrollTop = els.events.scrollHeight;
}

export function clearLog() {
  els.events.innerHTML = '';
}

/** options: [{ text, style, icon?, onClick }] */
export function setOptions(options) {
  els.options.innerHTML = options
    .map((o, i) => `<button type="button" class="${o.style ?? ''}" data-i="${i}">`
      + (o.icon ? `<span class="opt-ic" style="background-image:url('${o.icon}')"></span>` : '')
      + `<span class="opt-label">${o.text}</span></button>`)
    .join('');
  for (const btn of els.options.querySelectorAll('button')) {
    btn.addEventListener('click', () => options[Number(btn.dataset.i)]?.onClick?.());
  }
}

/** 折叠/展开右侧状态面板 */
export function setPanelCollapsed(collapsed) {
  if (!els.stage) return;
  els.stage.classList.toggle('panel-hidden', collapsed);
  els.panelToggle.textContent = collapsed ? '☰ 状态' : '✕ 收起';
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
    stage.innerHTML = '<div id="hud"></div><div id="canvasWrap"><canvas id="gameCanvas"></canvas>'
      + '<div id="battleToast" aria-live="polite"></div>'
      + '<div id="stickBase" aria-hidden="true"><i id="stickKnob"></i></div></div>'
      + '<div id="battleHint">WASD 移动 · 自动索敌攻击 · <b>空格</b>吞噬爆发（吸基因+回血+狂暴）· <b>Shift</b>闪避翻滚 · 靠近尸体自动吸取</div>';
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
