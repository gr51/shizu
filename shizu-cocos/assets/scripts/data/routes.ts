// ===== routes.ts · 10 路线 × 5 组（数值平衡表 三章）=====

import { RouteId, SaveData } from '../core/Types';

export interface RouteConfig {
  id: RouteId; name: string; group: string; plane: string; role: string; mutex: RouteId[];
}

export const routes: Record<RouteId, RouteConfig> = {
  dujie:    { id: 'dujie',    name: '渡劫', group: '仙途', plane: '渡劫之域', role: '雷法爆发',   mutex: ['sangshi', 'gongsheng'] },
  gongde:   { id: 'gongde',   name: '功德', group: '仙途', plane: '功德圣境', role: '攻守兼备',   mutex: ['sangshi', 'gongsheng'] },
  sangshi:  { id: 'sangshi',  name: '丧尸', group: '异变', plane: '尸海末世', role: '尸潮割草',   mutex: ['dujie', 'gongde'] },
  gongsheng:{ id: 'gongsheng',name: '共生', group: '异变', plane: '共生巢',   role: '寄生反水',   mutex: ['dujie', 'gongde'] },
  xiake:    { id: 'xiake',    name: '侠客', group: '武炼', plane: '武侠江湖', role: '高操作连招', mutex: ['juhua'] },
  shanhai:  { id: 'shanhai',  name: '山海', group: '武炼', plane: '山海洪荒', role: '巨兽碾压',   mutex: ['jijia'] },
  mofa:     { id: 'mofa',     name: '魔法', group: '诡术', plane: '奥法王国', role: '弹幕法师',   mutex: [] },
  qiji:     { id: 'qiji',     name: '奇技', group: '诡术', plane: '机关城',   role: '机关召唤',   mutex: [] },
  jijia:    { id: 'jijia',    name: '机甲', group: '钢铁', plane: '机甲战线', role: '远程速射',   mutex: ['shanhai'] },
  juhua:    { id: 'juhua',    name: '巨化', group: '钢铁', plane: '巨神界',   role: '巨型范围',   mutex: ['xiake'] },
};

export const routeIds = Object.keys(routes) as RouteId[];

export function isRouteActive(save: SaveData, routeId: RouteId): boolean {
  return (save.player.geneLocks[routeId] || 0) > 0;
}

export function activeRoutes(save: SaveData): RouteId[] {
  return routeIds.filter((r) => isRouteActive(save, r));
}

export function isRouteSealed(save: SaveData, routeId: RouteId): boolean {
  return save.player.sealedRoutes.includes(routeId);
}

export const comboSkills: Record<string, { name: string; desc: string }> = {
  'dujie+gongde':     { name: '仙途双修', desc: '雷击范围 +50% 且度化回血翻倍' },
  'sangshi+gongsheng':{ name: '腐生共体', desc: '尸爆吸血，寄生反水 +30%' },
  'xiake+shanhai':    { name: '山海侠踪', desc: '连招第 3 击附带践踏震击' },
  'jijia+juhua':      { name: '钢铁巨神', desc: '巨化期间导弹齐射' },
  'mofa+qiji':        { name: '奇术机关', desc: '机关单位附带元素效果' },
};
