// 测试公共夹具
import { createDefaultSave, createMemoryStorage, createSaveRepo } from '../shizu-cocos/assets/scripts/core/save.js';
import { rngFactory } from '../shizu-cocos/assets/scripts/core/rng.js';

export function freshSave(patch = {}) {
  const s = createDefaultSave();
  Object.assign(s.player, patch);
  return s;
}

export function repo() {
  const storage = createMemoryStorage();
  const r = createSaveRepo(storage);
  let persistCount = 0;
  return {
    ...r,
    persist(d) {
      persistCount += 1;
      r.persist(d);
    },
    get persistCount() {
      return persistCount;
    },
  };
}

export const rng = (seed = 12345) => rngFactory(seed);

/** 把玩家推到指定战力附近：直接设永久属性百分点 */
export function withPower(save, pct) {
  save.player.permAtkPct = pct;
  save.player.permHpPct = pct;
  save.player.permSpeedPct = pct;
  return save;
}

import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { RunState } from '../shizu-cocos/assets/scripts/core/run.js';

export const DT = 1 / 60;

/**
 * 机器人的操作策略 —— 代表**一个会用基本技能的玩家**：
 *   · 血量低于 60% 或身边尸体多时开吞噬爆发（回血 + 狂暴 + 收基因）
 *   · 有敌人贴到 40px 内就翻滚脱身
 * 不带这两个动作去标平衡，等于让玩家绑着手打。
 */
export function botAct(run, input) {
  const p = run.player;
  if (p.devourCd <= 0) {
    const nearOrbs = run.orbs.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < 240).length;
    if (run.hp / run.stats.maxHp < 0.6 || nearOrbs >= 8) { run.devour(); return; }
  }
  if (p.dodgeCd <= 0) {
    const tooClose = run.enemies.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 40);
    if (tooClose) run.dodge({ mx: -input.mx, my: -input.my });
  }
}


/**
 * 机器人的选牌策略：优先进攻向（清场范围 > 攻击 > 攻速 > 暴击），其余按顺序。
 * 恒取第一项会系统性错过某些强化；纯随机又等于「乱玩的玩家」。
 * 这个启发式代表**一个有基本判断的玩家**，才是平衡该对齐的基准。
 */
const PICK_PRIORITY = ['attr_aoe', 'attr_atk', 'attr_aspd', 'attr_crit', 'attr_lifesteal'];
export function pickOption(options) {
  for (const id of PICK_PRIORITY) {
    const i = options.findIndex((o) => o.id === id);
    if (i >= 0) return i;
  }
  const skill = options.findIndex((o) => o.kind === 'skill');
  return skill >= 0 ? skill : 0;
}

/**
 * 用「盲走机器人」自动打完一局：原地绕圈、不会闪避、三选一恒取第一项。
 * 它是**平衡的下限基准** —— 真人应当明显强于它。
 */
export function autoPlay(plane, save, seed, repo = null) {
  const run = new RealtimeRun(save, generateDungeon(plane, save, seed), seed * 13 + 5);
  let f = 0;
  let peak = 0;
  while (run.state !== RunState.WON && run.state !== RunState.LOST && f < 60 * 60 * 20) {
    if (run.state === RunState.CHOOSING) {
      // 随机选，不是恒取第一项 —— 恒取第一项会系统性错过某些强化
      //（实测那样一整局都拿不到「噬域扩张」，清场范围纹丝不动）
      run.choose(pickOption(run.pendingOptions.options));
      continue;
    }
    if (run.state === RunState.SLOT_CONFLICT) { run.resolveSlotConflict(run.pendingSkill.options[0]); continue; }
    // 黑市：盲走机器人**不消费**，把基因全留给升级阈值 ——
    // 这样它仍是平衡下限（真人会买东西变强），既有红线的口径也保持可比。
    if (run.state === RunState.SHOPPING) { run.closeShop(); continue; }
    // 机器人以「舒适速度 220」移动：速度属性不用于绕圈乱窜。
    // 真实玩家会把高速拿来走位/风筝，机器人的绕圈无法正确利用高速，
    // 反而会横扫敌群吃到更多接触伤害 —— 那会把速度错判成负收益。
    const speedScale = Math.min(1, 220 / (run.stats.speed || 220));
    const a = f * 0.02 + seed;
    const move = { mx: Math.cos(a) * speedScale, my: Math.sin(a) * speedScale };
    botAct(run, move);
    run.update(DT, move);
    run.drainEffects();
    peak = Math.max(peak, run.onScreen);
    f += 1;
  }
  const result = repo ? run.finalize(repo) : null;
  return { run, result, peak, won: run.state === RunState.WON };
}
