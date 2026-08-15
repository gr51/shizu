// ===== 界面中心.js · DOM 渲染（吸收 WordSimulator 界面中心）=====

import { 状态中心实例 } from './状态中心.js';

class 界面中心 {
  constructor() {
    this.els = {};
  }

  初始化() {
    this.els.meta = document.getElementById('meta');
    this.els.sceneTitle = document.getElementById('sceneTitle');
    this.els.sceneDesc = document.getElementById('sceneDesc');
    this.els.events = document.getElementById('events');
    this.els.options = document.getElementById('options');
    this.els.playerCard = document.getElementById('playerCard');
    this.els.geneCard = document.getElementById('geneCard');
    this.els.gearCard = document.getElementById('gearCard');
    this.els.slotsCard = document.getElementById('slotsCard');
    this.els.btnAdvance = document.getElementById('btnAdvance');
    this.els.hint = document.getElementById('hint');
    this.els.modalRoot = document.getElementById('modalRoot');

    状态中心实例.set渲染钩子((ui) => this.渲染(ui));
  }

  渲染(ui) {
    if (this.els.meta) this.els.meta.innerHTML = ui.meta;
    if (this.els.sceneTitle) this.els.sceneTitle.textContent = ui.sceneTitle;
    if (this.els.sceneDesc) this.els.sceneDesc.innerHTML = ui.sceneDesc;
    if (this.els.events) {
      this.els.events.innerHTML = ui.events.map((e) =>
        `<div class="evt ${e.cls}">${e.text}</div>`).join('');
      this.els.events.scrollTop = this.els.events.scrollHeight;
    }
    if (this.els.options) {
      this.els.options.innerHTML = ui.options.map((o, i) =>
        `<button class="opt ${o.style || ''}" data-i="${i}">${o.text}</button>`).join('');
      this.els.options.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => ui.options[+btn.dataset.i]?.onClick?.());
      });
    }
    if (this.els.playerCard) this.els.playerCard.innerHTML = ui.playerCard;
    if (this.els.geneCard) this.els.geneCard.innerHTML = ui.geneCard;
    if (this.els.gearCard) this.els.gearCard.innerHTML = ui.gearCard;
    if (this.els.slotsCard) this.els.slotsCard.innerHTML = ui.slotsCard;
    this.渲染模态(ui.modal);
  }

  渲染模态(m) {
    if (!this.els.modalRoot) return;
    if (!m) { this.els.modalRoot.innerHTML = ''; this.els.modalRoot.classList.remove('show'); return; }
    const btns = m.buttons.map((b, i) =>
      `<button class="opt ${b.style || ''}" data-i="${i}">${b.text}</button>`).join('');
    this.els.modalRoot.innerHTML = `
      <div class="modal-mask">
        <div class="modal">
          <h3>${m.title || ''}</h3>
          <div class="modal-body">${m.body || ''}</div>
          <div class="modal-btns">${btns}</div>
        </div>
      </div>`;
    this.els.modalRoot.classList.add('show');
    this.els.modalRoot.querySelectorAll('.modal-btns button').forEach((btn) => {
      btn.addEventListener('click', () => m.buttons[+btn.dataset.i]?.onClick?.());
    });
  }

  设置推进按钮(可见, 文案 = '前 进 ▶') {
    if (this.els.btnAdvance) {
      this.els.btnAdvance.style.display = 可见 ? 'inline-block' : 'none';
      this.els.btnAdvance.textContent = 文案;
    }
  }

  设置提示(text) {
    if (this.els.hint) this.els.hint.textContent = text;
  }
}

export const 界面中心实例 = new 界面中心();
export default 界面中心实例;
