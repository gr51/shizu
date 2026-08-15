// ===== data/planes.js · 12 位面副本模板 =====
// 来源：《噬祖-数值平衡表》五章（总表）+《噬祖-关卡策划》二章（逐模板）
//
// 【⚠ minionHp / eliteHp / bossHp 等字段不参与战斗数值计算】
//   红线 1：「位面不设固有强度……**禁止按位面手写不同强度表**」
//   整体策划 3.2：「位面模板不设固有难度」
//   实际敌人数值统一取 core/balance.js 的 UNIT_BASE（小怪 20/3、精英 150/8、之主 300/12），
//   见 core/dungeon.js。本文件保留平衡表五章的逐位面数值仅作**设定参考 / 对照存档**。
//
//   （实测佐证：若按五章逐位面值计算，战力 1 的新玩家在机关城通关率 14.7%、
//     而在巨神界只有 0%、平均只能打到第 1.45 阶段 —— 而 12 个位面是**平等随机**的，
//     玩家无法规避。这正是红线 1 要禁止的情况。详见 tests/systems.test.mjs。）
//
// 【waves】平衡表 五章「波次模式」列的绝对值（阶段 1-4；阶段 5 恒为 BOSS 单波）。
//   尸海(+1波)/山海·巨神(-1波)的波次调整**已烘焙进本表**，
//   spawnStyle 因此只再施加小怪 HP 修正（×0.75 / ×1.5），不重复调整波次。

/** @typedef {'standard'|'horde'|'single'} SpawnStyle */

export const planes = [
  {
    codex: 1, id: 'jiguan', name: '机关城', group: '诡术', routes: ['qiji'],
    theme: '齿轮机关阵', boss: '傀儡巨像', bossDesc: '三阶段：本体 → 部件飞出 → 狂暴',
    minionHp: 20, minionAtk: 3, eliteHp: 150, eliteAtk: 8, bossHp: 300, bossAtk: 12,
    waves: [3, 5, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '齿轮咬合处，有人在等你',
  },
  {
    codex: 2, id: 'aofa', name: '奥法王国', group: '诡术', routes: ['mofa'],
    theme: '弹幕法阵', boss: '秘法王', bossDesc: '全屏法阵 + 传送瞬移',
    minionHp: 25, minionAtk: 4, eliteHp: 180, eliteAtk: 9, bossHp: 350, bossAtk: 14,
    waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '法阵之上，星辰是燃料',
  },
  {
    codex: 3, id: 'qiqiao', name: '奇巧迷宫', group: '诡术', routes: ['qiji', 'mofa'],
    theme: '镜面激光', boss: '百机王', bossDesc: '召唤小傀儡 + 激光扫射',
    minionHp: 30, minionAtk: 5, eliteHp: 220, eliteAtk: 11, bossHp: 400, bossAtk: 15,
    waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '每一面镜子里都有一个你',
  },
  {
    codex: 4, id: 'dujie', name: '渡劫之域', group: '仙途', routes: ['dujie'],
    theme: '随机落雷', boss: '雷劫神君', bossDesc: '引雷 + 天罚',
    minionHp: 40, minionAtk: 6, eliteHp: 300, eliteAtk: 14, bossHp: 500, bossAtk: 18,
    waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '雷声之后，才是修行',
  },
  {
    codex: 5, id: 'gongde', name: '功德圣境', group: '仙途', routes: ['gongde'],
    theme: '护体金光', boss: '金身佛陀', bossDesc: '金身减伤 + 超度',
    minionHp: 45, minionAtk: 7, eliteHp: 340, eliteAtk: 15, bossHp: 550, bossAtk: 19,
    waves: [3, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '慈悲也是一种碾压',
  },
  {
    codex: 6, id: 'shihai', name: '尸海末世', group: '异变', routes: ['sangshi'],
    theme: '尸爆连锁', boss: '湮灭者', bossDesc: '尸潮 + 连锁爆炸',
    minionHp: 35, minionAtk: 5, eliteHp: 320, eliteAtk: 14, bossHp: 600, bossAtk: 20,
    waves: [5, 6, 4, 5], eliteStages: [3, 4], spawnStyle: 'horde',
    poem: '这里没有活人，只有还在走的',
  },
  {
    codex: 7, id: 'gongshengchao', name: '共生巢', group: '异变', routes: ['gongsheng'],
    theme: '寄生反水', boss: '万生', bossDesc: '寄生 + 分裂',
    minionHp: 40, minionAtk: 6, eliteHp: 340, eliteAtk: 15, bossHp: 650, bossAtk: 21,
    waves: [4, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '你以为你在吞噬，其实你在被接纳',
  },
  {
    codex: 8, id: 'wuxia', name: '武侠江湖', group: '武炼', routes: ['xiake'],
    theme: '连招暴击', boss: '剑圣无名', bossDesc: '瞬步连斩',
    minionHp: 45, minionAtk: 7, eliteHp: 340, eliteAtk: 16, bossHp: 700, bossAtk: 22,
    waves: [4, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '一剑之后，无人再问姓名',
  },
  {
    codex: 9, id: 'shanhai', name: '山海洪荒', group: '武炼', routes: ['shanhai'],
    theme: '巨型践踏', boss: '饕餮', bossDesc: '吞噬 + 践踏',
    minionHp: 55, minionAtk: 8, eliteHp: 380, eliteAtk: 17, bossHp: 750, bossAtk: 23,
    waves: [4, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'single',
    poem: '洪荒里，体型就是道理',
  },
  {
    codex: 10, id: 'jijia', name: '机甲战线', group: '钢铁', routes: ['jijia'],
    theme: '炮台导弹', boss: '零式', bossDesc: '导弹齐射 + 护盾',
    minionHp: 60, minionAtk: 9, eliteHp: 420, eliteAtk: 19, bossHp: 800, bossAtk: 25,
    waves: [4, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '钢铁不会疼，所以钢铁不会退',
  },
  {
    codex: 11, id: 'jushen', name: '巨神界', group: '钢铁', routes: ['juhua'],
    theme: '震地巨物', boss: '泰坦巨人', bossDesc: '震地 + 投掷',
    minionHp: 70, minionAtk: 10, eliteHp: 460, eliteAtk: 21, bossHp: 900, bossAtk: 27,
    waves: [4, 4, 3, 4], eliteStages: [3, 4], spawnStyle: 'single',
    poem: '你抬头，看见的是脚',
  },
  {
    codex: 12, id: 'zhutian', name: '诸天之心', group: '全路线', routes: [],
    theme: '全机制融合', boss: '崩坏之影', bossDesc: '四阶段形态 + 结局演出',
    minionHp: 50, minionAtk: 7, eliteHp: 400, eliteAtk: 18, bossHp: 1000, bossAtk: 30,
    waves: [5, 5, 4, 4], eliteStages: [3, 4], spawnStyle: 'standard',
    poem: '诸天的尽头，是一面镜子',
  },
];

/** 诸天之心 id（掉落双倍 / 必掉崩坏之心 / 首通必得隐藏技能） */
export const ZHUTIAN_ID = 'zhutian';

export function findPlaneById(id) {
  return planes.find((p) => p.id === id);
}

export function findPlaneByCodex(codex) {
  return planes.find((p) => p.codex === codex);
}

/** 首次副本固定位面（红线 7：totalRuns === 0，全局唯一固定分支） */
export const TUTORIAL_PLANE_ID = 'jiguan';
