// ===== projectOverrides.test.mjs · Cocos 项目配置文件消费守护 =====
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProjectOverrides } from '../shizu-cocos/assets/scripts/core/projectOverrides.js';
import { planes } from '../shizu-cocos/assets/scripts/data/planes.js';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE, PLANE_MECHANICS } from '../shizu-cocos/assets/scripts/data/planeModules.js';
import { findSkill } from '../shizu-cocos/assets/scripts/data/skills.js';

test('Cocos projectOverrides 同时消费位面/机制/Boss/小怪/技能配置', () => {
  const p = planes.find((x) => x.id === 'jiguan');
  const oldPlane = { ...p };
  const oldMech = { ...PLANE_MECHANICS.jiguan };
  const oldBoss = BOSS_BY_PLANE.jiguan;
  const oldSprites = MINION_SPRITE_BY_STAGE.jiguan;
  const skill = findSkill('dujie_1');
  const oldSkill = { ...skill, eff: skill.eff, visual: skill.visual };
  try {
    applyProjectOverrides({
      planes: { jiguan: { theme: 'Cocos覆盖主题', art: { floor: 'backgrounds/custom.png' }, statMods: { bossHpPct: 20 } } },
      mechanics: { jiguan: { type: 'bulletHell', count: 9, bossSkill: 'ring' } },
      bossSprites: { jiguan: 'custom_boss' },
      stageSprites: { jiguan: [['custom_a', 'custom_b'], ...oldSprites.slice(1)] },
      skills: [{ id: 'dujie_1', name: 'Cocos覆盖技能', visual: { fxKind: 'heal', color: '#123456' } }],
    });
    assert.equal(p.theme, 'Cocos覆盖主题');
    assert.equal(p.art.floor, 'backgrounds/custom.png');
    assert.equal(PLANE_MECHANICS.jiguan.bossSkill, 'ring');
    assert.equal(BOSS_BY_PLANE.jiguan, 'custom_boss');
    assert.deepEqual(MINION_SPRITE_BY_STAGE.jiguan[0], ['custom_a', 'custom_b']);
    assert.equal(skill.name, 'Cocos覆盖技能');
    assert.equal(skill.visual.color, '#123456');
  } finally {
    Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, oldPlane);
    Object.keys(PLANE_MECHANICS.jiguan).forEach((k) => delete PLANE_MECHANICS.jiguan[k]); Object.assign(PLANE_MECHANICS.jiguan, oldMech);
    BOSS_BY_PLANE.jiguan = oldBoss;
    MINION_SPRITE_BY_STAGE.jiguan = oldSprites;
    Object.keys(skill).forEach((k) => delete skill[k]); Object.assign(skill, oldSkill);
  }
});
