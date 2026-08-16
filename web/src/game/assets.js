// ===== game/assets.js · 像素资产加载 =====
// 读 art/anim.json 清单，把雪碧图切成帧。
// 关键：canvas 必须关掉平滑（imageSmoothingEnabled = false），
// 否则整数倍放大的像素图会被浏览器插值糊掉，像素风就没了。

const ART = '../shizu-cocos/assets/art';

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
    want(`units/minion_${planeId}.png`);
    want(`units/elite_${planeId}.png`);
    want(`units/boss_${planeId}.png`);
    want('items/gene_orb.png');
    const bgFile = BG_FILE[planeId] ?? 'nest';
    want(`backgrounds/${bgFile}.png`);
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
