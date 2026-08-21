// ===== game/input.js · 单摇杆输入（键盘 + 触摸）=====
// 整体策划 2.3：移动 = 左半屏虚拟摇杆（半径 60pt），攻击自动索敌无需操作。
// 桌面用 WASD / 方向键，移动端用触摸摇杆 —— 两者产出同一个 {mx,my}。

export class Input {
  constructor(surface) {
    this.keys = new Set();
    /** 本帧待消费的动作（读一次即清空，避免长按连发） */
    this.pending = { dodge: false, devour: false };
    this.holdT = 0;
    this.touch = { active: false, id: null, ox: 0, oy: 0, mx: 0, my: 0 };
    this.radius = 60;
    /** 已注册监听，dispose() 时统一摘除（多次开局不会叠加多套输入） */
    this._bound = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._bound.push([target, type, fn, opts]);
    };

    on(window, 'keydown', (e) => {
      if (KEY_MAP[e.code] || ACTION_KEYS[e.code]) e.preventDefault();
      if (this.keys.has(e.code)) return;           // 忽略系统重复触发
      this.keys.add(e.code);
      const act = ACTION_KEYS[e.code];
      if (act) this.pending[act] = true;
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

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

    on(surface, 'touchstart', start, { passive: false });
    on(surface, 'touchmove', move, { passive: false });
    on(surface, 'touchend', end);
    on(surface, 'touchcancel', end);
    on(surface, 'mousedown', start);
    on(surface, 'mousemove', move);
    on(window, 'mouseup', end);
  }

  /** 摘除全部监听：战斗结束时调用，避免多次开局叠加输入处理 */
  dispose() {
    for (const [target, type, fn, opts] of this._bound) target.removeEventListener(type, fn, opts);
    this._bound = [];
    this.keys.clear();
    this.touch.active = false;
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

  /**
   * 取出并清空本帧的动作请求。
   * @returns {{dodge:boolean, devour:boolean}}
   */
  takeActions() {
    const a = { ...this.pending };
    this.pending.dodge = false;
    this.pending.devour = false;
    return a;
  }

  /** 触摸端：长按 0.4s 触发吞噬爆发（整体策划 2.3） */
  tickHold(dt) {
    if (!this.touch.active) { this.holdT = 0; return; }
    // 摇杆几乎没动 = 长按而不是拖动
    if (Math.hypot(this.touch.mx, this.touch.my) < 0.25) {
      this.holdT += dt;
      if (this.holdT >= 0.4) { this.pending.devour = true; this.holdT = -999; }
    } else {
      this.holdT = 0;
    }
  }

  /** 摇杆可视化位置（UI 层画） */
  stick() {
    return this.touch.active
      ? { ox: this.touch.ox, oy: this.touch.oy, mx: this.touch.mx, my: this.touch.my, r: this.radius }
      : null;
  }
}

/** 动作键：空格=吞噬爆发，Shift=闪避翻滚 */
const ACTION_KEYS = {
  Space: 'devour',
  ShiftLeft: 'dodge',
  ShiftRight: 'dodge',
  KeyJ: 'dodge',
  KeyK: 'devour',
};

const KEY_MAP = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
