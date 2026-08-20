// ===== game/renderer.js · Canvas 像素渲染 =====
// 规则：整数倍缩放 + 关闭平滑 + 坐标取整。任何一条破了，像素风立刻变糊。

import { ARENA } from '../../../shizu-cocos/assets/scripts/core/battle.js';

// 特效类型 → effects/ 目录下的静态图文件名
const FX_SPRITE = {
  hit: 'hit', crit: 'crit', gene: 'gene_pickup',
  slash: 'slash', sword_hit: 'sword_hit', burst: null, surge: null,
};

export class Renderer {
  constructor(canvas, assets, planeId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.planeId = planeId;
    this.fx = [];             // 活跃特效实例
    this.shake = 0;
    this.flash = 0;           // 全屏闪光（升级/进化瞬间）
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
        if (e.type === 'hit') this.shake = Math.max(this.shake, 5);
        if (e.type === 'crit') this.shake = Math.max(this.shake, 3);
        if (e.type === 'sword_hit') this.shake = Math.max(this.shake, 2);
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

    // —— 地面（无缝地砖，一块一块平铺；镜像拼贴保证接缝无缝）——
    const TILE = 256;   // 每块地砖的世界尺寸（单位：世界坐标）
    const floor = A.img(`backgrounds/floor_${this.planeId}.png`);
    if (floor) {
      const startX = Math.floor(camX / TILE) * TILE;
      const startY = Math.floor(camY / TILE) * TILE;
      for (let y = startY; y < camY + ARENA.h; y += TILE) {
        for (let x = startX; x < camX + ARENA.w; x += TILE) {
          const gx = Math.round(x / TILE), gy = Math.round(y / TILE);
          const mx = (gx & 1) ? -1 : 1;   // 奇数列水平镜像
          const my = (gy & 1) ? -1 : 1;   // 奇数行垂直镜像
          ctx.save();
          ctx.translate(mx < 0 ? x + TILE : x, my < 0 ? y + TILE : y);
          ctx.scale(mx, my);
          ctx.drawImage(floor, 0, 0, TILE, TILE);
          ctx.restore();
        }
      }
    } else {
      // 兜底：旧的整图背景
      const bg = A.img(`backgrounds/${BG_FILE[this.planeId] ?? 'nest'}.png`);
      if (bg) {
        const startX = Math.floor(camX / ARENA.w) * ARENA.w;
        const startY = Math.floor(camY / ARENA.h) * ARENA.h;
        for (let x = startX; x < camX + ARENA.w; x += ARENA.w)
          for (let y = startY; y < camY + ARENA.h; y += ARENA.h)
            ctx.drawImage(bg, Math.round(x), Math.round(y), ARENA.w, ARENA.h);
      } else { ctx.fillStyle = '#0d1013'; ctx.fillRect(camX, camY, ARENA.w, ARENA.h); }
    }

    // —— 地面压暗罩：压低背景对比，让角色更突出 ——
    ctx.fillStyle = 'rgba(8, 11, 16, 0.30)';
    ctx.fillRect(camX, camY, ARENA.w, ARENA.h);

    // —— 基因尸体（在脚下，先画）——
    for (const o of run.orbs) {
      this.blitClip('gene_orb_pulse', o.x, o.y + Math.sin(o.bob) * 2, o.bob * 4, 0.5)
        || this.dot(o.x, o.y, 5, '#5fb8a6');
    }

    // —— 敌人：按 y 排序，靠下的后画（伪 2.5D 遮挡）——
    const sorted = [...run.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) this.drawEnemy(e, run.player);

    // —— 远程弹幕（暗器/飞弹）——
    this.drawShots(run);

    // —— 玩家剑气（飞行弹）——
    this.drawPlayerShots(run);

    // —— 死亡帧（尸体淡出）——
    this.drawDeaths(run);

    // —— 玩家 ——
    this.drawPlayer(run);

    // —— 特效（静态图，随时间扩散 + 淡出）——
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => {
      const dur = 0.25;
      if (f.t >= dur) return false;
      const a = 1 - f.t / dur;
      const size = 24 + f.t * 44;   // 从小扩散到大
      this.blitSprite(`effects/${f.sprite}.png`, f.x, f.y, size, false, 1, a);
      return true;
    });

    // —— 伤害飘字（暴击金色）——
    this.drawDamageNums(run);

    ctx.restore();

    // —— 全屏闪光（升级/进化瞬间的金色脉冲）——
    if (this.flash > 0) {
      const a = Math.min(0.5, this.flash) * 0.5;
      ctx.fillStyle = `rgba(216, 189, 106, ${a})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  /** 触发全屏闪光（升级/进化反馈） */
  pulse() {
    this.flash = 1;
  }

  drawDamageNums(run) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of run.damageNums ?? []) {
      const a = Math.min(1, n.life / 0.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = n.crit ? '#ffd76a' : '#f5f5f5';
      ctx.font = n.crit ? 'bold 17px monospace' : 'bold 14px monospace';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(String(n.v), n.x, n.y);
      ctx.fillText(String(n.v), n.x, n.y);
    }
    ctx.restore();
  }

  drawEnemy(e, player) {
    const kind = e.kind;
    // 朝向玩家（dx 符号决定左右翻转）
    const facing = player && player.x < e.x ? -1 : 1;
    // 按目标高度缩放，跨关卡散图尺寸不同也能统一体型
    const targetH = kind === 'boss' ? 95 : kind === 'elite' ? 60 : 34;
    const y = e.y;   // 不加颠簸，走路全靠 4 帧拼接（颠簸会「一跳一跳」）
    const base = e.sprite || this.spriteBase(kind, e.variant, e.id);
    let ok = false;
    if (e.attackT > 0) {
      // 攻击动画：attackT 0.3→0，按进度切 起手→劈砍→收招（小怪/精英/Boss 通用）
      const prog = 1 - e.attackT / 0.3;
      const f = prog < 0.35 ? 'atk0' : prog < 0.7 ? 'atk1' : 'atk2';
      ok = this.blitSprite(`units/${base}_${f}.png`, e.x, y, targetH, e.hitFlash > 0, facing)
        || this.blitSprite(`units/${base}_walk0.png`, e.x, y, targetH, e.hitFlash > 0, facing)
        || this.blitSprite(`units/${base}.png`, e.x, y, targetH, e.hitFlash > 0, facing);
      // 刀光特效（优先专属，回退通用）
      this.blitSprite(`effects/${base}_slash.png`, e.x + facing * 16, e.y, targetH * 0.75, false, facing)
        || this.blitSprite('effects/slash.png', e.x + facing * 16, e.y, targetH * 0.75, false, facing);
    } else {
      // 走路动画：4 帧循环（e.anim 每秒 +8）+ 轻微上下颠簸
      const walkF = Math.floor(e.anim) % 4;
      ok = this.blitSprite(`units/${base}_walk${walkF}.png`, e.x, y, targetH, e.hitFlash > 0, facing)
        || this.blitSprite(`units/${base}_walk0.png`, e.x, y, targetH, e.hitFlash > 0, facing)
        || this.blitSprite(`units/${base}.png`, e.x, y, targetH, e.hitFlash > 0, facing)
        || this.blitSprite(`units/minion_${this.planeId}.png`, e.x, y, targetH, e.hitFlash > 0, facing);
    }
    if (!ok) this.dot(e.x, e.y, e.r, e.kind === 'boss' ? '#a678d4' : '#c9556a');

    // 精英 / BOSS 血条
    if (e.kind !== 'minion') {
      const w = e.kind === 'boss' ? 64 : 40;
      this.bar(e.x - w / 2, e.y - e.r - 10, w, 4, e.hp / e.maxHp, '#c9556a');
    }
  }

  /** 敌人 → 资产 basename（武侠按变体分池，id 轮换取不同造型） */
  spriteBase(kind, variant, id) {
    if (kind !== 'minion') {
      if (this.planeId === 'wuxia' && kind === 'boss') return 'jiansheng';
      return `${kind}_${this.planeId}`;
    }
    if (this.planeId === 'wuxia') {
      const pools = {
        walker: ['maozei', 'shanzei', 'biaoshi'],   // 近战
        charger: ['jiutu', 'quanshi'],              // 冲撞/重击
        spitter: ['gunseng'],                       // 远程
      };
      const pool = pools[variant] ?? pools.walker;
      return pool[Math.abs(id ?? 0) % pool.length];
    }
    return `minion_${variant ?? 'walker'}_${this.planeId}`;
  }

  /** 死亡帧淡出（尸体按宽度缩放，避免躺倒姿势被拉成横向巨物） */
  drawDeaths(run) {
    for (const d of run.deaths) {
      const base = d.sprite || this.spriteBase(d.kind, d.variant, d.id);
      const targetW = d.kind === 'minion' ? 30 : d.kind === 'elite' ? 50 : 70;
      const a = Math.max(0, 1 - d.t / 0.5);
      this.blitSpriteW(`units/${base}_death.png`, d.x, d.y, targetW, false, d.facing, a)
        || this.blitSprite(`units/${base}_walk0.png`, d.x, d.y, d.kind === 'minion' ? 34 : d.kind === 'elite' ? 60 : 95, false, d.facing, a);
    }
  }

  /** 远程弹幕（小怪吐出的飞镖/箭/Boss剑气） */
  drawShots(run) {
    for (const s of run.shots ?? []) {
      const facing = s.vx < 0 ? -1 : 1;
      const sprite = s.sprite ?? 'projectile';
      const ok = this.blitSprite(`effects/${sprite}.png`, s.x, s.y, 14, false, facing);
      if (!ok) this.dot(s.x, s.y, 4, '#5fb8a6');
    }
  }

  /** 玩家武器弹体（剑=剑气/枪=子弹/雷=雷电…，朝速度方向翻转） */
  drawPlayerShots(run) {
    for (const s of run.playerShots ?? []) {
      const facing = s.vx < 0 ? -1 : 1;
      const a = Math.min(1, s.life / 0.15);
      const sprite = s.sprite ?? 'sword_qi';
      const ok = this.blitSprite(`effects/${sprite}.png`, s.x, s.y, 22, false, facing, a);
      if (!ok) this.dot(s.x, s.y, 5, '#b8e6d0');
    }
  }

  drawPlayer(run) {
    const p = run.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    if (blink) return;
    // 进化皮肤（待机时显示路线形态）；攻击/走路复用基础动作帧
    const skinBase = run.skin ? `units/player_${run.skin}.png` : 'units/player.png';
    let rel = 'units/player.png';
    if (p.state === 'attack') {
      // 攻击动画：attackCd 初段=抬手(atk0)，中段=劈砍(atk1)，末段=收招(atk2)
      const prog = 1 - Math.max(0, p.attackCd) / 0.333;
      const f = prog < 0.35 ? 0 : prog < 0.7 ? 1 : 2;
      rel = `units/player_atk${f}.png`;
    } else if (p.state === 'walk') rel = `units/player_walk${Math.floor(p.anim) % 4}.png`;
    else rel = skinBase;
    const ok = this.blitSprite(rel, p.x, p.y, 46, p.hitFlash > 0, p.facing)
      || this.blitSprite('units/player.png', p.x, p.y, 46, p.hitFlash > 0, p.facing);
    if (!ok) this.dot(p.x, p.y, p.r, '#e8e2d6');
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

  /** 按目标高度绘制静态散图（新接入的雪碧），支持朝向/受击闪白/整体透明度；带投影+墨线描边防止与地面融合 */
  blitSprite(rel, x, y, targetH, flash = false, facing = 1, alpha = 1) {
    const img = this.assets.img(rel);
    if (!img) return false;
    const scale = targetH / img.height;
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh / 2);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 脚下投影：接地 + 与地面分离
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y + dh * 0.42), dw * 0.30, Math.max(3, dh * 0.09), 0, 0, Math.PI * 2);
    ctx.fill();

    // 墨线描边：沿 alpha 轮廓加一圈细黑边，让角色从背景里跳出来
    if ('filter' in ctx) ctx.filter = 'drop-shadow(0 0 1.5px rgba(0,0,0,0.85))';

    if (facing < 0) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, 0, 0, dw, dh); }
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, dx, dy, dw, dh); }
    }
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.restore();
    return true;
  }

  /** 按目标宽度绘制（用于躺倒的尸体等横向 sprite，避免按高度缩放被拉巨大） */
  blitSpriteW(rel, x, y, targetW, flash = false, facing = 1, alpha = 1) {
    const img = this.assets.img(rel);
    if (!img) return false;
    const scale = targetW / img.width;
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh / 2);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if ('filter' in ctx) ctx.filter = 'drop-shadow(0 0 1.5px rgba(0,0,0,0.85))';
    if (facing < 0) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, 0, 0, dw, dh); }
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(img, dx, dy, dw, dh); }
    }
    if ('filter' in ctx) ctx.filter = 'none';
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
