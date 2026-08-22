// ===== data/crises.js · 危机事件（无限流随机危机）=====
// 对标《无限恐怖》：恐怖片世界随时可能发生意外——危机事件让每局都不同。
// 每个裂缝在 S2-S4 期间周期性触发随机危机：预警 2s → 效果 6-8s → 解除。
//
// 设计约束：
//   · 危机是环境效果，不直接扣血（伤害已有接触/弹幕/践踏等多个来源）
//   · 预警文本必须让玩家知道发生了什么、该怎么做
//   · 效果克制：改变节奏而非秒杀

/** @typedef {{ id:string, name:string, desc:string, warn:string, duration:number }} Crisis */

export const CRISES = [
  {
    id: 'crisis_meteor',
    name: '陨石雨',
    desc: '随机区域落下陨石冲击',
    warn: '☄️ 天空变红了——陨石雨来袭，远离红色预警圈！',
    duration: 8,
  },
  {
    id: 'crisis_frenzy',
    name: '狂暴化',
    desc: '所有敌人移速与攻速大幅提升',
    warn: '🔴 敌人进入狂暴状态——保持距离，不要硬拼！',
    duration: 8,
  },
  {
    id: 'crisis_swarm',
    name: '虫巢震荡',
    desc: '刷怪速率短暂暴增',
    warn: '🐝 虫巢震荡——刷怪率暴增，注意走位！',
    duration: 6,
  },
];

/** 随机抽一条危机 */
export function rollCrisis(rng) {
  return CRISES[Math.floor(rng() * CRISES.length)] ?? CRISES[0];
}
