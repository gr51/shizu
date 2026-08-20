// ===== data/achievements.js · 成就（长线目标）=====
// 内容策划 6 章：成就 = 长线目标，不是通关线。

/** @typedef {{ id: string, name: string, desc: string, check: (save: object) => boolean }} Achievement */

export const ACHIEVEMENTS = [
  {
    id: 'first_kill',
    name: '初噬',
    desc: '首次噬灭一个位面之主',
    check: (s) => s.player.wins >= 1,
  },
  {
    id: 'three_routes',
    name: '十方之途',
    desc: '激活 3 条进化路线',
    check: (s) => Object.values(s.player.geneLocks ?? {}).filter((lv) => lv > 0).length >= 3,
  },
  {
    id: 'ten_relics',
    name: '诸天残响',
    desc: '收集 10 个传承',
    check: (s) => s.inventory.relics.length >= 10,
  },
  {
    id: 'legend',
    name: '传说显现',
    desc: '获得 1 个传说技能',
    check: (s) => s.inventory.comboSkills.length >= 1,
  },
  {
    id: 'forbidden',
    name: '禁忌',
    desc: '刻印 1 个隐藏技能（禁忌）',
    check: (s) => s.inventory.hiddenSkills.length >= 1,
  },
  {
    id: 'forbidden_all',
    name: '诸天共鸣',
    desc: '4 个技能槽位全部刻印隐藏技能',
    check: (s) => (s.player.skillSlots ?? []).every((sl) => sl.hidden),
  },
  {
    id: 'endless',
    name: '诸天归一',
    desc: '首次通关诸天之心',
    check: (s) => s.stats.firstClear === true,
  },
];

/** 返回已解锁成就 id 集合 */
export function unlockedAchievements(save) {
  return new Set(ACHIEVEMENTS.filter((a) => {
    try { return a.check(save); } catch { return false; }
  }).map((a) => a.id));
}