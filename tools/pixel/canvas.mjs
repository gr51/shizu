// ===== pixel/canvas.mjs · 像素画布 =====
// 像素风的三条铁律，全在这个模块里保证：
//   1. **原生低分辨率绘制**，最后整数倍放大（nearest neighbor）—— 不是把高清图降噪
//   2. **受限调色板**，颜色只在色阶的 4 阶之间跳，不做平滑插值
//   3. **有序抖动**（Bayer 4×4）代替渐变 —— 像素画的天空/光晕都靠它

export class Canvas {
  constructor(w, h, fill = [0, 0, 0, 0]) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    if (fill[3] > 0) this.clear(fill);
  }

  clear(c) {
    for (let i = 0; i < this.w * this.h; i++) this.data.set(c, i * 4);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  px(x, y, c) {
    x |= 0; y |= 0;
    if (!this.inside(x, y) || !c || c[3] === 0) return;
    const i = (y * this.w + x) * 4;
    if (c[3] === 255) {
      this.data.set(c, i);
      return;
    }
    // 简单 alpha 混合（只用于光晕/半透 UI）
    const a = c[3] / 255;
    const d = this.data;
    d[i] = d[i] * (1 - a) + c[0] * a;
    d[i + 1] = d[i + 1] * (1 - a) + c[1] * a;
    d[i + 2] = d[i + 2] * (1 - a) + c[2] * a;
    d[i + 3] = Math.max(d[i + 3], c[3]);
  }

  get(x, y) {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fillRect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  /** 实心椭圆（像素画的圆要用这个，不能用抗锯齿圆） */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Bayer 4×4 有序抖动矩阵 —— 像素画渐变的标准做法 */
  static BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  /**
   * 抖动渐变填充：在两色之间按 Bayer 阈值二选一，产生像素风特有的颗粒过渡。
   * @param {(x:number,y:number)=>number} t 返回 0..1 的混合位置
   */
  ditherFill(x, y, w, h, cA, cB, t) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = Math.max(0, Math.min(1, t(i, j)));
        const threshold = (Canvas.BAYER[j & 3][i & 3] + 0.5) / 16;
        this.px(x + i, y + j, k > threshold ? cB : cA);
      }
    }
  }

  /**
   * 绘制 ASCII 精灵图 —— 本项目所有角色/道具/图标的主力手段。
   *
   * 用字符网格手绘每个单位的**剪影与明暗**，字符映射到调色板。
   * 这样每只怪的形状都是照《美术资产设计规范》4.1/4.2 的设定画的，
   * 而不是同一个轮廓换配色 —— 规则 1「剪影可读性」的落地方式。
   *
   * @param {string} art 多行字符串，行首行尾空白会被裁掉
   * @param {Record<string, number[]>} map 字符 → 颜色
   */
  sprite(art, map, ox = 0, oy = 0, name = 'sprite') {
    const rows = art.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
    // 校验：ASCII 图里最容易犯的错是**误打空格** —— 空格不在字符表里会被当成透明，
    // 在角色身上戳出看不见的洞。这种错不该靠肉眼在成图里抓。
    const unknown = new Set();
    for (const row of rows) {
      for (const ch of row) {
        if (ch !== '.' && !map[ch]) unknown.add(ch === ' ' ? '␠(空格)' : ch);
      }
    }
    if (unknown.size) {
      throw new Error(`[${name}] ASCII 图含未定义字符：${[...unknown].join(' ')}　（'.' 才是透明）`);
    }
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = map[row[x]];
        if (c) this.px(ox + x, oy + y, c);
      }
    }
    return { w: Math.max(...rows.map((r) => r.length)), h: rows.length };
  }

  /** ASCII 图的尺寸（不绘制） */
  static measure(art) {
    const rows = art.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
    return { w: Math.max(...rows.map((r) => r.length)), h: rows.length };
  }

  /**
   * 给所有不透明像素加一圈描边（规则 1：统一剪影线）。
   * 只在四邻域为空的地方描，保证 1px 干净轮廓。
   */
  outline(c) {
    const src = new Uint8Array(this.data);
    const alphaAt = (x, y) =>
      (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[(y * this.w + x) * 4 + 3];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (alphaAt(x, y) !== 0) continue;
        if (alphaAt(x - 1, y) || alphaAt(x + 1, y) || alphaAt(x, y - 1) || alphaAt(x, y + 1)) {
          this.px(x, y, c);
        }
      }
    }
  }

  /**
   * 轮廓光：在左上受光侧的边缘补一圈亮色（规则 4：主光左上 45°，青色 rim）。
   * 只补在「自身不透明、且左上方向为空」的像素上。
   */
  rimLight(c, dx = -1, dy = -1) {
    const src = new Uint8Array(this.data);
    const alphaAt = (x, y) =>
      (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[(y * this.w + x) * 4 + 3];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (alphaAt(x, y) === 0) continue;
        if (alphaAt(x + dx, y + dy) === 0) this.px(x, y, c);
      }
    }
  }

  /** 把另一块画布贴上来 */
  blit(other, ox, oy) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const c = other.get(x, y);
        if (c[3] > 0) this.px(ox + x, oy + y, c);
      }
    }
  }

  /** 水平镜像（画一半身体再镜像，是像素画保证左右对称的常用手法） */
  mirrorRight() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < Math.floor(this.w / 2); x++) {
        this.px(this.w - 1 - x, y, this.get(x, y));
      }
    }
  }

  /** 整数倍放大（nearest neighbor）—— 像素风的灵魂，绝不能用插值 */
  scale(n) {
    const out = new Canvas(this.w * n, this.h * n);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c[3] === 0) continue;
        out.fillRect(x * n, y * n, n, n, c);
      }
    }
    return out;
  }
}
