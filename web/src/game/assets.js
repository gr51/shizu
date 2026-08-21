// ===== game/assets.js · 像素资产加载 =====
// 读 art/anim.json 清单，把雪碧图切成帧。
// 关键：canvas 必须关掉平滑（imageSmoothingEnabled = false），
// 否则整数倍放大的像素图会被浏览器插值糊掉，像素风就没了。

const ART = '../shizu-cocos/assets/art';

import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE } from '../../../shizu-cocos/assets/scripts/core/battle.js';

/** 画了专属刀光贴图的敌人（目前只有武侠那批）。其余敌人回退到 effects/slash.png。 */
const SLASH_FX_UNITS = new Set([
  'maozei', 'shanzei', 'biaoshi', 'jiutu', 'quanshi', 'gunseng', 'jiansheng',
]);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // 缺图不阻塞，渲染层会退化为色块
    img.src = src;
  });
}

export class Assets {
  constructor() {
    this.images = new Map();
    this.clips = new Map();
  }

  async load(planeId) {
    const manifest = await fetch(`${ART}/anim.json`).then((r) => r.json()).catch(() => null);
    const need = [];

    const want = (rel) => { need.push(rel); return rel; };

    // 静态图
    want('units/player.png');
    for (let f = 0; f < 4; f++) want(`units/player_walk${f}.png`);   // 玩家走路帧
    for (let f = 0; f < 3; f++) want(`units/player_atk${f}.png`);    // 玩家攻击帧
    want('units/player_death.png');
    // 10 进化路线皮肤
    for (const r of ['dujie', 'gongde', 'sangshi', 'gongsheng', 'xiake', 'shanhai', 'mofa', 'qiji', 'jijia', 'juhua']) {
      want(`units/player_${r}.png`);
    }
    // 通用特效
    want('effects/slash.png');
    want('effects/crit.png');
    want('effects/hit.png');
    want('effects/projectile.png');
    want('effects/arrow.png');        // 弓手箭矢
    want('effects/jiansheng_slash.png'); // Boss剑气
    want('effects/sword_qi.png');    // 玩家剑气弹体
    want('effects/sword_hit.png');   // 剑气命中剑痕
    // 10 路线武器弹体
    for (const p of ['bullet', 'lightning', 'magic_orb', 'shockwave_gold', 'stomp_wave', 'miasma', 'tendril', 'gear_blade', 'quake_wave']) {
      want(`effects/${p}.png`);
    }
    // 敌人：本位面的小怪（按阶段表）+ Boss（数据驱动）
    // 阶段表里的怪是全套四向走路帧
    const FULL_FRAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death'];
    const stagePairs = MINION_SPRITE_BY_STAGE[planeId] ?? [];
    const units = new Set();
    for (const pair of stagePairs) for (const m of pair) units.add(m);
    const bossName = BOSS_BY_PLANE[planeId];
    if (bossName) units.add(bossName);
    for (const m of units) {
      for (const n of FULL_FRAMES) want(`units/${m}_${n}.png`);
      // 专属刀光是可选资产，只有武侠那批有；其余一律走 effects/slash.png 通用回退，
      // 无脑请求会让每个非武侠位面每局白跑十几个 404。
      if (SLASH_FX_UNITS.has(m)) want(`effects/${m}_slash.png`);
    }
    // 通用命名兜底：renderer.spriteBase() 在没有专属 sprite 时会回落到
    // minion_{variant}_{plane}，也正是 tools/ai-art/generate.mjs 产出的名字。
    // 不预载它们的话，缺席阶段表的位面（如首个教学位面 jiguan）会一张贴图都没有，
    // 满屏敌人全部退化成 dot() 色块。这一族只有单帧走路 + 待机图。
    //
    // 只在「阶段表里没有这个位面」时才要：drawEnemy 用的是 `e.sprite || spriteBase(...)`，
    // 有阶段表的位面 e.sprite 一定有值，兜底族根本用不到，请求了就是白跑 404。
    if (!stagePairs.length) {
      for (const v of ['walker', 'charger', 'spitter']) {
        const m = `minion_${v}_${planeId}`;
        want(`units/${m}.png`);
        for (const n of ['walk0', 'atk0', 'atk1', 'atk2', 'death']) want(`units/${m}_${n}.png`);
      }
    }
    want(`units/elite_${planeId}.png`);
    // Boss 在 spawnEnemy 里就拿到了 e.sprite = BOSS_BY_PLANE[plane]（如 dujie_boss），
    // 走的是上面那圈帧图。只有没进 BOSS_BY_PLANE 的位面（目前是 jiguan）
    // 才真的回落到 boss_{plane}.png —— 无条件请求会让另外 11 个位面每局白跑一个 404。
    if (!bossName) want(`units/boss_${planeId}.png`);
    want('items/gene_orb.png');
    want(`backgrounds/floor_${planeId}.png`);   // 无缝地砖

    // 动画片段
    if (manifest) {
      for (const clip of manifest.clips) {
        const rel = clip.file.replace(/^art\//, '');
        if (!CLIP_WANTED(rel, planeId)) continue;
        this.clips.set(rel.replace('anim/', '').replace('fx/', '').replace('.png', ''), clip);
        need.push(rel);
      }
    }

    await Promise.all([...new Set(need)].map(async (rel) => {
      const img = await loadImage(`${ART}/${rel}`);
      if (img) this.images.set(rel, img);
    }));
    return this;
  }

  img(rel) { return this.images.get(rel) ?? null; }

  /** 取某片段的第 n 帧（自动取模循环） */
  clip(name) { return this.clips.get(name) ?? null; }
}

const BG_FILE = {
  jiguan: 'plane_01_jiguan', aofa: 'plane_02_aofa', qiqiao: 'plane_03_qiqiao',
  dujie: 'plane_04_dujie', gongde: 'plane_05_gongde', shihai: 'plane_06_shihai',
  gongshengchao: 'plane_07_gongshengchao', wuxia: 'plane_08_wuxia', shanhai: 'plane_09_shanhai',
  jijia: 'plane_10_jijia', jushen: 'plane_11_jushen', zhutian: 'plane_12_zhutian',
};

/** 只加载本局用得到的片段，别把 106 个全拉下来 */
function CLIP_WANTED(rel, planeId) {
  if (rel.startsWith('fx/')) return true;
  if (/^anim\/player_(idle|walk|attack|hit)\.png$/.test(rel)) return true;
  if (rel === `anim/minion_${planeId}_move.png` || rel === `anim/minion_${planeId}_death.png`) return true;
  if (rel === `anim/elite_${planeId}_idle.png`) return true;
  if (rel === `anim/boss_${planeId}_idle.png`) return true;
  if (rel === 'anim/gene_orb_pulse.png') return true;
  return false;
}
