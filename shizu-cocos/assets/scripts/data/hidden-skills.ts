// ===== hidden-skills.ts · 隐藏技能（数值平衡表 4.8 禁忌技能）=====

import { RouteId } from '../core/Types';

export interface HiddenSkillConfig {
  name: string; route: RouteId; desc: string;
  eff: Record<string, number>;
}

export const hiddenSkills: HiddenSkillConfig[] = [
  { name: '禁忌·天劫降临', route: 'dujie',    desc: '攻击附带全屏雷罚（攻×1.5）', eff: { bonusAtk: 1.5 } },
  { name: '禁忌·万佛朝宗', route: 'gongde',   desc: '击杀全体回血 +10%，金身常驻', eff: { killHeal: 0.10, dmgReduct: 0.20 } },
  { name: '禁忌·尸山',     route: 'sangshi',  desc: '尸爆伤害 +100% 且吸血',     eff: { explode: 1.2 } },
  { name: '禁忌·万物共生', route: 'gongsheng',desc: '双核心协同，伤害 +100%',    eff: { dmgPct: 1.0 } },
  { name: '禁忌·无双',     route: 'xiake',    desc: '连招无上限，第 5 击翻倍',   eff: { ramping: 1.0 } },
  { name: '禁忌·饕餮真身', route: 'shanhai',  desc: '体型 +100%，践踏范围 +100%', eff: { splash: 1.0, size: 1.0 } },
  { name: '禁忌·大禁咒',   route: 'mofa',     desc: '弹幕翻倍，技能冷却 -50%',   eff: { proj: 1, cooldown: 0.5 } },
  { name: '禁忌·天工',     route: 'qiji',     desc: '机关单位继承 +100% 属性',   eff: { summon: 2 } },
  { name: '禁忌·永恒高达', route: 'jijia',    desc: '高达合体无冷却常驻护盾',    eff: { buff: 0.8 } },
  { name: '禁忌·顶天',     route: 'juhua',    desc: '巨神形态无冷却，全屏攻击',  eff: { splash: 0.8 } },
];

export function findHiddenSkill(name: string): HiddenSkillConfig | undefined {
  return hiddenSkills.find((h) => h.name === name);
}
