// ===== data/relics.js · 传承残影（碎片化叙事载体 + 永久被动）=====
// 每个位面一位强者，被巢灵吞噬后留下「残影」——唯一的长篇文本载体（内容策划 4.2）。
//
// 传承同时是**永久被动**：吞下的强者基因必须体现在战斗里，否则「收集」没有回报。
// 设计约束：
//   · 单件幅度小（4%-20%），12 件全收齐才约等于一条中等成长线，不抢局内构筑的主角位。
//   · 效果走 run.js 开局装载，与装备/永久属性同口径，不新增隐形碾压常量。
//   · 稀有残响 = 同效果 ×2（罕见掉落的价值体现）。

/** @typedef {{ id: string, name: string, story: string, eff?: object, rare?: boolean }} Relic */

export const RELICS = {
  relic_jiguan: {
    id: 'relic_jiguan',
    name: '机械之心',
    story: '机关城的守城巨像轰然倒下。我吞下了它的发条心脏——齿轮依旧在胃里转着，像在数一段早已停摆的时间。',
    eff: { aspdPct: 0.05 },
  },
  relic_aofa: {
    id: 'relic_aofa',
    name: '秘法王冠',
    story: '秘法王的王冠上，每一颗宝石都囚禁着一个被焚尽的念头。我戴上它，听见万千魔法师最后的咏唱。',
    eff: { aoe: 0.08 },
  },
  relic_qiqiao: {
    id: 'relic_qiqiao',
    name: '百机密钥',
    story: '百机王临死前吐出一把钥匙。它说：迷宫没有出口，只有下一道门。',
    eff: { cooldownPct: 0.06 },
  },
  relic_dujie: {
    id: 'relic_dujie',
    name: '雷劫残响',
    story: '雷劫神君散作漫天电弧。我吞下最后一道雷——它在我体内炸开，说：渡劫者，终是劫本身。',
    eff: { crit: 0.04 },
  },
  relic_gongde: {
    id: 'relic_gongde',
    name: '金身舍利',
    story: '金身佛陀圆寂，留下舍利。我吞下它，万千功德如潮水涌来——可潮水里，也漂着众生的欲。',
    eff: { dmgReduct: 0.04 },
  },
  relic_shihai: {
    id: 'relic_shihai',
    name: '湮灭者之核',
    story: '湮灭者倒下时，绿色的核还在跳动。它说：末日不是天灾，是每一个放弃抵抗的瞬间。',
    eff: { execute: 0.1 },
  },
  relic_gongshengchao: {
    id: 'relic_gongshengchao',
    name: '万生之种',
    story: '万生母体枯萎，留下最后一枚卵。它贴着我低语：共生的尽头，是谁在吞谁？',
    eff: { regen: 0.005 },
  },
  relic_wuxia: {
    id: 'relic_wuxia',
    name: '无名剑骨',
    story: '剑圣无名的剑折断了，剑骨却不肯碎。它说：我一生求剑，到头来，剑就是我。',
    eff: { critDmg: 0.15 },
  },
  relic_shanhai: {
    id: 'relic_shanhai',
    name: '饕餮残齿',
    story: '饕餮的牙齿崩了一地。它笑着咽下最后一口气：你和我一样，永远吃不饱。',
    eff: { lifesteal: 0.02 },
  },
  relic_jijia: {
    id: 'relic_jijia',
    name: '零式核心',
    story: '零式的核心滚到我面前，屏上跳出一行字：任务……进食……永续……',
    eff: { atkPct: 0.05 },
  },
  relic_jushen: {
    id: 'relic_jushen',
    name: '泰坦之眼',
    story: '泰坦巨人倒下，独眼望天。它说：站得再高，也够不到天。可天，就是用来碎的。',
    eff: { hpPct: 0.06 },
  },
  relic_benghuaixin: {
    id: 'relic_benghuaixin',
    name: '崩坏之心',
    story: '这不是天灾。崩坏之心，是诸天强者们吞吃彼此时，积下的每一分贪欲。我吞下它，听见了所有位面的声音。',
    eff: { atkPct: 0.08, hpPct: 0.08 },
  },
};

/** 稀有传承：位面强者的另一段记忆（罕见掉落，效果 ×2） */
export function rareRelicOf(planeId) {
  const base = RELICS[`relic_${planeId}`];
  if (!base) return null;
  const eff = {};
  for (const [k, v] of Object.entries(base.eff ?? {})) eff[k] = v * 2;
  return {
    id: `relic_rare_${planeId}`,
    name: `${base.name}·残响`,
    story: `（稀有）${base.story} 这一次，残影把没说完的那句也吐了出来。`,
    eff,
    rare: true,
  };
}

export function relicById(id) {
  if (RELICS[id]) return RELICS[id];
  const m = /^relic_rare_(.+)$/.exec(id);
  if (m) {
    const r = rareRelicOf(m[1]);
    if (r) return r;
  }
  return { id, name: '未知传承', story: '一段尚未被读懂的残影。', eff: {}, rare: false };
}

/**
 * 汇总已收集传承的永久被动。
 * @param {string[]} ids 存档里的 inventory.relics
 */
export function aggregateRelicEff(ids) {
  const out = {};
  for (const id of ids ?? []) {
    const r = relicById(id);
    for (const [k, v] of Object.entries(r.eff ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}