// ===== data/skills.js · 基因锁技能表（10 路线 × 6 段）=====
// 来源：《噬祖-数值平衡表》四章 4.1-4.5（完整配表）
// kind: 'active' 入主动槽 / 'passive' 入被动槽
// 平衡表 4.7：基因锁 Lv1/3/5 被动段自动生效不占槽；主动段（Lv5 召唤类、Lv6 终极技）占主动槽
// eff: 战斗引擎可读的结构化效果；desc/val 为展示文案

/** 段位 → 稀有度（ChoiceRoller 用）：1-2 基础 / 3-4 特色 / 5 稀有 / 6 传说 */
export function skillRarity(lv) {
  if (lv >= 6) return 'legend';
  if (lv >= 5) return 'rare';
  if (lv >= 3) return 'feature';
  return 'base';
}

/** 基因锁充能表（平衡表 4.6）：解锁第 N 段所需**累计**吞噬基因 */
export const CHARGE_THRESHOLDS = [100, 200, 350, 550, 800, 1200];

export const skills = [
  // ——— 仙途组 · 渡劫 ———
  { route: 'dujie', lv: 1, id: 'dujie_1', name: '雷击附魔', kind: 'passive', desc: '攻击附带小雷击（无视防御）', val: '附加 攻×0.3', eff: { addFlatMul: 0.3 } },
  { route: 'dujie', lv: 2, id: 'dujie_2', name: '雷光疾行', kind: 'passive', desc: '移速提升', val: '+10%', eff: { speedPct: 0.10 } },
  { route: 'dujie', lv: 3, id: 'dujie_3', name: '雷链',     kind: 'passive', desc: '雷击弹射额外目标，每次衰减', val: '弹射 2 目标 / 衰减 50%', eff: { chain: 2, chainDecay: 0.5 } },
  { route: 'dujie', lv: 4, id: 'dujie_4', name: '雷枢护体', kind: 'passive', desc: '受击概率落雷反击', val: '15% / 攻×0.5', eff: { counterChance: 0.15, counterMul: 0.5 } },
  { route: 'dujie', lv: 5, id: 'dujie_5', name: '天雷护体', kind: 'passive', desc: '反弹近战伤害', val: '反弹 20%', eff: { reflect: 0.20 } },
  { route: 'dujie', lv: 6, id: 'dujie_6', name: '九重雷劫', kind: 'active', cd: 60, desc: '全屏落雷', val: '3s，每秒 攻×0.8', eff: { aoeMul: 0.8, duration: 3 } },

  // ——— 仙途组 · 功德 ———
  { route: 'gongde', lv: 1, id: 'gongde_1', name: '度化',     kind: 'passive', desc: '击杀回血', val: '+2% 最大生命', eff: { killHealPct: 0.02 } },
  { route: 'gongde', lv: 2, id: 'gongde_2', name: '金肤',     kind: 'passive', desc: '生命上限提升', val: '+15%', eff: { hpPct: 0.15 } },
  { route: 'gongde', lv: 3, id: 'gongde_3', name: '金身',     kind: 'passive', desc: '减伤', val: '15%', eff: { dmgReduct: 0.15 } },
  { route: 'gongde', lv: 4, id: 'gongde_4', name: '禅心',     kind: 'passive', desc: '受控时间缩短', val: '-50%', eff: { ccResist: 0.50 } },
  { route: 'gongde', lv: 5, id: 'gongde_5', name: '业力',     kind: 'passive', desc: '反弹所受伤害', val: '反弹 20%', eff: { reflect: 0.20 } },
  { route: 'gongde', lv: 6, id: 'gongde_6', name: '金身不灭', kind: 'active', cd: 90, desc: '无敌', val: '3s', eff: { invuln: 3 } },

  // ——— 异变组 · 丧尸 ———
  { route: 'sangshi', lv: 1, id: 'sangshi_1', name: '嗜血',     kind: 'passive', desc: '吸血', val: '5%', eff: { lifesteal: 0.05 } },
  { route: 'sangshi', lv: 2, id: 'sangshi_2', name: '腐肉',     kind: 'passive', desc: '击杀额外基因', val: '+5%', eff: { geneBonus: 0.05 } },
  { route: 'sangshi', lv: 3, id: 'sangshi_3', name: '尸爆',     kind: 'passive', desc: '死亡敌人爆炸', val: '攻×0.6 / 范围 120pt', eff: { corpseBlastMul: 0.6, radius: 120 } },
  { route: 'sangshi', lv: 4, id: 'sangshi_4', name: '尸毒',     kind: 'passive', desc: '攻击附带中毒（持续伤害）', val: '3s 内 攻×0.3', eff: { dotMul: 0.3, dotDuration: 3 } },
  { route: 'sangshi', lv: 5, id: 'sangshi_5', name: '尸潮',     kind: 'active', cd: 45, desc: '召唤丧尸', val: '2 只 / 15s', eff: { summon: 2, summonDuration: 15 } },
  { route: 'sangshi', lv: 6, id: 'sangshi_6', name: '尸山血海', kind: 'active', cd: 90, desc: '召唤尸潮', val: '10 只 / 20s', eff: { summon: 10, summonDuration: 20 } },

  // ——— 异变组 · 共生 ———
  { route: 'gongsheng', lv: 1, id: 'gongsheng_1', name: '汲取',     kind: 'passive', desc: '攻击吸取敌方攻速', val: '3% / 次', eff: { aspdSteal: 0.03 } },
  { route: 'gongsheng', lv: 2, id: 'gongsheng_2', name: '菌毯',     kind: 'passive', desc: '站立回血', val: '+1% 最大生命/s', eff: { regen: 0.01 } },
  { route: 'gongsheng', lv: 3, id: 'gongsheng_3', name: '寄生',     kind: 'passive', desc: '击杀精英概率反水', val: '15%', eff: { parasiteChance: 0.15 } },
  { route: 'gongsheng', lv: 4, id: 'gongsheng_4', name: '增殖',     kind: 'passive', desc: '生命提升 + 受伤降低', val: '+10% / -10%', eff: { hpPct: 0.10, dmgReduct: 0.10 } },
  { route: 'gongsheng', lv: 5, id: 'gongsheng_5', name: '母体分裂', kind: 'passive', desc: '死亡时分裂继续战斗', val: '2 核心 / 一局 1 次', eff: { extraLife: 1 } },
  { route: 'gongsheng', lv: 6, id: 'gongsheng_6', name: '共生体',   kind: 'passive', desc: '双核心协同', val: '伤害 +50%', eff: { dmgPct: 0.50 } },

  // ——— 武炼组 · 侠客 ———
  { route: 'xiake', lv: 1, id: 'xiake_1', name: '精准',     kind: 'passive', desc: '暴击率提升', val: '+5%', eff: { crit: 0.05 } },
  { route: 'xiake', lv: 2, id: 'xiake_2', name: '连击',     kind: 'passive', desc: '第 3 击增伤', val: '+30%', eff: { comboEvery: 3, comboDmgPct: 0.30 } },
  { route: 'xiake', lv: 3, id: 'xiake_3', name: '连招',     kind: 'passive', desc: '连续攻击递增增伤', val: '叠至 +50%', eff: { rampMax: 0.50 } },
  { route: 'xiake', lv: 4, id: 'xiake_4', name: '身法',     kind: 'passive', desc: '闪避后攻速提升', val: '1s 内 +30%', eff: { dodgeAspd: 0.30 } },
  { route: 'xiake', lv: 5, id: 'xiake_5', name: '剑气',     kind: 'passive', desc: '远程剑气（可暴击）', val: '攻×0.8', eff: { rangedMul: 0.8 } },
  { route: 'xiake', lv: 6, id: 'xiake_6', name: '万剑归宗', kind: 'active', cd: 60, desc: '剑气风暴', val: '3s，每秒 攻×1.2', eff: { aoeMul: 1.2, duration: 3 } },

  // ——— 武炼组 · 山海 ———
  { route: 'shanhai', lv: 1, id: 'shanhai_1', name: '巨躯',     kind: 'passive', desc: '体型 + 生命提升', val: '+10% / +10%', eff: { size: 0.10, hpPct: 0.10 } },
  { route: 'shanhai', lv: 2, id: 'shanhai_2', name: '兽皮',     kind: 'passive', desc: '减伤', val: '5%', eff: { dmgReduct: 0.05 } },
  { route: 'shanhai', lv: 3, id: 'shanhai_3', name: '践踏',     kind: 'passive', desc: '攻击附带范围震击', val: '攻×0.5 / 范围 80pt', eff: { splashMul: 0.5, radius: 80 } },
  { route: 'shanhai', lv: 4, id: 'shanhai_4', name: '蛮力',     kind: 'passive', desc: '攻击提升', val: '+15%', eff: { atkPct: 0.15 } },
  { route: 'shanhai', lv: 5, id: 'shanhai_5', name: '兽魂',     kind: 'passive', desc: '暴击 + 体型提升', val: '+15% / +10%', eff: { crit: 0.15, size: 0.10 } },
  { route: 'shanhai', lv: 6, id: 'shanhai_6', name: '饕餮巨口', kind: 'active', cd: 45, desc: '吞噬小怪回血', val: '5s 内 每只 +5% 生命', eff: { devourHealPct: 0.05, duration: 5 } },

  // ——— 诡术组 · 魔法 ———
  { route: 'mofa', lv: 1, id: 'mofa_1', name: '弹幕',     kind: 'passive', desc: '弹幕数量 +1', val: '+1', eff: { projectiles: 1 } },
  { route: 'mofa', lv: 2, id: 'mofa_2', name: '奥术涌动', kind: 'passive', desc: '攻速提升', val: '+15%', eff: { aspdPct: 0.15 } },
  { route: 'mofa', lv: 3, id: 'mofa_3', name: '元素附加', kind: 'passive', desc: '攻击附带火/冰效果', val: '灼烧 / 减速', eff: { elemental: 1 } },
  { route: 'mofa', lv: 4, id: 'mofa_4', name: '法力共鸣', kind: 'passive', desc: '击杀减技能 CD', val: '-10%', eff: { killCdRefund: 0.10 } },
  { route: 'mofa', lv: 5, id: 'mofa_5', name: '法术暴击', kind: 'passive', desc: '法术暴击率提升', val: '+10%', eff: { crit: 0.10 } },
  { route: 'mofa', lv: 6, id: 'mofa_6', name: '禁咒',     kind: 'active', cd: 60, desc: '全屏奥术爆发', val: '攻×2.0', eff: { burstMul: 2.0 } },

  // ——— 诡术组 · 奇技 ———
  { route: 'qiji', lv: 1, id: 'qiji_1', name: '机关哨兵', kind: 'active', cd: 30, desc: '召唤机关鼠助战', val: '继承 30% 属性', eff: { summon: 1, inherit: 0.30 } },
  { route: 'qiji', lv: 2, id: 'qiji_2', name: '机壳',     kind: 'passive', desc: '减伤', val: '8%', eff: { dmgReduct: 0.08 } },
  { route: 'qiji', lv: 3, id: 'qiji_3', name: '陷阱',     kind: 'active', cd: 20, desc: '放置爆炸陷阱', val: '攻×0.8 / 范围 100pt', eff: { trapMul: 0.8, radius: 100 } },
  { route: 'qiji', lv: 4, id: 'qiji_4', name: '齿轮',     kind: 'passive', desc: '攻速提升', val: '+10%', eff: { aspdPct: 0.10 } },
  { route: 'qiji', lv: 5, id: 'qiji_5', name: '傀儡分身', kind: 'active', cd: 60, desc: '分身助战', val: '继承 50% / 20s', eff: { summon: 1, inherit: 0.50, summonDuration: 20 } },
  { route: 'qiji', lv: 6, id: 'qiji_6', name: '天工开物', kind: 'active', cd: 90, desc: '机关大军', val: '5 单位 / 20s', eff: { summon: 5, summonDuration: 20 } },

  // ——— 钢铁组 · 机甲 ———
  { route: 'jijia', lv: 1, id: 'jijia_1', name: '速射',     kind: 'passive', desc: '射程 + 攻速提升', val: '+30% / +20%', eff: { range: 0.30, aspdPct: 0.20 } },
  { route: 'jijia', lv: 2, id: 'jijia_2', name: '装甲',     kind: 'passive', desc: '生命提升', val: '+20%', eff: { hpPct: 0.20 } },
  { route: 'jijia', lv: 3, id: 'jijia_3', name: '护盾',     kind: 'passive', desc: '周期护盾吸收伤害', val: '每 20s / 吸收 攻×2', eff: { shieldMul: 2, shieldEvery: 20 } },
  { route: 'jijia', lv: 4, id: 'jijia_4', name: '锁定',     kind: 'passive', desc: '暴击率提升', val: '+10%', eff: { crit: 0.10 } },
  { route: 'jijia', lv: 5, id: 'jijia_5', name: '导弹',     kind: 'passive', desc: '周期导弹齐射', val: '每 10s / 攻×1.5', eff: { missileMul: 1.5, missileEvery: 10 } },
  { route: 'jijia', lv: 6, id: 'jijia_6', name: '高达合体', kind: 'active', cd: 90, desc: '变身巨型机甲', val: '8s / 全属性 +50%', eff: { allStatsPct: 0.50, duration: 8, form: 1 } },

  // ——— 钢铁组 · 巨化 ———
  { route: 'juhua', lv: 1, id: 'juhua_1', name: '长臂',     kind: 'passive', desc: '攻击范围提升', val: '+20%', eff: { range: 0.20 } },
  { route: 'juhua', lv: 2, id: 'juhua_2', name: '巨骨',     kind: 'passive', desc: '生命提升', val: '+25%', eff: { hpPct: 0.25 } },
  { route: 'juhua', lv: 3, id: 'juhua_3', name: '震地',     kind: 'passive', desc: '攻击附带范围震击', val: '攻×0.6', eff: { splashMul: 0.6 } },
  { route: 'juhua', lv: 4, id: 'juhua_4', name: '踏碎',     kind: 'passive', desc: '对精英增伤', val: '+20%', eff: { vsEliteDmgPct: 0.20 } },
  { route: 'juhua', lv: 5, id: 'juhua_5', name: '顶天',     kind: 'passive', desc: '体型 + 减伤提升', val: '+30% / -10%', eff: { size: 0.30, dmgReduct: 0.10 } },
  { route: 'juhua', lv: 6, id: 'juhua_6', name: '顶天立地', kind: 'active', cd: 90, desc: '巨神形态', val: '10s / 生命 +100% / 全屏攻击', eff: { hpPct: 1.0, aoe: 1, duration: 10, form: 1 } },
];

/** 某路线的 6 段技能（按段位升序） */
export function skillsByRoute(route) {
  return skills.filter((s) => s.route === route).sort((a, b) => a.lv - b.lv);
}

export function findSkill(id) {
  return skills.find((s) => s.id === id);
}
