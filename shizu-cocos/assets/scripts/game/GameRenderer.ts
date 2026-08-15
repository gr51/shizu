import { Color, Graphics } from 'cc';
import { ARENA, EnemyState, GameModel, ObstacleState } from './GameModel';

function color(hex: string, alpha = 255): Color {
  const raw = hex.replace('#', '');
  const value = parseInt(raw, 16);
  return new Color((value >> 16) & 255, (value >> 8) & 255, value & 255, alpha);
}

export class GameRenderer {
  constructor(private g: Graphics) {}

  draw(model: GameModel) {
    const g = this.g;
    g.clear();
    this.rect(-480, -320, 960, 640, '#090b0f');
    this.rect(-456, -276, 912, 536, '#111519');
    this.roundRect(ARENA.left - 14, ARENA.bottom - 14, ARENA.right - ARENA.left + 28, ARENA.top - ARENA.bottom + 28, 10, '#343b3b');
    this.roundRect(ARENA.left, ARENA.bottom, ARENA.right - ARENA.left, ARENA.top - ARENA.bottom, 6, '#1c2224');
    this.drawFloor(model.room);
    this.drawDoors(model);

    for (const obstacle of model.obstacles) this.drawObstacle(obstacle);
    for (const pickup of model.pickups) this.drawPickup(pickup.x, pickup.y + Math.sin(pickup.bob) * 4, pickup.kind);
    for (const bullet of model.bullets) this.drawBullet(bullet.x, bullet.y, bullet.r, bullet.color, bullet.friendly);
    for (const enemy of model.enemies) this.drawEnemy(enemy, model.elapsed);
    this.drawPlayer(model);
    for (const p of model.particles) {
      const alpha = Math.max(20, Math.round((p.life / p.maxLife) * 255));
      this.circle(p.x, p.y, p.size, p.color, alpha);
    }
    this.drawBossBar(model);

    if (model.flash > 0) {
      this.rect(-480, -320, 960, 640, '#8f2638', Math.round(model.flash * 110));
    }
  }

  private drawFloor(room: number) {
    const g = this.g;
    g.strokeColor = color('#2b3233');
    g.lineWidth = 1;
    for (let x = ARENA.left + 42; x < ARENA.right; x += 52) {
      g.moveTo(x, ARENA.bottom);
      g.lineTo(x, ARENA.top);
    }
    for (let y = ARENA.bottom + 38; y < ARENA.top; y += 48) {
      g.moveTo(ARENA.left, y);
      g.lineTo(ARENA.right, y);
    }
    g.stroke();

    const stains = room === 1
      ? [[-250, 120, 48], [145, 65, 62], [265, -150, 38]]
      : room === 2
        ? [[-260, -150, 54], [35, 40, 76], [270, 130, 44]]
        : [[-250, 155, 42], [0, 0, 86], [245, -135, 58]];
    for (const [x, y, r] of stains) {
      this.circle(x, y, r, room === 3 ? '#321920' : '#252b29', 150);
      this.circle(x - r * 0.25, y + r * 0.15, r * 0.42, room === 3 ? '#401d26' : '#2b302d', 100);
    }

    g.strokeColor = color('#47504d');
    g.lineWidth = 3;
    g.roundRect(ARENA.left, ARENA.bottom, ARENA.right - ARENA.left, ARENA.top - ARENA.bottom, 6);
    g.stroke();
  }

  private drawDoors(model: GameModel) {
    this.roundRect(ARENA.left - 18, -58, 30, 116, 5, '#0a0d0f');
    this.rect(ARENA.left - 12, -42, 20, 84, '#242a2c');

    const open = model.roomCleared;
    const pulse = (Math.sin(model.doorPulse) + 1) * 0.5;
    this.roundRect(ARENA.right - 12, -62, 30, 124, 5, open ? '#675625' : '#351b21');
    this.rect(ARENA.right - 8, -46, 20, 92, open ? '#151a18' : '#1b1114');
    this.circle(ARENA.right + 1, 0, 6 + pulse * 3, open ? '#d6bc67' : '#8a3444');
    if (open) {
      const g = this.g;
      g.strokeColor = color('#d6bc67', 180);
      g.lineWidth = 2;
      g.moveTo(ARENA.right - 25, 0);
      g.lineTo(ARENA.right - 4, 0);
      g.lineTo(ARENA.right - 12, 9);
      g.moveTo(ARENA.right - 4, 0);
      g.lineTo(ARENA.right - 12, -9);
      g.stroke();
    }
  }

  private drawObstacle(o: ObstacleState) {
    this.roundRect(o.x - o.w / 2 + 5, o.y - o.h / 2 - 7, o.w, o.h, 15, '#090b0c', 150);
    const base = o.kind === 'growth' ? '#303a35' : '#39403f';
    const edge = o.kind === 'growth' ? '#59695d' : '#646d68';
    this.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 15, base);
    const g = this.g;
    g.strokeColor = color(edge);
    g.lineWidth = 3;
    g.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 15);
    g.stroke();
    this.circle(o.x - o.w * 0.2, o.y + o.h * 0.15, Math.min(o.w, o.h) * 0.12, o.kind === 'growth' ? '#687a69' : '#737b74', 150);
  }

  private drawPlayer(model: GameModel) {
    const p = model.player;
    const flicker = p.invuln > 0 && Math.floor(model.elapsed * 18) % 2 === 0;
    const alpha = flicker ? 100 : 255;
    this.circle(p.x + 4, p.y - 17, 17, '#07090b', 145);
    this.roundRect(p.x - 13, p.y - 18, 26, 28, 10, p.hitFlash > 0 ? '#ffffff' : '#c8c1ad', alpha);
    this.circle(p.x, p.y + 10, 20, p.hitFlash > 0 ? '#ffffff' : '#ded7c3', alpha);
    this.circle(p.x - 8 + p.facingX * 3, p.y + 13 + p.facingY * 3, 4.4, '#15171a', alpha);
    this.circle(p.x + 8 + p.facingX * 3, p.y + 13 + p.facingY * 3, 4.4, '#15171a', alpha);
    this.circle(p.x - 7 + p.facingX * 3, p.y + 14 + p.facingY * 3, 1.3, '#dce8e6', alpha);
    this.circle(p.x + 9 + p.facingX * 3, p.y + 14 + p.facingY * 3, 1.3, '#dce8e6', alpha);
    const g = this.g;
    g.strokeColor = color('#6f685e', alpha);
    g.lineWidth = 2;
    g.moveTo(p.x - 7, p.y - 16);
    g.lineTo(p.x - 12, p.y - 24);
    g.moveTo(p.x + 7, p.y - 16);
    g.lineTo(p.x + 12, p.y - 24);
    g.stroke();
  }

  private drawEnemy(e: EnemyState, time: number) {
    this.circle(e.x + 5, e.y - e.r * 0.75, e.r * 0.88, '#050708', 150);
    if (e.kind === 'crawler') {
      this.circle(e.x, e.y, e.r, e.hitFlash > 0 ? '#ffffff' : '#7c3842');
      this.circle(e.x - 6, e.y + 4, 3.5, '#e0c5ae');
      this.circle(e.x + 6, e.y + 4, 3.5, '#e0c5ae');
      this.circle(e.x, e.y - 5, 5, '#32131a');
    } else if (e.kind === 'spitter') {
      this.circle(e.x, e.y, e.r, e.hitFlash > 0 ? '#ffffff' : '#48645f');
      this.circle(e.x, e.y - 1, 8, '#172421');
      this.circle(e.x - 7, e.y + 7, 3, '#d8d4b6');
      this.circle(e.x + 7, e.y + 7, 3, '#d8d4b6');
    } else if (e.kind === 'charger') {
      const charge = e.mode === 'charge';
      if (charge) this.circle(e.x, e.y, e.r + 9 + Math.sin(time * 18) * 3, '#bc743e', 80);
      this.roundRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2, 8, e.hitFlash > 0 ? '#ffffff' : '#8a5b3e');
      this.rect(e.x - 14, e.y + 3, 28, 7, '#2b1c18');
      this.circle(e.x - 8, e.y + 7, 2.5, '#e8c76b');
      this.circle(e.x + 8, e.y + 7, 2.5, '#e8c76b');
    } else {
      this.drawBoss(e, time);
    }
    if (e.kind !== 'boss' && e.hp < e.maxHp) this.drawHealth(e.x - 18, e.y + e.r + 10, 36, 4, e.hp / e.maxHp);
  }

  private drawBoss(e: EnemyState, time: number) {
    const pulse = Math.sin(time * 3) * 3;
    for (let i = 0; i < 6; i++) {
      const a = time * 0.45 + (i / 6) * Math.PI * 2;
      const tx = e.x + Math.cos(a) * (e.r + 19);
      const ty = e.y + Math.sin(a) * (e.r * 0.68 + 14);
      this.circle(tx, ty, 13, '#55232e');
    }
    this.circle(e.x, e.y, e.r + pulse, e.hitFlash > 0 ? '#ffffff' : '#71303c');
    this.circle(e.x, e.y + 4, e.r * 0.7, '#8c3a49');
    for (let i = -1; i <= 1; i++) {
      this.circle(e.x + i * 17, e.y + 13, 6, '#171116');
      this.circle(e.x + i * 17 + 1, e.y + 15, 2, '#d9ba64');
    }
    this.roundRect(e.x - 20, e.y - 22, 40, 12, 6, '#271116');
  }

  private drawBullet(x: number, y: number, r: number, hex: string, friendly: boolean) {
    this.circle(x + 2, y - 3, r + 2, '#06080a', 110);
    this.circle(x, y, r, hex);
    this.circle(x - r * 0.28, y + r * 0.32, Math.max(1.2, r * 0.25), friendly ? '#ffffff' : '#f1a09a', 210);
  }

  private drawPickup(x: number, y: number, kind: 'heart' | 'gene') {
    this.circle(x + 2, y - 8, 12, '#050708', 120);
    if (kind === 'heart') {
      this.circle(x - 5, y + 3, 7, '#bd4253');
      this.circle(x + 5, y + 3, 7, '#bd4253');
      const g = this.g;
      g.fillColor = color('#bd4253');
      g.moveTo(x - 11, y + 3);
      g.lineTo(x, y - 11);
      g.lineTo(x + 11, y + 3);
      g.close();
      g.fill();
    } else {
      this.circle(x, y, 11, '#477c74');
      this.circle(x, y, 5, '#91c5b8');
      this.circle(x, y, 2, '#d7e7d9');
    }
  }

  private drawBossBar(model: GameModel) {
    const boss = model.enemies.find((e) => e.kind === 'boss');
    if (!boss) return;
    this.roundRect(-190, 250, 380, 10, 5, '#111416');
    this.roundRect(-188, 252, 376 * Math.max(0, boss.hp / boss.maxHp), 6, 3, '#a43d4e');
  }

  private drawHealth(x: number, y: number, width: number, height: number, ratio: number) {
    this.roundRect(x, y, width, height, height / 2, '#17191b');
    this.roundRect(x + 1, y + 1, (width - 2) * Math.max(0, ratio), height - 2, (height - 2) / 2, '#a64752');
  }

  private rect(x: number, y: number, width: number, height: number, hex: string, alpha = 255) {
    const g = this.g;
    g.fillColor = color(hex, alpha);
    g.rect(x, y, width, height);
    g.fill();
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number, hex: string, alpha = 255) {
    const g = this.g;
    g.fillColor = color(hex, alpha);
    g.roundRect(x, y, width, height, radius);
    g.fill();
  }

  private circle(x: number, y: number, radius: number, hex: string, alpha = 255) {
    const g = this.g;
    g.fillColor = color(hex, alpha);
    g.circle(x, y, radius);
    g.fill();
  }
}
