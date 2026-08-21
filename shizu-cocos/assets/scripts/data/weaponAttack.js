// ===== data/weaponAttack.js · 武器 → 攻击视觉（攻击表现设计 v2.0）=====
// 攻击表现 = 武器的身份签名：剑=剑气、枪=子弹、雷=雷电、法杖=魔法弹……
// 玩家当前武器由「基因锁等级最高的路线」决定；未激活路线 = 默认剑气（巢灵本体）。

/** @typedef {{ projectile: string, color: string, pattern: 'single'|'line'|'circle'|'aoe' }} WeaponAttack */

/** 路线 → 武器（projectile=弹体图，pattern=攻击方式：single单体/line直线/circle环绕/aoe溅射） */
export const WEAPON_ATTACK = {
  dujie:     { projectile: 'lightning',      color: '#c9b8ff', pattern: 'circle' },  // 雷·环绕
  gongde:    { projectile: 'shockwave_gold', color: '#d8bd6a', pattern: 'aoe' },     // 金身·溅射
  xiake:     { projectile: 'sword_qi',       color: '#b8e6d0', pattern: 'line' },    // 剑·直线
  shanhai:   { projectile: 'stomp_wave',     color: '#c98a5a', pattern: 'circle' },  // 山海·践踏
  mofa:      { projectile: 'magic_orb',      color: '#d8a3d8', pattern: 'aoe' },     // 魔法·弹幕
  qiji:      { projectile: 'gear_blade',     color: '#d8bd6a', pattern: 'line' },    // 机关·飞刃
  jijia:     { projectile: 'bullet',         color: '#9ab8d8', pattern: 'single' },  // 机甲·单点速射
  juhua:     { projectile: 'quake_wave',     color: '#9a948a', pattern: 'circle' },  // 巨化·震荡
  sangshi:   { projectile: 'miasma',         color: '#8a9a6a', pattern: 'aoe' },     // 丧尸·毒雾
  gongsheng: { projectile: 'tendril',        color: '#c98ad8', pattern: 'single' },  // 共生·刺击
};

/** 默认武器（未激活任何路线）：巢灵本体冲击（小范围溅射） */
export const DEFAULT_WEAPON = { projectile: 'sword_qi', color: '#b8e6d0', pattern: 'aoe' };

/**
 * 取基因锁等级最高的路线（等级相同取先出现者；全 0 返回 null）。
 * @param {{ [routeId: string]: number }} geneLocks
 */
export function highestRoute(geneLocks) {
  let best = null;
  let bestLv = 0;
  for (const [route, lv] of Object.entries(geneLocks ?? {})) {
    if (lv > bestLv) { bestLv = lv; best = route; }
  }
  return best;
}

/**
 * 玩家当前武器：优先 use 指定的出征路线（出征武器），否则取基因锁等级最高的路线。
 * @param {{ [routeId: string]: number }} geneLocks
 * @param {string|null} [preferredRoute] 玩家主动选定的出征路线
 */
export function currentWeapon(geneLocks, preferredRoute = null) {
  const route = preferredRoute && (geneLocks?.[preferredRoute] ?? 0) > 0
    ? preferredRoute
    : highestRoute(geneLocks);
  return route ? WEAPON_ATTACK[route] ?? DEFAULT_WEAPON : DEFAULT_WEAPON;
}

/**
 * 玩家当前进化形态（皮肤）：优先出征路线，否则取「基因锁等级最高」的路线 id；
 * 无激活路线返回 null（基础形态）。皮肤 sprite 对应 units/player_<route>.png。
 */
export function currentSkin(geneLocks, preferredRoute = null) {
  const route = preferredRoute && (geneLocks?.[preferredRoute] ?? 0) > 0
    ? preferredRoute
    : highestRoute(geneLocks);
  return route ?? null;
}

/**
 * 路线 → 战斗机制（每条路线一种独特玩法，不是换皮）。
 * combo 连击连招 / chain 雷链弹射 / corpseBlast 尸爆连锁 / missile 周期导弹 /
 * multishot 弹幕翻倍 / parasite 寄生反水 / reflect 金身反击 / stomp 践踏震荡 / laser 机关激光
 */
export const ROUTE_MECHANIC = {
  dujie: 'chain',
  gongde: 'reflect',
  xiake: 'combo',
  shanhai: 'stomp',
  mofa: 'multishot',
  qiji: 'laser',
  jijia: 'missile',
  juhua: 'stomp',
  sangshi: 'corpseBlast',
  gongsheng: 'parasite',
};

/**
 * 玩家当前路线机制（优先出征路线，否则取基因锁等级最高的路线），无则 null。
 */
export function currentRouteMech(geneLocks, preferredRoute = null) {
  const route = preferredRoute && (geneLocks?.[preferredRoute] ?? 0) > 0
    ? preferredRoute
    : highestRoute(geneLocks);
  return route ? ROUTE_MECHANIC[route] ?? null : null;
}
