// ===== game/GameRoot.ts · 主控组件（挂在 Canvas 上）=====
// 职责边界：本层与 UiKit/ModalLayer 依赖 cc；../core 与 ../data 完全不依赖 ——
// 那两层就是网页原型里跑通、并被 tests/ 65 项测试守护的同一份代码。
//
// 竖屏 640×960（整体策划 1.1）。当前无美术资源，全部程序化绘制（见 UiKit.ts）。

import { Component, Label, Node, _decorator } from 'cc';
import { C, DESIGN, clearChildren, drawBar, drawPanel, makeButton, makeDivider, makeLabel, makeNode, sizeOf } from './UiKit';
import { ModalLayer, ModalRow } from './ModalLayer';
import { createStorage } from '../platform/storage';

import { createSaveRepo } from '../core/save.js';
import { computePower, dungeonDifficulty, DIFFICULTY_COEF, DIFFICULTY_LABEL, combatStats, geneLockPowerBonus } from '../core/balance.js';
import { generateDungeon, MAX_ONSCREEN } from '../core/dungeon.js';
import { previewPlane, rollPlane } from '../core/planePool.js';
import { Run, RunState } from '../core/run.js';
import { rngFactory } from '../core/rng.js';
import { activatableRoutes, activatedRoutes, chargeToNextSegment, geneLockLevel, isSealed } from '../core/geneLock.js';
import { affixText, gearPowerBonus, salvageGear } from '../core/gear.js';
import { SLOT_KEYS, SLOT_LABEL } from '../core/skillSlots.js';
import { ROUTES, ALL_ROUTES, mutexOf } from '../data/routes.js';
import { planes } from '../data/planes.js';
import { GEAR_SLOTS, GEAR_SLOT_IDS, GEAR_RARITY } from '../data/attrPool.js';
import { nestLine } from '../data/lines.js';

const { ccclass } = _decorator;

const LOG_LINES = 7;

@ccclass('GameRoot')
export class GameRoot extends Component {
  private repo: any;
  private save: any;
  private run: any = null;
  private uiRng!: () => number;

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

    this.exposeDebugApi();
    this.renderLobby();
  }

  // ===== 通用 =====

  private refreshHeader(extra = ''): void {
    const p = this.save.player;
    this.header.string =
      `战力 ${computePower(p).toFixed(2)}　难度 ${DIFFICULTY_LABEL[p.difficultyLevel]}`
      + `　动态 ${p.dynFactor.toFixed(2)}　通关 ${p.wins}/${p.totalRuns}` + (extra ? `　${extra}` : '');
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
    makeButton(s, '🎒 装备背包', 130, 115, 220, () => this.openBag());
    makeButton(s, '📖 进化图鉴', 360, 115, 220, () => this.openCodex());
    makeButton(s, '⚙ 难度设置', 130, 35, 220, () => this.openDifficulty());
    makeButton(s, '🗑 重置存档', 360, 35, 220, () => this.confirmReset(), 'danger');

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

  // ===== 开裂缝 =====

  private openRift(): void {
    const plane = rollPlane(this.save, this.uiRng);
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

    this.modal.show({
      title: `裂缝 · ${pre.name}`,
      rows,
      buttons: [
        { text: '撕开裂缝，进入', style: 'primary', onClick: () => this.startRun(plane) },
        { text: '换一道裂缝', onClick: () => this.openRift() },
        { text: '再想想', onClick: () => {} },
      ],
    });
  }

  private startRun(plane: any): void {
    const seed = Math.floor(this.uiRng() * 0xffffffff) >>> 0;
    const dungeon = generateDungeon(plane, this.save, seed);
    this.run = new Run(this.save, dungeon, seed ^ 0x9e3779b9);
    this.renderBattle();
  }

  // ===== 局内 =====

  private renderBattle(): void {
    const run = this.run;
    if (!run) return;
    const d = run.dungeon;
    this.refreshHeader(`副本 D ${d.D.toFixed(1)}`);
    const s = this.resetScreen();

    makeLabel(s, `${d.plane.name} · ${d.plane.theme}`, 0, 296, {
      size: 24, color: C.gold, align: Label.HorizontalAlign.CENTER, bold: true,
    });
    const mm = String(Math.floor(run.elapsed / 60)).padStart(2, '0');
    const ss = String(run.elapsed % 60).padStart(2, '0');
    makeLabel(s,
      `阶段 ${run.stageNo}/5　⏱ ${mm}:${ss}　`
      + (d.channel === 'skill' ? '技能通道' : '属性通道'),
      0, 266, { size: 15, color: C.dim, align: Label.HorizontalAlign.CENTER, width: DESIGN.width - 40 });

    // —— 巢灵血条 ——
    const me = makeNode('Me', s, -245, 200);
    sizeOf(me, 470, 110);
    drawPanel(me, 470, 110, C.panelDeep);
    makeLabel(me, `巢灵　HP ${Math.round(run.hp)} / ${Math.round(run.stats.maxHp)}`, -210, 30, { size: 16, width: 260 });
    makeLabel(me, `基因 ${run.genes}　已割 ${run.kills}`, 60, 30, { size: 15, color: C.gene, width: 180 });
    const hpBar = makeNode('HpBar', me, 0, -15);
    drawBar(hpBar, 430, 12, run.hp / run.stats.maxHp, '#d06a7a');

    // —— 同屏压力 / 阶段收尾单位 ——
    const boss = run.boss;
    const tgt = makeNode('Swarm', s, 245, 200);
    sizeOf(tgt, 470, 110);
    drawPanel(tgt, 470, 110, C.panelDeep);
    if (boss) {
      const tag = boss.kind === 'boss' ? '【位面之主】' : '【精英】';
      makeLabel(tgt, `${boss.name} ${tag}`, -210, 30, {
        size: 16, color: boss.kind === 'boss' ? C.gold : C.text, width: 260,
      });
      makeLabel(tgt, `${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp}`, 60, 30, { size: 15, color: C.dim, width: 180 });
      const tb = makeNode('BossBar', tgt, 0, -15);
      drawBar(tb, 430, 12, boss.hp / boss.maxHp, '#a4574f', '#241a1a');
    } else {
      makeLabel(tgt, `同屏敌人 ${run.onScreen} / ${MAX_ONSCREEN}`, -210, 30, { size: 16, width: 260 });
      makeLabel(tgt, `本阶段剩余 ${run.stageRemain}s`, 60, 30, { size: 15, color: C.dim, width: 180 });
      const sb = makeNode('SwarmBar', tgt, 0, -15);
      drawBar(sb, 430, 12, run.onScreen / MAX_ONSCREEN, '#7a6a3a', '#241f1a');
    }

    // —— 战斗日志 ——
    const logNode = makeNode('Log', s, 0, 35);
    sizeOf(logNode, 900, 210);
    drawPanel(logNode, 900, 210, C.panelDeep);
    const recent = run.log.slice(-LOG_LINES);
    let ly = 78;
    for (const entry of recent) {
      makeLabel(logNode, stripTags(entry.text), -430, ly, {
        size: 15, color: logColor(entry.cls), width: 860, height: 26,
      });
      ly -= 30;
    }

    // —— 推进 ——
    switch (run.state) {
      case RunState.FIGHTING:
        makeButton(s, '前 进 ▶', 0, -170, 480, () => {
          run.step();
          this.renderBattle();
        }, 'primary', 72);
        makeLabel(s, '每次「前进」= 3 秒战斗：刷怪 → 横扫 → 被围受击', 0, -230, {
          size: 14, color: C.dim, align: Label.HorizontalAlign.CENTER, width: 400,
        });
        break;
      case RunState.CHOOSING:
        this.showChoice();
        break;
      case RunState.SLOT_CONFLICT:
        this.showSlotConflict();
        break;
      case RunState.WON:
      case RunState.LOST:
        this.showSettle();
        break;
      default:
        break;
    }
  }

  private showChoice(): void {
    const run = this.run;
    const { reason, options } = run.pendingOptions;
    const rows: ModalRow[] = [];
    options.forEach((o: any, i: number) => {
      if (o.kind === 'skill') {
        rows.push({ text: `${i + 1}. 【技能】${o.name}　${ROUTES[o.route].name}·第${o.lv}段`, color: C.gold });
        rows.push({ text: `　　 ${o.desc}　${o.val}`, size: 15, color: C.dim });
      } else {
        rows.push({ text: `${i + 1}. 【属性】${o.name}`, color: C.gene });
        rows.push({ text: `　　 ${o.desc}`, size: 15, color: C.dim });
      }
    });

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

  private showSettle(): void {
    const r = this.run.finalize(this.repo);
    const rows: ModalRow[] = [
      { text: `评级 ${r.grade}　抵达阶段 ${r.stageReached}/5`, color: C.gold, size: 19 },
      { text: `噬灭 ${r.kills} 只（杂兵 ${r.minionKills}）　存活 ${Math.floor(r.survivedSec / 60)}:${String(r.survivedSec % 60).padStart(2, '0')}` },
      { text: `吞噬基因 ${r.genes}` },
    ];

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
      rows.push({ text: `${ROUTES[c.route].name} 充能：第 ${c.from} 段 → 第 ${c.to} 段`, color: C.gene });
    }
    if (r.relics.length) rows.push({ text: `传承 ×${r.relics.length}` });
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
    buttons.push({ text: '关闭', onClick: () => this.renderLobby() });

    this.modal.show({ title: '装备背包', rows, buttons });
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
