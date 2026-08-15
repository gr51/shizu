// ===== upgrade/SkillSlotSystem.js · 技能槽位与隐藏技能（开发指南 十章）=====
// 局内技能槽：主动×2（activeA/B）+ 被动×2（passiveC/D）。
// 普通技能为局内临时；隐藏技能 = 永久刻印（跨局，hidden:true 不可被局内替换）。

/** 槽位键顺序（用于路由与展示） */
export const SLOT_KEYS = ['activeA', 'activeB', 'passiveC', 'passiveD'];

/** 隐藏技能表（数值平衡表 4.8 · 10 路线各 1，匹配位面专属掉落） */
export const HIDDEN_SKILLS = {
  tianjie:   { id: 'tianjie',   route: 'dujie',     kind: 'active',  name: '禁忌·天劫降临', desc: '全屏雷劫且自身 2s 免伤', slotPrefer: 'activeA' },
  wanfo:     { id: 'wanfo',     route: 'gongde',    kind: 'passive', name: '禁忌·万佛朝宗', desc: '受击 20% 概率全屏超度（攻×1.5）', slotPrefer: 'passiveC' },
  shishan:   { id: 'shishan',   route: 'sangshi',   kind: 'passive', name: '禁忌·尸山',     desc: '尸爆范围 ×2，击杀额外生成 1 只永久丧尸', slotPrefer: 'passiveC' },
  wansheng:  { id: 'wansheng',  route: 'gongsheng', kind: 'passive', name: '禁忌·万物共生', desc: '寄生成功率 100%，被寄生小怪永久反水', slotPrefer: 'passiveC' },
  wushuang:  { id: 'wushuang',  route: 'xiake',     kind: 'passive', name: '禁忌·无双',     desc: '暴击率 +20% 且暴伤 ×2', slotPrefer: 'passiveC' },
  taotie:    { id: 'taotie',    route: 'shanhai',   kind: 'active',  name: '禁忌·饕餮真身', desc: '化饕餮 5s，吞噬一切并回血', slotPrefer: 'activeA' },
  dajinzhou: { id: 'dajinzhou', route: 'mofa',      kind: 'active',  name: '禁忌·大禁咒',   desc: '全屏奥术 ×3 + 冻结 2s', slotPrefer: 'activeA' },
  tiangong:  { id: 'tiangong',  route: 'qiji',      kind: 'passive', name: '禁忌·天工',     desc: '机关单位继承 100% 属性且永续', slotPrefer: 'activeB' },
  gaoda:     { id: 'gaoda',     route: 'jijia',     kind: 'active',  name: '禁忌·永恒高达', desc: '高达合体永久化（无时限）', slotPrefer: 'activeA' },
  dingtian:  { id: 'dingtian',  route: 'juhua',     kind: 'passive', name: '禁忌·顶天',     desc: '体型 +50% 且全屏攻击', slotPrefer: 'passiveC' },
};

export function findHiddenSkill(id) {
  return HIDDEN_SKILLS[id] ?? null;
}

/** 三选一时按类型路由槽位：主动→activeA/B，被动→passiveC/D；都满 → 返回首选交给 onLearnSkill 弹窗 */
export function routeToSlot(kind, save) {
  const slots = save.player.skillSlots;
  if (kind === 'active') {
    if (!slots.activeA) return 'activeA';
    if (!slots.activeB) return 'activeB';
    return 'activeA';
  }
  if (!slots.passiveC) return 'passiveC';
  if (!slots.passiveD) return 'passiveD';
  return 'passiveC';
}

/**
 * 局内学习技能 → 装填到指定槽位。
 * 规则 1：隐藏技能刻印的槽位不可被局内技能替换 → 'rejected'
 * 规则 2：空槽 → 直接装载 → 'equipped'
 * 规则 3：槽满 → 弹窗三选一（替换/放弃）；被替换技能销毁
 * @param {string} slotKey 槽位键
 * @param {{id:string,kind:'active'|'passive',route?:string|null}} skill 技能
 * @param {object} save 存档
 * @param {function} [askReplace] 弹窗回调：async (slotKey, newSkill, oldSlot) => 'replace'|'reject'
 * @returns {'equipped'|'replaced'|'rejected'}
 */
export async function onLearnSkill(slotKey, skill, save, askReplace) {
  const slot = save.player.skillSlots[slotKey];
  // 规则 1：隐藏刻印槽不可被局内技能替换
  if (slot?.hidden) return 'rejected';
  // 规则 2：空槽 → 直接装载
  if (!slot) {
    save.player.skillSlots[slotKey] = { skillId: skill.id, kind: skill.kind, hidden: false, route: skill.route ?? null };
    return 'equipped';
  }
  // 规则 3：槽满 → 弹窗三选一
  if (askReplace) {
    const choice = await askReplace(slotKey, skill, slot);
    if (choice === 'replace') {
      save.player.skillSlots[slotKey] = { skillId: skill.id, kind: skill.kind, hidden: false, route: skill.route ?? null };
      return 'replaced';
    }
  }
  return 'rejected';
}

/**
 * 获得隐藏技能 → 永久刻印到槽位（整体策划 4.6）。
 * 1) 优先刻印到空槽（按 slotPrefer）；2) 无空槽 → 弹窗选择替换哪个槽；3) 被替换技能销毁。
 * @param {object} h 隐藏技能配置（HIDDEN_SKILLS 项）
 * @param {object} save 存档
 * @param {function} [askWhichSlot] 弹窗回调：async (h) => slotKey
 * @returns {string} 刻印槽位键
 */
export async function applyHiddenSkill(h, save, askWhichSlot) {
  const slots = save.player.skillSlots;
  let key = h.slotPrefer;
  // 首选槽已被隐藏刻印占用 → 需玩家选择（或自动找空槽）
  if (slots[key]?.hidden) {
    if (askWhichSlot) {
      key = await askWhichSlot(h);
    } else {
      key = SLOT_KEYS.find((k) => !slots[k]?.hidden) ?? h.slotPrefer;
    }
  }
  slots[key] = { skillId: h.id, kind: h.kind, hidden: true, route: h.route };
  if (!save.inventory.hiddenSkills.includes(h.id)) {
    save.inventory.hiddenSkills.push(h.id);
  }
  return key;
}

/** 匹配位面掉落时 roll 具体隐藏技能（该路线专属；诸天之心 = 全路线池） */
export function rollHiddenSkill(plane, save, rng = Math.random) {
  const candidates = Object.values(HIDDEN_SKILLS).filter(
    (h) =>
      (plane.route === null || h.route === plane.route) &&
      !save.inventory.hiddenSkills.includes(h.id)
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** 4 槽全部刻印 → 成就「诸天共鸣」 */
export function allSlotsHidden(save) {
  return SLOT_KEYS.every((k) => save.player.skillSlots[k]?.hidden);
}