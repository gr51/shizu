// ===== 状态中心.js · 状态列表 + 渲染通知（吸收 WordSimulator）=====

/**
 * 状态中心：
 * - 维护全局 UI 状态：玩家面板、场景文本、选项按钮、模态框
 * - 界面中心订阅状态变化做重渲染
 */
class 状态中心 {
  constructor() {
    this.ui = {
      meta: '',            // 顶部元信息（战力/难度/位面）
      sceneTitle: '',
      sceneDesc: '',
      events: [],          // 事件文本流
      options: [],         // 选项按钮 [{text, style, onClick}]
      playerCard: '',
      geneCard: '',
      gearCard: '',
      slotsCard: '',
      modal: null,         // {title, body, buttons}
    };
    this.渲染钩子 = null;
  }

  set渲染钩子(fn) { this.渲染钩子 = fn; }

  更新(partial) {
    Object.assign(this.ui, partial);
    if (this.渲染钩子) this.渲染钩子(this.ui);
  }

  追加事件(text, cls = '') {
    this.ui.events.push({ text, cls });
    if (this.渲染钩子) this.渲染钩子(this.ui);
  }

  清空事件() { this.ui.events = []; }

  打开模态(m) {
    this.ui.modal = m;
    if (this.渲染钩子) this.渲染钩子(this.ui);
  }

  关闭模态() {
    this.ui.modal = null;
    if (this.渲染钩子) this.渲染钩子(this.ui);
  }
}

export const 状态中心实例 = new 状态中心();
export default 状态中心实例;
