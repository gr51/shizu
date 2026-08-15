// ===== Types.ts · 数据类型（与开发实现指南 SaveData 一致）=====

export type RouteId = 'dujie' | 'gongde' | 'sangshi' | 'gongsheng' | 'xiake' | 'shanhai' | 'mofa' | 'qiji' | 'jijia' | 'juhua';
export type DifficultyLevel = '简单' | '中等' | '困难';
export type GearSlotId = 'claw' | 'shell' | 'crown' | 'legs' | 'core' | 'trinket';
export type GearRarity = '白' | '绿' | '蓝' | '紫' | '金';
export type SkillKind = 'active' | 'passive';
export type AffixKey = 'atk' | 'hp' | 'speed' | 'crit' | 'aspd' | 'lifesteal' | 'dmgReduct' | 'regen' | 'cooldown' | 'suckRadius';

export interface SkillSlot {
  skillName: string;        // 技能名（技能表 / 隐藏技能表）
  kind: SkillKind;
  hidden: boolean;          // true = 隐藏技能永久刻印，不可被局内替换
  route: RouteId | null;
}

export interface GearAffix {
  key: AffixKey;
  value: number;            // 加成比例（0.05 = +5%）
  weight: number;           // 标准词条价值
  desc: string;
}

export interface GearItem {
  uid: string;
  slot: GearSlotId;
  rarity: GearRarity;
  star: number;             // 强化星数 0-5
  affixes: GearAffix[];
  name: string;             // 展示名
}

export interface SaveData {
  version: number;
  player: {
    nestlingName: string;
    totalRuns: number;
    wins: number;
    consecFails: number;
    difficultyLevel: DifficultyLevel;
    dynFactor: number;                 // 动态难度系数 0.70~1.50
    permAtkPct: number;                // 永久攻击加成（0.02 = +2%）
    permHpPct: number;
    permSpeedPct: number;
    geneLocks: Partial<Record<RouteId, number>>;  // 路线 → 段数 0-6
    sealedRoutes: RouteId[];           // 永久封印路线
    skillSlots: {
      activeA: SkillSlot | null;
      activeB: SkillSlot | null;
      passiveC: SkillSlot | null;
      passiveD: SkillSlot | null;
    };
    gear: Partial<Record<GearSlotId, GearItem>>;  // 已装备
    gearBag: GearItem[];               // 背包
    gearEssence: number;               // 装备精华
  };
  inventory: {
    genes: number;
    relics: string[];                  // 传承
    comboSkills: string[];             // 超低概率技能
    hiddenSkills: string[];            // 已获得隐藏技能
  };
  stats: {
    relicPity: number;
    legendPity: number;
    hiddenPity: number;
    gearPity: number;
    firstClear: boolean;               // 首通诸天之心
    endlessUnlocked: boolean;
    achievementFlags: Record<string, boolean>;
  };
}
