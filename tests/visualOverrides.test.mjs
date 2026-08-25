// ===== visualOverrides.test.mjs · 地图/技能视觉配置真实消费守护 =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeRun } from '../shizu-cocos/assets/scripts/core/battle.js';
import { generateDungeon } from '../shizu-cocos/assets/scripts/core/dungeon.js';
import { getPlaneModule, PLANE_MECHANICS } from '../shizu-cocos/assets/scripts/data/planeModules.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { findSkill } from '../shizu-cocos/assets/scripts/data/skills.js';
import { freshSave } from './helpers.mjs';

test('plane.art 覆盖由插件门面真实返回', () => {
  const p = planes.find((x) => x.id === 'jiguan');
  const original = p.art;
  p.art = { floor: 'backgrounds/custom_floor.png', background: 'backgrounds/custom_bg.png', playerSkin: 'units/custom_player.png' };
  try {
    const m = getPlaneModule('jiguan');
    assert.deepEqual(m.art, p.art);
  } finally {
    p.art = original;
  }
});

test('位面工程对象编译进 RealtimeRun：出生点/小怪/Boss/区域均真实生效', () => {
  const save = freshSave({ totalRuns: 5 });
  const plane = {
    ...planes.find((p) => p.id === 'jiguan'),
    triggers: [{ on: 'onAmbushSpawn', actions: [{ type: 'genes', amount: 7 }] }],
    editor: { version: 1, objects: [
      { id: 'spawn_1', type: 'spawn', role: 'player', x: 123, y: 234 },
      { id: 'unit_1', type: 'unit', name: '预放小怪', sprite: 'anqi', variant: 'tank', hp: 88, atk: 9, x: 300, y: 320 },
      { id: 'boss_1', type: 'boss', name: '地图Boss', sprite: 'aofa_boss', hp: 500, atk: 20, bossSkill: 'ring', x: 500, y: 400 },
      { id: 'region_1', type: 'region', name: '伏击区域', event: 'onAmbushSpawn', x: 123, y: 234, width: 100, height: 100 },
    ] },
  };
  const run = new RealtimeRun(save, generateDungeon(plane, save, 101), 33);
  assert.equal(run.player.x, 123); assert.equal(run.player.y, 234);
  const entranceFx = run.hits.find((h) => h.type === 'boss' && h.x === 500 && h.y === 400);
  assert.ok(entranceFx, '预放 Boss 开局应发登场预警圈（Anticipation）');
  const unit = run.enemies.find((e) => e.name === '预放小怪');
  const boss = run.enemies.find((e) => e.name === '地图Boss');
  assert.equal(unit.variant, 'tank'); assert.equal(unit.hp, 88); assert.equal(unit.x, 300);
  assert.equal(boss.bossSkill, 'ring'); assert.equal(boss.mapPlaced, true);
  const genes0 = run.genes;
  run.updateWorldRegions();
  assert.ok(run.hits.some((h) => h.type === 'regionPing' && h.x === 123), '区域首入应发 regionPing 确认特效');
  assert.equal(run.genes, genes0 + 7, '首次进入区域应触发 genes 动作');
  run.updateWorldRegions();
  assert.equal(run.genes, genes0 + 7, '同一区域只触发一次');
  run.killEnemy(boss);
  assert.equal(run.state, 'fighting', '地图预放 Boss 默认不应结束整局');
});

test('地图刷怪点按角色类型约束生成位置', () => {
  const save = freshSave({ totalRuns: 5 });
  const plane = { ...planes.find((p) => p.id === 'jiguan'), editor: { objects: [
    { id: 's1', type: 'spawn', role: 'minion', x: 111, y: 222 },
    { id: 's2', type: 'spawn', role: 'boss', x: 777, y: 666 },
  ] } };
  const run = new RealtimeRun(save, generateDungeon(plane, save, 55), 17);
  run.spawnEnemy({ kind: 'minion', name: '点位小怪', hp: 10, atk: 1 }, false);
  run.spawnEnemy({ kind: 'boss', name: '点位Boss', hp: 20, atk: 2 }, true);
  const minion = run.enemies.find((e) => e.name === '点位小怪');
  const boss = run.enemies.find((e) => e.name === '点位Boss');
  assert.equal(`${minion.x},${minion.y}`, '111,222');
  assert.equal(`${boss.x},${boss.y}`, '777,666');
});

test('实时战斗按 minionCount 限制常规刷怪，并按 closerCount 生成多个收尾单位', () => {
  const save = freshSave({ totalRuns: 5 });
  const plane = { ...planes.find((p) => p.id === 'jiguan'), stagePlan: [{ duration: 60, minionCount: 3, closerCount: 3 }, {}, {}, {}, {}] };
  const run = new RealtimeRun(save, generateDungeon(plane, save, 77), 29);
  run.dungeon.stages[0].surges = [];
  run.dungeon.stages[0].closerAt = 50;
  run.stageElapsed = 30;
  run.spawnTick(30);
  assert.equal(run.enemies.filter((e) => e.kind === 'minion').length, 3);
  run.enemies = [];
  run.stageElapsed = 50;
  run.spawnTick(0.01);
  assert.equal(run.enemies.filter((e) => e.kind === 'elite').length, 3);
});

test('后台 Boss技能样式配置真实改变 bossSkill 弹幕行为', () => {
  const original = PLANE_MECHANICS.jiguan.bossSkill;
  PLANE_MECHANICS.jiguan.bossSkill = 'ring';
  try {
    const save = freshSave({ totalRuns: 5 });
    const run = new RealtimeRun(save, generateDungeon(planes.find((p) => p.id === 'jiguan'), save, 13), 21);
    run.shots = [];
    run.bossSkill({ kind: 'boss', phase: 1, x: run.player.x + 100, y: run.player.y, atk: 10 });
    assert.equal(run.shots.length, 18, 'ring Boss技应生成18发满圆弹幕');
    assert.ok(run.shots.every((s) => s.sprite === 'magic_orb'));
  } finally {
    if (original == null) delete PLANE_MECHANICS.jiguan.bossSkill;
    else PLANE_MECHANICS.jiguan.bossSkill = original;
  }
});

test('小怪 sprite 可手动指定行为变体并被 spawnEnemy 消费', () => {
  const save = freshSave({ totalRuns: 5 });
  const plane = { ...planes.find((p) => p.id === 'jiguan'), minionVariants: { jixie_xie: 'tank' } };
  const run = new RealtimeRun(save, generateDungeon(plane, save, 15), 25);
  run.stageMinionSprite = () => 'jixie_xie';
  run.spawnEnemy({ kind: 'minion', name: '指定小怪', hp: 100, atk: 10 }, false);
  assert.equal(run.enemies.at(-1).variant, 'tank');
});
test('多 Boss 必须全部击杀后才胜利', () => {
  const save = freshSave({ totalRuns: 5 });
  const plane = { ...planes.find((p) => p.id === 'jiguan'), stagePlan: [{}, {}, {}, {}, { closerCount: 3 }] };
  const run = new RealtimeRun(save, generateDungeon(plane, save, 91), 31);
  run.stageIndex = 4;
  run.stageElapsed = run.stage.closerAt;
  run.spawnTick(0.01);
  const bosses = run.enemies.filter((e) => e.kind === 'boss');
  assert.equal(bosses.length, 3);
  run.killEnemy(bosses[0]);
  assert.equal(run.state, 'fighting', '击杀第一只不能提前胜利');
  run.killEnemy(bosses[1]);
  assert.equal(run.state, 'fighting', '击杀第二只仍不能提前胜利');
  run.killEnemy(bosses[2]);
  assert.equal(run.state, 'won', '最后一只死亡才胜利');
});

test('主动技能 visual.fxKind/color 真实进入 RealtimeRun FX 队列', () => {
  const skill = findSkill('dujie_6');
  const original = skill.visual;
  skill.visual = { fxKind: 'heal', color: '#123456', projectile: 'effects/custom.png' };
  try {
    const save = freshSave({ totalRuns: 5 });
    const run = new RealtimeRun(save, generateDungeon(planes.find((p) => p.id === 'jiguan'), save, 9), 17);
    run.castSkill(skill);
    const fx = run.hits.find((x) => x.type === 'skill');
    assert.ok(fx, '主动技应发出 skill FX');
    assert.equal(fx.data.skillKind, 'heal');
    assert.equal(fx.data.color, '#123456');
    assert.equal(fx.data.projectile, 'effects/custom.png');
  } finally {
    skill.visual = original;
  }
});
