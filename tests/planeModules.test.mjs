// ===== 位面插件化：模块完整性校验 =====
// 「一个位面 = 一个可插拔模块」的守护：进入事件/敌人资产/Boss/机制/美术路径
// 全部通过 getPlaneModule 门面校验——加新位面时漏配任何一面当场红。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlaneModule, listPlaneModules } from '../shizu-cocos/assets/scripts/data/planeModules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artDir = path.join(root, 'shizu-cocos', 'assets', 'art');

test('插件门面：12 个位面全部可取、与 planes.js 一一对应', () => {
  const mods = listPlaneModules();
  assert.equal(mods.length, 12);
  for (const m of mods) {
    assert.ok(m, '存在空模块');
    assert.equal(m.data.id, m.id);
  }
});

test('进入事件切面：诗 / 主题 / Boss 名与机制词齐备', () => {
  for (const m of listPlaneModules()) {
    assert.ok(m.entry.poem, `${m.id} 缺开场诗`);
    assert.ok(m.entry.theme, `${m.id} 缺主题`);
    assert.ok(m.boss.name, `${m.id} 缺 Boss 名`);
    assert.ok(m.entry.bossDesc, `${m.id} 缺 Boss 机制词`);
    assert.ok(Array.isArray(m.skillRoutes), `${m.id} skillRoutes 非数组`);
    // 终局位面（zhutian）通关即毕业，不绑定路线——其余位面必须绑定
    if (m.id !== 'zhutian') assert.ok(m.skillRoutes.length >= 1, `${m.id} 未绑定技能路线`);
  }
});

test('敌人资产切面：5 阶段 × 每阶段 2 只，且帧文件真实存在', () => {
  for (const m of listPlaneModules()) {
    const pairs = m.enemies.stageSprites;
    assert.ok(Array.isArray(pairs) && pairs.length === 5, `${m.id} 敌人表不是 5 阶段`);
    for (const pair of pairs) {
      assert.equal(pair.length, 2, `${m.id} 某阶段不是 2 只`);
      for (const name of pair) {
        for (const f of ['walk0', 'walk3', 'atk1', 'death']) {
          const p = path.join(artDir, 'units', `${name}_${f}.png`);
          assert.ok(fs.existsSync(p), `${m.id} 敌人 ${name}_${f}.png 缺失`);
        }
        // 远程标记必须与位面表自洽（该 sprite 是否远程由 RANGED_SPRITES 决定，此处查集合已含）
        if (!fs.existsSync(path.join(artDir, 'units', `${name}.png`))) {
          assert.fail(`${m.id} 敌人 ${name}.png 基础立绘缺失`);
        }
      }
    }
  }
});

test('机制切面：每位面一个机制，signature/type 至少其一', () => {
  for (const m of listPlaneModules()) {
    const mech = m.enemies.mechanic;
    assert.ok(mech, `${m.id} 缺位面机制`);
    assert.ok(mech.type || mech.signature, `${m.id} 机制缺 type/signature`);
  }
});

test('美术路径切面：floor 与 background 资产真实存在', () => {
  for (const m of listPlaneModules()) {
    const floor = path.join(artDir, m.art.floor);
    const bg = path.join(artDir, m.art.background);
    assert.ok(fs.existsSync(floor), `${m.id} 地砖缺失：${m.art.floor}`);
    assert.ok(fs.existsSync(bg), `${m.id} 背景缺失：${m.art.background}`);
  }
});
