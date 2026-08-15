// ===== game/UiKit.ts · 程序化 UI 构件（无预制体依赖）=====
// 本工程当前没有任何美术资源，全部用 Graphics + Label 画。
// 好处：场景文件保持最小、可 diff、不依赖编辑器手工摆放；
// 接素材阶段把这里的 drawPanel/drawButton 换成 Sprite 即可，调用方不用改。
//
// 设计分辨率 960×640（横屏，本轮由竖屏改为横屏）。Canvas 居中锚点 ⇒ x∈[-480,480], y∈[-320,320]。

import { Color, Graphics, Label, Node, UIOpacity, UITransform, Vec3, tween } from 'cc';

export const DESIGN = { width: 960, height: 640 };
export const SAFE = { top: 280, bottom: -280 };

/** 配色（对齐 web 原型的虫巢暗色底 + 基因青 + 位面金） */
export const C = {
  bg: '#0d1013',
  panel: '#1a2027',
  panelDeep: '#10151a',
  line: '#2a333c',
  text: '#d8dde2',
  dim: '#8b969f',
  gold: '#d8bd6a',
  gene: '#5fb8a6',
  danger: '#c9556a',
  heal: '#6fb98a',
  hidden: '#e0a3d8',
  white: '#b9c0c6',
  green: '#6db76d',
  blue: '#5b9bd5',
  purple: '#a678d4',
};

/** 装备稀有度 → 颜色 */
export const RARITY_COLOR: Record<string, string> = {
  white: C.white, green: C.green, blue: C.blue, purple: C.purple, gold: C.gold,
};

export function hex(value: string, alpha = 255): Color {
  const raw = parseInt(value.replace('#', ''), 16);
  return new Color((raw >> 16) & 255, (raw >> 8) & 255, raw & 255, alpha);
}

export function makeNode(name: string, parent: Node, x = 0, y = 0): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  node.parent = parent;
  node.setPosition(new Vec3(x, y, 0));
  return node;
}

export function sizeOf(node: Node, width: number, height: number): UITransform {
  const t = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  t.setContentSize(width, height);
  return t;
}

export interface LabelOpts {
  size?: number;
  color?: string;
  align?: Label.HorizontalAlign;
  width?: number;
  height?: number;
  lineHeight?: number;
  bold?: boolean;
}

export function makeLabel(parent: Node, text: string, x: number, y: number, opts: LabelOpts = {}): Label {
  const node = makeNode('Label', parent, x, y);
  sizeOf(node, opts.width ?? 560, opts.height ?? 32);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = opts.size ?? 20;
  label.lineHeight = opts.lineHeight ?? (opts.size ?? 20) + 8;
  label.color = hex(opts.color ?? C.text);
  label.horizontalAlign = opts.align ?? Label.HorizontalAlign.LEFT;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.RESIZE_HEIGHT;
  label.isBold = opts.bold ?? false;
  return label;
}

/** 圆角面板 */
export function drawPanel(node: Node, w: number, h: number, fill = C.panel, stroke = C.line, radius = 10): Graphics {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.fillColor = hex(fill);
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.fill();
  if (stroke) {
    g.strokeColor = hex(stroke);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
  }
  return g;
}

/** 进度条（血条 / 充能条） */
export function drawBar(node: Node, w: number, h: number, ratio: number, fill: string, bg = '#2a1a1e'): Graphics {
  const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  g.clear();
  g.fillColor = hex(bg);
  g.roundRect(-w / 2, -h / 2, w, h, h / 2);
  g.fill();
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0) {
    g.fillColor = hex(fill);
    g.roundRect(-w / 2, -h / 2, Math.max(h, w * clamped), h, h / 2);
    g.fill();
  }
  return g;
}

export type ButtonStyle = 'normal' | 'primary' | 'danger';

const BTN_FILL: Record<ButtonStyle, string> = {
  normal: '#232c34', primary: '#6b4d2a', danger: '#5a2530',
};
const BTN_LINE: Record<ButtonStyle, string> = {
  normal: '#3d4852', primary: '#8f6a3c', danger: '#7d3745',
};

/**
 * 按钮。热区强制 ≥ 88×88pt 的一半高度（整体策划 2.3：可点区 ≥ 44×44pt，
 * 960×640 设计分辨率下 1pt ≈ 1px，故最小高度取 56 留余量）。
 */
export function makeButton(
  parent: Node,
  text: string,
  x: number,
  y: number,
  w: number,
  onClick: () => void,
  style: ButtonStyle = 'normal',
  h = 60,
): Node {
  const node = makeNode('Button', parent, x, y);
  sizeOf(node, w, Math.max(56, h));
  drawPanel(node, w, Math.max(56, h), BTN_FILL[style], BTN_LINE[style], 8);
  makeLabel(node, text, 0, 0, {
    size: 20,
    color: style === 'primary' ? '#f2e6cf' : C.text,
    align: Label.HorizontalAlign.CENTER,
    width: w - 16,
  });

  const ET = (Node as any).EventType;
  node.on(ET.TOUCH_START, () => {
    node.setScale(0.97, 0.97, 1);
  }, node);
  const release = () => node.setScale(1, 1, 1);
  node.on(ET.TOUCH_END, () => {
    release();
    onClick();
  }, node);
  node.on(ET.TOUCH_CANCEL, release, node);
  return node;
}

/** 一条分隔线 */
export function makeDivider(parent: Node, y: number, w = 580): Node {
  const node = makeNode('Divider', parent, 0, y);
  const g = node.addComponent(Graphics);
  g.strokeColor = hex(C.line);
  g.lineWidth = 1;
  g.moveTo(-w / 2, 0);
  g.lineTo(w / 2, 0);
  g.stroke();
  return node;
}

/** 淡入（里程碑事件用；对应整体策划 6.2 的反馈梯度） */
export function fadeIn(node: Node, duration = 0.18): void {
  const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
  op.opacity = 0;
  tween(op).to(duration, { opacity: 255 }).start();
}

export function clearChildren(node: Node): void {
  for (const child of [...node.children]) child.destroy();
  node.removeAllChildren();
}
