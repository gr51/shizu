/* 极简 cc 模块声明（Cocos Creator 3.x 常用 API），供编辑器外 IDE/类型检查 */
declare module 'cc' {
  export class Vec3 {
    x: number; y: number; z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z?: number): this;
    add(v: Vec3): this; subtract(v: Vec3): this;
    multiplyScalar(s: number): this;
    normalize(): this; length(): number;
    static distance(a: Vec3, b: Vec3): number;
  }
  export class Vec2 {
    x: number; y: number;
    constructor(x?: number, y?: number);
  }
  export class Size {
    width: number; height: number;
    constructor(w?: number, h?: number);
  }
  export class Node {
    name: string; active: boolean;
    position: Vec3; parent: Node | null;
    children: Node[];
    constructor(name?: string);
    addChild(n: Node): void;
    removeFromParent(): void;
    removeAllChildren(): void;
    getComponent<T>(t: new (...a: any[]) => T): T | null;
    getComponent(t: any): any;
    addComponent<T>(t: new (...a: any[]) => T): T;
    addComponent(t: any): any;
    setPosition(x: number | Vec3, y?: number, z?: number): void;
    getPosition(): Vec3;
    setScale(x: number | Vec3, y?: number): void;
    on(type: string, cb: any, target?: any): void;
    off(type: string, cb?: any, target?: any): void;
    destroy(): void;
  }
  export class Component {
    node: Node;
    onLoad?(): void;
    start?(): void;
    update?(dt: number): void;
    onDestroy?(): void;
    schedule(cb: () => void, interval?: number): void;
    unschedule(cb: () => void): void;
    unscheduleAllCallbacks(): void;
  }
  export class Label extends Component {
    string: string; color: Color; fontSize: number;
    horizontalAlign: Label.HorizontalAlign;
    verticalAlign: Label.VerticalAlign;
    overflow: Label.Overflow;
    enableWrapText: boolean;
  }
  export namespace Label {
    enum HorizontalAlign { LEFT, CENTER, RIGHT }
    enum VerticalAlign { TOP, CENTER, BOTTOM }
    enum Overflow { NONE, CLAMP, SHRINK, RESIZE_HEIGHT }
  }
  export class Sprite extends Component {
    color: Color; spriteFrame: SpriteFrame | null; sizeMode: number;
  }
  export class UITransform extends Component {
    contentSize: Size;
    setContentSize(w: number | Size, h?: number): void;
  }
  export class Color {
    r: number; g: number; b: number; a: number;
    constructor(r?: number, g?: number, b?: number, a?: number);
    static fromHEX(out: Color, hex: string): Color;
    clone(): Color;
  }
  export class SpriteFrame { }
  export class Graphics extends Component {
    fillColor: Color; strokeColor: Color; lineWidth: number;
    clear(): void;
    circle(x: number, y: number, r: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, r: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
    fill(): void; stroke(): void;
  }
  export class Button extends Component {
    static EventType: { CLICK: string };
    target: Node | null;
  }
  export class EventKeyboard { keyCode: number; }
  export class EventMouse { getLocation(): Vec2; }
  export class EventTouch { getLocation(): Vec2; }
  export class KeyCode {
    static KEY_W: number; static KEY_A: number; static KEY_S: number; static KEY_D: number;
    static ARROW_UP: number; static ARROW_DOWN: number; static ARROW_LEFT: number; static ARROW_RIGHT: number;
    static SPACE: number;
  }
  export class Input {
    on(type: string, cb: any, target?: any): void;
    off(type: string, cb?: any, target?: any): void;
    static EventType: {
      KEY_DOWN: string; KEY_UP: string;
      MOUSE_DOWN: string; MOUSE_UP: string; MOUSE_MOVE: string;
      TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string;
    };
  }
  export const input: Input;
  export function instantiate<T>(p: T): T;
  export class Prefab { }
  export class Canvas extends Component { }
  export class Camera extends Component { }
  export function view(): { getDesignResolutionSize(): Size; getVisibleSize(): Size };
  export class Director {
    static getInstance(): Director;
    getScene(): any;
  }
  export function director(): Director;
  export class sys {
    static localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  }
  export function find(path: string): Node | null;
  export const _decorator: {
    ccclass: (name?: string) => (target: any) => any;
    property: (...args: any[]) => (target: any, key: string) => void;
  };
}
