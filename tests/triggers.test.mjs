// ===== triggers.test.mjs · 触发器枚举唯一真源守护（源码扫描，双向防漂移）=====
// 历史坑：run.js 分发器实现了 39 种动作，白名单却只放行 17 种——buffCrit 等 22 种
// 永远走不到（写进触发器只会 console.warn 然后被吞）。本文件用源码扫描把这类
// 「实现与白名单脱节」的 bug 类别永久关死：
//   1) 分发器里每个 act.type === 'X' 字面量必须 ∈ TRIGGER_ACTIONS
//   2) 全 core 层每个 runPlaneTriggers('X') 发射点必须 ∈ TRIGGER_EVENTS
//   3) 集合大小 === 扫描到的去重字面量数（防止「加了实现忘了入列」或反之）

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TRIGGER_EVENTS, TRIGGER_ACTIONS } from '../shizu-cocos/assets/scripts/core/run.js';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shizu-cocos/assets/scripts/core');
const src = (f) => readFileSync(path.join(CORE, f), 'utf8');

test('动作白名单 ⊇ 分发器全部实现（源码扫描 run.js）', () => {
  const s = src('run.js');
  const found = new Set([...s.matchAll(/act\.type === '([A-Za-z]+)'/g)].map((m) => m[1]));
  assert.ok(found.size >= 30, `分发器实现的动作数异常少：${found.size}`);
  const missing = [...found].filter((a) => !TRIGGER_ACTIONS.has(a));
  assert.deepEqual(missing, [], `以下动作已实现但不在 TRIGGER_ACTIONS 白名单（永远走不到）：${missing.join(',')}`);
  assert.equal(TRIGGER_ACTIONS.size, found.size, '白名单里有分发器不认识的条目（拼错或已删实现）');
});

test('事件集合 ⊇ 全部发射点（源码扫描 core/*.js）', () => {
  const found = new Set();
  for (const f of ['battle.js', 'run.js']) {
    for (const m of src(f).matchAll(/runPlaneTriggers\('([A-Za-z]+)'/g)) found.add(m[1]);
  }
  assert.ok(found.size >= 18, `发射点数异常少：${found.size}`);
  const missing = [...found].filter((e) => !TRIGGER_EVENTS.has(e));
  assert.deepEqual(missing, [], `以下事件有发射点但不在 TRIGGER_EVENTS：${missing.join(',')}`);
  // 反向：集合里的每个事件都应至少有一个真实发射点（防手滑加错名）
  const orphan = [...TRIGGER_EVENTS].filter((e) => !found.has(e));
  assert.deepEqual(orphan, [], `以下事件在白名单但没有任何发射点：${orphan.join(',')}`);
});

test('关键动作抽样在列（含曾被困死的 buff 家族）', () => {
  for (const a of ['surge', 'spawnElite', 'genes', 'freeze', 'invuln', 'revive', 'permGenes',
    'buffAtk', 'buffCrit', 'buffChain', 'buffCooldown', 'buffDmgReduct', 'buffLifesteal']) {
    assert.ok(TRIGGER_ACTIONS.has(a), `缺动作 ${a}`);
  }
});
