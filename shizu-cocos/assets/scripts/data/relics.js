// ===== data/relics.js · 传承残影（碎片化叙事载体）=====
// 每个位面一位强者，被巢灵吞噬后留下「残影」——唯一的长篇文本载体（内容策划 4.2）。

/** @typedef {{ id: string, name: string, story: string, rare?: boolean }} Relic */

export const RELICS = {
  relic_jiguan: {
    id: 'relic_jiguan',
    name: '机械之心',
    story: '机关城的守城巨像轰然倒下。我吞下了它的发条心脏——齿轮依旧在胃里转着，像在数一段早已停摆的时间。',
  },
  relic_aofa: {
    id: 'relic_aofa',
    name: '秘法王冠',
    story: '秘法王的王冠上，每一颗宝石都囚禁着一个被焚尽的念头。我戴上它，听见万千魔法师最后的咏唱。',
  },
  relic_qiqiao: {
    id: 'relic_qiqiao',
    name: '百机密钥',
    story: '百机王临死前吐出一把钥匙。它说：迷宫没有出口，只有下一道门。',
  },
  relic_dujie: {
    id: 'relic_dujie',
    name: '雷劫残响',
    story: '雷劫神君散作漫天电弧。我吞下最后一道雷——它在我体内炸开，说：渡劫者，终是劫本身。',
  },
  relic_gongde: {
    id: 'relic_gongde',
    name: '金身舍利',
    story: '金身佛陀圆寂，留下舍利。我吞下它，万千功德如潮水涌来——可潮水里，也漂着众生的欲。',
  },
  relic_shihai: {
    id: 'relic_shihai',
    name: '湮灭者之核',
    story: '湮灭者倒下时，绿色的核还在跳动。它说：末日不是天灾，是每一个放弃抵抗的瞬间。',
  },
  relic_gongshengchao: {
    id: 'relic_gongshengchao',
    name: '万生之种',
    story: '万生母体枯萎，留下最后一枚卵。它贴着我低语：共生的尽头，是谁在吞谁？',
  },
  relic_wuxia: {
    id: 'relic_wuxia',
    name: '无名剑骨',
    story: '剑圣无名的剑折断了，剑骨却不肯碎。它说：我一生求剑，到头来，剑就是我。',
  },
  relic_shanhai: {
    id: 'relic_shanhai',
    name: '饕餮残齿',
    story: '饕餮的牙齿崩了一地。它笑着咽下最后一口气：你和我一样，永远吃不饱。',
  },
  relic_jijia: {
    id: 'relic_jijia',
    name: '零式核心',
    story: '零式的核心滚到我面前，屏上跳出一行字：任务……进食……永续……',
  },
  relic_jushen: {
    id: 'relic_jushen',
    name: '泰坦之眼',
    story: '泰坦巨人倒下，独眼望天。它说：站得再高，也够不到天。可天，就是用来碎的。',
  },
  relic_benghuaixin: {
    id: 'relic_benghuaixin',
    name: '崩坏之心',
    story: '这不是天灾。崩坏之心，是诸天强者们吞吃彼此时，积下的每一分贪欲。我吞下它，听见了所有位面的声音。',
  },
};

/** 稀有传承：位面强者的另一段记忆（罕见掉落） */
export function rareRelicOf(planeId) {
  const base = RELICS[`relic_${planeId}`];
  if (!base) return null;
  return {
    id: `relic_rare_${planeId}`,
    name: `${base.name}·残响`,
    story: `（稀有）${base.story} 这一次，残影把没说完的那句也吐了出来。`,
    rare: true,
  };
}

export function relicById(id) {
  if (RELICS[id]) return RELICS[id];
  for (const p of Object.keys(RELICS)) {
    const m = /^relic_(.+)$/.exec(id);
    if (m) {
      const r = rareRelicOf(m[1]);
      if (r && r.id === id) return r;
    }
  }
  return { id, name: '未知传承', story: '一段尚未被读懂的残影。', rare: false };
}