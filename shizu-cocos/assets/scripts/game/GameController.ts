import {
  _decorator,
  Button,
  Color,
  Component,
  EventKeyboard,
  EventTouch,
  Graphics,
  Input,
  KeyCode,
  Label,
  Node,
  sys,
  UITransform,
  Vec3,
  input,
} from 'cc';
import { GameInput, GameModel } from './GameModel';
import { GameRenderer } from './GameRenderer';

const { ccclass } = _decorator;

function hex(value: string, alpha = 255): Color {
  const raw = parseInt(value.replace('#', ''), 16);
  return new Color((raw >> 16) & 255, (raw >> 8) & 255, raw & 255, alpha);
}

@ccclass('GameController')
export class GameController extends Component {
  private model!: GameModel;
  private renderer!: GameRenderer;
  private worldNode!: Node;
  private keys = new Set<number>();
  private arrowStack: number[] = [];
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchShootX = 0;
  private touchShootY = 0;
  private paused = false;
  private lastState = '';

  private hud!: {
    status: Label;
    room: Label;
    stats: Label;
    banner: Label;
    pause: Label;
    overlay: Node;
    result: Label;
    resultSub: Label;
    restart: Node;
  };

  private touchUi!: {
    root: Node;
    joystick: Node;
    knob: Node;
  };

  onLoad() {
    this.model = new GameModel(Date.now());
    this.buildWorld();
    this.buildHud();
    this.buildTouchControls();
    this.setupInput();
    this.exposeDebugApi();
    this.refreshView();
  }

  onDestroy() {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    if (typeof window !== 'undefined' && (window as any).__shizuGame) delete (window as any).__shizuGame;
  }

  update(dt: number) {
    if (!this.paused) this.model.update(dt, this.readInput());
    this.refreshView();
  }

  private buildWorld() {
    this.worldNode = this.createNode('Arena', this.node);
    this.worldNode.setSiblingIndex(0);
    const graphics = this.worldNode.addComponent(Graphics);
    this.renderer = new GameRenderer(graphics);
  }

  private buildHud() {
    const status = this.createLabel('Status', -426, 286, 330, 32, 16, '#d7d9d2', Label.HorizontalAlign.LEFT);
    const room = this.createLabel('Room', 0, 286, 280, 32, 15, '#d6bd70', Label.HorizontalAlign.CENTER);
    const stats = this.createLabel('Stats', 426, 286, 330, 32, 14, '#8fb7b0', Label.HorizontalAlign.RIGHT);
    const banner = this.createLabel('Banner', 0, 205, 620, 42, 24, '#e4d8b2', Label.HorizontalAlign.CENTER);
    const pause = this.createLabel('Pause', 0, 0, 560, 48, 26, '#e4d8b2', Label.HorizontalAlign.CENTER);
    pause.string = 'PAUSED';
    pause.node.active = false;

    const overlay = this.createNode('ResultOverlay', this.node);
    const overlayTransform = overlay.addComponent(UITransform);
    overlayTransform.setContentSize(960, 640);
    const overlayGraphics = overlay.addComponent(Graphics);
    overlayGraphics.fillColor = hex('#07090b', 220);
    overlayGraphics.rect(-480, -320, 960, 640);
    overlayGraphics.fill();
    overlay.active = false;

    const result = this.createLabel('Result', 0, 48, 640, 60, 34, '#e4d8b2', Label.HorizontalAlign.CENTER, overlay);
    const resultSub = this.createLabel('ResultSub', 0, -10, 640, 36, 15, '#8f9997', Label.HorizontalAlign.CENTER, overlay);
    const restart = this.createNode('Restart', overlay);
    restart.setPosition(0, -92, 0);
    const restartTransform = restart.addComponent(UITransform);
    restartTransform.setContentSize(210, 50);
    const restartGraphics = restart.addComponent(Graphics);
    restartGraphics.fillColor = hex('#6f2c39');
    restartGraphics.roundRect(-105, -25, 210, 50, 6);
    restartGraphics.fill();
    restartGraphics.strokeColor = hex('#a45360');
    restartGraphics.lineWidth = 2;
    restartGraphics.roundRect(-105, -25, 210, 50, 6);
    restartGraphics.stroke();
    const restartLabel = this.createLabel('RestartLabel', 0, 0, 200, 44, 15, '#f2e8dc', Label.HorizontalAlign.CENTER, restart);
    restartLabel.string = 'RESTART';
    restartLabel.verticalAlign = Label.VerticalAlign.CENTER;
    const button = restart.addComponent(Button);
    restart.on(Button.EventType.CLICK as any, () => this.restart(), this);

    this.hud = { status, room, stats, banner, pause, overlay, result, resultSub, restart };
  }

  private buildTouchControls() {
    const root = this.createNode('TouchControls', this.node);
    const forceTouch = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mobile');
    root.active = Boolean((sys as any).isMobile || forceTouch);

    const joystick = this.createNode('MovePad', root);
    joystick.setPosition(-360, -210, 0);
    const joyTransform = joystick.addComponent(UITransform);
    joyTransform.setContentSize(150, 150);
    const joyGraphics = joystick.addComponent(Graphics);
    joyGraphics.fillColor = hex('#11171a', 165);
    joyGraphics.circle(0, 0, 68);
    joyGraphics.fill();
    joyGraphics.strokeColor = hex('#7c8782', 160);
    joyGraphics.lineWidth = 2;
    joyGraphics.circle(0, 0, 68);
    joyGraphics.stroke();

    const knob = this.createNode('MoveKnob', joystick);
    const knobTransform = knob.addComponent(UITransform);
    knobTransform.setContentSize(62, 62);
    const knobGraphics = knob.addComponent(Graphics);
    knobGraphics.fillColor = hex('#c6b88e', 220);
    knobGraphics.circle(0, 0, 29);
    knobGraphics.fill();
    knobGraphics.strokeColor = hex('#ece2c7', 180);
    knobGraphics.lineWidth = 2;
    knobGraphics.circle(0, 0, 29);
    knobGraphics.stroke();

    const eventType = (Node as any).EventType;
    joystick.on(eventType.TOUCH_START, this.onJoystickMove, this);
    joystick.on(eventType.TOUCH_MOVE, this.onJoystickMove, this);
    joystick.on(eventType.TOUCH_END, this.onJoystickEnd, this);
    joystick.on(eventType.TOUCH_CANCEL, this.onJoystickEnd, this);

    this.createShootButton(root, 'ShootUp', 350, -145, 0, 1);
    this.createShootButton(root, 'ShootDown', 350, -245, 0, -1);
    this.createShootButton(root, 'ShootLeft', 300, -195, -1, 0);
    this.createShootButton(root, 'ShootRight', 400, -195, 1, 0);

    this.touchUi = { root, joystick, knob };
  }

  private createShootButton(parent: Node, name: string, x: number, y: number, dx: number, dy: number) {
    const node = this.createNode(name, parent);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(72, 72);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = hex('#541f2b', 210);
    graphics.circle(0, 0, 33);
    graphics.fill();
    graphics.strokeColor = hex('#9b4a57', 200);
    graphics.lineWidth = 2;
    graphics.circle(0, 0, 33);
    graphics.stroke();
    graphics.fillColor = hex('#f0dfc4');
    graphics.moveTo(dx * 14 - dy * 9, dy * 14 + dx * 9);
    graphics.lineTo(dx * 14 + dy * 9, dy * 14 - dx * 9);
    graphics.lineTo(-dx * 10, -dy * 10);
    graphics.close();
    graphics.fill();

    const eventType = (Node as any).EventType;
    node.on(eventType.TOUCH_START, () => {
      this.touchShootX = dx;
      this.touchShootY = dy;
    }, this);
    const release = () => {
      if (this.touchShootX === dx && this.touchShootY === dy) {
        this.touchShootX = 0;
        this.touchShootY = 0;
      }
    };
    node.on(eventType.TOUCH_END, release, this);
    node.on(eventType.TOUCH_CANCEL, release, this);
  }

  private setupInput() {
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  private onKeyDown(e: EventKeyboard) {
    const code = e.keyCode;
    if (code === KeyCode.SPACE) {
      if (this.model.state === 'playing') {
        this.paused = !this.paused;
      } else {
        this.restart();
      }
      return;
    }
    this.keys.add(code);
    if (this.isArrow(code)) {
      const index = this.arrowStack.indexOf(code);
      if (index >= 0) this.arrowStack.splice(index, 1);
      this.arrowStack.push(code);
    }
  }

  private onKeyUp(e: EventKeyboard) {
    const code = e.keyCode;
    this.keys.delete(code);
    const index = this.arrowStack.indexOf(code);
    if (index >= 0) this.arrowStack.splice(index, 1);
  }

  private readInput(): GameInput {
    let moveX = this.touchMoveX;
    let moveY = this.touchMoveY;
    if (this.keys.has(KeyCode.KEY_A)) moveX -= 1;
    if (this.keys.has(KeyCode.KEY_D)) moveX += 1;
    if (this.keys.has(KeyCode.KEY_W)) moveY += 1;
    if (this.keys.has(KeyCode.KEY_S)) moveY -= 1;

    let shootX = this.touchShootX;
    let shootY = this.touchShootY;
    const arrow = this.arrowStack[this.arrowStack.length - 1];
    if (arrow === KeyCode.ARROW_LEFT) { shootX = -1; shootY = 0; }
    if (arrow === KeyCode.ARROW_RIGHT) { shootX = 1; shootY = 0; }
    if (arrow === KeyCode.ARROW_UP) { shootX = 0; shootY = 1; }
    if (arrow === KeyCode.ARROW_DOWN) { shootX = 0; shootY = -1; }
    return { moveX, moveY, shootX, shootY };
  }

  private refreshView() {
    const shake = this.model.shake;
    this.worldNode.setPosition(
      shake > 0 ? (Math.random() - 0.5) * shake : 0,
      shake > 0 ? (Math.random() - 0.5) * shake : 0,
      0,
    );
    this.renderer.draw(this.model);
    this.hud.status.string = `HP ${this.model.player.hp} / ${this.model.player.maxHp}`;
    this.hud.room.string = this.model.room === this.model.roomCount
      ? 'CORE CHAMBER'
      : `RIFT ${this.model.room} / ${this.model.roomCount}`;
    this.hud.stats.string = `KILLS ${this.model.kills}   GENE ${this.model.genes}`;
    this.hud.banner.node.active = this.model.bannerTime > 0 && this.model.state === 'playing';
    this.hud.banner.string = this.model.banner;
    this.hud.pause.node.active = this.paused && this.model.state === 'playing';

    if (this.lastState !== this.model.state) {
      this.lastState = this.model.state;
      const finished = this.model.state === 'dead' || this.model.state === 'win';
      this.hud.overlay.active = finished;
      if (finished) {
        const win = this.model.state === 'win';
        this.hud.result.string = win ? 'CORE CONSUMED' : 'RIFT COLLAPSED';
        this.hud.resultSub.string = win
          ? `击杀 ${this.model.kills} · 基因 ${this.model.genes} · ${this.model.elapsed.toFixed(1)}s`
          : `抵达裂隙 ${this.model.room} · 击杀 ${this.model.kills}`;
      }
    }
  }

  private onJoystickMove(e: EventTouch) {
    const local = this.eventToCanvas(e);
    const origin = this.touchUi.joystick.position;
    let dx = local.x - origin.x;
    let dy = local.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 52) {
      dx = dx / distance * 52;
      dy = dy / distance * 52;
    }
    this.touchUi.knob.setPosition(dx, dy, 0);
    this.touchMoveX = dx / 52;
    this.touchMoveY = dy / 52;
  }

  private onJoystickEnd() {
    this.touchUi.knob.setPosition(0, 0, 0);
    this.touchMoveX = 0;
    this.touchMoveY = 0;
  }

  private eventToCanvas(e: EventTouch): Vec3 {
    const point = (e as any).getUILocation ? (e as any).getUILocation() : e.getLocation();
    const transform = this.node.getComponent(UITransform) as any;
    return transform.convertToNodeSpaceAR(new Vec3(point.x, point.y, 0));
  }

  private restart() {
    this.keys.clear();
    this.arrowStack.length = 0;
    this.paused = false;
    this.onJoystickEnd();
    this.touchShootX = 0;
    this.touchShootY = 0;
    this.model.reset(Date.now());
    this.lastState = '';
    this.refreshView();
  }

  private exposeDebugApi() {
    if (typeof window === 'undefined') return;
    (window as any).__shizuGame = {
      snapshot: () => this.model.getSnapshot(),
      restart: () => this.restart(),
      clearRoom: () => {
        for (const enemy of this.model.enemies) enemy.hp = 0;
      },
      model: this.model,
    };
  }

  private createNode(name: string, parent: Node): Node {
    const node = new Node(name);
    (node as any).layer = (parent as any).layer;
    node.parent = parent;
    return node;
  }

  private createLabel(
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    textColor: string,
    align: Label.HorizontalAlign,
    parent: Node = this.node,
  ): Label {
    const node = this.createNode(name, parent);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    const label = node.addComponent(Label);
    label.fontSize = fontSize;
    label.color = hex(textColor);
    label.horizontalAlign = align;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;
    return label;
  }

  private isArrow(code: number): boolean {
    return code === KeyCode.ARROW_LEFT || code === KeyCode.ARROW_RIGHT
      || code === KeyCode.ARROW_UP || code === KeyCode.ARROW_DOWN;
  }
}
