// ===== data/planeModules.js · 位面插件注册表 =====
// 目标：**一个位面 = 一个可插拔模块**。进入事件 / 技能路线 / 美术资产 /
// 敌人资产 / 机制招牌 / Boss 全部在此声明——加新位面 = 加一段模块配置 +
// 资产落盘，不再散落 core 各处。
//
// 分层约定：
//   · 本文件只放**数据与查询门面**，零战斗逻辑
//   · core/battle.js 从这里 import 并 re-export（旧测试兼容）
//   · getPlaneModule(id) 是外部工具（截图/审计/生成器）的统一入口

import { planes } from './planes.js';

// —— 敌人资产：每阶段刷的小怪 sprite（每阶段一对，5 阶段各不同）——
export const MINION_SPRITE_BY_STAGE = {
  jiguan: [['jixie_xie', 'lu_kuilei'], ['jixie_xie', 'paotai_ji'], ['lu_kuilei', 'paotai_ji'], ['jixie_xie', 'lu_kuilei'], ['paotai_ji', 'jixie_xie']],
  wuxia: [['maozei', 'jiutu'], ['shanzei', 'biaoshi'], ['quanshi', 'gunseng'], ['anqi', 'gongshou'], ['hanfei', 'shashou']],
  aofa: [['yuan_jingling', 'huo_bing'], ['huo_bing', 'bing_yuansu'], ['bing_yuansu', 'aoshu_shicong'], ['aoshu_shicong', 'huo_yao'], ['huo_yao', 'yuan_jingling']],
  qiqiao: [['jiguan_shou', 'fashu_jiguan'], ['fashu_jiguan', 'jing_ling'], ['jing_ling', 'chilun_shou'], ['chilun_shou', 'jiguan_qishi'], ['jiguan_qishi', 'jiguan_shou']],
  dujie: [['lei_jing', 'jianxiu_kuilei'], ['jianxiu_kuilei', 'lei_shou'], ['lei_shou', 'tianlei_zi'], ['tianlei_zi', 'leijie_kuilei'], ['leijie_kuilei', 'lei_jing']],
  gongde: [['jinlian_shicong', 'luohan_wuseng'], ['luohan_wuseng', 'jinlian_wushi'], ['jinlian_wushi', 'chifan_seng'], ['chifan_seng', 'jinjia_lishi'], ['jinjia_lishi', 'jinlian_shicong']],
  shihai: [['sangshi', 'bianyi_quan'], ['bianyi_quan', 'bianyi_shi'], ['bianyi_shi', 'shi_wu'], ['shi_wu', 'fenghe_guai'], ['fenghe_guai', 'sangshi']],
  gongshengchao: [['jishengchong', 'fuhua_chong'], ['fuhua_chong', 'jisheng_zhu'], ['jisheng_zhu', 'fuhua_muti'], ['fuhua_muti', 'gongsheng_jushou'], ['gongsheng_jushou', 'jishengchong']],
  shanhai: [['huangshou', 'jujiao_shou'], ['jujiao_shou', 'huo_shou'], ['huo_shou', 'bing_shou'], ['bing_shou', 'shanyue_shou'], ['shanyue_shou', 'huangshou']],
  jijia: [['shaojie', 'zizou_pao'], ['zizou_pao', 'wuren_ji'], ['wuren_ji', 'zhongzhuang_jijia'], ['zhongzhuang_jijia', 'guidao_paotai'], ['guidao_paotai', 'shaojie']],
  jushen: [['ju_ying', 'shi_juren'], ['shi_juren', 'shuang_juren'], ['shuang_juren', 'duyan_juren'], ['duyan_juren', 'shanling_juren'], ['shanling_juren', 'ju_ying']],
  zhutian: [['weimian_canying', 'ziwo_jingxiang'], ['ziwo_jingxiang', 'benghuai_suipian'], ['benghuai_suipian', 'weimian_jingxiang'], ['weimian_jingxiang', 'xukong_jiti'], ['xukong_jiti', 'weimian_canying']],
};

/** Boss sprite 映射（位面 → boss 名） */
export const BOSS_BY_PLANE = {
  jiguan: 'boss_jiguan',
  wuxia: 'jiansheng', aofa: 'aofa_boss', qiqiao: 'qiqiao_boss', dujie: 'dujie_boss',
  gongde: 'gongde_boss', shihai: 'shihai_boss', gongshengchao: 'gongshengchao_boss',
  shanhai: 'shanhai_boss', jijia: 'jijia_boss', jushen: 'jushen_boss', zhutian: 'zhutian_boss',
};

/** 远程小怪散集：这些 sprite 用远程弹体，其余一律近战 */
export const RANGED_SPRITES = new Set(['anqi', 'gongshou', 'yuan_jingling', 'huo_bing', 'bing_yuansu', 'aoshu_shicong', 'fashu_jiguan', 'jing_ling', 'lei_jing', 'tianlei_zi', 'shi_wu', 'wuren_ji', 'guidao_paotai', 'shaojie', 'zizou_pao', 'benghuai_suipian', 'weimian_canying', 'xukong_jiti', 'paotai_ji']);

// ===== 位面主题机制 =====
// type      = 常驻规则（被动减伤 / 击杀触发 / 伤害乘区），没有周期表现
// signature = 该位面的**周期性招牌事件**：玩家一眼认出「我在哪个位面」靠的是它。
// 12 个位面的 signature 互不相同（机关城单向激光 vs 奇巧镜面双绝、山海践踏 vs 巨神踏步）。
export const PLANE_MECHANICS = {
  jiguan:       { type: 'laser',        interval: 12 },
  aofa:         { type: 'bulletHell',   interval: 10, count: 3 },
  qiqiao:       { type: 'mirrorLaser',  interval: 11 },
  dujie:        { type: 'lightning',    interval: 10 },
  gongde:       { type: 'armor',        factor: 0.3, signature: 'lotus',    interval: 13 }, // 金身减伤 + 金光普照
  shihai:       { type: 'corpseBlast',  radius: 55, mul: 1.3, signature: 'corpseTide', interval: 11 }, // 尸爆连锁 + 尸潮拱地
  gongshengchao:{ type: 'parasite',     chance: 0.12, duration: 5, signature: 'spore', interval: 12 }, // 寄生反水 + 孢子迸散
  wuxia:        { type: 'combo',        mul: 1.2, signature: 'swordQi', interval: 12 },     // 连招增伤 + 剑气纵横
  shanhai:      { type: 'stomp',        interval: 18, radius: 100 },
  jijia:        { type: 'missile',      interval: 14 },
  jushen:       { type: 'titanStep',    interval: 15, radius: 150 },   // 比山海更大更慢
  zhutian:      { type: 'mix',          interval: 10 },                   // 全机制融合
};

/**
 * 插件门面：返回某位面「可插拔」的全部配置切面。
 * 外部系统（渲染/生成器/审计）一律走这里，不直接摸散表。
 * @returns {object|null} null = 未知位面 id
 */
export function getPlaneModule(id) {
  const plane = planes.find((p) => p.id === id);
  if (!plane) return null;
  const codex2 = String(plane.codex).padStart(2, '0');
  return {
    id,
    /** 静态叙事与主题（planes.js） */
    data: plane,
    entry: { poem: plane.poem, theme: plane.theme, bossDesc: plane.bossDesc ?? '' },
    /** Boss 切面 */
    boss: { name: plane.boss, sprite: BOSS_BY_PLANE[id] ?? null, desc: plane.bossDesc ?? '' },
    /** 敌人切面 */
    enemies: {
      stageSprites: MINION_SPRITE_BY_STAGE[id] ?? null,
      ranged: RANGED_SPRITES,
      mechanic: PLANE_MECHANICS[id] ?? null,
    },
    /** 美术切面：相对 assets/art 的路径约定 */
    art: {
      floor: `backgrounds/floor_${id}.png`,
      background: `backgrounds/plane_${codex2}_${id}.png`,
      /** 该位面首条路线的角色形象（未激活位面无皮肤） */
      playerSkin: plane.routes?.[0] ? `units/player_${plane.routes[0]}.png` : null,
    },
    /** 技能切面：本位面通关激活的路线（= 可学技能的来源路线） */
    skillRoutes: plane.routes ?? [],
    /** 音频切面：BGM 调性键（audio.startBgm 按 id 换和声层）；ambience 为可选环境音层标记 */
    audio: { bgm: id, ambience: AMBIENCE_BY_PLANE[id] ?? null },
    /** 危机切面：本位面允许触发的危机子集（教学/主题不合的可剔除） */
    crises: CRISES_BY_PLANE[id] ?? null,   // null = 全部允许
    /** 掉落切面：传承残影加权池——位面主题 relic 在此加成 */
    drops: DROPS_BY_PLANE[id] ?? null,
  };
}

/** 各位面环境音层（web audio.js 的 BGM 强度层之外的氛围标记；Cocos 接入音频时同源消费） */
export const AMBIENCE_BY_PLANE = {
  jiguan: 'steam', aofa: 'arcane', qiqiao: 'musicbox', dujie: 'storm',
  gongde: 'choir', shihai: 'moan', gongshengchao: 'hive', wuxia: 'wind',
  shanhai: 'rumble', jijia: 'engine', jushen: 'quake', zhutian: 'void',
};

/** 各位面允许的危机子集（null = 全部；机关城为教学位面禁用危机） */
export const CRISES_BY_PLANE = {
  jiguan: [],
  dujie: ['crisis_meteor'],              // 渡劫位面只出天雷类危机（主题一致）
  gongde: ['crisis_meteor', 'crisis_swarm'],
  shihai: ['crisis_swarm', 'crisis_frenzy'],
};

/** 位面主题掉落倾向：匹配 relic 的权重加成倍率（其余 relic 基础权重不变） */
export const DROPS_BY_PLANE = {
  jiguan:  {},                          // 机关城无专属 relic，均匀池
  dujie:   { lei_shi_zhi_xin: 2.0 },    // 示例：雷狮之心在渡劫位面双倍权重
};

/** 全部位面模块（按 codex 排序） */
export function listPlaneModules() {
  return planes.map((p) => getPlaneModule(p.id));
}
