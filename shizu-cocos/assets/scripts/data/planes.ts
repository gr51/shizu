// ===== planes.ts · 12 位面副本模板（关卡策划 + 数值平衡表 五章）=====

import { RouteId } from '../core/Types';

export interface PlaneConfig {
  codex: number; name: string; group: string; route: RouteId | null;
  theme: string; boss: string;
  bossHp: number; bossAtk: number;
  mHp: number; mAtk: number;       // 小怪
  eHp: number; eAtk: number;       // 精英
  waves: number[];                 // 阶段 1-4 波次
  swarm: boolean; single: boolean; double: boolean;
}

export const planes: PlaneConfig[] = [
  { codex: 1,  name: '机关城',   group: '诡术', route: 'qiji',     theme: '齿轮机关阵', boss: '傀儡巨像', bossHp: 300,  bossAtk: 12, mHp: 22,  mAtk: 3,  eHp: 150, eAtk: 8,  waves: [3, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 2,  name: '奥法王国', group: '诡术', route: 'mofa',     theme: '弹幕法阵',   boss: '秘法王',   bossHp: 350,  bossAtk: 14, mHp: 28,  mAtk: 4,  eHp: 190, eAtk: 9,  waves: [3, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 3,  name: '奇巧迷宫', group: '诡术', route: null,       theme: '镜面激光',   boss: '百机王',   bossHp: 400,  bossAtk: 15, mHp: 32,  mAtk: 5,  eHp: 235, eAtk: 11, waves: [3, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 4,  name: '渡劫之域', group: '仙途', route: 'dujie',    theme: '随机落雷',   boss: '雷劫神君', bossHp: 500,  bossAtk: 18, mHp: 42,  mAtk: 6,  eHp: 300, eAtk: 14, waves: [3, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 5,  name: '功德圣境', group: '仙途', route: 'gongde',   theme: '护体金光',   boss: '金身佛陀', bossHp: 550,  bossAtk: 19, mHp: 47,  mAtk: 7,  eHp: 340, eAtk: 15, waves: [3, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 6,  name: '尸海末世', group: '异变', route: 'sangshi',  theme: '尸爆连锁',   boss: '湮灭者',   bossHp: 600,  bossAtk: 20, mHp: 37,  mAtk: 5,  eHp: 320, eAtk: 14, waves: [5, 6, 4, 5], swarm: true,  single: false, double: false },
  { codex: 7,  name: '共生巢',   group: '异变', route: 'gongsheng',theme: '寄生反水',   boss: '万生',     bossHp: 650,  bossAtk: 21, mHp: 42,  mAtk: 6,  eHp: 340, eAtk: 15, waves: [4, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 8,  name: '武侠江湖', group: '武炼', route: 'xiake',    theme: '连招暴击',   boss: '剑圣无名', bossHp: 700,  bossAtk: 22, mHp: 47,  mAtk: 7,  eHp: 360, eAtk: 16, waves: [4, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 9,  name: '山海洪荒', group: '武炼', route: 'shanhai',  theme: '巨型践踏',   boss: '饕餮',     bossHp: 750,  bossAtk: 23, mHp: 87,  mAtk: 8,  eHp: 400, eAtk: 17, waves: [4, 4, 3, 4], swarm: false, single: true,  double: false },
  { codex: 10, name: '机甲战线', group: '钢铁', route: 'jijia',    theme: '炮台导弹',   boss: '零式',     bossHp: 800,  bossAtk: 25, mHp: 62,  mAtk: 9,  eHp: 440, eAtk: 19, waves: [4, 4, 3, 4], swarm: false, single: false, double: false },
  { codex: 11, name: '巨神界',   group: '钢铁', route: 'juhua',    theme: '震地巨物',   boss: '泰坦巨人', bossHp: 900,  bossAtk: 27, mHp: 108, mAtk: 10, eHp: 480, eAtk: 21, waves: [4, 4, 3, 4], swarm: false, single: true,  double: false },
  { codex: 12, name: '诸天之心', group: '全路线', route: null,     theme: '全机制融合', boss: '崩坏之影', bossHp: 1000, bossAtk: 30, mHp: 50,  mAtk: 7,  eHp: 400, eAtk: 18, waves: [5, 5, 4, 4], swarm: false, single: false, double: true },
];

export function findPlane(name: string): PlaneConfig | undefined {
  return planes.find((p) => p.name === name);
}
