// ===== game/SpriteBank.ts · 像素资产装载与逐帧播放 =====
//
// 把 tools/gen-pixel-assets.mjs 产出的 art/ 接进 Cocos：
//   · 静态图 → SpriteFrame
//   · 雪碧图 → 按 art/anim.json 的 frameWidth 切成帧序列
//
// 关键：像素风必须关掉纹理过滤（Filter.NONE）。
// 不关的话引擎会做双线性插值，整数倍放大的像素图会被糊成一团 ——
// 那一步做错，前面所有像素绘制的功夫全白费。

import { ImageAsset, JsonAsset, Rect, Sprite, SpriteFrame, Texture2D, resources } from 'cc';
import { MINION_SPRITE_BY_STAGE, BOSS_BY_PLANE, getPlaneModule } from '../data/planeModules.js';
import { skills } from '../data/skills.js';

export interface AnimClip {
  file: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
}

export class SpriteBank {
  private frames = new Map<string, SpriteFrame[]>();
  private clips = new Map<string, AnimClip>();
  private ready = false;

  /** resources/ 下的相对路径（不含扩展名），与 art/ 目录结构一致 */
  private static path(rel: string): string {
    return `art/${rel.replace(/\.png$/, '')}`;
  }

  async load(planeId: string): Promise<void> {
    const manifest = await this.loadJson('art/anim');
    const wanted: string[] = [
      'units/player',
      `units/minion_${planeId}`,
      `units/elite_${planeId}`,
      `units/boss_${planeId}`,
      'items/gene_orb',
      'items/relic',
    ];
    const module = getPlaneModule(planeId);
    if (module?.art?.playerSkin) wanted.push(module.art.playerSkin.replace(/\.png$/, ''));
    const unitNames = new Set<string>();
    for (const pair of MINION_SPRITE_BY_STAGE[planeId] ?? []) for (const n of pair) if (n) unitNames.add(n);
    if (BOSS_BY_PLANE[planeId]) unitNames.add(BOSS_BY_PLANE[planeId]);
    for (const name of unitNames) {
      wanted.push(`units/${name}`);
      for (const frame of ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death']) wanted.push(`units/${name}_${frame}`);
    }
    for (const o of module?.data?.editor?.objects ?? []) {
      if (!o?.sprite) continue;
      if (o.type === 'unit' || o.type === 'boss') {
        wanted.push(`units/${o.sprite}`);
        for (const frame of ['walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2', 'death']) wanted.push(`units/${o.sprite}_${frame}`);
      } else if (o.type === 'doodad') wanted.push(String(o.sprite).replace(/\.png$/, ''));
    }
    for (const t of module?.data?.editor?.tiles ?? []) {
      if (t?.sprite) wanted.push(`backgrounds/${String(t.sprite).replace(/\.png$/, '')}`);
    }
    for (const skill of skills) {
      for (const rel of [skill.visual?.icon, skill.visual?.projectile]) if (rel) wanted.push(rel.replace(/\.png$/, ''));
    }

    if (manifest?.clips) {
      for (const clip of manifest.clips as AnimClip[]) {
        const rel = clip.file.replace(/^art\//, '').replace(/\.png$/, '');
        if (!SpriteBank.wanted(rel, planeId)) continue;
        this.clips.set(SpriteBank.key(rel), clip);
        wanted.push(rel);
      }
    }

    await Promise.all([...new Set(wanted)].map((rel) => this.loadSheet(rel)));
    this.ready = true;
  }

  get loaded(): boolean { return this.ready; }

  /** 单帧（静态图取第 0 帧） */
  frame(name: string, index = 0): SpriteFrame | null {
    const list = this.frames.get(name);
    if (!list || list.length === 0) return null;
    return list[index % list.length];
  }

  /** 按时间取循环帧 */
  frameAt(name: string, t: number): SpriteFrame | null {
    const clip = this.clips.get(name);
    const list = this.frames.get(name);
    if (!list || list.length === 0) return null;
    if (!clip) return list[0];
    const i = Math.floor(t * clip.fps);
    return list[clip.loop ? i % list.length : Math.min(i, list.length - 1)];
  }

  clip(name: string): AnimClip | null { return this.clips.get(name) ?? null; }

  /** 把一张（可能是雪碧图的）PNG 切成帧列表 */
  private loadSheet(rel: string): Promise<void> {
    return new Promise((resolve) => {
      resources.load(SpriteBank.path(rel), ImageAsset, (err, image) => {
        if (err || !image) { resolve(); return; }

        const tex = new Texture2D();
        tex.image = image;
        // ★ 像素风的生死线：关掉过滤，否则放大后全糊
        tex.setFilters(Texture2D.Filter.NONE, Texture2D.Filter.NONE);
        tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);

        const key = SpriteBank.key(rel);
        const clip = this.clips.get(key);
        const fw = clip?.frameWidth ?? image.width;
        const fh = clip?.frameHeight ?? image.height;
        const count = clip?.frames ?? 1;

        const list: SpriteFrame[] = [];
        for (let i = 0; i < count; i++) {
          const sf = new SpriteFrame();
          sf.texture = tex;
          sf.rect = new Rect(i * fw, 0, fw, fh);
          list.push(sf);
        }
        this.frames.set(key, list);
        resolve();
      });
    });
  }

  private loadJson(path: string): Promise<any> {
    return new Promise((resolve) => {
      resources.load(path, JsonAsset, (err, asset) => resolve(err ? null : (asset as any)?.json));
    });
  }

  /** 'anim/player_walk' → 'player_walk'；'units/player' → 'player' */
  private static key(rel: string): string {
    return rel.replace(/^(anim|fx|units|items|icons|ui|backgrounds)\//, '');
  }

  /** 只装本局用得到的片段，别把 100+ 个全拉进内存 */
  private static wanted(rel: string, planeId: string): boolean {
    if (rel.startsWith('fx/')) return true;
    if (/^anim\/player_(idle|walk|attack|hit)$/.test(rel)) return true;
    if (rel === `anim/minion_${planeId}_move` || rel === `anim/minion_${planeId}_death`) return true;
    if (rel === `anim/elite_${planeId}_idle`) return true;
    if (rel === `anim/boss_${planeId}_idle`) return true;
    if (rel === 'anim/gene_orb_pulse') return true;
    return false;
  }
}

/** 给一个节点套上 Sprite 并设帧；返回该 Sprite 供后续换帧 */
export function applyFrame(sprite: Sprite, sf: SpriteFrame | null): void {
  if (sf && sprite.spriteFrame !== sf) sprite.spriteFrame = sf;
}
