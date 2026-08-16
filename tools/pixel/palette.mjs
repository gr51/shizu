// ===== pixel/palette.mjs · 全局调色板 =====
// 像素画的成败先在调色板。这里把《美术资产设计规范》的硬规则编码成数据：
//
//   规则 2「克制配色」：全图主色 ≤ 3 + 强调色 ≤ 1，禁止彩虹
//   规则 4「统一光源」：主光左上 45°，轮廓光统一青色 #5fb8a6
//   规则 10「统一后期」：深青 + 琥珀双色调，与 UI 配色 #0d1013/#5fb8a6/#d8bd6a 对齐
//
// 每种颜色给一条 4 阶「色阶」（ramp）：[暗部, 中间调, 亮部, 高光]。
// 像素画不做平滑渐变，只在这 4 阶之间跳 —— 这正是像素风「干净」的来源。

/** '#rrggbb' → [r,g,b,255] */
export const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  255,
];

export const TRANSPARENT = [0, 0, 0, 0];

/** 描边色：所有单位共用同一根最深的线，保证剪影统一（规则 1） */
export const INK = rgb('#05070a');

/** 4 阶色阶。索引 0=暗 1=中 2=亮 3=高光 */
const ramp = (...hexes) => hexes.map(rgb);

export const P = {
  // —— 底色 / 环境（低饱和，永远不抢戏。规则 3 / 8）——
  void: ramp('#05070a', '#0d1013', '#151a1f', '#1f272e'),
  stone: ramp('#141a1f', '#232c34', '#3d4852', '#5a6874'),

  // —— 青：基因 / 能量 / 轮廓光（唯一强调色之一）——
  teal: ramp('#12352f', '#2f7d6c', '#5fb8a6', '#a8e6d6'),

  // —— 琥珀：UI / 里程碑 / 暴击（唯一强调色之二）——
  amber: ramp('#3a2a0e', '#8a6a2a', '#d8bd6a', '#f6ecc4'),

  // —— 玩家甲壳：最亮，规则 7 可读性层级顶端。乳白珍珠（不是棕，棕会像「屎」）——
  shell: ramp('#32302c', '#8a847a', '#d6cfc2', '#f7f3ea'),

  // —— 危险 / 受击 / 血 ——
  blood: ramp('#2e0d15', '#7a2434', '#c9556a', '#eda3ac'),

  // —— 阵营色（每个只用一条，避免彩虹。规则 5 形状语言的配色侧）——
  brass: ramp('#3a2a10', '#8a6a28', '#c9a24a', '#efd899'),   // 诡术·机关：黄铜
  arcane: ramp('#1d1040', '#4a2f8a', '#8a6ae0', '#c9b0f5'),  // 诡术·奥法：奥术紫
  thunder: ramp('#241046', '#5a2f9a', '#a877ee', '#e0ccff'), // 仙途·渡劫：雷紫
  merit: ramp('#3d2c0a', '#96762a', '#e0c46a', '#f8edc0'),   // 仙途·功德：金
  rot: ramp('#101a10', '#37502c', '#6d8f4e', '#a8c47a'),     // 异变·尸海：腐绿
  spore: ramp('#2e1024', '#7a2f5e', '#c96aa0', '#eeb0d2'),   // 异变·共生：孢子粉
  ink: ramp('#12181c', '#3a4a4e', '#7d9296', '#c2d2d4'),     // 武炼·武侠：水墨
  beast: ramp('#2a1408', '#7a4020', '#b8763a', '#e0b184'),   // 武炼·山海：赤褐
  steel: ramp('#0d1626', '#2c4a70', '#5b9bd5', '#a8d2f2'),   // 钢铁·机甲：银蓝
  titan: ramp('#232e36', '#566674', '#96a8b4', '#dbe6ec'),   // 钢铁·巨神：石白
  chaos: ramp('#150a20', '#3d1f5e', '#7d4ab0', '#c49aec'),   // 诸天：崩坏紫

  // —— 稀有度（装备框，规则 9 色编码）——
  rWhite: ramp('#3a3f44', '#767d84', '#b9c0c6', '#e8ecef'),
  rGreen: ramp('#153a15', '#3d7a3d', '#6db76d', '#b0dfb0'),
  rBlue: ramp('#0f2a45', '#2f6296', '#5b9bd5', '#a8d0f0'),
  rPurple: ramp('#2a1440', '#6a44a0', '#a678d4', '#d8bcf0'),
  rGold: ramp('#3a2a0e', '#8a6a2a', '#d8bd6a', '#f6ecc4'),
};

/** 轮廓光颜色（规则 4：统一青色 rim light） */
export const RIM = P.teal[2];

/**
 * 位面 → 主色阶。位面之间只换这一条色阶，
 * 保证 12 张背景是「同一套后期下的变奏」，而不是 12 种画风（规则 10）。
 */
export const PLANE_PALETTE = {
  jiguan: P.brass,
  aofa: P.arcane,
  qiqiao: P.brass,
  dujie: P.thunder,
  gongde: P.merit,
  shihai: P.rot,
  gongshengchao: P.spore,
  wuxia: P.ink,
  shanhai: P.beast,
  jijia: P.steel,
  jushen: P.titan,
  zhutian: P.chaos,
};

/** 路线 → 色阶（图鉴图标 / 巢灵皮肤用） */
export const ROUTE_PALETTE = {
  dujie: P.thunder,
  gongde: P.merit,
  sangshi: P.rot,
  gongsheng: P.spore,
  xiake: P.ink,
  shanhai: P.beast,
  mofa: P.arcane,
  qiji: P.brass,
  jijia: P.steel,
  juhua: P.titan,
};
