// ===== 事件中心.js · 推进循环 + 订阅/广播（吸收 WordSimulator 核心）=====

/**
 * 事件中心：
 * - 广播组：一组"事件库"实例，每次推进遍历运行
 * - 订阅/广播：轻量事件总线（推进、状态变化、战斗事件等）
 */
class 事件中心 {
  constructor() {
    this.广播组 = [];           // 事件库实例列表
    this.订阅者 = {};          // 事件名 -> [fn]
  }

  挂载事件库(lib) {
    if (!this.广播组.includes(lib)) this.广播组.push(lib);
    if (lib.onMount) lib.onMount();
  }

  卸载事件库(lib) {
    const i = this.广播组.indexOf(lib);
    if (i >= 0) {
      this.广播组.splice(i, 1);
      if (lib.onUnmount) lib.onUnmount();
    }
  }

  /** 推进一步：先广播 'advance' 预钩子，再依次运行各事件库的推进 */
  async 推进(ctx) {
    this.广播('advance', ctx);
    for (const lib of [...this.广播组]) {
      if (lib.推进 && typeof lib.推进 === 'function') {
        await lib.推进(ctx);
        if (ctx.中断) break;   // 事件库可主动中断本次推进链
      }
    }
    this.广播('advanceEnd', ctx);
  }

  订阅(evt, fn) {
    (this.订阅者[evt] = this.订阅者[evt] || []).push(fn);
  }

  广播(evt, payload) {
    const list = this.订阅者[evt];
    if (!list) return;
    for (const fn of [...list]) {
      try { fn(payload); } catch (e) { console.error('[事件中心]', evt, e); }
    }
  }
}

export const 事件中心实例 = new 事件中心();
export default 事件中心实例;
