// ===== data/sideQuests.js · 支线协议（无限流任务制）=====
// 对标《无限恐怖》/《王牌进化》：每个世界除了主线（击破位面之主），
// 还有一条**可选支线**——完成拿额外基因，失败不罚但错过收益。
// 「有目标地打」而不是「漫无目的地刷」，这是无限流的魂。
//
// 设计约束：
//   · 每个裂缝开局随机一条（rng 决定，不重复刷同一条）
//   · progress(run) 从战斗态实时读取——不维护第二份计数，杜绝双源漂移
//   · 奖励走既有口径（结算基因入库），不新增隐形常量

/** @typedef {{ id:string, name:string, desc:string, target:number, reward:number, progress:(run:object)=>number }} SideQuest */

export const SIDE_QUESTS = [
  {
    id: 'annihilation',
    name: '歼灭协议',
    desc: '噬灭 400 只敌人',
    target: 400,
    reward: 300,
    progress: (r) => r.kills,
  },
  {
    id: 'harvest',
    name: '收割协议',
    desc: '吞噬 600 基因',
    target: 600,
    reward: 300,
    progress: (r) => r.genes,
  },
  {
    id: 'speedrun',
    name: '速通协议',
    desc: '150 秒内抵达第 3 阶段',
    target: 3,
    reward: 400,
    progress: (r) => (r.time <= 150 ? r.stageNo : 0),   // 超时即失败：归零且不可恢复
  },
  {
    id: 'headhunter',
    name: '猎头协议',
    desc: '击破 4 名守关精英',
    target: 4,
    reward: 350,
    progress: (r) => (r.elitesKilled ?? 0),
  },
];

/** 开局随机一条支线协议 */
export function rollSideQuest(rng) {
  return SIDE_QUESTS[Math.floor(rng() * SIDE_QUESTS.length)];
}
