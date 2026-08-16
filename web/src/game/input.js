// ===== game/input.js · 单摇杆输入（键盘 + 触摸）=====
// 整体策划 2.3：移动 = 左半屏虚拟摇杆（半径 60pt），攻击自动索敌无需操作。
// 桌面用 WASD / 方向键，移动端用触摸摇杆 —— 两者产出同一个 {mx,my}。

export class Input {
  constructor(surface) {
    this.keys = new Set();
    this.touch = { active: false, id: null, ox: 0, oy: 0, mx: 0, my: 0 };
    this.radius = 60;

    window.addEventListener('keydown', (e) => {
      if (KEY_MAP[e.code]) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this.touch.active = true;
      this.touch.id = t.identifier ?? 'mouse';
      this.touch.ox = t.clientX;
      this.touch.oy = t.clientY;
      this.touch.mx = 0;
      this.touch.my = 0;
    };
    const move = (e) => {
      if (!this.touch.active) return;
      const list = e.changedTouches ? [...e.changedTouches] : [e];
      const t = list.find((x) => (x.identifier ?? 'mouse') === this.touch.id);
      if (!t) return;
      const dx = t.clientX - this.touch.ox;
      const dy = t.clientY - this.touch.oy;
      const d = Math.hypot(dx, dy);
      const k = d > this.radius ? this.radius / d : 1;
      this.touch.mx = (dx * k) / this.radius;
      this.touch.my = (dy * k) / this.radius;
      e.preventDefault();
    };
    const end = () => {
      this.touch.active = false;
      this.touch.mx = 0;
      this.touch.my = 0;
    };

    surface.addEventListener('touchstart', start, { passive: false });
    surface.addEventListener('touchmove', move, { passive: false });
    surface.addEventListener('touchend', end);
    surface.addEventListener('touchcancel', end);
    surface.addEventListener('mousedown', start);
    surface.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }

  /** @returns {{mx:number,my:number}} 归一化方向 */
  read() {
    let mx = this.touch.mx;
    let my = this.touch.my;
    for (const code of this.keys) {
      const v = KEY_MAP[code];
      if (v) { mx += v[0]; my += v[1]; }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { mx, my };
  }

  /** 摇杆可视化位置（UI 层画） */
  stick() {
    return this.touch.active
      ? { ox: this.touch.ox, oy: this.touch.oy, mx: this.touch.mx, my: this.touch.my, r: this.radius }
      : null;
  }
}

const KEY_MAP = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
