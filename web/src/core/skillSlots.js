// ===== core/skillSlots.js · 技能槽位与隐藏技能永久刻印 =====
// 来源：《噬祖-开发实现指南》十章；《噬祖-数值平衡表》4.7 / 4.8
//
// 槽位：主动 activeA/activeB + 被动 passiveC/passiveD。
// 红线 8：
//   - 同一隐藏技能只可获得一次（inventory.hiddenSkills 去重）
//   - hidden:true 的槽位不可被局内技能替换，也不参与三选一
//   - 隐藏技能之间的覆盖必须由玩家明确选择

import { ALL_HIDDEN_SKILLS, findHiddenSkill } from '../data/hiddenSkills.js';
import { ZHUTIAN_ID } from '../data/planes.js';

export const SLOT_KEYS = ['activeA', 'activeB', 'passiveC', 'passiveD'];
export const ACTIVE_SLOTS = ['activeA', 'activeB'];
export const PASSIVE_SLOTS = ['passiveC', 'passiveD'];

export const SLOT_LABEL = {
  activeA: '主动槽 A',
  activeB: '主动槽 B',
  passiveC: '被动槽 C',
  passiveD: '被动槽 D',
};

export function slotsOfKind(kind) {
  return kind === 'active' ? ACTIVE_SLOTS : PASSIVE_SLOTS;
}

/**
 * 按技能类型找目标槽位：优先空槽；都满则返回 null（由 UI 弹窗让玩家选替换）。
 * 被隐藏技能刻印的槽位不算空槽，也不作为可替换目标。
 */
export function findFreeSlot(kind, save) {
  const slots = save.player.skillSlots;
  for (const key of slotsOfKind(kind)) {
    if (!slots[key]) return key;
  }
  return null;
}

/** 该类型下**可被替换**的槽位（排除隐藏刻印） */
export function replaceableSlots(kind, save) {
  const slots = save.player.skillSlots;
  return slotsOfKind(kind).filter((key) => !slots[key]?.hidden);
}

/**
 * 局内学习一个技能。
 *   空槽 → 'equipped'
 *   指定槽位被隐藏刻印 → 'rejected'
 *   槽满且未指定 → 'needChoice'（调用方弹窗后带 slotKey 再调一次）
 */
export function learnSkill(save, skill, slotKey = null) {
  const slots = save.player.skillSlots;
  const kind = skill.skillKind ?? skill.kind;

  if (slotKey === null) {
    const free = findFreeSlot(kind, save);
    if (free === null) {
      const options = replaceableSlots(kind, save);
      return options.length > 0
        ? { result: 'needChoice', options }
        : { result: 'rejected', reason: '该类型槽位已被隐藏技能全部刻印' };
    }
    slotKey = free;
  }

  if (slots[slotKey]?.hidden) {
    return { result: 'rejected', reason: '隐藏技能刻印的槽位不可被局内技能替换' };
  }

  const replaced = slots[slotKey];
  slots[slotKey] = {
    skillId: skill.id,
    kind,
    hidden: false,
    route: skill.route ?? null,
    name: skill.name,
  };
  return { result: replaced ? 'replaced' : 'equipped', slotKey, replaced };
}

/**
 * 隐藏技能永久刻印。
 *   1) 首选槽位（slotPrefer）未被其他隐藏刻印 → 直接刻印
 *   2) 否则找任一非隐藏槽位
 *   3) 全部槽位都已被隐藏刻印 → 返回 needChoice，由玩家决定覆盖哪个
 */
export function applyHiddenSkill(save, hiddenId, slotKey = null) {
  const h = findHiddenSkill(hiddenId);
  if (!h) return { result: 'rejected', reason: `未知隐藏技能: ${hiddenId}` };
  if (save.inventory.hiddenSkills.includes(h.id)) {
    return { result: 'rejected', reason: '同一隐藏技能不可重复获得' };
  }

  const slots = save.player.skillSlots;
  if (slotKey === null) {
    if (!slots[h.slotPrefer]?.hidden) {
      slotKey = h.slotPrefer;
    } else {
      slotKey = SLOT_KEYS.find((k) => !slots[k]?.hidden) ?? null;
      if (slotKey === null) {
        return { result: 'needChoice', options: [...SLOT_KEYS], hidden: h };
      }
    }
  }

  const replaced = slots[slotKey];
  slots[slotKey] = {
    skillId: h.id,
    kind: h.kind,
    hidden: true,
    route: h.route,
    name: h.name,
  };
  save.inventory.hiddenSkills.push(h.id);
  return { result: 'engraved', slotKey, replaced, hidden: h };
}

/**
 * 抽一个本位面可掉落的隐藏技能（未获得过的）。
 * 诸天之心 = 全路线池；其余 = 该位面路线专属。
 */
export function rollHiddenSkill(plane, save, rng) {
  const owned = new Set(save.inventory.hiddenSkills);
  const candidates = ALL_HIDDEN_SKILLS.filter((h) => {
    if (owned.has(h.id)) return false;
    if (plane.id === ZHUTIAN_ID) return true;
    return (plane.routes ?? []).includes(h.route);
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** 开局自动装载的隐藏刻印（指南 13.1 onRunStart） */
export function engravedSkills(save) {
  return SLOT_KEYS
    .map((k) => save.player.skillSlots[k])
    .filter((s) => s?.hidden);
}

/** 成就「诸天共鸣」：4 槽全部刻印隐藏技能 */
export function allSlotsEngraved(save) {
  return SLOT_KEYS.every((k) => save.player.skillSlots[k]?.hidden);
}

/** 局内可参与三选一/替换的槽位是否已全被锁死 */
export function isKindFullyEngraved(kind, save) {
  return replaceableSlots(kind, save).length === 0;
}
