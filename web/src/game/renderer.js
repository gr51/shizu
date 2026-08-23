// ===== game/renderer.js · Canvas 像素渲染 =====
// 规则：整数倍缩放 + 关闭平滑 + 坐标取整。任何一条破了，像素风立刻变糊。

import { ARENA, DASH_WINDUP, FUSE_BLAST_RADIUS, FUSE_TIME, SLAM_WINDUP, SLAM_RADIUS } from '../../../shizu-cocos/assets/scripts/core/battle.js';

// 特效类型 → effects/ 目录下的静态图文件名
const FX_SPRITE = {
  hit: 'hit', crit: 'crit', gene: 'gene_pickup',
  slash: 'slash', sword_hit: 'sword_hit', burst: null, surge: null,
};

// 调色板：十六进制与 shizu-cocos/assets/scripts/game/UiKit.ts 的 C 表同源，
// 外加战斗语义扩展（精英/自爆/践踏/引信/暴击…）。渲染端只在此处写颜色值 ——
// 改色一处生效，避免「金四种、红五种」式的漂移。
/**
 * 没有贴图、靠程序化绘制的特效：类型 → 持续时长（秒）。
 * 本作是「纯程序化、无 prefab」的架构，这些机制表现不该为了几个圆环去出图。
 */
const PROC_FX = {
  lightning: 0.38,   // 渡劫：随机落雷
  laser: 0.30,       // 机关城 / 奇巧：激光横扫
  stomp: 0.42,       // 山海 / 巨神：巨型践踏
  slam: 0.42,        // 重装怪践踏落地
  spit: 0.16,        // 远程起手枪口闪
  elite: 0.50,       // 精英抬手预警
  boss: 0.60,        // 位面之主抬手预警
  devour: 0.40,      // 吞噬爆发
  dodge: 0.22,       // 闪避翻滚
  shield: 0.40,      // 护盾
  skill: 0.26,       // 主动技释放
};

const PAL = {
  bgFallback: '#0d1013',   // 兜底底色（= C.bg）
  gene: '#5fb8a6',         // 基因青（= C.gene）
  gold: '#d8bd6a',         // 位面金（= C.gold）
  danger: '#c9556a',       // 敌意红（= C.danger）
  boss: '#a678d4',         // Boss 紫（= C.purple）
  elite: '#e08a4c',        // 精英橙
  bomber: '#e0653c',       // 自爆 / 冲撞预警橙红
  tank: '#7fa8c9',         // 重装灰蓝
  slam: '#c9a227',         // 践踏蓄力土金（刻意区别于位面金）
  fuse: '#ff6b4a',         // 引信烧红
  crit: '#ffd76a',         // 暴击亮金（比 UI 金亮一档，只用于飘字）
  dmgText: '#f5f5f5',      // 普通伤害白
  shotDot: '#b8e6d0',      // 玩家弹体兜底点
  playerDot: '#e8e2d6',    // 玩家兜底点
  barBg: '#11151a',        // 单位血条底
  shotTrail: 'rgba(255, 140, 110, 0.4)',   // 敌方弹体拖尾（暖色 = 危险向）
};

export class Renderer {
  constructor(canvas, assets, planeId) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.planeId = planeId;
    this.fx = [];             // 活跃特效实例
    this.procFx = [];         // 程序化特效实例（无贴图，见 PROC_FX）
    this._outlines = new Map();   // 墨线描边版贴图缓存（键 = 原始 Image）
    this.shake = 0;
    this.flash = 0;           // 全屏闪光（升级/进化瞬间）
    this.pop = 0;             // 镜头缩放脉冲（升级瞬间 zoom）
    this.hurtT = 0;           // 受击红闪剩余时长（屏幕级反馈）
    this._wasHurt = false;    // 上一帧受击态（边沿检测用）
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  /** 摘除 resize 监听：战斗结束时调用，避免每局叠加一个渲染器监听 */
  dispose() {
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = null;
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    // 半整数步进缩放，保证像素网格不被拉歪。
    // 宽高必须取自同一个比值并同步取整 —— 旧写法高度方向用原始浮点
    // （availH / ARENA.h），扁窗口下会得到 1.25 这类非整数倍：
    // 每个游戏像素被摊成 1~2 设备像素不等，镜头一动全场像素「游动」。
    const fit = Math.min(availW / ARENA.w, availH / ARENA.h);
    const scale = Math.max(1, Math.floor(fit * 2) / 2);
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
      } else if (e.type === 'slam') {
        // tank 践踏落地：同位面爆裂贴图，但震动更重 —— 重击要有重量感
        this.fx.push({ sprite: `burst_${this.planeId}`, x: e.x, y: e.y, t: 0 });
        this.shake = Math.max(this.shake, 4);
      } else if (e.type === 'surge') {
        this.shake = Math.max(this.shake, 5);
      } else {
        const s = FX_SPRITE[e.type];
        if (s) this.fx.push({ sprite: s, x: e.x, y: e.y, t: 0 });
        // 没有贴图的类型走程序化绘制。核心层一共发 16 种特效，FX_SPRITE 只映射了 7 种 ——
        // 位面机制（落雷/激光/践踏）、精英与 Boss 的抬手预警、闪避、吞噬爆发
        // 此前**全部画不出来**：玩家只会莫名其妙掉血，十二个位面因此长得一模一样。
        else if (PROC_FX[e.type]) {
          this.procFx.push({ type: e.type, x: e.x, y: e.y, data: e.data ?? null, t: 0 });
        }
        if (e.type === 'hit') this.shake = Math.max(this.shake, 5);
        if (e.type === 'crit') this.shake = Math.max(this.shake, 3);
        if (e.type === 'sword_hit') this.shake = Math.max(this.shake, 2);
        if (e.type === 'lightning' || e.type === 'stomp' || e.type === 'slam') {
          this.shake = Math.max(this.shake, 6);
        }
      }
    }
  }

  draw(run, dt) {
    const ctx = this.ctx;
    const A = this.assets;
    ctx.save();
    // 升级 zoom 脉冲：pop 1→0，先放大后回弹
    this.pop = Math.max(0, this.pop - dt * 5);
    const popScale = this.pop > 0 ? 1 + Math.sin((1 - this.pop) * Math.PI) * 0.035 : 1;
    ctx.scale(this.scale * popScale, this.scale * popScale);

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
      } else { ctx.fillStyle = PAL.bgFallback; ctx.fillRect(camX, camY, ARENA.w, ARENA.h); }
    }

    // —— 地面压暗罩 ——
    // 用径向渐晕代替均匀压暗：中心（玩家所在）留亮，四周压深。
    // 均匀压暗压不住无缝地砖的重复感，整片地面读起来像壁纸；
    // 渐晕既打散了规律网格，又把视线收回玩家身上。
    //
    // 渐变在**竞技场局部坐标**里形状恒定，只是整体随相机平移 —— 所以建一次就够。
    // 这里原本每帧 createRadialGradient + 3 次 addColorStop：60fps 下每秒白造
    // 60 个渐变对象，纯粹是 CPU 与 GC 的无谓开销（用户实测反馈过卡顿）。
    if (!this._vignette) {
      const g = ctx.createRadialGradient(
        ARENA.w / 2, ARENA.h / 2, ARENA.h * 0.16,
        ARENA.w / 2, ARENA.h / 2, ARENA.w * 0.62,
      );
      g.addColorStop(0, 'rgba(8, 11, 16, 0.10)');
      g.addColorStop(0.55, 'rgba(8, 11, 16, 0.34)');
      g.addColorStop(1, 'rgba(5, 7, 10, 0.72)');
      this._vignette = g;
    }
    ctx.save();
    ctx.translate(camX, camY);       // 局部坐标 → 世界坐标
    ctx.fillStyle = this._vignette;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.restore();

    // —— 基因尸体（在脚下，先画）——
    for (const o of run.orbs) {
      this.blitClip('gene_orb_pulse', o.x, o.y + Math.sin(o.bob) * 2, o.bob * 4, 0.5)
        || this.blitSprite('items/gene_orb.png', o.x, o.y + Math.sin(o.bob) * 2, 11, false, 1, 1, true)
        || this.dot(o.x, o.y, 5, PAL.gene);
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

    // —— 程序化特效（位面机制 / 预警 / 位移动作）——
    this.drawProcFx(dt);

    // —— 伤害飘字（暴击金色）——
    this.drawDamageNums(run);

    ctx.restore();

    // —— 屏外威胁指示（精英/Boss/自爆在画面外逼近时，边缘画指向楔形）——
    // 怪从约一整个视野之外刷入（core spawnEnemy 以玩家为锚点外扩），
    // 没有这个提示，「被屏外的精英糊脸」会读成不公平的偷袭。
    // 颜色沿用它们脚下光环的语义色；投影忽略震屏/zoom 脉冲（瞬态，肉眼无差）。
    {
      const viewScale = this.scale * popScale;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const MARGIN = 14;
      for (const e of run.enemies ?? []) {
        if (e.dead) continue;
        const color = e.kind !== 'minion'
          ? (e.kind === 'boss' ? PAL.boss : PAL.elite)
          : (e.variant === 'bomber' ? PAL.bomber : null);
        if (!color) continue;
        const px = (e.x - camX) * viewScale;
        const py = (e.y - camY) * viewScale;
        if (px > MARGIN && px < W - MARGIN && py > MARGIN && py < H - MARGIN) continue;
        // 钳到画面内边框上，箭头朝向目标真实方位
        const ax = Math.min(W - MARGIN, Math.max(MARGIN, px));
        const ay = Math.min(H - MARGIN, Math.max(MARGIN, py));
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(py - ay, px - ax));
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-4, 5);
        ctx.lineTo(-4, -5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // —— 全屏闪光（升级/进化瞬间的金色脉冲）——
    if (this.flash > 0) {
      const a = Math.min(0.5, this.flash) * 0.5;
      ctx.fillStyle = `rgba(216, 189, 106, ${a})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.flash = Math.max(0, this.flash - dt * 3);

    // —— 临近死亡：红色暗角脉冲（低血量张力，屏幕边缘渗血）——
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const hpPct = run.hp / Math.max(1, run.stats.maxHp);
    if (hpPct < 0.3) {
      const pulse = 0.28 + Math.sin(performance.now() / 130) * 0.14;
      const a = Math.min(0.85, (1 - hpPct / 0.3) * pulse);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(140, 20, 32, 0)');
      g.addColorStop(1, `rgba(140, 20, 32, ${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // —— 受击红闪：挨打的一瞬屏幕边缘渗一下血 ——
    // 玩家 hitFlash 此前只提亮自身贴图，屏幕毫无反应，高血量时挨打几乎无感；
    // 边沿触发（0→正）保证每次受击恰好一段短脉冲，色相与低血红暗角同源。
    const hurtNow = run.player.hitFlash > 0;
    if (hurtNow && !this._wasHurt) this.hurtT = 0.22;
    this._wasHurt = hurtNow;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hurtT > 0) {
      const k = this.hurtT / 0.22;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(140, 20, 32, 0)');
      g.addColorStop(1, `rgba(140, 20, 32, ${(0.34 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** 触发全屏闪光 + 镜头缩放（升级/进化反馈） */
  pulse() {
    this.flash = 1;
    this.pop = 1;
  }

  /**
   * 程序化特效。核心层发的 16 种特效里有 11 种没有贴图，此前一律不画 ——
   * 位面机制（落雷/激光/践踏）和精英 Boss 的抬手预警因此完全不可见：
   * 玩家只会莫名其妙掉血，而十二个位面的差异恰恰就藏在这些机制里。
   * 这里按语义各画各的形状，颜色统一走 PAL，不新增任何美术资产。
   */
  drawProcFx(dt) {
    const ctx = this.ctx;
    for (const f of this.procFx) f.t += dt;
    this.procFx = this.procFx.filter((f) => {
      const dur = PROC_FX[f.type] ?? 0.3;
      if (f.t >= dur) return false;
      const k = f.t / dur;              // 0→1 进度
      const fade = 1 - k;
      ctx.save();
      ctx.lineCap = 'round';

      switch (f.type) {
        case 'lightning': {
          // 天降雷：先一道抖动的折线劈下，再在落点炸开一圈
          ctx.globalAlpha = Math.min(1, fade * 1.6);
          ctx.strokeStyle = '#cfa8ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          let ly = f.y - 260;
          ctx.moveTo(f.x, ly);
          for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            ctx.lineTo(f.x + Math.sin(i * 2.3 + f.x) * 16 * (1 - t), ly + 260 * t);
          }
          ctx.stroke();
          ctx.globalAlpha = fade * 0.8;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 18 + k * 58, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'laser': {
          // 横扫激光：整条轴线一道亮束，外面套一层辉光
          const horiz = f.data?.horiz ?? true;
          const half = ARENA.w;
          ctx.globalAlpha = fade;
          for (const [w, c] of [[16, 'rgba(255,120,90,0.22)'], [5, '#ff8f6b'], [2, '#ffe6d8']]) {
            ctx.strokeStyle = c;
            ctx.lineWidth = w;
            ctx.beginPath();
            if (horiz) { ctx.moveTo(f.x - half, f.y); ctx.lineTo(f.x + half, f.y); }
            else { ctx.moveTo(f.x, f.y - half); ctx.lineTo(f.x, f.y + half); }
            ctx.stroke();
          }
          break;
        }
        case 'stomp':
        case 'slam': {
          // 践踏：地面冲击环，横向压扁模拟俯视
          ctx.globalAlpha = fade;
          ctx.strokeStyle = f.type === 'slam' ? PAL.slam : PAL.tank;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(f.x, f.y, 20 + k * 110, (20 + k * 110) * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'spit': {
          ctx.globalAlpha = fade;
          ctx.fillStyle = PAL.shotTrail;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 4 + k * 10, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'elite':
        case 'boss': {
          // 抬手预警：一圈从外向内收缩的环 —— 收拢即出手，给玩家读秒的锚点
          ctx.globalAlpha = 0.3 + fade * 0.6;
          ctx.strokeStyle = f.type === 'boss' ? PAL.boss : PAL.elite;
          ctx.lineWidth = f.type === 'boss' ? 4 : 3;
          const r0 = f.type === 'boss' ? 120 : 80;
          ctx.beginPath();
          ctx.arc(f.x, f.y, r0 * (1 - k) + 14, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'devour': {
          ctx.globalAlpha = fade * 0.9;
          ctx.strokeStyle = PAL.gene;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 30 + k * 230, 0, Math.PI * 2);   // ≈ DEVOUR_RADIUS
          ctx.stroke();
          break;
        }
        case 'dodge': {
          ctx.globalAlpha = fade * 0.55;
          ctx.strokeStyle = PAL.playerDot;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 10 + k * 22, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'shield': {
          ctx.globalAlpha = fade * 0.8;
          ctx.strokeStyle = PAL.tank;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 26, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'skill': {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = PAL.gold;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 16 + k * 44, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        default: break;
      }
      ctx.restore();
      return true;
    });
  }

  drawDamageNums(run) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of run.damageNums ?? []) {
      const a = Math.min(1, n.life / 0.4);
      ctx.globalAlpha = n.dot ? a * 0.55 : a;
      ctx.fillStyle = n.crit ? PAL.crit : PAL.dmgText;
      // DoT 跳字降权：小一号、不加粗 —— 灼烧/中毒的跳数不能淹没真正的暴击；
      // 暴击放大一档（17→20），大额伤害在混战中要一眼可辨。
      ctx.font = n.crit ? 'bold 20px monospace' : n.dot ? '10px monospace' : 'bold 14px monospace';
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
    // 特殊敌人可读性：脚下光环区分（自爆红 / 坦克灰蓝 / 伏击金 / 精英橙 / Boss 紫）
    const RING = { bomber: PAL.bomber, tank: PAL.tank };
    const ringColor = e.affix?.color
      ?? (e.ambush ? PAL.gold
      : kind === 'boss' ? PAL.boss
      : kind === 'elite' ? PAL.elite
      : RING[e.variant] ?? null);
    if (ringColor) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.45, e.r * 1.15, e.r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    let ok = false;
    // 冲撞抬手：脚下画一道指向玩家的蓄力条 + 收缩圈。
    // 核心层锁的方向就是这一刻的朝向，玩家读到它才有机会侧身让开 ——
    // 没有这个提示，冲刺在体感上和「突然被瞬移撞一下」没区别。
    if (e.dashWindup > 0) {
      const t = 1 - e.dashWindup / DASH_WINDUP;   // 0→1 蓄满
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = PAL.bomber;
      ctx.strokeStyle = PAL.bomber;
      ctx.beginPath();
      ctx.arc(e.x, e.y + e.r * 0.4, e.r * (2.2 - t * 1.1), 0, Math.PI * 2);
      // 半透明面积 + 实线边界双层编码：光靠描边读不出「圈住多大」
      ctx.globalAlpha = 0.15;
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (player) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        ctx.globalAlpha = 0.5 + t * 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * (26 + t * 26), e.y + Math.sin(a) * (26 + t * 26));
        ctx.stroke();
      }
      ctx.restore();
    }
    // 重装践踏蓄力：脚下金色收缩圈（无方向线 —— AOE 是圆形的，读「圈」就够）。
    // 圈从践踏判定半径收到脚底，收到头就是落地震地的一刻。
    if (e.slamWindup > 0) {
      const t = 1 - e.slamWindup / SLAM_WINDUP;   // 0→1 蓄满
      const ctx = this.ctx;
      ctx.save();
      const pulse = 0.4 + t * 0.5;
      ctx.fillStyle = PAL.slam;
      ctx.strokeStyle = PAL.slam;
      ctx.beginPath();
      ctx.arc(e.x, e.y + e.r * 0.4, Math.max(e.r * 1.15, SLAM_RADIUS * (1 - t * 0.85)), 0, Math.PI * 2);
      ctx.globalAlpha = pulse * 0.3;   // 面积感：圈住的就是要砸的
      ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    // 自爆引信：越烧越快的红闪 + 爆炸半径预告圈，告诉玩家「现在退开还来得及」
    if (e.fuseT > 0) {
      const t = Math.min(1, e.fuseT / FUSE_TIME);
      const ctx = this.ctx;
      ctx.save();
      const pulse = 0.35 + 0.45 * Math.abs(Math.sin(e.fuseT * (8 + t * 26)));
      ctx.fillStyle = PAL.fuse;
      ctx.strokeStyle = PAL.fuse;
      ctx.beginPath();
      // 半径 = 判定值本身（core 导出常量），别让预告圈和实际爆炸圈差一像素
      ctx.arc(e.x, e.y + e.r * 0.4, FUSE_BLAST_RADIUS, 0, Math.PI * 2);
      ctx.globalAlpha = pulse * 0.22;
      ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }
    if (e.attackT > 0) {
      // 攻击动画：attackT 0.3→0，按进度切 起手→劈砍→收招（小怪/精英/Boss 通用）
      const prog = 1 - e.attackT / 0.3;
      const f = prog < 0.35 ? 'atk0' : prog < 0.7 ? 'atk1' : 'atk2';
      ok = this.blitSprite(`units/${base}_${f}.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true)
        || this.blitSprite(`units/${base}_walk0.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true)
        || this.blitSprite(`units/${base}.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true);
      // 刀光特效（优先专属，回退通用）
      this.blitSprite(`effects/${base}_slash.png`, e.x + facing * 16, e.y, targetH * 0.75, false, facing)
        || this.blitSprite('effects/slash.png', e.x + facing * 16, e.y, targetH * 0.75, false, facing);
    } else {
      // 走路动画：4 帧循环（e.anim 每秒 +8）+ 轻微上下颠簸
      const walkF = Math.floor(e.anim) % 4;
      ok = this.blitSprite(`units/${base}_walk${walkF}.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true)
        || this.blitSprite(`units/${base}_walk0.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true)
        || this.blitSprite(`units/${base}.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true)
        || this.blitSprite(`units/minion_${this.planeId}.png`, e.x, y, targetH, e.hitFlash > 0, facing, 1, true);
    }
    if (!ok) this.dot(e.x, e.y, e.r, e.kind === 'boss' ? PAL.boss : PAL.danger);

    // 精英 / BOSS 血条；伏击与词缀额外标注，提示「这只不一样」
    if (e.kind !== 'minion') {
      const w = e.kind === 'boss' ? 64 : 40;
      this.bar(e.x - w / 2, e.y - e.r - 10, w, 4, e.hp / e.maxHp, e.ambush ? PAL.gold : PAL.danger);
      const tags = [];
      if (e.ambush) tags.push('伏击');
      if (e.affix) tags.push(e.affix.name);
      if (tags.length) {
        const ctx = this.ctx;
        ctx.save();
        // 13px + 黑描边：11px 的细字在 scale=1 的画布上读不清，词缀等于没写
        ctx.fillStyle = e.affix?.color ?? PAL.gold;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        const label = tags.join('·');
        ctx.strokeText(label, e.x, e.y - e.r - 16);
        ctx.fillText(label, e.x, e.y - e.r - 16);
        ctx.restore();
      }
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
    // MINION_VARIANTS 有 5 种，但 generate.mjs 只产 walker/charger/spitter 三套贴图。
    // tank / bomber（合计约 14% 刷新权重）复用体型最接近的那套 ——
    // 它们本来就靠脚下光环区分（RING: bomber 红 / tank 灰蓝），不映射就会画成色块。
    const ART_VARIANT = { tank: 'walker', bomber: 'charger' };
    const v = ART_VARIANT[variant] ?? variant ?? 'walker';
    return `minion_${v}_${this.planeId}`;
  }

  /** 死亡帧淡出（尸体按宽度缩放，避免躺倒姿势被拉成横向巨物） */
  drawDeaths(run) {
    for (const d of run.deaths) {
      const base = d.sprite || this.spriteBase(d.kind, d.variant, d.id);
      const targetW = d.kind === 'minion' ? 30 : d.kind === 'elite' ? 50 : 70;
      const a = Math.max(0, 1 - d.t / 0.5);
      this.blitSpriteW(`units/${base}_death.png`, d.x, d.y, targetW, false, d.facing, a)
        || this.blitSprite(`units/${base}_walk0.png`, d.x, d.y, d.kind === 'minion' ? 34 : d.kind === 'elite' ? 60 : 95, false, d.facing, a, true);
      // 死亡爆闪：借现成的 hit.png 在倒地头几帧叠一下 —— 匀速淡出没有
      // 「击杀峰值」，割草最爽的一拍不该是视觉上的平局（零新资产）。
      if (d.t < 0.06) this.blitSprite('effects/hit.png', d.x, d.y, targetW * 1.3, false, 1, 0.8);
    }
  }

  /** 远程弹幕（小怪吐出的飞镖/箭/Boss剑气） */
  drawShots(run) {
    for (const s of run.shots ?? []) {
      const facing = s.vx < 0 ? -1 : 1;
      const sprite = s.sprite ?? 'projectile';
      // 来路拖尾：反速度方向一条暖色短线 —— 敌方弹体是玩家主要死因，
      // 14px 的静止单帧在暗色地板上读不出飞行轨迹，躲弹变成猜弹。
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = PAL.shotTrail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - (s.vx || 0) * 0.06, s.y - (s.vy || 0) * 0.06);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.restore();
      // 14 → 18：致命的东西不该是场上最小的元素
      const ok = this.blitSprite(`effects/${sprite}.png`, s.x, s.y, 18, false, facing);
      if (!ok) this.dot(s.x, s.y, 4, PAL.gene);
    }
  }

  /** 玩家武器弹体（剑=剑气/枪=子弹/雷=雷电…，朝速度方向翻转）。高等级武器弹体更大更亮 */
  drawPlayerShots(run) {
    for (const s of run.playerShots ?? []) {
      const facing = s.vx < 0 ? -1 : 1;
      const a = Math.min(1, s.life / 0.15);
      const sprite = s.sprite ?? 'sword_qi';
      const tier = s.tier ?? 0;
      const size = 22 + tier * 6;             // 进化档位 → 弹体尺寸
      const alpha = Math.min(1, a + tier * 0.15); // 进化档位 → 更不透明
      const ok = this.blitSprite(`effects/${sprite}.png`, s.x, s.y, size, false, facing, alpha);
      if (!ok) this.dot(s.x, s.y, 5 + tier * 2, PAL.shotDot);
    }
  }

  drawPlayer(run) {
    const p = run.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
    if (blink) return;
    // 可读性：玩家脚下光圈，60 只怪里一眼认出自己
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = PAL.gene;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 16, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 统一形象（用户反馈：AI 分次生成的 idle/walk 帧是两个角色，观感割裂）——
    // 全状态只用同一张基础像（皮肤优先），动感改由程序化表达：
    //   移动 = 跑步颠步（bob）+ 前倾；待机 = 呼吸起伏；攻击 = 向前突刺
    const skinBase = run.skin ? `units/player_${run.skin}.png` : 'units/player.png';
    let rel = 'units/player.png';
    if (run.skin) rel = skinBase;
    const moving = p.state === 'walk';
    const bob = moving ? Math.abs(Math.sin(p.anim * 1.6)) * 3.5 : Math.sin(p.anim * 0.5) * 1.2;
    const lunge = p.state === 'attack' ? p.facing * 7 : 0;
    const lean = moving ? p.facing * 0.06 : 0;
    const y = p.y - bob;
    const ok = this.blitSprite(rel, p.x + lunge, y, 46, p.hitFlash > 0, p.facing, 1, true)
      || this.blitSprite('units/player.png', p.x + lunge, y, 46, p.hitFlash > 0, p.facing, 1, true);
    void ok;
    if (!ok) this.dot(p.x, p.y, p.r, PAL.playerDot);
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

  /**
   * 缓存「墨线描边」版贴图：四方向各偏移 1px 的深墨剪影打底，再叠原图。
   * 取代逐帧 ctx.filter='drop-shadow' —— filter 每次绘制都走离屏合成慢路径，
   * 60 怪同屏时是最大的帧率杀手；且高斯晕是软灰圈，不如 1px 硬墨线贴水墨风。
   * 每张贴图只构建一次（键 = 原始 Image 元素），之后零额外开销。
   */
  outlined(img) {
    let cached = this._outlines.get(img);
    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = img.width + 2;
      cached.height = img.height + 2;
      const g = cached.getContext('2d');
      g.drawImage(img, 0, 1);
      g.drawImage(img, 2, 1);
      g.drawImage(img, 1, 0);
      g.drawImage(img, 1, 2);
      g.globalCompositeOperation = 'source-in';   // 剪影只保留 alpha 轮廓
      g.fillStyle = 'rgba(12, 12, 16, 0.9)';
      g.fillRect(0, 0, cached.width, cached.height);
      g.globalCompositeOperation = 'source-over';
      g.drawImage(img, 1, 1);
      this._outlines.set(img, cached);
    }
    return cached;
  }

  /** 按目标高度绘制静态散图（新接入的雪碧），支持朝向/受击闪白/整体透明度；带投影防止与地面融合。
   *  outlined=true 时叠加缓存的墨线描边（角色/拾取物用；特效不需要，省一笔开销）。 */
  blitSprite(rel, x, y, targetH, flash = false, facing = 1, alpha = 1, outlined = false) {
    const img = this.assets.img(rel);
    if (!img) return false;
    const scale = targetH / img.height;
    const dw = Math.round(img.width * scale);
    const dh = Math.round(img.height * scale);
    const dx = Math.round(x - dw / 2);
    const dy = Math.round(y - dh / 2);
    // 描边版比原图四周各多 ~1 游戏像素的墨边，绘制矩形同步外扩
    const src = outlined ? this.outlined(img) : img;
    const o = outlined ? Math.round(scale) : 0;
    const rx = dx - o;
    const ry = dy - o;
    const rw = dw + o * 2;
    const rh = dh + o * 2;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 脚下投影：接地 + 与地面分离
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y + dh * 0.42), dw * 0.30, Math.max(3, dh * 0.09), 0, 0, Math.PI * 2);
    ctx.fill();

    if (facing < 0) {
      ctx.translate(rx + rw, ry);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, rw, rh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(src, 0, 0, rw, rh); }
    } else {
      ctx.drawImage(src, rx, ry, rw, rh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(src, rx, ry, rw, rh); }
    }
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
    const o = Math.round(scale);   // 尸体固定走描边版：躺倒姿态贴地，没墨线会和地板糊成一片
    const rx = dx - o;
    const ry = dy - o;
    const rw = dw + o * 2;
    const rh = dh + o * 2;
    const src = this.outlined(img);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (facing < 0) {
      ctx.translate(rx + rw, ry);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, rw, rh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(src, 0, 0, rw, rh); }
    } else {
      ctx.drawImage(src, rx, ry, rw, rh);
      if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(src, rx, ry, rw, rh); }
    }
    ctx.restore();
    return true;
  }

  /** 贴图缺失时的兜底。画圆不画方 —— 方块在像素场景里像「没加载出来的占位图」，
      圆点至少读得出是个单位。 */
  dot(x, y, r, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), Math.max(2, Math.round(r)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  bar(x, y, w, h, ratio, color) {
    const ctx = this.ctx;
    // 先画一圈浅灰外框再填底：底色 #11151a 在渐晕压暗的屏幕边缘几乎隐形
    ctx.fillStyle = '#3a444e';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, h + 2);
    ctx.fillStyle = PAL.barBg;
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
