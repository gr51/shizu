// ===== event-center.js · 事件中心：推进循环 + 订阅/广播 =====

class EventCenter {
  constructor() {
    this.libs = [];          // 事件库实例列表（每次推进遍历运行）
    this.subscribers = {};   // 事件名 -> [fn]
  }

  mountLib(lib) {
    if (!this.libs.includes(lib)) this.libs.push(lib);
    if (lib.onMount) lib.onMount();
  }

  unmountLib(lib) {
    const i = this.libs.indexOf(lib);
    if (i >= 0) {
      this.libs.splice(i, 1);
      if (lib.onUnmount) lib.onUnmount();
    }
  }

  /** 推进一步：先广播 'advance'，再依次运行各事件库 */
  async advance(ctx = { interrupted: false }) {
    this.emit('advance', ctx);
    for (const lib of [...this.libs]) {
      if (typeof lib.advance === 'function') {
        await lib.advance(ctx);
        if (ctx.interrupted) break;
      }
    }
    this.emit('advanceEnd', ctx);
  }

  on(evt, fn) {
    (this.subscribers[evt] = this.subscribers[evt] || []).push(fn);
  }

  emit(evt, payload) {
    const list = this.subscribers[evt];
    if (!list) return;
    for (const fn of [...list]) {
      try { fn(payload); } catch (e) { console.error('[EventCenter]', evt, e); }
    }
  }
}

export const eventCenter = new EventCenter();
export default eventCenter;
