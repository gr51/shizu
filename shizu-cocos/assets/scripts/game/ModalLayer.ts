// ===== game/ModalLayer.ts · 全屏弹层（三选一 / 裂缝卡 / 结算 / 图鉴 / 背包）=====
// 整体策划 6.1：升级三选一为「全屏弹层」，技能槽冲突与结算同样走弹窗。

import { Graphics, Label, Node, UITransform } from 'cc';
import { C, DESIGN, clearChildren, drawPanel, fadeIn, hex, makeButton, makeLabel, makeNode, sizeOf } from './UiKit';

export interface ModalButton {
  text: string;
  style?: 'normal' | 'primary' | 'danger';
  onClick: () => void;
}

export interface ModalRow {
  text: string;
  color?: string;
  size?: number;
}

export interface ModalSpec {
  title: string;
  rows: ModalRow[];
  buttons: ModalButton[];
}

export class ModalLayer {
  private root: Node;
  private open = false;

  constructor(parent: Node) {
    this.root = makeNode('ModalLayer', parent);
    this.root.active = false;
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(spec: ModalSpec): void {
    clearChildren(this.root);
    this.root.active = true;
    this.open = true;

    // 遮罩：吃掉底层点击
    const mask = makeNode('Mask', this.root);
    sizeOf(mask, DESIGN.width, DESIGN.height);
    const mg = mask.addComponent(Graphics);
    mg.fillColor = hex('#06090b', 200);
    mg.rect(-DESIGN.width / 2, -DESIGN.height / 2, DESIGN.width, DESIGN.height);
    mg.fill();
    mask.on((Node as any).EventType.TOUCH_START, () => {}, mask);

    // 面板高度按内容行数与按钮数估算
    const rowH = 30;
    const btnH = 62;
    const bodyH = spec.rows.length * rowH;
    const panelH = Math.min(
      DESIGN.height - 80,
      110 + bodyH + spec.buttons.length * btnH,
    );
    const panelW = 580;

    const panel = makeNode('Panel', this.root, 0, 0);
    sizeOf(panel, panelW, panelH);
    drawPanel(panel, panelW, panelH, C.panel, '#3a444e', 12);

    let y = panelH / 2 - 40;
    makeLabel(panel, spec.title, 0, y, {
      size: 24, color: C.gold, align: Label.HorizontalAlign.CENTER, width: panelW - 40, bold: true,
    });
    y -= 42;

    for (const row of spec.rows) {
      makeLabel(panel, row.text, -(panelW - 48) / 2, y, {
        size: row.size ?? 17,
        color: row.color ?? C.text,
        width: panelW - 48,
        height: rowH,
      });
      y -= rowH;
    }

    y -= 12;
    for (const b of spec.buttons) {
      makeButton(panel, b.text, 0, y - btnH / 2 + 8, panelW - 60, () => {
        this.close();
        b.onClick();
      }, b.style ?? 'normal');
      y -= btnH;
    }

    fadeIn(this.root);
  }

  close(): void {
    this.open = false;
    this.root.active = false;
    clearChildren(this.root);
  }
}
