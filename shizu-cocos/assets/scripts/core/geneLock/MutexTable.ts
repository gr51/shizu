// ===== MutexTable.ts · 互斥矩阵（与开发实现指南 八章 一致）=====
// 路线 → 永久互斥路线。激活 A 时，A.mutexWith 中所有路线被永久封印。
// 互斥关系为双向语义：A 封印 B 的同时，B 也封印 A（由 ROUTES 双向声明保证）。

import { RouteId } from '../Types';

export interface RouteConfig {
  id: RouteId;
  name: string;          // 展示名
  group: string;         // 流派分组（仙途/武炼/诡术/钢铁/异变）
  planeId: string;       // 对应位面 id
  skinName: string;      // 激活后获得的皮肤名
  mutexWith: RouteId[];  // 永久互斥路线
}

// 注意：Types.ts 的 RouteId 使用 'sangshi'（丧尸）与 'jijia'（机甲），
// 与开发指南中的 'shishi'/'jia' 为同一路线，此处统一为 Types.ts 的命名。
export const ROUTES: Record<RouteId, RouteConfig> = {
  dujie:     { id: 'dujie',     name: '渡劫', group: 'xiantu',  planeId: 'dujie',          skinName: '雷化皮肤', mutexWith: ['sangshi', 'gongsheng'] },
  gongde:    { id: 'gongde',    name: '功德', group: 'xiantu',  planeId: 'gongde',         skinName: '金身皮肤', mutexWith: ['sangshi', 'gongsheng'] },
  xiake:     { id: 'xiake',     name: '侠客', group: 'wulian',  planeId: 'wuxia',          skinName: '侠客皮肤', mutexWith: ['juhua'] },
  shanhai:   { id: 'shanhai',   name: '山海', group: 'wulian',  planeId: 'shanhai',        skinName: '兽化皮肤', mutexWith: ['jijia'] },
  mofa:      { id: 'mofa',      name: '魔法', group: 'guishu',  planeId: 'aofa',           skinName: '魔法皮肤', mutexWith: [] },
  qiji:      { id: 'qiji',      name: '奇技', group: 'guishu',  planeId: 'jiguan',         skinName: '机关皮肤', mutexWith: [] },
  jijia:     { id: 'jijia',     name: '机甲', group: 'gangtie', planeId: 'jijia',          skinName: '机甲皮肤', mutexWith: ['shanhai'] },
  juhua:     { id: 'juhua',     name: '巨化', group: 'gangtie', planeId: 'jushen',         skinName: '巨化皮肤', mutexWith: ['xiake'] },
  sangshi:   { id: 'sangshi',   name: '丧尸', group: 'yibian',  planeId: 'shihai',         skinName: '尸化皮肤', mutexWith: ['dujie', 'gongde'] },
  gongsheng: { id: 'gongsheng', name: '共生', group: 'yibian',  planeId: 'gongshengchao',  skinName: '共生皮肤', mutexWith: ['dujie', 'gongde'] },
};

export const ALL_ROUTES: RouteId[] = Object.keys(ROUTES) as RouteId[];

/** 查询某路线的互斥路线（含自身，供 UI 图鉴展示） */
export function mutexOf(route: RouteId): RouteId[] {
  return ROUTES[route]?.mutexWith ?? [];
}

/** 判断两条路线是否互斥（双向） */
export function isMutex(a: RouteId, b: RouteId): boolean {
  return ROUTES[a]?.mutexWith.includes(b) ?? false;
}