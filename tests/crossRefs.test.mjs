// ===== crossRefs.test.mjs · 配表间引用完整性（防悬空 id 复积）=====
// 思路同 planeModules.test.mjs 的完整性校验，但覆盖「表之间」的指针：
// 位面↔路线、互斥、隐藏技能、攻击方式、共鸣 need、传承覆盖。
// 任何一条红 = 有表改了名/删了条目但消费方没跟上。

import test from 'node:test';
import assert from 'node:assert/strict';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { ROUTES } from '../shizu-cocos/assets/scripts/data/routes.js';
import { HIDDEN_SKILLS } from '../shizu-cocos/assets/scripts/data/hiddenSkills.js';
import { WEAPON_ATTACK } from '../shizu-cocos/assets/scripts/data/weaponAttack.js';
import { SYNERGIES } from '../shizu-cocos/assets/scripts/data/synergies.js';
import { GENERIC_ATTR_POOL } from '../shizu-cocos/assets/scripts/data/attrPool.js';
import { MECH_UPGRADES } from '../shizu-cocos/assets/scripts/data/mechUpgrades.js';
import { RELICS } from '../shizu-cocos/assets/scripts/data/relics.js';

const ROUTE_IDS = new Set(Object.keys(ROUTES));
const PLANE_IDS = new Set(planes.map((p) => p.id));
const CODEXES = new Set(planes.map((p) => p.codex));
const ATTR_IDS = new Set(GENERIC_ATTR_POOL.map((a) => a.id));
const MECH_IDS = new Set(Object.values(MECH_UPGRADES).flat().map((m) => m.id));

test('位面引用的路线全部存在', () => {
  for (const p of planes) {
    for (const r of p.routes ?? []) {
      assert.ok(ROUTE_IDS.has(r), `位面 ${p.id} 引用了不存在的路线 "${r}"`);
    }
  }
});

test('路线 planeCodex 反向指回真实位面', () => {
  for (const [rid, r] of Object.entries(ROUTES)) {
    assert.ok(CODEXES.has(r.planeCodex), `路线 ${rid} 的 planeCodex=${r.planeCodex} 无对应位面`);
  }
});

test('互斥矩阵指向存在的路线', () => {
  for (const [rid, r] of Object.entries(ROUTES)) {
    for (const m of r.mutexWith ?? []) {
      assert.ok(ROUTE_IDS.has(m), `路线 ${rid} 与不存在的路线 "${m}" 声明互斥`);
      assert.notEqual(m, rid, `路线 ${rid} 与自身互斥`);
    }
  }
});

test('隐藏技能：route 合法、槽位偏好合法', () => {
  const SLOTS = new Set(['activeA', 'activeB', 'passiveC', 'passiveD']);
  for (const h of Object.values(HIDDEN_SKILLS)) {
    assert.ok(ROUTE_IDS.has(h.route), `隐藏技能 ${h.id} 挂在不存在的路线 "${h.route}"`);
    assert.ok(SLOTS.has(h.slotPrefer), `隐藏技能 ${h.id} 的槽位偏好 "${h.slotPrefer}" 非法`);
  }
});

test('攻击方式表与 10 条路线一一对应', () => {
  const wids = new Set(Object.keys(WEAPON_ATTACK));
  for (const rid of ROUTE_IDS) assert.ok(wids.has(rid), `路线 ${rid} 缺攻击方式配置`);
  for (const wid of wids) assert.ok(ROUTE_IDS.has(wid), `攻击方式表含未知路线 "${wid}"`);
});

test('共鸣 need 全部可解析到属性池或机制强化', () => {
  for (const s of SYNERGIES) {
    assert.ok(s.need.length >= 2, `共鸣 ${s.id} 的 need 少于 2 条`);
    for (const n of s.need) {
      assert.ok(
        ATTR_IDS.has(n) || MECH_IDS.has(n),
        `共鸣 ${s.id} 的 need "${n}" 既不是属性也不是机制强化 id`,
      );
    }
  }
});

test('传承覆盖：除诸天外每位面都有 relic_<id>', () => {
  for (const p of planes) {
    if (p.id === 'zhutian') continue;   // 诸天走 relic_benghuaixin 特判
    assert.ok(RELICS[`relic_${p.id}`], `位面 ${p.id} 缺专属传承 relic_${p.id}`);
  }
});
