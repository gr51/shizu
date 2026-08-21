// ===== data/achievements.js · 成就（长线目标 + 里程碑奖励）=====
// 内容策划 6 章：成就 = 长线目标，不是通关线。
//
// 成就同时是**里程碑奖励**（milestone rewards）：达成即一次性发放局外资源或永久加成。
// 设计约束：
//   · 一次性发放，靠 save.stats.achievementFlags 去重，绝不重复领取。
//   · 奖励走已有口径（库存基因 / 装备精华 / 永久属性 / 放逐次数），不新增隐形常量。
//   · 幅度定位「肯定长线投入」，不替代主线成长。

/** @typedef {{ id:string, name:string, desc:string, reward:string, check:(save:object)=>boolean, grant:(save:object)=>void }} Achievement */

export const ACHIEVEMENTS = [
  {
    id: 'first_kill',
    name: '初噬',
    desc: '首次噬灭一个位面之主',
    reward: '库存基因 +300',
    check: (s) => s.player.wins >= 1,
    grant: (s) => { s.inventory.genes = (s.inventory.genes ?? 0) + 300; },
  },
  {
    id: 'three_routes',
    name: '十方之途',
    desc: '激活 3 条进化路线',
    reward: '永久攻击 +3%',
    check: (s) => Object.values(s.player.geneLocks ?? {}).filter((lv) => lv > 0).length >= 3,
    grant: (s) => { s.player.permAtkPct += 3; },
  },
  {
    id: 'ten_relics',
    name: '诸天残响',
    desc: '收集 10 个传承',
    reward: '永久生命 +5%',
    check: (s) => s.inventory.relics.length >= 10,
    grant: (s) => { s.player.permHpPct += 5; },
  },
  {
    id: 'legend',
    name: '传说显现',
    desc: '获得 1 个传说技能',
    reward: '装备精华 +150',
    check: (s) => s.inventory.comboSkills.length >= 1,
    grant: (s) => { s.player.gearEssence = (s.player.gearEssence ?? 0) + 150; },
  },
  {
    id: 'forbidden',
    name: '禁忌',
    desc: '刻印 1 个隐藏技能（禁忌）',
    reward: '库存基因 +600',
    check: (s) => s.inventory.hiddenSkills.length >= 1,
    grant: (s) => { s.inventory.genes = (s.inventory.genes ?? 0) + 600; },
  },
  {
    id: 'forbidden_all',
    name: '诸天共鸣',
    desc: '4 个技能槽位全部刻印隐藏技能',
    reward: '永久攻击 +5% · 生命 +5%',
    check: (s) => Object.values(s.player.skillSlots ?? {}).every((sl) => sl?.hidden),
    grant: (s) => { s.player.permAtkPct += 5; s.player.permHpPct += 5; },
  },
  {
    id: 'endless',
    name: '诸天归一',
    desc: '首次通关诸天之心',
    reward: '库存基因 +1500',
    check: (s) => s.stats.firstClear === true,
    grant: (s) => { s.inventory.genes = (s.inventory.genes ?? 0) + 1500; },
  },
  // —— 新增：与本作已实现系统挂钩的长线目标 ——
  {
    id: 'stage5',
    name: '深入裂缝',
    desc: '抵达第 5 阶段',
    reward: '库存基因 +400',
    check: (s) => (s.stats.bestStage ?? 0) >= 5,
    grant: (s) => { s.inventory.genes = (s.inventory.genes ?? 0) + 400; },
  },
  {
    id: 'nest_master',
    name: '巢髓精通',
    desc: '任意一项虫巢强化升到满级',
    reward: '永久速度 +3%',
    check: (s) => {
      const up = s.player.nestUpgrades ?? {};
      return Object.entries(up).some(([, lv]) => lv >= 5) || (up.nest_revive ?? 0) >= 1;
    },
    grant: (s) => { s.player.permSpeedPct += 3; },
  },
  {
    id: 'veteran',
    name: '百战之躯',
    desc: '累计开启 20 次裂缝',
    reward: '库存基因 +800',
    check: (s) => (s.player.totalRuns ?? 0) >= 20,
    grant: (s) => { s.inventory.genes = (s.inventory.genes ?? 0) + 800; },
  },
];

/** 返回已解锁成就 id 集合 */
export function unlockedAchievements(save) {
  return new Set(ACHIEVEMENTS.filter((a) => {
    try { return a.check(save); } catch { return false; }
  }).map((a) => a.id));
}

/** 某成就是否已领取奖励 */
export function isRewardClaimed(save, id) {
  return Boolean(save?.stats?.achievementFlags?.[id]);
}

/**
 * 结算里程碑：把「已达成但未领取」的成就一次性发放。
 * @returns {Array<{id:string,name:string,reward:string}>} 本次新领取的成就
 */
export function claimAchievements(save) {
  save.stats.achievementFlags = save.stats.achievementFlags ?? {};
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (save.stats.achievementFlags[a.id]) continue;
    let ok = false;
    try { ok = a.check(save); } catch { ok = false; }
    if (!ok) continue;
    try { a.grant(save); } catch { /* 奖励发放失败不阻塞结算 */ }
    save.stats.achievementFlags[a.id] = true;
    got.push({ id: a.id, name: a.name, reward: a.reward });
  }
  return got;
}
