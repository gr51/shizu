/**
 * cc.d.ts —— **编辑器外**类型检查用的最小声明桩。
 *
 * ⚠ 这不是 Cocos 的官方类型定义，只声明了本工程真正用到的那部分 API。
 *   在 Cocos Creator 编辑器里打开工程时，编辑器会注入引擎自带的完整声明，
 *   本文件被 tsconfig 的 paths 指到，仅供 `npm run typecheck` 在无编辑器环境下跑。
 *   若某个 API 在这里缺声明而在引擎里存在，补一行即可，不影响实际运行。
 *
 * 上一版工程也有一个同类桩文件，问题在于它没标注来源，导致 `setSiblingIndex`
 * 这种引擎里明明存在的方法被报成错误。这次把边界写清楚。
 */
declare module 'cc' {
  export class Color {
    constructor(r?: number, g?: number, b?: number, a?: number);
    r: number; g: number; b: number; a: number;
  }

  export class Vec3 {
    constructor(x?: number, y?: number, z?: number);
    x: number; y: number; z: number;
  }

  export class Size {
    constructor(width?: number, height?: number);
    width: number; height: number;
  }

  export class Component {
    node: Node;
    enabled: boolean;
    getComponent<T>(type: new (...args: any[]) => T): T | null;
    addComponent<T>(type: new (...args: any[]) => T): T;
    schedule(callback: () => void, interval?: number): void;
    scheduleOnce(callback: () => void, delay?: number): void;
    onLoad?(): void;
    start?(): void;
    update?(dt: number): void;
    onDestroy?(): void;
  }

  export class Node {
    constructor(name?: string);
    name: string;
    parent: Node | null;
    children: Node[];
    active: boolean;
    layer: number;
    position: Vec3;
    static EventType: Record<string, string>;
    setPosition(pos: Vec3): void;
    setPosition(x: number, y: number, z?: number): void;
    setScale(x: number, y: number, z?: number): void;
    setSiblingIndex(index: number): void;
    getComponent<T>(type: new (...args: any[]) => T): T | null;
    addComponent<T>(type: new (...args: any[]) => T): T;
    removeAllChildren(): void;
    destroy(): boolean;
    on(type: string, callback: (...args: any[]) => void, target?: any): void;
    off(type: string, callback?: (...args: any[]) => void, target?: any): void;
    emit(type: string, ...args: any[]): void;
  }

  export class UITransform extends Component {
    contentSize: Size;
    width: number;
    height: number;
    setContentSize(width: number, height: number): void;
    setAnchorPoint(x: number, y: number): void;
    convertToNodeSpaceAR(worldPoint: Vec3): Vec3;
  }

  export class UIOpacity extends Component {
    opacity: number;
  }

  export class Graphics extends Component {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    clear(): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, radius: number): void;
    circle(x: number, y: number, r: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
    fill(): void;
    stroke(): void;
  }

  export class Label extends Component {
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    isBold: boolean;
    horizontalAlign: Label.HorizontalAlign;
    verticalAlign: Label.VerticalAlign;
    overflow: Label.Overflow;
  }

  // 类 + 命名空间声明合并：让 Label.HorizontalAlign 既能当值又能当类型用，
  // 与引擎自带声明的行为一致。
  export namespace Label {
    export enum HorizontalAlign { LEFT = 0, CENTER = 1, RIGHT = 2 }
    export enum VerticalAlign { TOP = 0, CENTER = 1, BOTTOM = 2 }
    export enum Overflow { NONE = 0, CLAMP = 1, SHRINK = 2, RESIZE_HEIGHT = 3 }
  }

  export class Sprite extends Component {
    spriteFrame: any;
    color: Color;
  }

  export class Button extends Component {
    static EventType: Record<string, string>;
    interactable: boolean;
  }

  export class EventTouch {
    getLocation(): { x: number; y: number };
    getUILocation(): { x: number; y: number };
  }

  export class EventKeyboard {
    keyCode: number;
  }

  export const KeyCode: Record<string, number>;

  export const Input: { EventType: Record<string, string> };
  export const input: {
    on(type: string, cb: (...args: any[]) => void, target?: any): void;
    off(type: string, cb?: (...args: any[]) => void, target?: any): void;
  };

  export const sys: {
    isMobile: boolean;
    localStorage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
      removeItem(key: string): void;
    };
  };

  export function tween<T>(target: T): {
    to(duration: number, props: Partial<T>): any;
    by(duration: number, props: Partial<T>): any;
    call(cb: () => void): any;
    start(): any;
  };

  export const _decorator: {
    ccclass: (name?: string) => ClassDecorator;
    property: (options?: any) => PropertyDecorator;
    menu: (path: string) => ClassDecorator;
  };
}
