export type GameState = 'playing' | 'dead' | 'win';
export type EnemyKind = 'crawler' | 'spitter' | 'charger' | 'boss';

export interface GameInput {
  moveX: number;
  moveY: number;
  shootX: number;
  shootY: number;
}

export interface CircleBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface PlayerState extends CircleBody {
  hp: number;
  maxHp: number;
  speed: number;
  fireCd: number;
  invuln: number;
  hitFlash: number;
  facingX: number;
  facingY: number;
}

export interface EnemyState extends CircleBody {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  contact: number;
  cooldown: number;
  timer: number;
  mode: string;
  hitFlash: number;
  dead: boolean;
}

export interface BulletState extends CircleBody {
  id: number;
  friendly: boolean;
  damage: number;
  life: number;
  color: string;
}

export interface ObstacleState {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'rock' | 'growth';
}

export interface PickupState {
  id: number;
  x: number;
  y: number;
  r: number;
  kind: 'heart' | 'gene';
  bob: number;
}

export interface ParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export const ARENA = {
  left: -410,
  right: 410,
  bottom: -238,
  top: 238,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const length = (x: number, y: number) => Math.hypot(x, y);

function normalize(x: number, y: number): { x: number; y: number } {
  const m = length(x, y);
  return m > 0.0001 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
}

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let t = this.state += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export class GameModel {
  state: GameState = 'playing';
  room = 1;
  readonly roomCount = 3;
  kills = 0;
  genes = 0;
  elapsed = 0;
  roomCleared = false;
  doorPulse = 0;
  shake = 0;
  flash = 0;
  hitStop = 0;
  banner = '';
  bannerTime = 0;

  player!: PlayerState;
  enemies: EnemyState[] = [];
  bullets: BulletState[] = [];
  obstacles: ObstacleState[] = [];
  pickups: PickupState[] = [];
  particles: ParticleState[] = [];

  private rng!: Rng;
  private nextId = 1;
  private seed = 0;

  constructor(seed = Date.now()) {
    this.reset(seed);
  }

  reset(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.state = 'playing';
    this.room = 1;
    this.kills = 0;
    this.genes = 0;
    this.elapsed = 0;
    this.nextId = 1;
    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.player = {
      x: -325,
      y: 0,
      vx: 0,
      vy: 0,
      r: 17,
      hp: 6,
      maxHp: 6,
      speed: 225,
      fireCd: 0,
      invuln: 0,
      hitFlash: 0,
      facingX: 1,
      facingY: 0,
    };
    this.startRoom(1);
  }

  update(dtRaw: number, input: GameInput) {
    const frameDt = Math.min(dtRaw, 1 / 20);
    this.elapsed += frameDt;
    this.bannerTime = Math.max(0, this.bannerTime - frameDt);
    this.shake = Math.max(0, this.shake - frameDt * 22);
    this.flash = Math.max(0, this.flash - frameDt * 3.5);
    this.player.invuln = Math.max(0, this.player.invuln - frameDt);
    this.player.hitFlash = Math.max(0, this.player.hitFlash - frameDt);
    this.doorPulse += frameDt * 3;

    if (this.state !== 'playing') {
      this.updateParticles(frameDt);
      return;
    }

    let dt = frameDt;
    if (this.hitStop > 0) {
      this.hitStop -= frameDt;
      dt *= 0.08;
    }

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(frameDt);
    this.removeDeadEntities();

    if (!this.roomCleared && this.enemies.length === 0) {
      this.roomCleared = true;
      this.banner = this.room === this.roomCount ? '裂隙核心已净化' : '通道已开启';
      this.bannerTime = 1.6;
      this.shake = 8;
      this.burst(355, 0, 24, '#d8bd6a', 150);
      if (this.room === this.roomCount) {
        this.state = 'win';
      }
    }

    if (this.roomCleared && this.state === 'playing' && this.player.x > ARENA.right - 8) {
      this.startRoom(this.room + 1);
    }
  }

  getSnapshot() {
    return {
      state: this.state,
      room: this.room,
      roomCleared: this.roomCleared,
      kills: this.kills,
      genes: this.genes,
      player: {
        x: this.player.x,
        y: this.player.y,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
      },
      enemies: this.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, hp: e.hp })),
      bullets: this.bullets.length,
    };
  }

  private startRoom(room: number) {
    this.room = clamp(room, 1, this.roomCount);
    this.roomCleared = false;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.particles = [];
    this.player.x = ARENA.left + 62;
    this.player.y = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invuln = 0.8;
    this.obstacles = this.makeObstacles(this.room);

    if (this.room === this.roomCount) {
      this.spawnEnemy('boss', 150, 0);
      this.spawnEnemy('crawler', 40, 135);
      this.spawnEnemy('crawler', 40, -135);
      this.banner = '位面之主 · 裂口母体';
    } else {
      const count = 3 + this.room * 2;
      const kinds: EnemyKind[] = ['crawler', 'spitter', 'charger'];
      for (let i = 0; i < count; i++) {
        const p = this.findSpawnPoint();
        this.spawnEnemy(kinds[(i + this.room) % kinds.length], p.x, p.y);
      }
      this.banner = `裂隙 ${this.room} / ${this.roomCount}`;
    }
    this.bannerTime = 1.8;
  }

  private makeObstacles(room: number): ObstacleState[] {
    if (room === 1) {
      return [
        { x: -55, y: 95, w: 92, h: 62, kind: 'rock' },
        { x: 120, y: -105, w: 108, h: 70, kind: 'growth' },
      ];
    }
    if (room === 2) {
      return [
        { x: -95, y: 120, w: 76, h: 76, kind: 'growth' },
        { x: -95, y: -120, w: 76, h: 76, kind: 'rock' },
        { x: 130, y: 120, w: 76, h: 76, kind: 'rock' },
        { x: 130, y: -120, w: 76, h: 76, kind: 'growth' },
      ];
    }
    return [
      { x: -35, y: 145, w: 128, h: 48, kind: 'rock' },
      { x: -35, y: -145, w: 128, h: 48, kind: 'rock' },
    ];
  }

  private findSpawnPoint(): { x: number; y: number } {
    for (let i = 0; i < 30; i++) {
      const p = {
        x: this.rng.range(-70, ARENA.right - 65),
        y: this.rng.range(ARENA.bottom + 45, ARENA.top - 45),
      };
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 170) continue;
      if (this.obstacles.some((o) => this.pointInExpandedRect(p.x, p.y, o, 34))) continue;
      return p;
    }
    return { x: 180, y: 0 };
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number) {
    const stats = {
      crawler: { r: 18, hp: 34, speed: 105, contact: 1 },
      spitter: { r: 20, hp: 46, speed: 82, contact: 1 },
      charger: { r: 22, hp: 62, speed: 88, contact: 1 },
      boss: { r: 48, hp: 380, speed: 62, contact: 1 },
    }[kind];
    this.enemies.push({
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: stats.r,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      contact: stats.contact,
      cooldown: this.rng.range(0.5, 1.4),
      timer: this.rng.range(0.7, 1.5),
      mode: 'idle',
      hitFlash: 0,
      dead: false,
    });
  }

  private updatePlayer(dt: number, input: GameInput) {
    const p = this.player;
    const move = normalize(input.moveX, input.moveY);
    const targetVx = move.x * p.speed;
    const targetVy = move.y * p.speed;
    const accel = move.x || move.y ? 2100 : 1700;
    p.vx = approach(p.vx, targetVx, accel * dt);
    p.vy = approach(p.vy, targetVy, accel * dt);
    this.moveBody(p, dt);

    p.fireCd = Math.max(0, p.fireCd - dt);
    const shoot = normalize(input.shootX, input.shootY);
    if (shoot.x || shoot.y) {
      p.facingX = shoot.x;
      p.facingY = shoot.y;
      if (p.fireCd <= 0) {
        this.spawnBullet(true, p.x + shoot.x * 23, p.y + shoot.y * 23, shoot.x * 520, shoot.y * 520, 10, 6, '#dbeaf2');
        p.fireCd = 0.18;
        this.burst(p.x + shoot.x * 20, p.y + shoot.y * 20, 3, '#b8d9e8', 70);
      }
    } else if (move.x || move.y) {
      p.facingX = move.x;
      p.facingY = move.y;
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.cooldown -= dt;
      e.timer -= dt;
      const toPlayer = normalize(p.x - e.x, p.y - e.y);
      const distance = Math.hypot(p.x - e.x, p.y - e.y);

      if (e.kind === 'crawler') {
        e.vx = approach(e.vx, toPlayer.x * e.speed, 700 * dt);
        e.vy = approach(e.vy, toPlayer.y * e.speed, 700 * dt);
      } else if (e.kind === 'spitter') {
        const desired = distance > 245 ? 1 : distance < 165 ? -1 : 0;
        const strafe = Math.sin(this.elapsed * 1.8 + e.id) * 0.48;
        e.vx = approach(e.vx, (toPlayer.x * desired - toPlayer.y * strafe) * e.speed, 520 * dt);
        e.vy = approach(e.vy, (toPlayer.y * desired + toPlayer.x * strafe) * e.speed, 520 * dt);
        if (e.cooldown <= 0 && distance < 430) {
          this.spawnBullet(false, e.x, e.y, toPlayer.x * 245, toPlayer.y * 245, 1, 7, '#c95b64');
          e.cooldown = this.rng.range(1.1, 1.55);
        }
      } else if (e.kind === 'charger') {
        if (e.mode === 'dash') {
          if (e.timer <= 0) {
            e.mode = 'recover';
            e.timer = 0.65;
            e.vx *= 0.22;
            e.vy *= 0.22;
          }
        } else if (e.mode === 'charge') {
          e.vx *= 0.78;
          e.vy *= 0.78;
          if (e.timer <= 0) {
            e.mode = 'dash';
            e.timer = 0.6;
            e.vx = toPlayer.x * 380;
            e.vy = toPlayer.y * 380;
            this.burst(e.x, e.y, 10, '#cf9a54', 130);
          }
        } else if (e.mode === 'recover') {
          e.vx *= 0.9;
          e.vy *= 0.9;
          if (e.timer <= 0) {
            e.mode = 'idle';
            e.timer = this.rng.range(1.0, 1.7);
          }
        } else {
          e.vx = approach(e.vx, toPlayer.x * e.speed, 450 * dt);
          e.vy = approach(e.vy, toPlayer.y * e.speed, 450 * dt);
          if (e.timer <= 0 && distance < 360) {
            e.mode = 'charge';
            e.timer = 0.52;
            e.vx = 0;
            e.vy = 0;
          }
        }
      } else {
        this.updateBoss(e, dt, toPlayer, distance);
      }

      this.moveBody(e, dt);
      if (Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r - 2) {
        this.damagePlayer(e.contact, e.x, e.y);
      }
    }
  }

  private updateBoss(e: EnemyState, dt: number, toPlayer: { x: number; y: number }, distance: number) {
    const phase = e.hp / e.maxHp < 0.45 ? 2 : 1;
    const tangent = { x: -toPlayer.y, y: toPlayer.x };
    const desired = distance > 225 ? 1 : distance < 150 ? -0.8 : 0;
    e.vx = approach(e.vx, (toPlayer.x * desired + tangent.x * 0.5) * e.speed, 360 * dt);
    e.vy = approach(e.vy, (toPlayer.y * desired + tangent.y * 0.5) * e.speed, 360 * dt);

    if (e.cooldown <= 0) {
      const count = phase === 1 ? 8 : 12;
      const offset = this.elapsed * 0.8;
      for (let i = 0; i < count; i++) {
        const a = offset + (i / count) * Math.PI * 2;
        const speed = phase === 1 ? 185 : 225;
        this.spawnBullet(false, e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, 1, 8, phase === 1 ? '#bc5361' : '#d06b45');
      }
      e.cooldown = phase === 1 ? 1.55 : 0.95;
      this.shake = Math.max(this.shake, 4);
    }

    if (phase === 2 && e.timer <= 0) {
      this.spawnEnemy('crawler', e.x - 55, e.y + 20);
      this.spawnEnemy('crawler', e.x + 55, e.y - 20);
      e.timer = 5.5;
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < ARENA.left || b.x > ARENA.right || b.y < ARENA.bottom || b.y > ARENA.top) {
        b.life = 0;
        continue;
      }
      if (this.obstacles.some((o) => this.pointInExpandedRect(b.x, b.y, o, b.r))) {
        b.life = 0;
        this.burst(b.x, b.y, 4, b.color, 55);
        continue;
      }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.dead || Math.hypot(b.x - e.x, b.y - e.y) >= b.r + e.r) continue;
          b.life = 0;
          e.hp -= b.damage;
          e.hitFlash = 0.12;
          const knock = normalize(e.x - b.x, e.y - b.y);
          e.vx += knock.x * (e.kind === 'boss' ? 18 : 85);
          e.vy += knock.y * (e.kind === 'boss' ? 18 : 85);
          this.hitStop = Math.max(this.hitStop, 0.035);
          this.shake = Math.max(this.shake, e.kind === 'boss' ? 3 : 1.5);
          this.burst(b.x, b.y, e.kind === 'boss' ? 7 : 5, '#9f3947', 110);
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      } else if (Math.hypot(b.x - this.player.x, b.y - this.player.y) < b.r + this.player.r) {
        b.life = 0;
        this.damagePlayer(b.damage, b.x, b.y);
      }
    }
  }

  private updatePickups(dt: number) {
    for (const p of this.pickups) {
      p.bob += dt * 3;
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) > p.r + this.player.r + 4) continue;
      if (p.kind === 'heart') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
      else this.genes++;
      p.r = 0;
      this.burst(p.x, p.y, 12, p.kind === 'heart' ? '#cf5965' : '#66b9ad', 120);
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 3.5);
      p.vy *= Math.max(0, 1 - dt * 3.5);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private spawnBullet(friendly: boolean, x: number, y: number, vx: number, vy: number, damage: number, r: number, color: string) {
    this.bullets.push({ id: this.nextId++, friendly, x, y, vx, vy, damage, r, color, life: friendly ? 1.25 : 3.2 });
  }

  private damagePlayer(amount: number, sourceX: number, sourceY: number) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'playing') return;
    p.hp -= amount;
    p.invuln = 0.9;
    p.hitFlash = 0.22;
    const knock = normalize(p.x - sourceX, p.y - sourceY);
    p.vx = knock.x * 310;
    p.vy = knock.y * 310;
    this.flash = 0.35;
    this.shake = 12;
    this.hitStop = 0.07;
    this.burst(p.x, p.y, 18, '#a83243', 210);
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.banner = '巢核破碎';
      this.bannerTime = 999;
    }
  }

  private killEnemy(e: EnemyState) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.shake = Math.max(this.shake, e.kind === 'boss' ? 18 : 6);
    this.hitStop = Math.max(this.hitStop, e.kind === 'boss' ? 0.14 : 0.055);
    this.burst(e.x, e.y, e.kind === 'boss' ? 48 : 18, e.kind === 'boss' ? '#b43d4f' : '#78323d', e.kind === 'boss' ? 260 : 180);
    const dropChance = e.kind === 'boss' ? 1 : this.rng.next();
    if (dropChance < 0.22 && this.player.hp < this.player.maxHp) {
      this.pickups.push({ id: this.nextId++, x: e.x, y: e.y, r: 12, kind: 'heart', bob: 0 });
    } else if (dropChance < 0.62 || e.kind === 'boss') {
      this.pickups.push({ id: this.nextId++, x: e.x, y: e.y, r: 11, kind: 'gene', bob: 0 });
    }
  }

  private removeDeadEntities() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.pickups = this.pickups.filter((p) => p.r > 0);
  }

  private moveBody(body: CircleBody, dt: number) {
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.x = clamp(body.x, ARENA.left + body.r, ARENA.right - body.r);
    body.y = clamp(body.y, ARENA.bottom + body.r, ARENA.top - body.r);
    for (const o of this.obstacles) this.resolveCircleRect(body, o);
  }

  private resolveCircleRect(body: CircleBody, o: ObstacleState) {
    const halfW = o.w / 2;
    const halfH = o.h / 2;
    const nearestX = clamp(body.x, o.x - halfW, o.x + halfW);
    const nearestY = clamp(body.y, o.y - halfH, o.y + halfH);
    const dx = body.x - nearestX;
    const dy = body.y - nearestY;
    const d = Math.hypot(dx, dy);
    if (d >= body.r || d < 0.0001) return;
    const nx = dx / d;
    const ny = dy / d;
    body.x = nearestX + nx * body.r;
    body.y = nearestY + ny * body.r;
    const dot = body.vx * nx + body.vy * ny;
    if (dot < 0) {
      body.vx -= nx * dot;
      body.vy -= ny * dot;
    }
  }

  private pointInExpandedRect(x: number, y: number, o: ObstacleState, margin: number): boolean {
    return x >= o.x - o.w / 2 - margin && x <= o.x + o.w / 2 + margin
      && y >= o.y - o.h / 2 - margin && y <= o.y + o.h / 2 + margin;
  }

  private burst(x: number, y: number, count: number, color: string, speed: number) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(speed * 0.25, speed);
      const life = this.rng.range(0.2, 0.55);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        maxLife: life,
        size: this.rng.range(2, 5.5),
        color,
      });
    }
  }
}
