// ===== data/lines.js · 噬祖台词 / 旁白 / 彩蛋文案 =====
// 来源：《噬祖-内容策划》五章、六章。文案与逻辑分离，改词不动代码。

/** 旁白（内容策划 5.2） */
export const NARRATION = {
  boot: '诸天崩坏，裂缝涌现。噬祖，醒来。',
  endless: '裂缝……永远不会关。有些食欲，喂不饱。',
  daily: '今日裂缝已定。十方同局，谁能更快吃穿？',
};

/** 噬祖台词（内容策划 5.1，回巢随机触发） */
export const NEST_LINES = [
  '吃吧，孩子。',
  '活下来的，才有资格饿。',
  '别怕，怕就吃不下了。',
  '这味道……有点苦。',
  '诸天的尽头，也没什么两样。',
  '你回来了。饿了吗？',
];

/** 彩蛋（内容策划 六章） */
export const EASTER_EGGS = {
  consecFails5: '孩子，累了就回来。巢，永远有位置。',
  mutexBlocked: '闻见了吗？那不是我们该碰的东西。',
  namedShizu: '……这孩子，野心不小。',
  firstHidden: '……禁忌的东西，终于自己找上你了。孩子，它从此就是你的一部分，甩不掉了。',
  firstGold: '披上它。强者留下的壳，也是肉，也是骨头。',
};

/**
 * 回巢时该说哪句话。优先彩蛋，其次随机台词。
 * @param {object} save
 * @param {() => number} rng
 */
export function nestLine(save, rng) {
  const p = save.player;
  if (p.totalRuns === 0) return NARRATION.boot;
  if (p.consecFails >= 5) return EASTER_EGGS.consecFails5;
  if (p.nestlingName === '噬祖') return EASTER_EGGS.namedShizu;
  if (save.stats.endlessUnlocked) return NARRATION.endless;
  return NEST_LINES[Math.floor(rng() * NEST_LINES.length)];
}
