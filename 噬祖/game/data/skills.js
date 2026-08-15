// ===== skills.js · 10 路线 × 6 段基因锁（数值平衡表 四章）=====
// kind: 'passive' | 'active'；active 进主动槽，passive 进被动槽；基因锁被动段不占槽（此处统一进槽，简化）
// eff: 供战斗引擎读取的简化数值字段

export const skills = [
  // —— 仙途组 ——
  { route: 'dujie', lv: 1, name: '雷击附魔', kind: 'passive', desc: '攻击附带小雷击（无视防御）', val: '附加 攻×0.3', eff: { bonusAtk: 0.3 } },
  { route: 'dujie', lv: 2, name: '雷光疾行', kind: 'passive', desc: '移速提升', val: '+10%', eff: { speedPct: 0.10 } },
  { route: 'dujie', lv: 3, name: '雷链', kind: 'passive', desc: '雷击弹射额外目标', val: '弹射 2 目标', eff: { chain: 2 } },
  { route: 'dujie', lv: 4, name: '雷枢护体', kind: 'passive', desc: '受击概率落雷反击', val: '15% / 攻×0.5', eff: {} },
  { route: 'dujie', lv: 5, name: '天雷护体', kind: 'passive', desc: '反弹近战伤害', val: '反弹 20%', eff: { reflect: 0.2 } },
  { route: 'dujie', lv: 6, name: '九重雷劫', kind: 'active', cd: 60, desc: '全屏落雷', val: '3s，每秒 攻×0.8', eff: { aoe: 0.8 } },
  { route: 'gongde', lv: 1, name: '度化', kind: 'passive', desc: '击杀回血', val: '+2% 最大生命', eff: { killHeal: 0.02 } },
  { route: 'gongde', lv: 2, name: '金肤', kind: 'passive', desc: '生命上限提升', val: '+15%', eff: { hpPct: 0.15 } },
  { route: 'gongde', lv: 3, name: '金身', kind: 'passive', desc: '减伤', val: '15%', eff: { dmgReduct: 0.15 } },
  { route: 'gongde', lv: 4, name: '禅心', kind: 'passive', desc: '受控时间缩短', val: '-50%', eff: {} },
  { route: 'gongde', lv: 5, name: '业力', kind: 'passive', desc: '反弹所受伤害', val: '反弹 20%', eff: { reflect: 0.2 } },
  { route: 'gongde', lv: 6, name: '金身不灭', kind: 'active', cd: 90, desc: '无敌', val: '3s', eff: { invincible: 3 } },

  // —— 异变组 ——
  { route: 'sangshi', lv: 1, name: '嗜血', kind: 'passive', desc: '吸血', val: '5%', eff: { lifesteal: 0.05 } },
  { route: 'sangshi', lv: 2, name: '腐肉', kind: 'passive', desc: '击杀额外基因', val: '+5%', eff: { genePct: 0.05 } },
  { route: 'sangshi', lv: 3, name: '尸爆', kind: 'passive', desc: '死亡敌人爆炸', val: '攻×0.6 / 范围', eff: { explode: 0.6 } },
  { route: 'sangshi', lv: 4, name: '尸毒', kind: 'passive', desc: '攻击附带中毒', val: '3s 攻×0.3', eff: { dot: 0.3 } },
  { route: 'sangshi', lv: 5, name: '尸潮', kind: 'active', cd: 45, desc: '召唤丧尸', val: '2 只 / 15s', eff: { summon: 2 } },
  { route: 'sangshi', lv: 6, name: '尸山血海', kind: 'active', cd: 90, desc: '召唤尸潮', val: '10 只 / 20s', eff: { summon: 10 } },
  { route: 'gongsheng', lv: 1, name: '汲取', kind: 'passive', desc: '攻击吸取敌方攻速', val: '3% / 次', eff: {} },
  { route: 'gongsheng', lv: 2, name: '菌毯', kind: 'passive', desc: '站立回血', val: '+1% 最大生命/s', eff: { regen: 0.01 } },
  { route: 'gongsheng', lv: 3, name: '寄生', kind: 'passive', desc: '击杀精英概率反水', val: '15%', eff: { convert: 0.15 } },
  { route: 'gongsheng', lv: 4, name: '增殖', kind: 'passive', desc: '生命提升 + 受伤降低', val: '+10% / -10%', eff: { hpPct: 0.10, dmgReduct: 0.10 } },
  { route: 'gongsheng', lv: 5, name: '母体分裂', kind: 'passive', desc: '死亡时分裂续战', val: '一局 1 次', eff: { revive: 1 } },
  { route: 'gongsheng', lv: 6, name: '共生体', kind: 'passive', desc: '双核心协同', val: '伤害 +50%', eff: { dmgPct: 0.5 } },

  // —— 武炼组 ——
  { route: 'xiake', lv: 1, name: '精准', kind: 'passive', desc: '暴击率提升', val: '+5%', eff: { crit: 0.05 } },
  { route: 'xiake', lv: 2, name: '连击', kind: 'passive', desc: '第 3 击增伤', val: '+30%', eff: { combo3: 0.3 } },
  { route: 'xiake', lv: 3, name: '连招', kind: 'passive', desc: '连续攻击递增增伤', val: '叠至 +50%', eff: { ramping: 0.5 } },
  { route: 'xiake', lv: 4, name: '身法', kind: 'passive', desc: '闪避后攻速提升', val: '1s 内 +30%', eff: {} },
  { route: 'xiake', lv: 5, name: '剑气', kind: 'passive', desc: '远程剑气（可暴击）', val: '攻×0.8', eff: { bonusAtk: 0.8 } },
  { route: 'xiake', lv: 6, name: '万剑归宗', kind: 'active', cd: 60, desc: '剑气风暴', val: '3s，每秒 攻×1.2', eff: { aoe: 1.2 } },
  { route: 'shanhai', lv: 1, name: '巨躯', kind: 'passive', desc: '体型 + 生命提升', val: '+10% / +10%', eff: { hpPct: 0.10, size: 0.10 } },
  { route: 'shanhai', lv: 2, name: '兽皮', kind: 'passive', desc: '减伤', val: '5%', eff: { dmgReduct: 0.05 } },
  { route: 'shanhai', lv: 3, name: '践踏', kind: 'passive', desc: '攻击附带范围震击', val: '攻×0.5', eff: { splash: 0.5 } },
  { route: 'shanhai', lv: 4, name: '蛮力', kind: 'passive', desc: '攻击提升', val: '+15%', eff: { atkPct: 0.15 } },
  { route: 'shanhai', lv: 5, name: '兽魂', kind: 'passive', desc: '暴击 + 体型提升', val: '+15% / +10%', eff: { crit: 0.15, size: 0.10 } },
  { route: 'shanhai', lv: 6, name: '饕餮巨口', kind: 'active', cd: 45, desc: '吞噬小怪回血', val: '每只 +5% 生命', eff: { devour: 0.05 } },

  // —— 诡术组 ——
  { route: 'mofa', lv: 1, name: '弹幕', kind: 'passive', desc: '弹幕数量 +1', val: '+1', eff: { proj: 1 } },
  { route: 'mofa', lv: 2, name: '奥术涌动', kind: 'passive', desc: '攻速提升', val: '+15%', eff: { aspdPct: 0.15 } },
  { route: 'mofa', lv: 3, name: '元素附加', kind: 'passive', desc: '攻击附带火/冰', val: '灼烧 / 减速', eff: {} },
  { route: 'mofa', lv: 4, name: '法力共鸣', kind: 'passive', desc: '击杀减技能 CD', val: '-10%', eff: {} },
  { route: 'mofa', lv: 5, name: '法术暴击', kind: 'passive', desc: '法术暴击率提升', val: '+10%', eff: { crit: 0.10 } },
  { route: 'mofa', lv: 6, name: '禁咒', kind: 'active', cd: 60, desc: '全屏奥术爆发', val: '攻×2.0', eff: { aoe: 2.0 } },
  { route: 'qiji', lv: 1, name: '机关哨兵', kind: 'active', cd: 30, desc: '召唤机关鼠', val: '继承 30%', eff: { summon: 1 } },
  { route: 'qiji', lv: 2, name: '机壳', kind: 'passive', desc: '减伤', val: '8%', eff: { dmgReduct: 0.08 } },
  { route: 'qiji', lv: 3, name: '陷阱', kind: 'active', cd: 20, desc: '放置爆炸陷阱', val: '攻×0.8', eff: { trap: 0.8 } },
  { route: 'qiji', lv: 4, name: '齿轮', kind: 'passive', desc: '攻速提升', val: '+10%', eff: { aspdPct: 0.10 } },
  { route: 'qiji', lv: 5, name: '傀儡分身', kind: 'active', cd: 60, desc: '分身助战', val: '继承 50% / 20s', eff: { summon: 1 } },
  { route: 'qiji', lv: 6, name: '天工开物', kind: 'active', cd: 90, desc: '机关大军', val: '5 单位 / 20s', eff: { summon: 5 } },

  // —— 钢铁组 ——
  { route: 'jijia', lv: 1, name: '速射', kind: 'passive', desc: '射程 + 攻速提升', val: '+30% / +20%', eff: { range: 0.30, aspdPct: 0.20 } },
  { route: 'jijia', lv: 2, name: '装甲', kind: 'passive', desc: '生命提升', val: '+20%', eff: { hpPct: 0.20 } },
  { route: 'jijia', lv: 3, name: '护盾', kind: 'passive', desc: '周期护盾吸收伤害', val: '每 20s', eff: {} },
  { route: 'jijia', lv: 4, name: '锁定', kind: 'passive', desc: '暴击率提升', val: '+10%', eff: { crit: 0.10 } },
  { route: 'jijia', lv: 5, name: '导弹', kind: 'passive', desc: '周期导弹齐射', val: '每 10s / 攻×1.5', eff: {} },
  { route: 'jijia', lv: 6, name: '高达合体', kind: 'active', cd: 90, desc: '变身巨型机甲', val: '8s 全属性 +50%', eff: { buff: 0.5 } },
  { route: 'juhua', lv: 1, name: '长臂', kind: 'passive', desc: '攻击范围提升', val: '+20%', eff: { range: 0.20 } },
  { route: 'juhua', lv: 2, name: '巨骨', kind: 'passive', desc: '生命提升', val: '+25%', eff: { hpPct: 0.25 } },
  { route: 'juhua', lv: 3, name: '震地', kind: 'passive', desc: '攻击附带范围震击', val: '攻×0.6', eff: { splash: 0.6 } },
  { route: 'juhua', lv: 4, name: '踏碎', kind: 'passive', desc: '对精英增伤', val: '+20%', eff: { eliteDmg: 0.2 } },
  { route: 'juhua', lv: 5, name: '顶天', kind: 'passive', desc: '体型 + 减伤提升', val: '+30% / -10%', eff: { size: 0.30, dmgReduct: 0.10 } },
  { route: 'juhua', lv: 6, name: '顶天立地', kind: 'active', cd: 90, desc: '巨神形态', val: '10s 全屏攻击', eff: { buff: 1.0 } },
];

export function skillsByRoute(routeId) {
  return skills.filter((s) => s.route === routeId);
}

export function findSkill(name) {
  return skills.find((s) => s.name === name);
}
