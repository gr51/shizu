// ===== data/hiddenSkills.js · 隐藏技能表（禁忌级 · 10 路线各 1）=====
// 来源：《噬祖-数值平衡表》4.8；《噬祖-开发实现指南》10.2
// 稀有度：隐藏 > 传说。基础概率 0.1%（仅匹配位面），PRD 递增，500 次内期望 1 个。
// 效果：永久替换一个技能槽位 —— 刻印后跨局生效，开局自动装载，不参与局内三选一/替换。
//
// ⚠ 两处文档瑕疵，此处按平衡表 4.8 修正，并保留注释说明：
//   1) 指南 10.2 写 gaoda 的 route 为 'gangtie'（那是**组名**不是路线 id）。
//      平衡表 4.8 明确「机甲 → 禁忌·永恒高达」，故取 route: 'jijia'。
//   2) tiangong 类型为「被动」但两份文档都建议刻印到**主动槽**（activeB）。
//      此处照文档保留 slotPrefer: 'activeB'；若判定为文档笔误，改本行即可，逻辑不受影响。

export const HIDDEN_SKILLS = {
  tianjie:   { id: 'tianjie',   route: 'dujie',     kind: 'active',  cd: 45, name: '禁忌·天劫降临', desc: '全屏雷劫且自身 2s 免伤',              slotPrefer: 'activeA',
    eff: { aoeMul: 2.0, invuln: 2 } },
  wanfo:     { id: 'wanfo',     route: 'gongde',    kind: 'passive',         name: '禁忌·万佛朝宗', desc: '受击 20% 概率全屏超度（攻×1.5）——现以范围与增伤近似',      slotPrefer: 'passiveC',
    eff: { aoeMul: 1.5, dmgPct: 0.3 } },
  shishan:   { id: 'shishan',   route: 'sangshi',   kind: 'passive',         name: '禁忌·尸山',     desc: '尸爆范围 ×2，击杀额外生成 1 只永久丧尸（丧尸群以召唤增幅近似）', slotPrefer: 'passiveC',
    eff: { corpseBlastMul: 2.0, summon: 3 } },
  wansheng:  { id: 'wansheng',  route: 'gongsheng', kind: 'passive',         name: '禁忌·万物共生', desc: '寄生成功率 100%，被寄生小怪永久反水（召唤增幅+全属性近似）',   slotPrefer: 'passiveC',
    eff: { summon: 4, allStatsPct: 0.15 } },
  wushuang:  { id: 'wushuang',  route: 'xiake',     kind: 'passive',         name: '禁忌·无双',     desc: '暴击率 +20% 且暴伤 ×2',                slotPrefer: 'passiveC',
    eff: { crit: 0.20, critDmg: 1.0 } },
  taotie:    { id: 'taotie',    route: 'shanhai',   kind: 'active',  cd: 60, name: '禁忌·饕餮真身', desc: '化饕餮 5s，吞噬一切并回血',            slotPrefer: 'activeA',
    eff: { devourHealPct: 0.5, allStatsPct: 0.3 } },
  dajinzhou: { id: 'dajinzhou', route: 'mofa',      kind: 'active',  cd: 45, name: '禁忌·大禁咒',   desc: '全屏奥术 ×3 + 冻结 2s（冻结轴未建，先以三倍爆发兑现）', slotPrefer: 'activeA',
    eff: { burstMul: 3.0 } },
  tiangong:  { id: 'tiangong',  route: 'qiji',      kind: 'passive',         name: '禁忌·天工',     desc: '机关单位继承 100% 属性且永续（召唤增幅+全属性近似永续收益）',  slotPrefer: 'activeB',
    eff: { summon: 5, allStatsPct: 0.25 } },
  gaoda:     { id: 'gaoda',     route: 'jijia',     kind: 'active',  cd: 60, name: '禁忌·永恒高达', desc: '高达合体永久化（无时限）',              slotPrefer: 'activeA',
    eff: { allStatsPct: 0.5, summon: 4 } },
  dingtian:  { id: 'dingtian',  route: 'juhua',     kind: 'passive',         name: '禁忌·顶天',     desc: '体型 +50% 且全屏攻击（体型轴未建，以清场范围兑现「全屏」）', slotPrefer: 'passiveC',
    eff: { aoeMul: 2.5 } },
};

export const ALL_HIDDEN_SKILLS = Object.values(HIDDEN_SKILLS);

export function findHiddenSkill(id) {
  return HIDDEN_SKILLS[id] ?? null;
}
