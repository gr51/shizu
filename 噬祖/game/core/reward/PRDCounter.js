// ===== reward/PRDCounter.js · 伪随机保底计数器（开发指南 九章）=====
// 整体策划 4.5：连续不触发则概率递增，命中后重置为基础概率。
// 用于传承 / 传说技能 / 隐藏技能 / 装备的保底掉落。

/**
 * 伪随机计数器（PRD）
 * 每次 roll：当前概率 = baseP + step × count（封顶 1）
 *   命中 → count 归零，返回 true
 *   未命中 → count +1，返回 false
 */
export class PRDCounter {
  constructor(baseP, step) {
    this.baseP = baseP;
    this.step = step;
    this.count = 0;
  }

  /** 当前生效概率（封顶 1） */
  get p() {
    return Math.min(this.baseP + this.step * this.count, 1);
  }

  /** 执行一次判定 */
  roll(rng = Math.random) {
    const hit = rng() < this.p;
    this.count = hit ? 0 : this.count + 1;
    return hit;
  }

  /** 重置计数器（如跨局/跨类别时） */
  reset() {
    this.count = 0;
  }
}

/** 便捷：一次性 PRD 判定（不保留状态），返回 { hit, nextP } */
export function prdOnce(baseP, step, rng = Math.random) {
  const c = new PRDCounter(baseP, step);
  const hit = c.roll(rng);
  return { hit, nextP: c.p };
}