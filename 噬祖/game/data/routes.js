// ===== routes.js · 10 路线 × 5 组（数值平衡表 三章）=====

export const routes = {
  dujie:   { name: '渡劫', group: '仙途', plane: '渡劫之域', role: '雷法爆发', mutex: ['sangshi', 'gongsheng'] },
  gongde:  { name: '功德', group: '仙途', plane: '功德圣境', role: '攻守兼备', mutex: ['sangshi', 'gongsheng'] },
  sangshi: { name: '丧尸', group: '异变', plane: '尸海末世', role: '尸潮割草', mutex: ['dujie', 'gongde'] },
  gongsheng:{ name: '共生', group: '异变', plane: '共生巢',   role: '寄生反水', mutex: ['dujie', 'gongde'] },
  xiake:   { name: '侠客', group: '武炼', plane: '武侠江湖', role: '高操作连招', mutex: ['juhua'] },
  shanhai: { name: '山海', group: '武炼', plane: '山海洪荒', role: '巨兽碾压', mutex: ['jijia'] },
  mofa:    { name: '魔法', group: '诡术', plane: '奥法王国', role: '弹幕法师', mutex: [] },
  qiji:    { name: '奇技', group: '诡术', plane: '机关城',   role: '机关召唤', mutex: [] },
  jijia:   { name: '机甲', group: '钢铁', plane: '机甲战线', role: '远程速射', mutex: ['shanhai'] },
  juhua:   { name: '巨化', group: '钢铁', plane: '巨神界',   role: '巨型范围', mutex: ['xiake'] },
};

export const routeIds = Object.keys(routes);

/** 路线是否已激活（解锁 ≥1 段） */
export function isRouteActive(save, routeId) {
  return (save.player.geneLocks[routeId] || 0) > 0;
}

export function activeRoutes(save) {
  return routeIds.filter((r) => isRouteActive(save, r));
}

export function isRouteSealed(save, routeId) {
  return save.player.sealedRoutes.includes(routeId);
}

/** 组合技（组内双激活） */
export const comboSkills = {
  'dujie+gongde':   { name: '仙途双修', desc: '雷击范围 +50% 且度化回血翻倍' },
  'sangshi+gongsheng': { name: '腐生共体', desc: '尸爆吸血，寄生反水 +30%' },
  'xiake+shanhai':  { name: '山海侠踪', desc: '连招第 3 击附带践踏震击' },
  'jijia+juhua':    { name: '钢铁巨神', desc: '巨化期间导弹齐射' },
  'mofa+qiji':      { name: '奇术机关', desc: '机关单位附带元素效果' },
};
