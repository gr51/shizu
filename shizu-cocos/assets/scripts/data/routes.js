// ===== data/routes.js · 10 路线 × 5 组 + 互斥矩阵 + 组合技 =====
// 来源：《噬祖-数值平衡表》三章；《噬祖-整体策划》4.1
// 互斥为双向语义，由本表双向声明保证（isMutexSymmetric 测试守护）。

/** @typedef {'dujie'|'gongde'|'xiake'|'shanhai'|'mofa'|'qiji'|'jijia'|'juhua'|'sangshi'|'gongsheng'} RouteId */

export const ROUTES = {
  dujie:     { id: 'dujie',     name: '渡劫', group: 'xiantu',  groupName: '仙途', planeCodex: 4,  skin: '雷化皮肤', role: '雷法爆发',   mutexWith: ['sangshi', 'gongsheng'] },
  gongde:    { id: 'gongde',    name: '功德', group: 'xiantu',  groupName: '仙途', planeCodex: 5,  skin: '金身皮肤', role: '攻守兼备',   mutexWith: ['sangshi', 'gongsheng'] },
  xiake:     { id: 'xiake',     name: '侠客', group: 'wulian',  groupName: '武炼', planeCodex: 8,  skin: '侠客皮肤', role: '高操作连招', mutexWith: ['juhua'] },
  shanhai:   { id: 'shanhai',   name: '山海', group: 'wulian',  groupName: '武炼', planeCodex: 9,  skin: '兽化皮肤', role: '巨兽碾压',   mutexWith: ['jijia'] },
  mofa:      { id: 'mofa',      name: '魔法', group: 'guishu',  groupName: '诡术', planeCodex: 2,  skin: '魔法皮肤', role: '弹幕法师',   mutexWith: [] },
  qiji:      { id: 'qiji',      name: '奇技', group: 'guishu',  groupName: '诡术', planeCodex: 1,  skin: '机关皮肤', role: '机关召唤',   mutexWith: [] },
  jijia:     { id: 'jijia',     name: '机甲', group: 'gangtie', groupName: '钢铁', planeCodex: 10, skin: '机甲皮肤', role: '远程速射',   mutexWith: ['shanhai'] },
  juhua:     { id: 'juhua',     name: '巨化', group: 'gangtie', groupName: '钢铁', planeCodex: 11, skin: '巨化皮肤', role: '巨型范围',   mutexWith: ['xiake'] },
  sangshi:   { id: 'sangshi',   name: '丧尸', group: 'yibian',  groupName: '异变', planeCodex: 6,  skin: '尸化皮肤', role: '尸潮割草',   mutexWith: ['dujie', 'gongde'] },
  gongsheng: { id: 'gongsheng', name: '共生', group: 'yibian',  groupName: '异变', planeCodex: 7,  skin: '共生皮肤', role: '寄生反水',   mutexWith: ['dujie', 'gongde'] },
};

/** @type {RouteId[]} */
export const ALL_ROUTES = Object.keys(ROUTES);

/** 组内双激活生效的组合技（平衡表三章） */
export const COMBO_SKILLS = [
  { id: 'dujie_jinshen',  routes: ['dujie', 'gongde'],       name: '渡劫金身', desc: '金身期间雷击反伤 ×2' },
  { id: 'qifa_kuilei',    routes: ['mofa', 'qiji'],          name: '奇法傀儡', desc: '机关单位继承元素附加' },
  { id: 'xuemai_wuzhe',   routes: ['xiake', 'shanhai'],      name: '血脉武者', desc: '连招触发时体型增长' },
  { id: 'shisheng_gongrong', routes: ['sangshi', 'gongsheng'], name: '尸生共融', desc: '尸爆范围 +50%' },
  { id: 'gangtie_jushen', routes: ['jijia', 'juhua'],        name: '钢铁巨神', desc: '巨化期间导弹齐射' },
];

/** 某路线的永久互斥路线 */
export function mutexOf(route) {
  return ROUTES[route]?.mutexWith ?? [];
}

/** 两条路线是否互斥（读单向表，双向性由测试守护） */
export function isMutex(a, b) {
  return mutexOf(a).includes(b);
}

export function routeName(route) {
  return ROUTES[route]?.name ?? String(route);
}
