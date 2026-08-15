// ===== 游戏.js · 局内状态机与战斗引擎 =====

import { 事件中心实例 } from '../core/事件中心.js';
import { 状态中心实例 } from '../core/状态中心.js';
import { 界面中心实例 } from '../core/界面中心.js';
import { 战斗属性, 基因锁加成, 装备加成, 战力, 副本难度 } from '../core/属性中心.js';
import { 位面表 } from './数据/位面.js';
import { 已激活 } from './数据/路线.js';
import { 技能表 } from './数据/技能.js';
import { 生成装备, 槽位表 } from './数据/装备.js';
import { 隐藏技能表 } from './数据/隐藏技能.js';
import { randInt, weightedPick, prdRoll, sleep } from '../core/tools.js';

/** 通用属性池（不匹配位面的三选一） */
const 属性池 = [
  { 名: '噬骨之爪', key: '攻', 值: 0.10, 描述: '攻击 +10%' },
  { 名: '厚甲之壳', key: '血', 值: 0.15, 描述: '生命 +15%' },
  { 名: '疾行之风', key: '速', 值: 0.10, 描述: '速度 +10%' },
  { 名: '暴君之瞳', key: '暴击', 值: 0.05, 描述: '暴击 +5%' },
  { 名: '连噬之颚', key: '攻速', 值: 0.08, 描述: '攻速 +8%' },
  { 名: '血饲之牙', key: '吸血', 值: 0.02, 描述: '吸血 +2%' },
  { 名: '自愈之囊', key: '回血', 值: 0.01, 描述: '回血 +1%/s' },
  { 名: '贪婪触须', key: '吸取半径', 值: 0.10, 描述: '吸取半径 +10%' },
];

export class 游戏 {
  constructor(存档) {
    this.存档 = 存档;
    this.局内 = null;        // 局内状态
    this.busy = false;
    this.已订阅 = false;
    this.库 = null;          // 当前事件库（推进源）
  }

  // ============ 开局 ============
  开始新局(难度等级, 位面) {
    const s = this.存档;
    s.player.难度等级 = 难度等级;
    s.player.总次数++;
    存档持久化(s);
    this.局内 = this.创建局内状态(位面);
    this.渲染();
    this.启动事件库();
    this.进入阶段(1);
  }

  创建局内状态(位面) {
    const s = this.存档;
    const b = 战斗属性(s);
    // 隐藏技能开局自动装载（跨局刻印）
    const 隐藏已装载 = [];
    for (const slot of Object.values(s.player.技能槽)) {
      if (slot && slot.隐藏) 隐藏已装载.push(slot.名);
    }
    return {
      位面,
      难度值: 副本难度(s),
      阶段: 1,
      波次: 1,
      波次总数: 1,
      敌群: [],
      基因: 0,           // 本局累计基因
      技能: [],           // 本局已学普通技能名
      属性加成: {},       // key -> 倍率
      隐藏已装载,
      战斗: { ...b },
      装备掉落: [],
      组合技: [],
      胜利: false,
      失败: false,
    };
  }

  // ============ 事件库 ============
  启动事件库() {
    const lib = this.创建事件库();
    this.库 = lib;
    事件中心实例.挂载事件库(lib);
  }

  停止事件库() {
    if (this.库) { 事件中心实例.卸载事件库(this.库); this.库 = null; }
  }

  // ============ 阶段推进 ============
  进入阶段(n) {
    const g = this.局内;
    g.阶段 = n;
    const 蓝图 = g.蓝图 = g.蓝图 || this.生成蓝图();
    const st = 蓝图.阶段[n - 1];
    g.波次总数 = st.波次;
    g.波次 = 1;
    this.生成波次(n, 1);
    this.渲染();
  }

  生成蓝图() {
    const 位面 = this.局内.位面;
    const D = this.局内.难度值;
    const 阶段系数 = [0.9, 1.0, 1.15, 1.3];
    const stages = [];
    for (let s = 1; s <= 5; s++) {
      const 系数 = s === 5 ? 1.12 : 阶段系数[s - 1];
      stages.push({
        阶段: s,
        波次: s === 5 ? 1 : (位面.波次 || [3, 4, 3, 4])[s - 1] || 3,
        系数,
        精英: (s === 3 || s === 4) ? { 名: `${位面.主题}·精英`, HP: Math.round(位面.精HP * D * 系数), 攻: +(位面.精攻 * D * 系数).toFixed(1), 精英: true } : null,
      });
    }
    return { 位面, 难度值: D, 阶段: stages };
  }

  生成波次(阶段, 波) {
    const g = this.局内;
    const 蓝图 = g.蓝图;
    const st = 蓝图.阶段[阶段 - 1];
    const 位面 = g.位面;
    const 敌群 = [];
    if (阶段 === 5) {
      敌群.push({ 名: 位面.之主, HP: Math.round(位面.BOSSHP * st.系数 * g.难度值), 攻: +(位面.BOSS攻 * st.系数 * g.难度值).toFixed(1), BOSS: true });
    } else {
      const 数量 = st.波次;
      // 最后波出精英
      const isElite = 波 === st.波次 && st.精英;
      for (let i = 0; i < 数量; i++) {
        if (isElite && i === Math.floor(数量 / 2)) {
          敌群.push({ ...st.精英, 精英: true });
        } else {
          const 波动 = 0.85 + Math.random() * 0.3;
          敌群.push({ 名: `${位面.主题}·喽啰`, HP: Math.round(位面.小HP * st.系数 * g.难度值 * 波动), 攻: +(位面.小攻 * st.系数 * g.难度值 * 波动).toFixed(1) });
        }
      }
    }
    g.敌群 = 敌群;
    g.当前目标 = 0;
  }

  // ============ 战斗一步 ============
  async 战斗回合() {
    if (this.busy) return;
    const g = this.局内;
    if (!g || g.胜利 || g.失败) return;
    if (!g.敌群.length) return;
    this.busy = true;
    try {
      this.玩家攻击();
      if (g.失败) { await this.败局(); return; }
      await this.清波检查();
      if (g.胜利) { await this.胜局(); return; }
      this.渲染();
    } finally {
      this.busy = false;
    }
  }

  玩家攻击() {
    const g = this.局内;
    const b = g.战斗;
    const 目标 = g.敌群[g.当前目标];
    let 伤害 = b.攻 * (0.85 + Math.random() * 0.3);
    let 暴击 = Math.random() < b.暴击;
    if (暴击) 伤害 *= 1.5;
    // 路线被动简算
    for (const 技名 of g.技能) {
      if (技名 === '雷击附魔') 伤害 += b.攻 * 0.3;
      if (技名 === '雷链') 伤害 += b.攻 * 0.15;
      if (技名 === '连击' || 技名 === '连招') 伤害 *= 1.2;
      if (技名 === '剑气' || 技名 === '蛮力') 伤害 *= 1.15;
      if (技名 === '尸毒') 目标.HP -= b.攻 * 0.3;
      if (技名 === '践踏' || 技名 === '震地') g.敌群.forEach((e, i) => { if (i !== g.当前目标) e.HP -= b.攻 * 0.4; });
      if (技名 === '速射') 伤害 *= 1.1;
    }
    for (const h of g.隐藏已装载) {
      if (h === '禁忌·饕餮真身') 伤害 *= 1.2;
      if (h === '禁忌·大禁咒') 伤害 *= 1.1;
      if (h === '禁忌·无双') 伤害 *= 1.3;
    }
    伤害 = Math.max(1, Math.round(伤害));
    目标.HP -= 伤害;
    状态中心实例.追加事件(`你${暴击 ? '<b class="gold">暴击</b>' : ''}攻击 ${目标.名}，造成 <b>${伤害}</b> 点伤害${目标.HP <= 0 ? '，<b>击杀</b>' : ''}。`, 'atk');
    if (目标.HP <= 0) {
      // 击杀收益
      const 基因获得 = 目标.BOSS ? randInt(200, 300) : 目标.精英 ? randInt(30, 50) : randInt(5, 10);
      g.基因 += 基因获得;
      状态中心实例.追加事件(`吞噬基因碎片 +${基因获得}。`, 'gene');
      // 回血类被动
      for (const 技名 of g.技能) {
        if (技名 === '度化') { const h = Math.round(b.血 * 0.02); b.HP = Math.min(b.血, (b.HP || b.血) + h); 状态中心实例.追加事件(`度化回血 +${h}。`, 'heal'); }
        if (技名 === '饕餮巨口') { const h = Math.round(b.血 * 0.05); b.HP = Math.min(b.血, (b.HP || b.血) + h); }
      }
      // 掉落
      this.掉落检查(目标);
    }
    // 敌人反击
    if (目标.HP > 0 && g.敌群.length) {
      const 敌人 = g.敌群[g.当前目标];
      if (敌人.HP > 0) {
        let dmg = 敌人.攻 * (0.85 + Math.random() * 0.3);
        if (b.减伤 > 0) dmg *= (1 - b.减伤);
        dmg = Math.max(0, Math.round(dmg));
        b.HP = (b.HP === undefined ? b.血 : b.HP) - dmg;
        状态中心实例.追加事件(`${敌人.名}反击，你受到 <b>${dmg}</b> 点伤害。`, 'dmg');
        if (b.HP <= 0) {
          g.失败 = true;
          状态中心实例.追加事件('你的生命值耗尽，倒在裂缝之中……', 'death');
        }
      }
    }
    // 回血
    if (b.回血 > 0 && b.HP !== undefined && b.HP < b.血) {
      b.HP = Math.min(b.血, b.HP + Math.round(b.血 * b.回血));
    }
    // 击杀后推进目标
    if (目标.HP <= 0) {
      g.当前目标++;
      // 找到下一个存活
      while (g.当前目标 < g.敌群.length && g.敌群[g.当前目标].HP <= 0) g.当前目标++;
      if (g.当前目标 >= g.敌群.length) {
        g.敌群 = [];
        g.当前目标 = 0;
      }
    }
    this.渲染();
  }

  掉落检查(目标) {
    const g = this.局内;
    const s = this.存档;
    // 匹配：位面路线已激活（与三选一一致）；不匹配位面 → 零技能但装备掉率 ×1.5
    const 匹配 = !g.位面.路线 || 已激活(s, g.位面.路线);
    const 倍率 = 匹配 ? 1 : 1.5;   // 不匹配位面装备掉率 ×1.5
    let r;
    if (目标.BOSS) {
      // 位面之主 100% 保底蓝
      r = '蓝';
      const x = Math.random();
      if (x < 0.05) r = '金';
      else if (x < 0.30) r = '紫';
    } else if (目标.精英) {
      r = Math.random() < 0.01 * 倍率 ? '绿' : Math.random() < 0.04 * 倍率 ? '白' : null;
    } else {
      r = Math.random() < 0.005 * 倍率 ? '白' : null;
    }
    if (r) {
      const 槽位 = weightedPick(Object.keys(槽位表).map((k) => ({ item: k, weight: 1 })));
      const 装备 = 生成装备(r, 槽位);
      g.装备掉落.push(装备);
      s.player.背包.push(装备);
      存档持久化(s);
      状态中心实例.追加事件(`🎁 掉落装备：<b class="r-${r}">${装备.名称}</b>（${装备.词条.map((a) => a.描述).join('，')}）`, 'drop');
    }
    // 隐藏技能：仅匹配位面，PRD 0.1%
    if (匹配 && g.位面.路线 && 隐藏技能表.some((h) => h.路线 === g.位面.路线)) {
      const st = s.stats;
      const { hit, nextP } = prdRoll(0.001, st.隐藏计数 > 0 ? Math.min(0.001 + st.隐藏计数 * 0.0004, 0.1) : 0.001);
      st.隐藏计数 = nextP;
      if (hit) {
        const 池 = 隐藏技能表.filter((h) => h.路线 === g.位面.路线 && !s.inventory.隐藏技能.includes(h.名) && !Object.values(s.player.技能槽).some((v) => v && v.名 === h.名));
        if (池.length) {
          const hs = 池[Math.floor(Math.random() * 池.length)];
          s.inventory.隐藏技能.push(hs.名);
          st.隐藏计数 = 0.001;
          s.stats.成就['禁忌觉醒'] = true;
          存档持久化(s);
          状态中心实例.追加事件(`🔥 <b class="gold">隐藏技能显现：【${hs.名}】</b>！已永久铭刻。`, 'hidden');
        }
      }
    }
  }

  async 清波检查() {
    const g = this.局内;
    if (g.敌群.length) return;
    if (g.阶段 === 5) {
      // 位面之主死亡 → 胜利
      g.胜利 = true;
      return;
    }
    // 下一波或下一阶段
    if (g.波次 < g.波次总数) {
      g.波次++;
      this.生成波次(g.阶段, g.波次);
      状态中心实例.追加事件(`—— 第 ${g.阶段} 阶段 · 第 ${g.波次} 波 ——`, 'wave');
      await sleep(400);
    } else {
      await this.阶段完成();
    }
  }

  async 阶段完成() {
    const g = this.局内;
    状态中心实例.追加事件(`✨ 第 ${g.阶段} 阶段肃清！${g.阶段 === 4 ? '，位面之主的气息逼近……' : ''}`, 'stage');
    if (g.阶段 < 5) {
      if (g.阶段 === 3 || g.阶段 === 4) {
        // 阶段 3/4 完成后触发三选一
        this.三选一(() => {
          this.进入阶段(g.阶段 + 1);
          状态中心实例.追加事件(`—— 进入第 ${g.阶段} 阶段 ——`, 'wave');
        });
      } else {
        this.进入阶段(g.阶段 + 1);
        状态中心实例.追加事件(`—— 进入第 ${g.阶段} 阶段 ——`, 'wave');
      }
    }
  }

  // ============ 三选一 ============
  三选一(完成回调) {
    const g = this.局内;
    const s = this.存档;
    // 匹配判定：位面路线已激活 → 学技能；未激活/互斥 → 属性池 + 装备（三通道）
    let 选项 = [];
    if (g.位面.名 === '诸天之心') {
      const 池 = 技能表.filter((sk) => !g.技能.includes(sk.名));
      if (池.length) 选项 = 洗牌(池).slice(0, 3).map((sk) => ({ 类型: '技能', 技能: sk }));
    } else if (g.位面.名 === '奇巧迷宫') {
      const 池 = 技能表.filter((sk) => !g.技能.includes(sk.名) && (sk.路线 === '奇技' || sk.路线 === '魔法'));
      if (池.length) 选项 = 洗牌(池).slice(0, 3).map((sk) => ({ 类型: '技能', 技能: sk }));
    } else if (g.位面.路线 && 已激活(s, g.位面.路线)) {
      const 池 = 技能表.filter((sk) => sk.路线 === g.位面.路线 && !g.技能.includes(sk.名));
      if (池.length) 选项 = 洗牌(池).slice(0, 3).map((sk) => ({ 类型: '技能', 技能: sk }));
    }
    // 属性池补充
    const 属性选项 = 洗牌(属性池).slice(0, 3).map((a) => ({ 类型: '属性', 属性: a }));
    选项 = 选项.concat(属性选项).slice(0, 3);
    // 装备补位（三通道：技能/属性/装备）
    const 缺 = 3 - 选项.length;
    if (缺 > 0) {
      for (let i = 0; i < 缺; i++) {
        const r = weightedPick([{ item: '白', weight: 70 }, { item: '绿', weight: 20 }, { item: '蓝', weight: 8 }, { item: '紫', weight: 2 }]);
        选项.push({ 类型: '装备', 装备: 生成装备(r, weightedPick(Object.keys(槽位表).map((k) => ({ item: k, weight: 1 })))) });
      }
    }
    界面中心实例.设置推进按钮(false);
    状态中心实例.打开模态({
      title: `阶段 ${g.阶段} 结束 · 选择你的进化`,
      body: 选项.map((o) => {
        if (o.类型 === '技能') return `<div class="pick"><b>【技能】${o.技能.名}</b>（${o.技能.路线}·第${o.技能.段}段）<br><span>${o.技能.效果} <i>${o.技能.数值}</i></span></div>`;
        if (o.类型 === '属性') return `<div class="pick"><b>【属性】${o.属性.名}</b><br><span>${o.属性.描述}</span></div>`;
        return `<div class="pick"><b>【装备】${o.装备.名称}</b><br><span>${o.装备.词条.map((a) => a.描述).join('，')}</span></div>`;
      }).join(''),
      buttons: 选项.map((o) => ({
        text: o.类型 === '技能' ? `习得 ${o.技能.名}` : o.类型 === '属性' ? `获得 ${o.属性.名}` : `拾取 ${o.装备.名称}`,
        onClick: () => {
          状态中心实例.关闭模态();
          this.选择进化(o);
          界面中心实例.设置推进按钮(true);
          if (完成回调) 完成回调();
        },
      })),
    });
  }

  选择进化(choice) {
    const g = this.局内;
    const s = this.存档;
    if (choice.类型 === '技能') {
      const sk = choice.技能;
      // 主动→主动槽 A/B；被动→被动槽 C/D
      const 槽位表名 = sk.类型 === '主动' ? ['主动A', '主动B'] : ['被动C', '被动D'];
      const 槽 = 槽位表名.find((k) => !s.player.技能槽[k]);
      if (槽) {
        s.player.技能槽[槽] = { 名: sk.名, 类型: sk.类型, 隐藏: false };
        g.技能.push(sk.名); // 局内生效列表
      } else {
        // 槽满：替换或放弃
        状态中心实例.打开模态({
          title: '技能槽已满',
          body: `${sk.类型}技能槽已满（${槽位表名.join(' / ')}），选择要替换的技能或放弃：<b>${sk.名}</b>`,
          buttons: 槽位表名.map((k) => {
            const 旧 = s.player.技能槽[k];
            return {
              text: `替换 ${k}（当前：${旧?.名 || '空'}）`,
              onClick: () => {
                // 移除旧技能局内生效
                if (旧) g.技能 = g.技能.filter((n) => n !== 旧.名);
                s.player.技能槽[k] = { 名: sk.名, 类型: sk.类型, 隐藏: false };
                g.技能.push(sk.名);
                存档持久化(s);
                状态中心实例.关闭模态();
                this.渲染();
              },
            };
          }).concat([{ text: '放弃', onClick: () => 状态中心实例.关闭模态() }]),
        });
      }
      状态中心实例.追加事件(`你习得了 <b>${sk.名}</b>（${sk.路线}·第${sk.段}段）！`, 'learn');
    } else if (choice.类型 === '属性') {
      const a = choice.属性;
      g.属性加成[a.key] = (g.属性加成[a.key] || 1) + a.值;
      // 属性也写入局内战斗
      if (a.key === '攻') g.战斗.攻 *= (1 + a.值);
      if (a.key === '血') { g.战斗.血 *= (1 + a.值); }
      if (a.key === '速') g.战斗.速 *= (1 + a.值);
      if (a.key === '暴击') g.战斗.暴击 += a.值;
      if (a.key === '攻速') g.战斗.攻速 *= (1 + a.值);
      if (a.key === '吸血') g.战斗.吸血 += a.值;
      if (a.key === '回血') g.战斗.回血 += a.值;
      if (a.key === '吸取半径') g.战斗.吸取半径 *= (1 + a.值);
      状态中心实例.追加事件(`你获得了 <b>${a.名}</b>（${a.描述}）`, 'learn');
    } else {
      const 装 = choice.装备;
      s.player.背包.push(装);
      存档持久化(s);
      状态中心实例.追加事件(`你拾取了 <b class="r-${装.稀有度}">${装.名称}</b>！`, 'drop');
    }
    存档持久化(s);
    this.渲染();
  }

  // ============ 胜/败局 ============
  async 胜局() {
    const g = this.局内;
    const s = this.存档;
    g.胜利 = true;
    s.player.通关++;
    s.player.连败 = 0;
    s.stats.成就['披甲噬祖'] = true;
    if (g.位面.名 === '诸天之心') s.stats.首通诸天 = true;
    // 永久属性转化：基因 → 永久属性（1% = 100 基因）
    const 转化 = Math.floor(g.基因 / 100);
    const 分配 = ['永久攻%', '永久血%', '永久速%'];
    for (let i = 0; i < 转化; i++) {
      const k = 分配[Math.floor(Math.random() * 3)];
      s.player[k] = (s.player[k] || 0) + 0.01;
    }
    // 基因锁：本局位面路线 +1 段（上限 6）；无路线位面 → 随机已激活路线 +1
    const 增段 = (r) => { s.player.基因锁[r] = Math.min(6, (s.player.基因锁[r] || 0) + 1); };
    if (g.位面.路线 && !s.player.封印路线.includes(g.位面.路线) && (s.player.基因锁[g.位面.路线] || 0) < 6) {
      增段(g.位面.路线);
    } else {
      const 已激活路线表 = Object.keys(s.player.基因锁).filter((r) => s.player.基因锁[r] > 0 && s.player.基因锁[r] < 6);
      if (已激活路线表.length) 增段(已激活路线表[Math.floor(Math.random() * 已激活路线表.length)]);
    }
    // 传承（20% 保底）
    s.stats.传承保底 = (s.stats.传承保底 || 0) + 1;
    if (Math.random() < 0.2 || s.stats.传承保底 >= 8) {
      const 传承 = g.位面.路线 ? { 名: `传承·${g.位面.路线}`, 路线: g.位面.路线 } : { 名: '传承·诸天', 路线: null };
      s.inventory.传承.push(传承.名);
      s.stats.传承保底 = 0;
      状态中心实例.追加事件(`你获得了 <b>${传承.名}</b>！`, 'learn');
    }
    存档持久化(s);
    // 结算弹窗
    await sleep(500);
    状态中心实例.追加事件(`🎉 <b class="gold">你噬灭了【${g.位面.名}】位面！</b> 基因 +${g.基因}，永久属性已转化。`, 'win');
    界面中心实例.设置推进按钮(false);
    状态中心实例.打开模态({
      title: `通关 · ${g.位面.名}`,
      body: `<div class="sum"><p>本局吞噬基因：<b>${g.基因}</b></p><p>永久属性转化：<b>+${转化}%</b></p><p>累计通关：<b>${s.player.通关}</b> 次</p><p>掉落装备：<b>${g.装备掉落.length}</b> 件</p></div>`,
      buttons: [
        { text: '再战诸天', style: 'primary', onClick: () => { 状态中心实例.关闭模态(); this.停止事件库(); this.开始新局(s.player.难度等级, 随机位面(s)); } },
        { text: '返回大厅', onClick: () => { 状态中心实例.关闭模态(); this.停止事件库(); 事件中心实例.广播('返回大厅', s); } },
      ],
    });
  }

  async 败局() {
    const g = this.局内;
    const s = this.存档;
    g.失败 = true;
    s.player.连败++;
    // 部分基因残留（20%）
    const 残留 = Math.floor(g.基因 * 0.2 / 100);
    if (残留 > 0) {
      const 分配 = ['永久攻%', '永久血%', '永久速%'];
      for (let i = 0; i < 残留; i++) s.player[分配[Math.floor(Math.random() * 3)]] += 0.01;
    }
    存档持久化(s);
    界面中心实例.设置推进按钮(false);
    await sleep(400);
    状态中心实例.打开模态({
      title: '身陨裂缝',
      body: `<p>你在【${g.位面.名}】第 ${g.阶段} 阶段被噬灭……</p><p>残留基因化为永久属性：<b>+${残留}%</b></p>`,
      buttons: [
        { text: '再次挑战', style: 'primary', onClick: () => { 状态中心实例.关闭模态(); this.停止事件库(); this.开始新局(s.player.难度等级, 随机位面(s)); } },
        { text: '返回大厅', onClick: () => { 状态中心实例.关闭模态(); this.停止事件库(); 事件中心实例.广播('返回大厅', s); } },
      ],
    });
  }

  // ============ 渲染 ============
  渲染() {
    const s = this.存档;
    const g = this.局内;
    if (!g) { 界面中心实例.渲染(状态中心实例.ui); return; }
    const b = g.战斗;
    const HP = b.HP === undefined ? b.血 : Math.max(0, Math.round(b.HP));
    const 位面 = g.位面;
    const 敌群 = g.敌群;
    const 目标 = 敌群[g.当前目标];
    const 匹配 = !位面.路线 ? '全融合' : 已激活(s, 位面.路线) ? '已匹配' : '不匹配';
    状态中心实例.更新({
      meta: `战力 <b>${战力(s).toFixed(1)}</b> · 难度 <b>${s.player.难度等级}</b> · 副本难度值 <b>${g.难度值.toFixed(1)}</b>`,
      sceneTitle: `【${位面.名}】${位面.主题}`,
      sceneDesc: `第 ${g.阶段}/5 阶段 · 波次 ${g.波次}/${g.波次总数} · 通道匹配：${匹配}${位面.路线 ? `（${位面.路线}）` : ''}`,
      playerCard: `
        <h4>噬灵</h4>
        <div class="hpbar"><i style="width:${Math.min(100, HP / b.血 * 100)}%"></i></div>
        <p class="hp">HP ${HP}/${b.血} &nbsp; 攻 ${b.攻.toFixed(0)} &nbsp; 速 ${b.速.toFixed(0)}</p>
        <p class="small">暴击 ${(b.暴击 * 100).toFixed(0)}% · 吸血 ${(b.吸血 * 100).toFixed(0)}% · 减伤 ${(b.减伤 * 100).toFixed(0)}%</p>
        <p class="small">基因锁加成 ×${基因锁加成(s).toFixed(2)} · 装备加成 ×${装备加成(s.player.装备).toFixed(2)}</p>
      `,
      geneCard: `
        <h4>基因·本局 <b>${g.基因}</b></h4>
        <p class="small">已学技能：${g.技能.length ? g.技能.join('、') : '无'}</p>
        <p class="small">隐藏刻印：${g.隐藏已装载.length ? g.隐藏已装载.join('、') : '无'}</p>
      `,
      gearCard: this.渲染装备(s),
      slotsCard: this.渲染技能槽(s),
    });
    if (目标) {
      状态中心实例.更新({
        sceneDesc: `第 ${g.阶段}/5 阶段 · 波次 ${g.波次}/${g.波次总数} · 通道匹配：${匹配}${位面.路线 ? `（${位面.路线}）` : ''}<br><b>${目标.名}</b> HP ${Math.max(0, Math.round(目标.HP))} ${目标.BOSS ? '【位面之主】' : 目标.精英 ? '【精英】' : ''}`,
      });
    }
  }

  渲染装备(s) {
    const 装 = s.player.装备;
    let html = `<h4>装备栏（加成 ×${装备加成(装).toFixed(2)}）</h4>`;
    for (const [k, v] of Object.entries(槽位表)) {
      const item = 装[k];
      html += `<div class="gear-slot ${item ? '' : 'empty'}">${v.名}：${item ? `<span class="r-${item.稀有度}">${item.名称}</span>${'★'.repeat(item.星)}` : '空'}</div>`;
    }
    return html;
  }

  渲染技能槽(s) {
    let html = '<h4>技能槽位</h4>';
    for (const [k, v] of Object.entries(s.player.技能槽)) {
      html += `<div class="slot ${v ? '' : 'empty'}">${k}：${v ? (v.隐藏 ? `<span class="gold">${v.名}</span>` : v.名) : '空'}</div>`;
    }
    return html;
  }

  创建事件库() {
    const game = this;
    return {
      name: '噬祖-战斗',
      async 推进(ctx) {
        if (ctx.中断) return;
        await game.战斗回合();
      },
    };
  }
}

// ============ 辅助 ============
export function 无封印(s, 路线) {
  return !s.player.封印路线.includes(路线);
}

function 洗牌(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function 随机位面(s) {
  // 加权：已激活路线 ×2 / 未激活 ×1 / 互斥(封印) ×0 / 诸天之心 ×1
  const entries = 位面表.map((p) => {
    let w = p.名 === '诸天之心' ? 1 : p.路线 && s.player.封印路线.includes(p.路线) ? 0 : 1;
    if (p.路线 && 已激活(s, p.路线)) w *= 2;
    return { item: p, weight: w };
  });
  return weightedPick(entries);
}
