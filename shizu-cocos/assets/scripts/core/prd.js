// ===== core/prd.js · PRD 伪随机保底（持久化计数器）=====
// 来源：《噬祖-整体策划》4.5；《噬祖-开发实现指南》九章；《噬祖-数值平衡表》7.4
//
// ⚠ 这是重写前版本的头号 bug 所在：旧实现每次判定都 `new PRDCounter(...)`，
//   计数器随即被丢弃，实际概率恒等于基础概率 —— 保底完全失效。
//   本实现强制把 count 落在 save.stats 上，calc 与存储分离，由测试守护。

/** 平衡表 7.4 · PRD 参数：[基础概率, 每次递增] */
export const PRD_PARAMS = {
  relicPity:  { baseP: 0.20,  step: 0.025,  label: '普通传承' },
  rareRelic:  { baseP: 0.05,  step: 0.008,  label: '稀有传承' },
  legendPity: { baseP: 0.005, step: 0.001,  label: '传说技能' },
  hiddenPity: { baseP: 0.001, step: 0.0004, label: '隐藏技能' },
  gearPity:   { baseP: 0.04,  step: 0.008,  label: '装备（精英/阶段BOSS）' },
};

/**
 * 硬保底次数 —— 第二层机制，与 PRD 并列。
 *
 * 《整体策划》4.5 把两者列为**两条独立规则**：
 *   ·「PRD 伪随机：连续不触发则概率递增，消除极端脸黑」
 *   ·「保底机制：传承保底次数 = 1/概率 × 1.5-2」
 * 上一版只实现了第一条，第二条整个缺失。此处补上。
 *
 * 取值来自《数值平衡表》7.3「保底」列与 4.8 表头：
 *   普通传承「8 次内必出」/ 稀有传承「30-40 次」（取 35）
 *   传说技能「300 次内期望 1-2 个」（取 350）/ 隐藏技能「500 次内期望 1 个」
 *   装备未给保底次数 → null（不设硬保底）
 *
 * ⚠ 与 7.4 的 step 并存时，硬保底实际几乎不会触发（step 太陡，PRD 早就命中了）。
 *   数学上的原因见仓库根目录《重建说明.md》第四节第 2 条 —— 需策划裁定后调 step。
 *   保留本层的意义：它是文档明文要求的机制，且 step 一旦调缓就会立刻生效。
 */
export const PITY_CAP = {
  relicPity: 8,
  rareRelic: 35,
  legendPity: 350,
  hiddenPity: 500,
  gearPity: null,
};

/** 当前生效概率（封顶 1） */
export function prdChance(baseP, step, count) {
  return Math.min(baseP + step * count, 1);
}

/**
 * 有状态的 PRD 计数器。命中 → count 归零；未命中 → count + 1。
 * 通常不直接 new，而是用 prdRoll() 走存档。
 */
export class PRDCounter {
  constructor(baseP, step, count = 0) {
    this.baseP = baseP;
    this.step = step;
    this.count = count;
  }

  get p() {
    return prdChance(this.baseP, this.step, this.count);
  }

  roll(rng) {
    const hit = rng() < this.p;
    this.count = hit ? 0 : this.count + 1;
    return hit;
  }
}

/**
 * 走存档的掉落判定 —— **唯一推荐入口**。两层保底：
 *   1) PRD 递增（消除极端脸黑）
 *   2) 硬保底：连续未中达 PITY_CAP 次时强制命中
 * 计数器状态读写 save.stats[statKey]，因此跨局累积、跨会话持久。
 *
 * @param {object} save 存档（会被就地修改 stats[statKey]）
 * @param {keyof PRD_PARAMS} statKey stats 上的计数器字段名
 * @param {() => number} rng
 * @returns {boolean} 是否命中
 */
export function prdRoll(save, statKey, rng) {
  const params = PRD_PARAMS[statKey];
  if (!params) throw new Error(`未知 PRD 计数器: ${statKey}`);
  const counter = new PRDCounter(params.baseP, params.step, save.stats[statKey] ?? 0);
  const cap = PITY_CAP[statKey];

  let hit;
  if (cap !== null && counter.count + 1 >= cap) {
    hit = true;              // 硬保底触发：这一发必中
    counter.count = 0;
  } else {
    hit = counter.roll(rng);
  }
  save.stats[statKey] = counter.count;
  return hit;
}

/** 当前该类掉落的生效概率（UI「距离下个传承差 XX」用） */
export function prdCurrentChance(save, statKey) {
  const params = PRD_PARAMS[statKey];
  return prdChance(params.baseP, params.step, save.stats[statKey] ?? 0);
}

/** 理论保底次数（概率累积到 1 所需的最大判定次数） */
export function prdPityCap(statKey) {
  const { baseP, step } = PRD_PARAMS[statKey];
  return Math.ceil((1 - baseP) / step) + 1;
}
