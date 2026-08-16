// ===== game/renderer.js · Canvas 像素渲染 =====
// 规则：整数倍缩放 + 关闭平滑 + 坐标取整。任何一条破了，像素风立刻变糊。

import { ARENA } from '../../../shizu-cocos/assets/scripts/core/battle.js';

const FX_SPRITE = {
  hit: 'hit_spark', crit: 'crit_star', gene: 'gene_pickup',
  slash: 'slash', burst: null, surge: null,
};

export class Renderer {
  constructor(canvas, assets, planeId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.planeId = planeId;
    this.fx = [];             // 活跃特效实例
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    // 整数倍缩放，保证像素网格不被拉歪
    const scale = Math.max(1, Math.min(Math.floor(availW / ARENA.w * 2) / 2, availH / ARENA.h));
    this.scale = scale;
    this.canvas.width = Math.round(ARENA.w * scale);
    this.canvas.height = Math.round(ARENA.h * scale);
    this.canvas.style.width = `${this.canvas.width}px`;
    this.canvas.style.height = `${this.canvas.height}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 消费一批特效请求 */
  pushEffects(list) {
    for (const e of list) {
      if (e.type === 'burst') {
        this.fx.push({ sprite: `burst_${this.planeId}`, x: e.x, y: e.y, t: 0 });
        this.shake = Math.max(this.shake, 1.5);
      } else if (e.type === 'surge') {
        this.shake = Math.max(this.shake, 5);
      } else {
        const s = FX_SPRITE[e.type];
        if (s) this.fx.push({ sprite: s, x: e.x, y: e.y, t: 0 });
        if (e.type === 'hit') this.shake = Math.max(this.shake, 4);
        if (e.type === 'crit') this.shake = Math.max(this.shake, 2);
      }
    }
  }

  draw(run, dt) {
    const ctx = this.ctx;
    const A = this.assets;
    ctx.save();
    ctx.scale(this.scale, this.scale);

    this.shake = Math.max(0, this.shake - dt * 22);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    // 相机跟随玩家：世界坐标 → 屏幕坐标（取整保持像素网格）
    const camX = Math.round(run.player.x - ARENA.w / 2);
    const camY = Math.round(run.player.y - ARENA.h / 2);
    ctx.translate(Math.round(sx) - camX, Math.round(sy) - camY);

    // —— 背景（无限平铺）——
    const bg = A.img(`backgrounds/${BG_FILE[this.planeId] ?? 'nest'}.png`);
    if (bg) {
      const tw = ARENA.w, th = ARENA.h;
      const startX = Math.floor(camX / tw) * tw;
      const startY = Math.floor(camY / th) * th;
      for (let x = startX; x < camX + ARENA.w; x += tw)
        for (let y = startY; y < camY + ARENA.h; y += th)
          ctx.drawImage(bg, Math.round(x), Math.round(y), tw, th);
    } else { ctx.fillStyle = '#0d1013'; ctx.fillRect(camX, camY, ARENA.w, ARENA.h); }

    // —— 基因尸体（在脚下，先画）——
    for (const o of run.orbs) {
      this.blitClip('gene_orb_pulse', o.x, o.y + Math.sin(o.bob) * 2, o.bob * 4, 0.5)
        || this.dot(o.x, o.y, 5, '#5fb8a6');
    }

    // —— 敌人：按 y 排序，靠下的后画（伪 2.5D 遮挡）——
    const sorted = [...run.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) this.drawEnemy(e);

    // —— 玩家 ——
    this.drawPlayer(run);

    // —— 特效 ——
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => {
      const clip = A.clip(f.sprite);
      if (!clip) return false;
      const frame = Math.floor(f.t * clip.fps);
      if (frame >= clip.frames) return false;
      this.blitFrame(f.sprite, frame, f.x, f.y, 1);
      return true;
    });

    ctx.restore();
  }

  drawEnemy(e) {
    const kind = e.kind;
    // 按目标高度缩放，跨关卡散图尺寸不同也能统一体型
    const targetH = kind === 'boss' ? 95 : kind === 'elite' ? 60 : 34;
    const ok = this.blitSprite(`units/${kind}_${this.planeId}.png`, e.x, e.y, targetH, e.hitFlash > 0);
    if (!ok) this.dot(e.x, e.y, e.r, e.kind === 'boss' ? '#a678d4' : '#c9556a');

    // 精英 / BOSS 血条
    if (e.kind !== 'minion') {
      const w = e.kind === 'boss' ? 64 : 40;
      this.bar(e.x - w / 2, e.y - e.r - 10, w, 4, e.hp / e.maxHp, '#c9556a');
    }
  }

  drawPlayer(run) {
    const p = run.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    if (!blink) {
      const ok = this.blitSprite('units/player.png', p.x, p.y, 46, p.hitFlash > 0, p.facing);
      if (!ok) this.dot(p.x, p.y, p.r, '#e8e2d6');
    }
  }

  // —— 底层绘制 ——

  blitClip(name, x, y, animT, scale = 1, flash = false, facing = 1) {
    const clip = this.assets.clip(name);
    if (!clip) return false;
    const frame = Math.floor(animT) % clip.frames;
    return this.blitFrame(name, frame, x, y, scale, flash, facing);
  }

  blitFrame(name, frame, x, y, scale = 1, flash = false, facing = 1) {
    const clip = this.assets.clip(name);
    if (!clip) return false;
    const rel = clip.file.replace(/^art\//, '');
    const img = this.assets.img(rel);
    if (!img) return false;

    const fw = clip.frameWidth;
    const fh = clip.frameHeight;
    const dw = Math.round(fw * scale);
    const dh = Math.round(fh * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh / 2);

    const ctx = this.ctx;
    ctx.save();
    if (facing < 0) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, dw, dh);
    }
    if (flash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      if (facing < 0) ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, dw, dh);
      else ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  /** 按目标高度绘制静态散图（新接入的雪碧），支持朝向/受击闪白 */
  blitSprite(rel, x, y, targetH, flash = false, facing = 1) {
    const img = this.assets.img(rel);
    if (!img) return false;
    const scale = targetH / img.height;
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh / 2);
    const ctx = this.ctx;
    ctx.save();
    if (facing < 0) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, 0, 0, dw, dh); }
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, dx, dy, dw, dh); }
    }
    ctx.restore();
    return true;
  }

  dot(x, y, r, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
  }

  bar(x, y, w, h, ratio, color) {
    const ctx = this.ctx;
    ctx.fillStyle = '#11151a';
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * Math.max(0, ratio)), h);
  }
}

const BG_FILE = {
  jiguan: 'plane_01_jiguan', aofa: 'plane_02_aofa', qiqiao: 'plane_03_qiqiao',
  dujie: 'plane_04_dujie', gongde: 'plane_05_gongde', shihai: 'plane_06_shihai',
  gongshengchao: 'plane_07_gongshengchao', wuxia: 'plane_08_wuxia', shanhai: 'plane_09_shanhai',
  jijia: 'plane_10_jijia', jushen: 'plane_11_jushen', zhutian: 'plane_12_zhutian',
};
