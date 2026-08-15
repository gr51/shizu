// ===== event-center.js · 事件中心（订阅/广播）=====

class EventCenter {
  constructor() {
    this.subs = {};
  }
  on(evt, fn) {
    (this.subs[evt] = this.subs[evt] || []).push(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    const l = this.subs[evt];
    if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  }
  emit(evt, payload) {
    const l = this.subs[evt];
    if (!l) return;
    for (const fn of [...l]) { try { fn(payload); } catch (e) { console.error('[EventCenter]', evt, e); } }
  }
}

export const events = new EventCenter();
export default events;
