// ===== tools/cc-shim · 'cc' 模块的最小运行时替身（仅供无编辑器环境冒烟测试）=====
//
// 目的：让 assets/scripts/game/*.ts 这一层在 Node 里**真的执行一遍** ——
// 建节点、挂组件、切界面、驱动整局战斗、走结算。
// 它不渲染任何像素，只保证：API 用法成立、状态机跑得通、没有空引用。
//
// 这不能替代在 Cocos Creator 里预览；它能替代的是「写完没跑过就交付」。

class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) {
    this.r = r; this.g = g; this.b = b; this.a = a;
  }
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
}

class Size {
  constructor(width = 0, height = 0) { this.width = width; this.height = height; }
}

class Component {
  constructor() { this.node = null; this.enabled = true; }
  getComponent(type) { return this.node ? this.node.getComponent(type) : null; }
  addComponent(type) { return this.node.addComponent(type); }
  schedule() {}
  scheduleOnce() {}
}

const NodeEventType = {
  TOUCH_START: 'touch-start',
  TOUCH_MOVE: 'touch-move',
  TOUCH_END: 'touch-end',
  TOUCH_CANCEL: 'touch-cancel',
};

class NodeImpl {
  constructor(name = '') {
    this.name = name;
    this.children = [];
    this._parent = null;
    this._components = [];
    this._handlers = new Map();
    this.active = true;
    this.layer = 33554432;
    this.position = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.destroyed = false;
  }

  get parent() { return this._parent; }
  set parent(p) {
    if (this._parent) {
      const i = this._parent.children.indexOf(this);
      if (i >= 0) this._parent.children.splice(i, 1);
    }
    this._parent = p;
    if (p) p.children.push(this);
  }

  setPosition(x, y, z) {
    if (x instanceof Vec3) { this.position = x; return; }
    this.position = new Vec3(x, y, z ?? 0);
  }

  setScale(x, y, z) { this.scale = new Vec3(x, y, z ?? 1); }
  setSiblingIndex(i) {
    if (!this._parent) return;
    const arr = this._parent.children;
    const cur = arr.indexOf(this);
    if (cur >= 0) { arr.splice(cur, 1); arr.splice(i, 0, this); }
  }

  addComponent(type) {
    const c = new type();
    c.node = this;
    this._components.push(c);
    if (typeof c.onLoad === 'function') c.onLoad();
    return c;
  }

  getComponent(type) {
    return this._components.find((c) => c instanceof type) ?? null;
  }

  removeAllChildren() {
    for (const c of [...this.children]) c._parent = null;
    this.children.length = 0;
  }

  destroy() {
    this.destroyed = true;
    this.parent = null;
    return true;
  }

  on(type, cb, target) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(cb.bind(target ?? this));
  }

  off(type) { this._handlers.delete(type); }

  emit(type, ...args) {
    for (const h of this._handlers.get(type) ?? []) h(...args);
  }

  /** 冒烟测试用：模拟一次点击（TOUCH_START → TOUCH_END） */
  simulateClick() {
    this.emit(NodeEventType.TOUCH_START);
    this.emit(NodeEventType.TOUCH_END);
  }
}

NodeImpl.EventType = NodeEventType;

class UITransform extends Component {
  constructor() {
    super();
    this.contentSize = new Size();
  }
  get width() { return this.contentSize.width; }
  get height() { return this.contentSize.height; }
  setContentSize(w, h) { this.contentSize = new Size(w, h); }
  setAnchorPoint() {}
  convertToNodeSpaceAR(p) { return p; }
}

class UIOpacity extends Component {
  constructor() { super(); this.opacity = 255; }
}

class Graphics extends Component {
  constructor() {
    super();
    this.fillColor = new Color();
    this.strokeColor = new Color();
    this.lineWidth = 1;
    this.ops = [];
  }
  clear() { this.ops.length = 0; }
  rect(...a) { this.ops.push(['rect', ...a]); }
  roundRect(...a) { this.ops.push(['roundRect', ...a]); }
  circle(...a) { this.ops.push(['circle', ...a]); }
  moveTo(...a) { this.ops.push(['moveTo', ...a]); }
  lineTo(...a) { this.ops.push(['lineTo', ...a]); }
  close() { this.ops.push(['close']); }
  fill() { this.ops.push(['fill']); }
  stroke() { this.ops.push(['stroke']); }
}

class Label extends Component {
  constructor() {
    super();
    this.string = '';
    this.fontSize = 20;
    this.lineHeight = 28;
    this.color = new Color();
    this.isBold = false;
    this.horizontalAlign = 0;
    this.verticalAlign = 1;
    this.overflow = 0;
  }
}
Label.HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
Label.VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
Label.Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };

class Sprite extends Component {
  constructor() { super(); this.spriteFrame = null; this.color = new Color(); }
}

class Button extends Component {
  constructor() { super(); this.interactable = true; }
}
Button.EventType = { CLICK: 'click' };

class EventTouch {
  getLocation() { return { x: 0, y: 0 }; }
  getUILocation() { return { x: 0, y: 0 }; }
}

class EventKeyboard {
  constructor(keyCode = 0) { this.keyCode = keyCode; }
}

const KeyCode = { SPACE: 32, KEY_A: 65, KEY_D: 68, KEY_S: 83, KEY_W: 87 };
const Input = { EventType: { KEY_DOWN: 'key-down', KEY_UP: 'key-up' } };
const input = { on() {}, off() {} };

const _store = new Map();
const sys = {
  isMobile: false,
  localStorage: {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => void _store.set(k, String(v)),
    removeItem: (k) => void _store.delete(k),
  },
};

/** tween：立即把终值写上去，不做插值（冒烟测试不关心动画时序） */
function tween(target) {
  const chain = {
    to(_d, props) { Object.assign(target, props); return chain; },
    by(_d, props) { Object.assign(target, props); return chain; },
    call(cb) { cb(); return chain; },
    start() { return chain; },
  };
  return chain;
}

const _decorator = {
  ccclass: () => (target) => target,
  property: () => () => {},
  menu: () => (target) => target,
};

module.exports = {
  Color, Vec3, Size, Component, Node: NodeImpl, UITransform, UIOpacity,
  Graphics, Label, Sprite, Button, EventTouch, EventKeyboard,
  KeyCode, Input, input, sys, tween, _decorator,
};
