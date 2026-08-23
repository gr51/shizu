// ===== game/GameRoot.ts · 主控组件（挂在 Canvas 上）=====
// 职责边界：本层与 UiKit/ModalLayer 依赖 cc；../core 与 ../data 完全不依赖 ——
// 那两层就是网页原型里跑通、并被 tests/ 65 项测试守护的同一份代码。
//
// 竖屏 640×960（整体策划 1.1）。当前无美术资源，全部程序化绘制（见 UiKit.ts）。

import { Component, EventKeyboard, Graphics, Input, KeyCode, Label, Node, Sprite, UITransform, _decorator, input } from 'cc';
import { C, DESIGN, clearChildren, drawBar, drawPanel, hex, makeButton, makeDivider, makeLabel, makeNode, sizeOf } from './UiKit';
import { ModalLayer, ModalRow } from './ModalLayer';
import { SpriteBank, applyFrame } from './SpriteBank';
import { createStorage } from '../platform/storage';

import { createSaveRepo } from '../core/save.js';
import { computePower, dungeonDifficulty, DIFFICULTY_COEF, DIFFICULTY_LABEL, combatStats, geneLockPowerBonus } from '../core/balance.js';
import { generateDungeon, MAX_ONSCREEN } from '../core/dungeon.js';
import { previewPlane, rollPlane } from '../core/planePool.js';
import { RunState } from '../core/run.js';
import { RealtimeRun, ARENA } from '../core/battle.js';
import { rngFactory } from '../core/rng.js';
import { activatableRoutes, activatedRoutes, chargeToNextSegment, geneLockLevel, isSealed } from '../core/geneLock.js';
import { affixText, gearPowerBonus, salvageGear, craftGear, enhanceGear, forgeGear, forgeCost, FORGE_COST } from '../core/gear.js';
import { SLOT_KEYS, SLOT_LABEL } from '../core/skillSlots.js';
import { ROUTES, ALL_ROUTES, mutexOf } from '../data/routes.js';
import { planes } from '../data/planes.js';
import { GEAR_SLOTS, GEAR_SLOT_IDS, GEAR_RARITY, RARITY_ORDER } from '../data/attrPool.js';
import { nestLine } from '../data/lines.js';
import { relicById } from '../data/relics.js';
import { NEST_UPGRADES, buyNestUpgrade, nestLevel, nextCost } from '../data/nestUpgrades.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { SYNERGIES } from '../data/synergies.js';
import { RIFT_MODS, aggregateRiftMods } from '../data/riftMods.js';

const { ccclass } = _decorator;

const LOG_LINES = 7;

@ccclass('GameRoot')
export class GameRoot extends Component {
  private repo: any;
  private save: any;
  private run: any = null;
  private uiRng!: () => number;
  private lastState: string | null = null;
  private keys = new Set<number>();
  private hudLabel: Label | null = null;
  /** 叙事 toast：run.log 增量泵出，2.6s 自动退场（与 web 端 pumpToast 同口径） */
  private toastBase: Node | null = null;
  private toastLabels: Label[] = [];
  private logSeen = 0;
  /** 裂缝配置暂存：变异 picks 与出征武器（撕开裂缝时消费，换裂缝时重置） */
  private riftPicked: string[] = [];
  private riftWeapon: any = null;
  private riftPlane: any = null;
  private bank = new SpriteBank();
  /** 战场实体的显示节点池：entityId → { node, sprite } */
  private pool = new Map<number, { node: Node; sprite: Sprite }>();
  private field: Node | null = null;
  private playerNode: { node: Node; sprite: Sprite } | null = null;

  private screen!: Node;
  private header!: Label;
  private modal!: ModalLayer;

  onLoad(): void {
    this.node.layer = this.node.layer || 33554432;
    this.repo = createSaveRepo(createStorage());
    this.save = this.repo.load();
    // 大厅侧随机用时钟播种；副本内随机一律走副本 seed（每日挑战可复现）
    this.uiRng = rngFactory((Date.now() ^ 0x5f3759df) >>> 0);

    const bg = makeNode('Bg', this.node);
    sizeOf(bg, DESIGN.width, DESIGN.height);
    drawPanel(bg, DESIGN.width, DESIGN.height, C.bg, '', 0);

    this.header = makeLabel(this.node, '', 0, 296, {
      size: 16, color: C.dim, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 24,
    });
    makeDivider(this.node, 276, DESIGN.width - 40);

    this.screen = makeNode('Screen', this.node);
    this.modal = new ModalLayer(this.node);

    input.on(Input.EventType.KEY_DOWN, (e: EventKeyboard) => this.keys.add(e.keyCode), this);
    input.on(Input.EventType.KEY_UP, (e: EventKeyboard) => this.keys.delete(e.keyCode), this);

    this.exposeDebugApi();
    this.renderLobby();
  }

  onDestroy(): void {
    input.off(Input.EventType.KEY_DOWN);
    input.off(Input.EventType.KEY_UP);
  }

  /** 战斗中只更新一行文字，不重建节点树 */
  private refreshBattleHud(): void {
    if (!this.hudLabel) return;
    const run = this.run;
    const mm = String(Math.floor(run.time / 60)).padStart(2, '0');
    const ss = String(Math.floor(run.time % 60)).padStart(2, '0');
    let s =
      `HP ${Math.max(0, Math.round(run.hp))}/${Math.round(run.stats.maxHp)}　⏱ ${mm}:${ss}`
      + `　阶段 ${run.stageNo}/5　基因 ${run.genes}　噬灭 ${run.kills}　同屏 ${run.visibleCount}`;
    // 支线协议进度（无限流任务制）：与 web 端 HUD 同口径
    const q = run.sideQuest;
    if (q && !run.sideQuestFailed) {
      if (run.isSideQuestDone()) s += `　✅${q.name}`;
      else s += `　支线 ${run.sideQuestProgress()}/${q.target}`;
    }
    // 击杀连击：≥3 且 1.5s 内有击杀时显示（与 web 端同口径）
    const combo = run.comboCount ?? 0;
    if (combo >= 3 && run.time - (run.lastKillTime ?? -99) <= 1.5) s += `　🔥${combo}`;
    this.hudLabel.string = s;
    this.pumpToast();
  }

  /** 叙事 toast 泵：run.log 增量 → 浮动文本，2.6s 自动退场，同屏至多 4 条 */
  private pumpToast(): void {
    if (!this.toastBase || !this.run) return;
    const log = this.run.log ?? [];
    if (this.logSeen > log.length) this.logSeen = 0;
    const CLS_COLOR: Record<string, string> = {
      death: '#e06c5b', wave: '#cdd4da', win: C.gold, gene: C.gene,
      drop: C.gold, learn: C.gold, stage: C.gold, hidden: '#c9b8ff',
    };
    for (; this.logSeen < log.length; this.logSeen++) {
      const entry = log[this.logSeen];
      const color = CLS_COLOR[entry.cls];
      if (!color) continue;
      if (this.toastLabels.length >= 4) {
        const old = this.toastLabels.shift();
        old?.node.destroy();
      }
      const y = 236 - this.toastLabels.length * 24;
      const l = makeLabel(this.toastBase, String(entry.text).replace(/<[^>]+>/g, ''), 0, y, {
        size: 14, color, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 40,
      });
      this.toastLabels.push(l);
      this.scheduleOnce(() => {
        const i = this.toastLabels.indexOf(l);
        if (i >= 0) this.toastLabels.splice(i, 1);
        l.node.destroy();
      }, 2.6);
    }
  }

  /** 无尽模式撤离确认：立即以胜利结算保住战利品（与 web 端同口径） */
  private confirmRetire(): void {
    const run = this.run;
    if (!run || !run.endless || run.state !== RunState.FIGHTING) return;
    const s = this.resetScreen();
    makeLabel(s, '撤 离 深 渊 ？', 0, 170, { size: 24, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true });
    makeLabel(s, `当前深渊第 ${run.endlessLayer} 层 · 基因 ${run.genes}`, 0, 130, {
      size: 16, align: Label.HorizontalAlign.CENTER,
    });
    makeLabel(s, '撤离后立即以胜利结算，保住全部战利品；继续深入则敌人更强、基因更多。', 0, 100, {
      size: 13, color: C.dim, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 80,
    });
    makeButton(s, '撤离结算', -120, 30, 220, () => { run.retire(); }, 'primary');
    makeButton(s, '继续深入', 120, 30, 220, () => this.renderBattle());
  }

  // ===== 通用 =====

  private refreshHeader(extra = ''): void {
    const p = this.save.player;
    this.header.string =
      `战力 ${computePower(p).toFixed(2)}　难度 ${DIFFICULTY_LABEL[p.difficultyLevel]}`
      + `　动态 ${p.dynFactor.toFixed(2)}　战绩 胜${p.wins}/共${p.totalRuns}局` + (extra ? `　${extra}` : '');
  }

  private resetScreen(): Node {
    clearChildren(this.screen);
    return this.screen;
  }

  // ===== 虫巢（大厅）=====

  private renderLobby(): void {
    this.run = null;
    this.save = this.repo.load();
    this.refreshHeader();
    const s = this.resetScreen();

    makeLabel(s, '虫 巢', 0, 238, { size: 28, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true });
    makeLabel(s, `「${nestLine(this.save, this.uiRng)}」　—— 噬祖`, 0, 208, {
      size: 16, color: C.hidden, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 60,
    });

    // —— 巢灵状态卡 ——
    const p = this.save.player;
    const stats = combatStats(p);
    const card = makeNode('PlayerCard', s, -245, 82);
    sizeOf(card, 470, 170);
    drawPanel(card, 470, 170);
    makeLabel(card, `巢灵 · ${p.nestlingName}`, -215, 60, { size: 19, color: C.gold, width: 260 });
    makeLabel(card, `HP ${Math.round(stats.hp)}`, 80, 60, { size: 17, color: C.dim, width: 160 });
    const bar = makeNode('Hp', card, 0, 34);
    drawBar(bar, 430, 10, 1, '#d06a7a');
    makeLabel(card, `攻 ${stats.atk.toFixed(1)}　速 ${stats.speed.toFixed(0)}　暴击 ${(stats.crit * 100).toFixed(1)}%`, -215, 4, { size: 16, width: 430 });
    makeLabel(card, `永久 攻+${p.permAtkPct}% 血+${p.permHpPct}% 速+${p.permSpeedPct}%`, -215, -22, { size: 15, color: C.dim, width: 430 });
    makeLabel(card, `基因锁 ×${geneLockPowerBonus(p.geneLocks).toFixed(2)}　装备 ×${gearPowerBonus(p.gear).toFixed(2)}`, -215, -46, { size: 15, color: C.dim, width: 430 });

    // —— 基因锁卡 ——
    const active = activatedRoutes(this.save);
    const gene = makeNode('GeneCard', s, -245, -122);
    sizeOf(gene, 470, 160);
    drawPanel(gene, 470, 160);
    makeLabel(gene, '基因锁', -215, 52, { size: 18, color: C.gold, width: 300 });
    if (active.length) {
      const text = active
        .map((r: string) => `${ROUTES[r].name} Lv${geneLockLevel(this.save, r)}`)
        .join('　');
      makeLabel(gene, text, -215, 18, { size: 16, color: C.gene, width: 430 });
      const next = chargeToNextSegment(this.save, active[0]);
      makeLabel(gene, next === null ? '首条路线已满段' : `${ROUTES[active[0]].name} 距下一段还需 ${next} 基因`, -215, -12, { size: 14, color: C.dim, width: 430 });
    } else {
      makeLabel(gene, '尚未激活任何路线', -215, 18, { size: 16, color: C.dim, width: 430 });
      makeLabel(gene, '首次进入某位面副本即可永久激活其路线基因锁', -215, -12, { size: 14, color: C.dim, width: 430 });
    }
    if (p.sealedRoutes.length) {
      makeLabel(gene, `已永久封印：${p.sealedRoutes.map((r: string) => ROUTES[r].name).join('、')}`, -215, -58, { size: 14, color: '#7a5c62', width: 430 });
    }

    // —— 操作 ——
    makeButton(s, '⚔  开 启 裂 缝', 245, 210, 460, () => this.openRift(), 'primary', 80);
    makeButton(s, '🧬 虫巢强化（库存基因）', 245, 115, 460, () => this.openNest());
    makeButton(s, '🎒 装备背包', 130, 45, 220, () => this.openBag());
    makeButton(s, '📖 进化图鉴', 360, 45, 220, () => this.openCodex());
    makeButton(s, '🏅 成就', 130, -25, 220, () => this.openAchievements());
    makeButton(s, '⚙ 难度设置', 360, -25, 220, () => this.openDifficulty());
    makeButton(s, '🗑 重置存档', 245, -95, 460, () => this.confirmReset(), 'danger');

    makeLabel(s, p.totalRuns === 0 ? '首次裂缝固定为「机关城」，用于熟悉基本操作' : '选择一项行动', 0, -222, {
      size: 14, color: C.dim, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 40,
    });

    // —— 收藏摘要 ——
    const inv = this.save.inventory;
    makeLabel(s, `传承 ${inv.relics.length}　传说技能 ${inv.comboSkills.length}　禁忌 ${inv.hiddenSkills.length}/10`, 0, -250, {
      size: 15, color: C.gene, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 40,
    });
    const engraved = SLOT_KEYS.filter((k: string) => this.save.player.skillSlots[k]?.hidden);
    if (engraved.length) {
      makeLabel(s, `已刻印：${engraved.map((k: string) => this.save.player.skillSlots[k].name).join('、')}`, 0, -278, {
        size: 14, color: C.hidden, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 40,
      });
    }
    if (this.save.stats.endlessUnlocked) {
      makeLabel(s, '★ 无尽模式已解锁', 0, -300, { size: 15, color: C.gold, align: Label.HorizontalAlign.CENTER, width: 400 });
    }
  }

  /** 虫巢强化（局外元进度）：Cocos 侧此前缺失该入口——跨局成长核心循环补全 */
  private openNest(): void {
    this.refreshHeader();
    const s = this.resetScreen();
    const bank = this.save.inventory.genes ?? 0;
    makeLabel(s, '虫 巢 强 化', 0, 238, { size: 26, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true });
    makeLabel(s, `库存基因：${bank}　每局带回的基因都会入库，失败也算推进`, 0, 208, {
      size: 15, color: C.gene, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 60,
    });

    let y = 168;
    for (const u of NEST_UPGRADES) {
      const lv = nestLevel(this.save, u.id);
      const cost = nextCost(this.save, u.id);
      const maxed = cost === null;
      makeLabel(s, `${u.name}　Lv${lv}/${u.max}`, -230, y + 8, { size: 16, color: C.gold, width: 300 });
      makeLabel(s, u.desc, -230, y - 16, { size: 13, color: C.dim, width: 460 });
      if (maxed) {
        makeLabel(s, '已满级', 230, y + 4, { size: 14, color: C.gold });
      } else {
        const afford = bank >= cost;
        makeButton(s, `强化（${cost}）`, 230, y - 4, 190, () => {
          if (buyNestUpgrade(this.save, u.id).ok) {
            this.repo.persist(this.save);
            this.openNest();   // 重渲染刷新等级与余额
          }
        }, afford ? 'primary' : 'normal');
        if (!afford) {
          makeLabel(s, `还差 ${cost - bank}`, 230, y - 34, { size: 12, color: C.dim, width: 190, align: Label.HorizontalAlign.CENTER });
        }
      }
      y -= 62;
    }

    makeButton(s, '返回虫巢', 0, -240, 220, () => this.renderLobby());
  }

  /** 成就页面：14 条成就三态（已达成/可领取/未达成）——与 web 端同口径 */
  private openAchievements(): void {
    this.refreshHeader();
    const s = this.resetScreen();
    const flags = this.save.stats.achievementFlags ?? {};
    const claimed = ACHIEVEMENTS.filter((a) => flags[a.id]).length;
    makeLabel(s, `成 就　${claimed}/${ACHIEVEMENTS.length}`, 0, 238, { size: 26, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true });
    makeLabel(s, '★ 标记的成就已满足条件，下次结算时自动领取', 0, 210, {
      size: 13, color: C.gene, align: Label.HorizontalAlign.CENTER,
    });

    let y = 172;
    for (const a of ACHIEVEMENTS) {
      const done = flags[a.id] === true;
      let met = false;
      try { met = a.check(this.save); } catch { /* check 可能抛 */ }
      const tag = done ? '✅' : met ? '★ 可领取' : '○';
      makeLabel(s, `${tag} ${a.name}`, -225, y, { size: 15, color: done ? C.gold : C.text, width: 200 });
      makeLabel(s, a.desc, -20, y, { size: 12, color: C.dim, width: 330 });
      makeLabel(s, a.reward, -20, y - 22, { size: 11, color: done ? C.gold : '#7a5c62', width: 330 });
      y -= 52;
    }

    makeButton(s, '返回虫巢', 0, -240, 220, () => this.renderLobby());
  }

  // ===== 开裂缝 =====

  /** 入口：无暂存位面时重摇并清空配置；已有则直接渲染信息屏（保留配置） */
  private openRift(): void {
    if (!this.riftPlane) {
      this.riftPlane = rollPlane(this.save, this.uiRng);
      this.riftPicked = [];
      this.riftWeapon = null;
    }
    this.renderRiftInfo(this.riftPlane);
  }

  /** 换一道裂缝：重摇位面并清空配置（与「确认返回」不同——后者必须保留配置） */
  private rerollRift(): void {
    this.riftPlane = null;
    this.openRift();
  }

  private renderRiftInfo(plane: any): void {
    const pre = previewPlane(plane, this.save);
    const D = dungeonDifficulty(computePower(this.save.player), this.save.player.difficultyLevel) * this.save.player.dynFactor;

    const rows: ModalRow[] = [
      { text: `「${pre.poem}」`, color: C.gold },
      { text: `主题：${pre.theme}　之主：${pre.boss}` },
      {
        text: `路线基因：${pre.routes.length
          ? pre.routes.map((r: string) => `${ROUTES[r].name}${geneLockLevel(this.save, r) ? `(Lv${geneLockLevel(this.save, r)})` : '(未激活)'}`).join(' / ')
          : '全路线融合'}`,
      },
      {
        text: pre.channel === 'skill' ? '通道：技能通道 —— 三选一可学该路线技能' : '通道：属性通道 —— 学不到技能，装备掉率 ×1.5',
        color: pre.channel === 'skill' ? C.gold : C.gene,
      },
      { text: `可获奖励：${pre.rewards.join(' / ')}` },
      { text: `难度：${DIFFICULTY_LABEL[this.save.player.difficultyLevel]}　副本 D ≈ ${D.toFixed(1)}` },
    ];
    if (pre.firstVisit) {
      rows.push({ text: '⚠ 首次进入：通关后永久激活该路线，', color: C.gold, size: 15 });
      rows.push({ text: '　 并永久封印其互斥路线，不可撤销。', color: C.gold, size: 15 });
    }
    // 配置回显：从配置屏返回后能确认自己选了什么
    if (this.riftPicked.length || this.riftWeapon) {
      const mods = aggregateRiftMods(this.riftPicked);
      const wName = this.riftWeapon ? (ROUTES as Record<string, { name: string }>)[this.riftWeapon].name : '自动';
      rows.push({
        text: `已配置：变异×${this.riftPicked.length}（倍率 ×${mods.geneMul.toFixed(2)}）　武器：${wName}`,
        color: C.gene,
        size: 15,
      });
    }

    this.modal.show({
      title: `裂缝 · ${pre.name}`,
      rows,
      buttons: [
        { text: '变异与出征武器', onClick: () => this.openRiftConfig() },
        {
          text: '撕开裂缝，进入',
          style: 'primary',
          onClick: () => {
            const picked = this.riftPicked;
            const weapon = this.riftWeapon;
            this.riftPlane = null;
            this.riftPicked = [];
            this.riftWeapon = null;
            this.startRun(plane, picked, { weaponLoadout: weapon });
          },
        },
        ...(this.save.stats.endlessUnlocked
          ? [{
              text: '★ 无尽模式（通关后续接深渊层）',
              onClick: () => {
                const picked = this.riftPicked;
                const weapon = this.riftWeapon;
                this.riftPlane = null;
                this.riftPicked = [];
                this.riftWeapon = null;
                this.startRun(plane, picked, { endless: true, weaponLoadout: weapon });
              },
            }]
          : []),
        { text: '换一道裂缝', onClick: () => this.rerollRift() },
        { text: '再想想', onClick: () => {} },
      ],
    });
  }

  /** 裂缝配置屏：变异开关（点按钮切换）+ 出征武器轮换——与 web 端同口径 */
  private openRiftConfig(): void {
    const plane = this.riftPlane;
    if (!plane) { this.openRift(); return; }
    const picked = this.riftPicked;
    const pool = activatableRoutes(this.save);

    const render = () => {
      const mods = aggregateRiftMods(picked);
      const weaponText = this.riftWeapon
        ? (ROUTES as Record<string, { name: string }>)[this.riftWeapon].name
        : (pool.length ? `自动（按基因最高：${ROUTES[pool[0]].name}）` : '自动（默认巢灵之爪）');
      const rows: ModalRow[] = [
        { text: `基因倍率 ×${mods.geneMul.toFixed(2)}　风险合计 ${mods.risk}`, color: picked.length ? C.gold : C.dim },
        ...RIFT_MODS.map((m) => {
          const on = picked.includes(m.id);
          return { text: `${on ? '✔' : '·'} ${m.name}（风险${m.risk}）：${m.desc}`, color: on ? C.gold : C.dim, size: 14 };
        }),
        { text: `出征武器：${weaponText}`, color: C.gene },
      ];
      const buttons = [
        ...RIFT_MODS.map((m) => ({
          text: `${picked.includes(m.id) ? '取消' : '叠加'} ${m.name}`,
          onClick: () => {
            const i = picked.indexOf(m.id);
            if (i >= 0) picked.splice(i, 1); else picked.push(m.id);
            render();
          },
        })),
      ];
      if (pool.length > 1) {
        buttons.push({
          text: '轮换出征武器',
          onClick: () => {
            if (!this.riftWeapon) { this.riftWeapon = pool[0]; }
            else {
              const i = pool.indexOf(this.riftWeapon);
              this.riftWeapon = i >= 0 && i < pool.length - 1 ? pool[i + 1] : null;   // 末位回到自动
            }
            render();
          },
        });
      }
      buttons.push({ text: '确认，返回裂缝', onClick: () => this.openRift() });
      this.modal.show({ title: `裂缝配置 · ${plane.name}`, rows, buttons });
    };
    render();
  }

  private startRun(plane: any, riftMods: string[] = [], opts: any = {}): void {
    const seed = Math.floor(this.uiRng() * 0xffffffff) >>> 0;
    const dungeon = generateDungeon(plane, this.save, seed, riftMods, opts);
    this.run = new RealtimeRun(this.save, dungeon, seed ^ 0x9e3779b9);
    this.lastState = null;
    this.pool.clear();
    this.playerNode = null;
    this.renderBattle();
    // 资产异步装载；装完之前先用色块顶着，不阻塞开局
    this.bank.load(plane.id).catch(() => { /* 缺图时保持色块回退 */ });
  }

  /**
   * Cocos 的 update(dt) 就是游戏循环 —— 实时战斗直接挂在这里。
   * 只在**状态变化**时重建界面：每帧重建节点树会让帧率崩掉
   *（网页端实测每帧重建模态框把帧率压到 0.57x）。
   */
  update(dt: number): void {
    const run = this.run;
    if (!run || typeof run.update !== 'function') return;

    if (run.state === RunState.FIGHTING) {
      run.update(dt, this.readMove());
      run.drainEffects();
      this.refreshBattleHud();
      this.drawField(run);        // 每帧只**移动节点、换帧**，不重建节点树
    }
    if (run.state !== this.lastState) this.renderBattle();
  }

  /** 键盘（编辑器预览用）。触摸摇杆接入见 UiKit 的 joystick 资源 */
  private readMove(): { mx: number; my: number } {
    let mx = 0;
    let my = 0;
    if (this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT)) mx -= 1;
    if (this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) mx += 1;
    if (this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP)) my -= 1;
    if (this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) my += 1;
    const len = Math.hypot(mx, my);
    return len > 1 ? { mx: mx / len, my: my / len } : { mx, my };
  }

  // ===== 局内 =====

  private renderBattle(): void {
    const run = this.run;
    if (!run) return;
    const d = run.dungeon;
    this.refreshHeader(`副本 D ${d.D.toFixed(1)}`);
    const s = this.resetScreen();

    makeLabel(s, `${d.plane.name} · ${d.plane.theme}`, 0, 292, {
      size: 20, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true,
    });
    this.hudLabel = makeLabel(s, '', 0, 264, {
      size: 14, color: C.dim, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 24,
    });
    this.refreshBattleHud();
    // 叙事 toast 容器：run.log 的新条目在这里浮出（任务简报/Boss 降临/阶段叙事/胜利诗）
    this.toastBase = makeNode('Toasts', s, 0, 0);
    // 无尽模式：主动撤离入口（贪多必死 → 收手也是一种技术；与 web 端同口径）
    if (run.endless) {
      makeButton(s, '🚪 撤离结算', 0, -180, 220, () => this.confirmRetire());
    }

    // 战场：当前用 Graphics 画色块占位。
    // 接入 tools/gen-pixel-assets.mjs 产出的像素资产时，把这里换成 Sprite + SpriteFrame，
    // 帧序取 assets/art/anim.json 的 frameWidth 切分 —— 逻辑层（core/battle.js）不用动。
    const field = makeNode('Field', s, 0, -20);
    sizeOf(field, ARENA.w * GameRoot.K, ARENA.h * GameRoot.K);
    drawPanel(field, ARENA.w * GameRoot.K, ARENA.h * GameRoot.K, C.panelDeep, C.line, 4);
    this.field = field;
    this.pool.clear();
    this.playerNode = null;
    this.drawField(run);

    switch (run.state) {
      case RunState.CHOOSING: this.showChoice(); break;
      case RunState.SLOT_CONFLICT: this.showSlotConflict(); break;
      case RunState.SHOPPING: this.showShop(); break;
      case RunState.WON:
      case RunState.LOST: this.showSettle(); break;
      default: break;
    }

    // 记的是「刚画出来的是哪个状态」，而且必须记在 switch 之后：
    // 弹窗回调（选完进化、离开黑市）会直接调 renderBattle()，若只有 update() 维护这个游标，
    // 就会出现 lastState 停在 choosing、而本帧 run.update() 内部又刚好重开一次三选一的情况 ——
    // 那一帧的 `state !== lastState` 判定为假，弹窗永远不再弹出，整局静止在无按钮的战斗画面。
    this.lastState = run.state;
  }

  /** 战场缩放：逻辑坐标（ARENA 960×560）→ 屏幕坐标 */
  private static readonly K = 0.62;

  /**
   * 画战场。资产装载完成后用 SpriteFrame，未完成时回退到 Graphics 色块。
   * 节点走**对象池**：割草同屏 60 只，每帧新建/销毁节点会直接卡死
   *（整体策划 9.3 明确要求「敌人/尸体/飘字全部对象池化」）。
   */
  private drawField(run: any): void {
    const field = this.field;
    if (!field) return;
    const K = GameRoot.K;
    const toX = (x: number) => (x - ARENA.w / 2) * K;
    const toY = (y: number) => (ARENA.h / 2 - y) * K;

    if (!this.bank.loaded) { this.drawFieldFallback(run, toX, toY); return; }

    const alive = new Set<number>();
    const planeId = run.dungeon.plane.id;

    for (const e of run.enemies) {
      alive.add(e.id);
      const name = e.kind === 'minion' ? `minion_${planeId}_move`
        : e.kind === 'elite' ? `elite_${planeId}_idle` : `boss_${planeId}_idle`;
      const scale = e.kind === 'boss' ? 0.55 : e.kind === 'elite' ? 0.6 : 0.75;
      const ent = this.entity(e.id, field);
      ent.node.setPosition(toX(e.x), toY(e.y), 0);
      ent.node.setScale(scale, scale, 1);
      applyFrame(ent.sprite, this.bank.frameAt(name, e.anim * 0.12));
    }
    // 基因尸体也走池子，id 用负数避开敌人 id
    run.orbs.forEach((o: any, i: number) => {
      const id = -1 - i;
      alive.add(id);
      const ent = this.entity(id, field);
      ent.node.setPosition(toX(o.x), toY(o.y), 0);
      ent.node.setScale(0.5, 0.5, 1);
      applyFrame(ent.sprite, this.bank.frameAt('gene_orb_pulse', o.bob * 0.2));
    });

    // 回收本帧没出现的节点
    for (const [id, ent] of this.pool) {
      if (!alive.has(id)) { ent.node.active = false; this.pool.delete(id); ent.node.destroy(); }
    }

    // 玩家：最后画，永远在最上层（规则 7 可读性层级顶端）
    if (!this.playerNode) this.playerNode = this.makeEntityNode(field);
    const p = run.player;
    const clip = p.state === 'attack' ? 'player_attack' : p.state === 'walk' ? 'player_walk' : 'player_idle';
    this.playerNode.node.setPosition(toX(p.x), toY(p.y), 0);
    this.playerNode.node.setScale(0.62 * (p.facing < 0 ? -1 : 1), 0.62, 1);
    this.playerNode.node.active = !(p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0);
    applyFrame(this.playerNode.sprite, this.bank.frameAt(clip, p.anim * 0.1));
    this.playerNode.node.setSiblingIndex(field.children.length - 1);
  }

  private entity(id: number, parent: Node): { node: Node; sprite: Sprite } {
    let ent = this.pool.get(id);
    if (!ent) { ent = this.makeEntityNode(parent); this.pool.set(id, ent); }
    ent.node.active = true;
    return ent;
  }

  private makeEntityNode(parent: Node): { node: Node; sprite: Sprite } {
    const node = makeNode('E', parent);
    node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = (Sprite as any).SizeMode?.RAW ?? 0;
    return { node, sprite };
  }

  /** 资产未装载完时的色块回退，保证开局不空屏 */
  private drawFieldFallback(run: any, toX: (n: number) => number, toY: (n: number) => number): void {
    const g = this.field!.getComponent(Graphics) ?? this.field!.addComponent(Graphics);
    g.clear();
    for (const o of run.orbs) { g.fillColor = hex(C.gene); g.circle(toX(o.x), toY(o.y), 3); g.fill(); }
    for (const e of run.enemies) {
      g.fillColor = hex(e.kind === 'boss' ? C.danger : e.kind === 'elite' ? C.gold : '#8a5a64');
      g.circle(toX(e.x), toY(e.y), Math.max(2, e.r * GameRoot.K));
      g.fill();
    }
    g.fillColor = hex(C.text);
    g.circle(toX(run.player.x), toY(run.player.y), run.player.r * GameRoot.K);
    g.fill();
  }

  private showChoice(): void {
    const run = this.run;
    const { reason, options } = run.pendingOptions;
    const rows: ModalRow[] = [];
    options.forEach((o: any, i: number) => {
      if (o.kind === 'skill') {
        rows.push({ text: `${i + 1}. 【技能】${o.name}　${ROUTES[o.route].name}·第${o.lv}段`, color: C.gold });
        rows.push({ text: `　　 ${o.desc}　${o.val}`, size: 15, color: C.dim });
      } else if (o.kind === 'mech') {
        rows.push({ text: `${i + 1}. 【强化】${o.name}`, color: '#c9b8ff' });
        rows.push({ text: `　　 ${o.desc}`, size: 15, color: C.dim });
      } else {
        rows.push({ text: `${i + 1}. 【属性】${o.name}`, color: C.gene });
        rows.push({ text: `　　 ${o.desc}`, size: 15, color: C.dim });
      }
    });
    // 共鸣提示（与 web 端同口径）：差一件的共鸣列出来，让选择有目标
    const fired = run.firedSynergies ?? new Set<string>();
    const owned = run.ownedPicks ?? new Set<string>();
    for (const syn of SYNERGIES) {
      if (fired.has(syn.id)) continue;
      const missing = syn.need.filter((id: string) => !owned.has(id));
      if (missing.length !== 1) continue;
      const inRoll = options.some((o: any) => o.id === missing[0]);
      rows.push({ text: `${inRoll ? '★ ' : ''}${syn.name}：还差 1 件即可成立${inRoll ? '（本次可选）' : ''}`, size: 13, color: inRoll ? C.gold : C.dim });
    }

    this.modal.show({
      title: `${reason} · 选择你的进化`,
      rows,
      buttons: options.map((o: any, i: number) => ({
        text: o.kind === 'skill' ? `习得 ${o.name}` : `获得 ${o.name}`,
        style: o.kind === 'skill' ? ('primary' as const) : ('normal' as const),
        onClick: () => {
          run.choose(i);
          this.renderBattle();
        },
      })),
    });
  }

  private showSlotConflict(): void {
    const run = this.run;
    const { skill, options } = run.pendingSkill;
    const rows: ModalRow[] = [
      { text: `要装载 ${skill.name}，需替换掉一个已有技能。`, color: C.gold },
      { text: '被替换的技能将被销毁，不进入传承库。', size: 15, color: C.dim },
      { text: '隐藏技能刻印的槽位不可替换。', size: 15, color: C.dim },
    ];
    this.modal.show({
      title: '技能槽已满',
      rows,
      buttons: [
        ...options.map((k: string) => ({
          text: `替换 ${SLOT_LABEL[k]}（${this.save.player.skillSlots[k]?.name ?? '空'}）`,
          onClick: () => {
            run.resolveSlotConflict(k);
            this.renderBattle();
          },
        })),
        {
          text: '放弃新技能',
          onClick: () => {
            run.resolveSlotConflict(null);
            this.renderBattle();
          },
        },
      ],
    });
  }

  /**
   * 裂缝黑市（阶段间开门，core/run.js 的 RunState.SHOPPING）。
   *
   * 这一屏不是可选的装饰：RealtimeRun.update() 对任何非 FIGHTING 态直接 return，
   * 界面若不给出「离开黑市」的出口，整局就永远停在开门这一刻 ——
   * 表现为战斗静止、阶段推不动、玩家除了杀进程没有别的办法。
   */
  private showShop(): void {
    const run = this.run;
    const items = run.shopItems ?? [];
    const rows: ModalRow[] = [
      { text: `当前基因 ${run.genes}　—— 花掉的基因不再计入升级进度，权衡再买`, size: 15, color: C.dim },
    ];
    for (const it of items) {
      const bought = run.shopBought?.has(it.id);
      const afford = run.genes >= it.price;
      rows.push({
        text: `${bought ? '✔ ' : ''}${it.name}　${it.price} 基因${bought ? '（已购）' : afford ? '' : '（不足）'}`,
        color: bought ? C.dim : afford ? C.gold : C.dim,
      });
      rows.push({ text: `　 ${it.desc}`, size: 15, color: C.dim });
    }

    this.modal.show({
      title: `裂缝黑市 · 阶段 ${run.stageNo}`,
      rows,
      buttons: [
        ...items.map((it: any, i: number) => ({
          text: `购入 ${it.name}（${it.price}）`,
          style: !run.shopBought?.has(it.id) && run.genes >= it.price ? ('primary' as const) : ('normal' as const),
          onClick: () => {
            // 买不起 / 已购时 buyShopItem 静默失败；无论成败都重开一次，价签与基因数才是当前值
            run.buyShopItem(i);
            this.showShop();
          },
        })),
        {
          text: '离开黑市',
          onClick: () => {
            run.closeShop();
            this.renderBattle();
          },
        },
      ],
    });
  }

  private showSettle(): void {
    // 防死锁保护网：结算任何一步抛异常，都必须给出「回巢」出口
    try {
      this.renderSettleInner();
    } catch (err) {
      console.error('[settle] 结算渲染异常', err);
      this.modal.show({
        title: '结算出现异常',
        rows: [{ text: `结算数据生成失败：${String(err?.message ?? err)}`, color: C.danger, size: 14 }],
        buttons: [{ text: '回 巢', onClick: () => { this.run = null; this.renderLobby(); } }],
      });
    }
  }

  private renderSettleInner(): void {
    const r = this.run.finalize(this.repo);
    const rows: ModalRow[] = [
      { text: `评级 ${r.grade}　抵达阶段 ${r.stageReached}/5`, color: C.gold, size: 19 },
      { text: `噬灭 ${r.kills} 只（杂兵 ${r.minionKills}）　存活 ${Math.floor(r.survivedSec / 60)}:${String(r.survivedSec % 60).padStart(2, '0')}` },
      { text: `吞噬基因 ${r.genes}` },
    ];
    // 支线协议与评级加成（无限流任务制）：与 web 端结算同口径
    const sq = this.run.sideQuest;
    if (sq && this.run.isSideQuestDone()) {
      rows.push({ text: `✅ 支线协议【${sq.name}】完成 +${sq.reward} 基因`, color: C.gold });
    }
    if (r.gradeBonusGenes) {
      rows.push({ text: `🏅 完成度评价 ${r.grade}：基因加成 +${r.gradeBonusGenes}`, color: C.gold });
    }

    if (r.growth.grants.length) {
      rows.push({ text: `永久成长：${r.growth.grants.map((g: any) => `${g.label} +${g.pct}%`).join('，')}`, color: C.gene });
    } else {
      rows.push({ text: '基因不足以兑换永久成长（每 1500 基因 1 次）', size: 15, color: C.dim });
    }
    for (const a of r.activations) {
      rows.push({ text: `⟡ 永久激活基因锁：${ROUTES[a.route].name}`, color: C.gold });
      if (a.newlySealed.length) {
        rows.push({ text: `✕ 永久封印：${a.newlySealed.map((x: string) => ROUTES[x].name).join('、')}`, color: '#a5717c' });
        rows.push({ text: '　 你的血脉拒绝了它。', color: '#a5717c', size: 15 });
      }
    }
    for (const c of r.charges) {
      // 升段收益说明（与 web 端同口径）：每段战力 +2%
      rows.push({ text: `${ROUTES[c.route].name} 充能：第 ${c.from} 段 → 第 ${c.to} 段（战力 +${((c.to - c.from) * 2).toFixed(0)}%）`, color: C.gene });
    }
    if (r.relics.length) rows.push({ text: `传承 ×${r.relics.length}` });
    for (const a of r.achievements ?? []) {
      rows.push({ text: `🏅 成就达成「${a.name}」—— ${a.reward}`, color: C.gold });
    }
    if (r.legendSkillId) rows.push({ text: `✦ 传说技能：${r.legendSkillId}`, color: C.gold });
    if (r.hiddenSkill) {
      rows.push({ text: `🔥 禁忌显现：${r.hiddenSkill.name}`, color: C.hidden });
      if (r.engraveResult?.slotKey) {
        rows.push({ text: `　 永久刻印于 ${SLOT_LABEL[r.engraveResult.slotKey]}`, color: C.hidden, size: 15 });
      }
    }
    for (const g of r.gear) {
      rows.push({ text: `🎁 ${g.name}　${g.affixes.map(affixText).join('，')}`, size: 15 });
    }
    rows.push({
      text: `难度进化：动态系数 ${r.dyn.before.toFixed(2)} → ${r.dyn.after.toFixed(2)}`,
      size: 15, color: C.dim,
    });
    if (r.firstClear) rows.push({ text: '★ 首通诸天之心 —— 无尽模式已解锁', color: C.gold });
    // 动态下一局建议（与 web 端同口径）：根据本局表现生成针对性提示
    {
      const hints: string[] = [];
      if (!r.victory && r.stageReached <= 2) hints.push('前期生存不足——回巢优先升级「巢髓·体质」和「巢髓·利齿」');
      else if (!r.victory) hints.push('后期乏力——尝试换一条出征路线，或叠加「贪婪诅咒」提高收益');
      if (r.victory) hints.push('已通关！试试更高难度位面或无尽模式');
      if (r.gradeBonusGenes) hints.push(`获得 ${r.gradeBonusGenes} 评级加成基因——保持支线完成度可持续触发`);
      if (!hints.length) hints.push(r.victory ? '试试无尽模式冲击深渊层' : '回巢强化后再开裂缝');
      rows.push({ text: `💡 ${hints.slice(0, 2).join('；')}`, size: 14, color: C.dim });
    }

    this.modal.show({
      title: r.victory ? `噬灭 · ${r.plane.name}` : `身陨 · ${r.plane.name}`,
      rows,
      buttons: [{ text: '回 巢', style: 'primary', onClick: () => this.renderLobby() }],
    });
  }

  // ===== 大厅子界面 =====

  private openDifficulty(): void {
    this.modal.show({
      title: '难度等级',
      rows: [
        { text: '敌人数值 = 战力 × 难度系数 × 动态系数', size: 15, color: C.dim },
        ...Object.keys(DIFFICULTY_COEF).map((k) => ({
          text: `${DIFFICULTY_LABEL[k]}　系数 ${DIFFICULTY_COEF[k]}` + (this.save.player.difficultyLevel === k ? '　← 当前' : ''),
          color: this.save.player.difficultyLevel === k ? C.gold : C.text,
        })),
      ],
      buttons: [
        ...Object.keys(DIFFICULTY_COEF).map((k) => ({
          text: `选择【${DIFFICULTY_LABEL[k]}】`,
          onClick: () => {
            this.save.player.difficultyLevel = k;
            this.repo.persist(this.save);
            this.renderLobby();
          },
        })),
        { text: '关闭', onClick: () => {} },
      ],
    });
  }

  private openBag(): void {
    const p = this.save.player;
    const rows: ModalRow[] = [
      { text: `已装备（战力 ×${gearPowerBonus(p.gear).toFixed(2)}）`, color: C.gold },
      ...GEAR_SLOT_IDS.map((id: string) => {
        const item = p.gear[id];
        return {
          text: `${GEAR_SLOTS[id].name}：` + (item ? `${item.name}${'★'.repeat(item.star)}` : '空'),
          color: item ? (RARITY_TEXT[item.rarity] ?? C.text) : C.dim,
          size: 15,
        };
      }),
      { text: `背包 ${p.gearBag.length} 件　精华 ${p.gearEssence}`, color: C.gold },
    ];
    const shown = p.gearBag.slice(0, 6);
    for (const item of shown) {
      rows.push({ text: `${item.name}　${item.affixes.map(affixText).join('，')}`, color: RARITY_TEXT[item.rarity], size: 15 });
    }
    if (p.gearBag.length > shown.length) {
      rows.push({ text: `…… 另有 ${p.gearBag.length - shown.length} 件`, size: 14, color: C.dim });
    }

    const buttons = shown.map((item: any, i: number) => ({
      text: `穿戴 ${item.name}`,
      onClick: () => {
        const worn = p.gear[item.slot];
        p.gear[item.slot] = item;
        p.gearBag.splice(i, 1);
        if (worn) p.gearBag.push(worn);
        this.repo.persist(this.save);
        this.openBag();
      },
    }));
    if (shown.length) {
      buttons.push({
        text: `分解全部（+${p.gearBag.reduce((n: number, g: any) => n + salvageGear(g), 0)} 精华）`,
        onClick: () => {
          p.gearEssence += p.gearBag.reduce((n: number, g: any) => n + salvageGear(g), 0);
          p.gearBag.length = 0;
          this.repo.persist(this.save);
          this.openBag();
        },
      });
    }
    // 锻造/合成/强化三入口（与 web 端同口径）：精华与垫子在这里变成确定战力
    buttons.push({ text: '✨ 精华锻造（指定槽位）', onClick: () => this.openForge() });
    buttons.push({ text: '⚗ 合成（3 件同稀有度 → 升 1 档）', onClick: () => this.openCraft() });
    buttons.push({ text: '⭐ 强化（同槽同稀有度 3 件 → +1 星）', onClick: () => this.openEnhance() });
    buttons.push({ text: '关闭', onClick: () => this.renderLobby() });

    this.modal.show({ title: '装备背包', rows, buttons });
  }

  /** 精华锻造 · 第一步：选槽位（两段式流程，避免按钮墙） */
  private openForge(): void {
    const p = this.save.player;
    const rows: ModalRow[] = [
      { text: `装备精华：${p.gearEssence ?? 0}`, color: C.gold },
      { text: '选择要锻造的槽位（确定性获取，随机词缀）', color: C.dim, size: 14 },
    ];
    const buttons = GEAR_SLOT_IDS.map((id: string) => {
      const worn = p.gear[id];
      return {
        text: `${GEAR_SLOTS[id].name}${worn ? `（现 ${worn.name}）` : '（空）'}`,
        onClick: () => this.openForgeSlot(id),
      };
    });
    buttons.push({ text: '返回背包', onClick: () => this.openBag() });
    this.modal.show({ title: '精华锻造 · 选择槽位', rows, buttons });
  }

  /** 精华锻造 · 第二步：按稀有度锻造（只列可负担档位） */
  private openForgeSlot(slot: string): void {
    const p = this.save.player;
    const rows: ModalRow[] = [
      { text: `装备精华：${p.gearEssence ?? 0}`, color: C.gold },
      { text: `目标槽位：${GEAR_SLOTS[slot].name}`, color: C.gene },
      { text: '价目：', color: C.dim, size: 14 },
      ...Object.keys(FORGE_COST).map((r: string) => {
        const cost = forgeCost(r);
        const ok = (p.gearEssence ?? 0) >= cost;
        return { text: `${GEAR_RARITY[r].name}　${cost} 精华${ok ? '' : '（不足）'}`, color: ok ? C.gold : C.dim, size: 15 };
      }),
    ];
    const affordable = Object.keys(FORGE_COST).filter((r: string) => (p.gearEssence ?? 0) >= forgeCost(r));
    const buttons = affordable.map((r: string) => ({
      text: `锻造 ${GEAR_RARITY[r].name}`,
      onClick: () => {
        if (forgeGear(this.save, slot, r, this.uiRng).ok) this.repo.persist(this.save);
        this.openForgeSlot(slot);
      },
    }));
    buttons.push({ text: '换槽位', onClick: () => this.openForge() });
    buttons.push({ text: '返回背包', onClick: () => this.openBag() });
    this.modal.show({ title: `精华锻造 · ${GEAR_SLOTS[slot].name}`, rows, buttons });
  }

  /** 合成：3 件同稀有度 → 1 件高一档（只列可合成档位） */
  private openCraft(): void {
    const bag = this.save.player.gearBag;
    const rows: ModalRow[] = [{ text: '消耗 3 件同稀有度装备，换 1 件高一档的随机装备。', color: C.dim, size: 14 }];
    for (const r of RARITY_ORDER.slice(0, -1)) {
      const n = bag.filter((x: any) => x.rarity === r).length;
      rows.push({ text: `${GEAR_RARITY[r].name} × ${n}${n >= 3 ? '　✔ 可合成' : '（不足 3 件）'}`, color: n >= 3 ? C.gold : C.dim, size: 15 });
    }
    const craftable = RARITY_ORDER.slice(0, -1).filter((r: string) => bag.filter((x: any) => x.rarity === r).length >= 3);
    const buttons = craftable.map((r: string) => ({
      text: `合成 ${GEAR_RARITY[r].name} × 3`,
      onClick: () => {
        const picks = bag.filter((x: any) => x.rarity === r).slice(0, 3);
        const made = craftGear(picks, this.uiRng);
        if (!made) return;
        for (const g of picks) bag.splice(bag.indexOf(g), 1);
        bag.push(made);
        this.repo.persist(this.save);
        this.openCraft();
      },
    }));
    buttons.push({ text: '返回背包', onClick: () => this.openBag() });
    this.modal.show({ title: '合成', rows, buttons });
  }

  /** 强化：已装备 + 背包 3 件同槽同稀有度 → +1 星（只列有效目标） */
  private openEnhance(): void {
    const p = this.save.player;
    const targets = Object.values(p.gear).filter(Boolean).filter((t: any) => {
      const fodder = p.gearBag.filter((g: any) => g.slot === t.slot && g.rarity === t.rarity);
      return t.star < 5 && fodder.length >= 3;
    });
    const rows: ModalRow[] = [
      { text: '消耗背包中 3 件同槽位同稀有度装备，为已装备的该件 +1 星（词条 ×1.1/星，上限 5 星）。', color: C.dim, size: 14 },
      ...targets.map((t: any) => ({ text: `${t.name}${'★'.repeat(t.star)} → ${t.star + 1}★`, color: C.text, size: 15 })),
    ];
    if (!targets.length) rows.push({ text: '没有可强化的装备：需要「已装备的某件」+「背包里 3 件同槽位同稀有度」。', color: C.dim, size: 14 });
    const buttons = targets.map((t: any) => ({
      text: `强化 ${t.name} → ${t.star + 1} 星`,
      onClick: () => {
        const fodder = p.gearBag.filter((g: any) => g.slot === t.slot && g.rarity === t.rarity).slice(0, 3);
        if (fodder.length < 3 || !enhanceGear(t, fodder)) return;
        for (const g of fodder) p.gearBag.splice(p.gearBag.indexOf(g), 1);
        this.repo.persist(this.save);
        this.openEnhance();
      },
    }));
    buttons.push({ text: '返回背包', onClick: () => this.openBag() });
    this.modal.show({ title: '强化', rows, buttons });
  }

  private openCodex(): void {
    const rows: ModalRow[] = [{ text: '基因锁 · 10 路线', color: C.gold }];
    for (const r of ALL_ROUTES) {
      const lv = geneLockLevel(this.save, r);
      const sealed = isSealed(this.save, r);
      const status = sealed ? '已封印 · 你的血脉拒绝了它' : lv > 0 ? `Lv${lv}/6` : '未激活';
      rows.push({
        text: `${ROUTES[r].groupName}·${ROUTES[r].name}　${status}`,
        color: sealed ? '#5a4a4e' : lv > 0 ? C.gene : C.dim,
        size: 15,
      });
    }
    rows.push({ text: `位面图鉴 · 已探索 ${countVisited(this.save)}/12`, color: C.gold });
    const collectible = activatableRoutes(this.save);
    if (collectible.length) {
      rows.push({ text: `仍可争取：${collectible.map((r: string) => ROUTES[r].name).join('、')}`, size: 15, color: C.dim });
    }
    // 传承残影：名称 + 效果 + 故事（与 web 端图鉴同口径）
    const EFF_LABEL: Record<string, string> = {
      atkPct: '攻击', hpPct: '生命', aspdPct: '攻速', crit: '暴击', critDmg: '暴伤',
      aoe: '清场范围', lifesteal: '吸血', regen: '回血', dmgReduct: '减伤',
      execute: '斩杀', cooldownPct: '技能冷却缩减',
    };
    if (this.save.inventory.relics.length) {
      rows.push({ text: `传承残影 · ${this.save.inventory.relics.length}`, color: C.gold });
      for (const id of this.save.inventory.relics) {
        const r = relicById(id);
        const effText = Object.entries(r.eff ?? {}).map(([k, v]) => `${EFF_LABEL[k] ?? k} +${Math.round((v as number) * 100)}%`).join('，');
        rows.push({ text: `${r.name}　${effText || (r.rare ? '稀有' : '')}`, color: '#c9b8ff', size: 15 });
        if (r.story) rows.push({ text: `　 ${r.story}`, size: 13, color: C.dim });
      }
    }
    this.modal.show({
      title: '进化图鉴',
      rows,
      buttons: [{ text: '关闭', onClick: () => this.renderLobby() }],
    });
  }

  private confirmReset(): void {
    this.modal.show({
      title: '重置存档',
      rows: [
        { text: '将清空全部永久财产：', color: C.danger },
        { text: '基因锁 / 封印记录 / 装备 / 隐藏技能刻印', size: 15 },
        { text: '此操作不可撤销。', size: 15, color: C.dim },
      ],
      buttons: [
        {
          text: '确认重置',
          style: 'danger',
          onClick: () => {
            this.repo.reset();
            this.save = this.repo.load();
            this.renderLobby();
          },
        },
        { text: '取消', onClick: () => {} },
      ],
    });
  }

  // ===== 调试接口（与网页原型同名，便于同一套 e2e 驱动）=====

  private exposeDebugApi(): void {
    if (typeof globalThis === 'undefined') return;
    (globalThis as any).__shizu = {
      get save() { return (globalThis as any).__shizuRoot.save; },
      get run() { return (globalThis as any).__shizuRoot.run; },
      snapshot: () => {
        const r = this.run;
        return {
          screen: r ? 'battle' : 'lobby',
          runs: this.save.player.totalRuns,
          state: r?.state ?? null,
          stage: r?.stageNo ?? null,
          hp: r?.hp ?? null,
          genes: r?.genes ?? null,
          channel: r?.dungeon.channel ?? null,
          plane: r?.dungeon.plane.name ?? null,
        };
      },
    };
    (globalThis as any).__shizuRoot = this;
  }
}

const RARITY_TEXT: Record<string, string> = {
  white: '#b9c0c6', green: '#6db76d', blue: '#5b9bd5', purple: '#a678d4', gold: '#d8bd6a',
};

function countVisited(save: any): number {
  return planes.filter((p: any) => (p.routes ?? []).some((r: string) => (save.player.geneLocks[r] ?? 0) > 0)).length;
}

/** core 层的日志带少量 HTML 标记（网页原型用），Label 不认，这里剥掉 */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

function logColor(cls: string): string {
  switch (cls) {
    case 'dmg': case 'death': return C.danger;
    case 'heal': return C.heal;
    case 'gene': case 'drop': return C.gene;
    case 'learn': case 'win': return C.gold;
    case 'hidden': return C.hidden;
    case 'stage': case 'wave': case 'info': return C.dim;
    default: return C.text;
  }
}
