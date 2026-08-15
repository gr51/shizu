// ===== 触发中心.js · 属性变化 → 响应式联动（吸收 WordSimulator）=====

/**
 * 触发中心：
 * - 订阅某属性的变化（如基因锁阶段、位面通道）
 * - 检测触发：属性变化后派发回调，用于词库挂载/卸载、UI 更新
 */
class 触发中心 {
  constructor() {
    this.监听 = {};      // 属性名 -> [fn]
    this.全局监听 = [];  // [fn] 任意属性变化
  }

  触发时(attr, fn) {
    (this.监听[attr] = this.监听[attr] || []).push(fn);
  }

  全局触发(fn) {
    this.全局监听.push(fn);
  }

  /** 属性变化后调用 */
  检测触发(变化对象) {
    for (const [key, value] of Object.entries(变化对象)) {
      const fns = this.监听[key];
      if (fns) for (const fn of [...fns]) { try { fn(value, 变化对象); } catch (e) { console.error('[触发中心]', key, e); } }
    }
    for (const fn of [...this.全局监听]) {
      try { fn(变化对象); } catch (e) { console.error('[触发中心]全局', e); }
    }
  }
}

export const 触发中心实例 = new 触发中心();
export default 触发中心实例;
