// ===== 大厅.js · 主界面 / 难度选择 / 装备管理 / 成就 / 基因锁 =====

import { 状态中心实例 } from '../core/状态中心.js';
import { 界面中心实例 } from '../core/界面中心.js';
import { 事件中心实例 } from '../core/事件中心.js';
import { 战力, 基因锁加成, 装备加成, 战斗属性 } from '../core/属性中心.js';
import { 路线表, 组合技表, 是否封印, 已激活, 已激活路线, 路线列表 } from './数据/路线.js';
import { 稀有度表, 槽位表 } from './数据/装备.js';
import { 隐藏技能表 } from './数据/隐藏技能.js';
import { 存档 } from '../core/属性中心.js';
import { 生成装备 } from './数据/装备.js';

const 难度选项 = ['简单', '中等', '困难'];

/** 大厅主界面 */
export function 大厅(s) {
  界面中心实例.设置推进按钮(false);
  const 战 = 战力(s);
  const b = 战斗属性(s);
  状态中心实例.更新({
    meta: `战力 <b>${战.toFixed(1)}</b> · 难度 <b>${s.player.难度等级}</b> · 累计通关 <b>${s.player.通关}</b>`,
    sceneTitle: '噬祖 · 诸天噬灵',
    sceneDesc: '你是行走诸天的噬灵，吞噬万界基因以开启基因锁。每一次吞噬都让下一次更强大。',
    playerCard: `
      <h4>巢灵 · ${s.player.巢灵名}</h4>
      <p class="hp">攻 ${b.攻.toFixed(0)} &nbsp; 血 ${b.血} &nbsp; 速 ${b.速.toFixed(0)}</p>
      <p class="small">永久攻 +${(s.player['永久攻%'] * 100).toFixed(1)}% · 永久血 +${(s.player['永久血%'] * 100).toFixed(1)}% · 永久速 +${(s.player['永久速%'] * 100).toFixed(1)}%</p>
      <p class="small">基因锁加成 ×${基因锁加成(s).toFixed(2)} · 装备加成 ×${装备加成(s.player.装备).toFixed(2)}</p>
    `,
    geneCard: `
      <h4>基因锁 · 已激活路线</h4>
      ${已激活路线(s).length
        ? 已激活路线(s).map((r) => `<div class="slot">${r} Lv${s.player.基因锁[r]}/6（${路线表[r].定位}）</div>`).join('')
        : '<p class="small">尚未激活任何路线。<br>通关位面副本将激活对应路线基因锁。</p>'}
      ${s.player.封印路线.length ? `<p class="small">永久封印：${s.player.封印路线.join('、')}</p>` : ''}
    `,
    gearCard: 渲染装备卡(s),
    slotsCard: 渲染技能槽卡(s),
    options: [
      { text: '⚔ 开启裂缝（随机位面）', style: 'primary', onClick: () => 难度选择(s) },
      { text: '🎒 装备背包', onClick: () => 装备背包(s) },
      { text: '🏆 成就与图鉴', onClick: () => 成就图鉴(s) },
      { text: 'ℹ 玩法说明', onClick: () => 玩法说明() },
      { text: '🗑 重置存档', style: 'danger', onClick: () => 确认重置(s) },
    ],
    events: [],
  });
  界面中心实例.设置提示('选择开始挑战，噬灭万界');
}

function 渲染装备卡(s) {
  const 装 = s.player.装备;
  let html = `<h4>装备栏（加成 ×${装备加成(装).toFixed(2)}）</h4>`;
  for (const [k, v] of Object.entries(槽位表)) {
    const item = 装[k];
    html += `<div class="gear-slot ${item ? '' : 'empty'}">${v.名}：${item ? `<span class="r-${item.稀有度}">${item.名称}</span>${'★'.repeat(item.星)}` : '空'}</div>`;
  }
  return html;
}

function 渲染技能槽卡(s) {
  let html = '<h4>技能槽位</h4>';
  for (const [k, v] of Object.entries(s.player.技能槽)) {
    html += `<div class="slot ${v ? '' : 'empty'}">${k}：${v ? (v.隐藏 ? `<span class="gold">${v.名}</span>` : v.名) : '空'}</div>`;
  }
  return html;
}

/** 难度选择 */
function 难度选择(s) {
  状态中心实例.打开模态({
    title: '选择副本难度',
    body: `
      <div class="diff-row"><b>简单</b> 系数 0.9 · 适合新手</div>
      <div class="diff-row"><b>中等</b> 系数 1.5 · 均衡</div>
      <div class="diff-row"><b>困难</b> 系数 2.0 · 高基因回报</div>
      <p class="small">副本敌人数值 = 你的战力 × 难度系数 × 动态系数。难度越高掉落越丰厚。</p>
    `,
    buttons: 难度选项.map((d) => ({
      text: `选择【${d}】`,
      style: 'primary',
      onClick: () => {
        状态中心实例.关闭模态();
        事件中心实例.广播('开始新局', { s, 难度: d });
      },
    })),
  });
}

/** 装备背包：穿戴/卸下/合成/强化/分解 */
export function 装备背包(s) {
  const 背包 = s.player.背包;
  const 装备栏 = s.player.装备;
  const 精华 = s.player.装备精华 || 0;
  let body = `<p class="small">装备精华：<b>${精华}</b>（合成/强化消耗）</p>`;
  if (!背包.length) body += '<p class="small">背包空空如也，去挑战位面获取装备吧。</p>';
  背包.forEach((item, i) => {
    const 已装备 = Object.values(装备栏).some((x) => x && x.uid === item.uid);
    body += `
      <div class="bag-item r-${item.稀有度}">
        <b>${item.名称}</b>${'★'.repeat(item.星)} ${已装备 ? '<span class="gold">【已装备】</span>' : ''}
        <div class="small">${item.词条.map((a) => a.描述).join('，')}</div>
        <div class="bag-btns">
          ${已装备
            ? `<button data-a="卸下" data-i="${i}">卸下</button>`
            : `<button data-a="穿戴" data-i="${i}">穿戴</button>`}
          <button data-a="分解" data-i="${i}">分解(+${稀有度表[item.稀有度].精华})</button>
        </div>
      </div>`;
  });
  状态中心实例.打开模态({
    title: '装备背包',
    body,
    buttons: [
      { text: '合成装备（3 件同稀有度 → 升 1 稀有度）', onClick: () => 合成界面(s) },
      { text: '强化（同槽同稀有度 ×3 → 星级 +1）', onClick: () => 强化界面(s) },
      { text: '关闭', onClick: () => 状态中心实例.关闭模态() },
    ],
  });
  // 事件绑定
  setTimeout(() => {
    document.querySelectorAll('#modalRoot .bag-btns button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.i;
        const a = btn.dataset.a;
        const item = 背包[i];
        if (a === '穿戴') {
          装备栏[item.槽位] = item;
          背包.splice(i, 1);
          存档(s);
          装备背包(s);
        } else if (a === '卸下') {
          背包.push(item);
          装备栏[item.槽位] = null;
          存档(s);
          装备背包(s);
        } else if (a === '分解') {
          背包.splice(i, 1);
          s.player.装备精华 += 稀有度表[item.稀有度].精华;
          存档(s);
          装备背包(s);
        }
      });
    });
  }, 0);
}

function 合成界面(s) {
  const 背包 = s.player.背包;
  const 稀有度顺序 = ['白', '绿', '蓝', '紫'];
  let body = '<p class="small">消耗 3 件<b>同稀有度</b>装备 → 获得更高 1 级稀有度随机装备</p>';
  for (const r of 稀有度顺序) {
    const 数量 = 背包.filter((x) => x.稀有度 === r).length;
    const 可 = 数量 >= 3;
    body += `<div class="diff-row">${r}色装备 × ${数量} ${可 ? '✅ 可合成' : '（不足 3）'}</div>`;
  }
  状态中心实例.打开模态({
    title: '合成',
    body,
    buttons: [
      { text: '合成（自动选最低稀有度优先）', style: 'primary', onClick: () => {
        for (const r of 稀有度顺序) {
          const 同稀有 = 背包.filter((x) => x.稀有度 === r);
          if (同稀有.length >= 3) {
            同稀有.slice(0, 3).forEach((x) => {
              const idx = 背包.indexOf(x);
              背包.splice(idx, 1);
            });
            const 新r = r === '紫' ? '金' : 稀有度顺序[稀有度顺序.indexOf(r) + 1];
            const 装备 = 生成随机装备(新r);
            背包.push(装备);
            存档(s);
            状态中心实例.追加事件(`合成成功：<b class="r-${新r}">${装备.名称}</b>！`, 'drop');
            合成界面(s);
            return;
          }
        }
        // 没有可合成的
        状态中心实例.打开模态({ title: '合成', body: '<p>没有足够的同稀有度装备。</p>', buttons: [{ text: '关闭', onClick: () => 合成界面(s) }] });
      } },
      { text: '返回', onClick: () => 装备背包(s) },
    ],
  });
}

function 强化界面(s) {
  const 背包 = s.player.背包;
  let body = '<p class="small">消耗 3 件<b>同槽位 + 同稀有度</b>的装备 → 主件星级 +1（上限 5 星）</p>';
  背包.forEach((item, i) => {
    const 同组 = 背包.filter((x) => x.槽位 === item.槽位 && x.稀有度 === item.稀有度);
    body += `<div class="diff-row">${item.名称}（${item.槽位}·${item.稀有度}）· ${同组.length}/3 ${同组.length >= 3 && item.星 < 5 ? '✅' : '❌'}</div>`;
  });
  状态中心实例.打开模态({
    title: '强化',
    body,
    buttons: [
      { text: '强化（自动选第一件可强化目标）', style: 'primary', onClick: () => {
        for (const item of 背包) {
          const 同组 = 背包.filter((x) => x.uid !== item.uid && x.槽位 === item.槽位 && x.稀有度 === item.稀有度);
          if (同组.length >= 2 && item.星 < 5) {
            同组.slice(0, 2).forEach((x) => 背包.splice(背包.indexOf(x), 1));
            item.星++;
            存档(s);
            状态中心实例.追加事件(`强化成功：<b>${item.名称}</b> → ★${item.星}！`, 'drop');
            强化界面(s);
            return;
          }
        }
        状态中心实例.打开模态({ title: '强化', body: '<p>没有可强化的装备（需同槽同稀有度 ×3）。</p>', buttons: [{ text: '关闭', onClick: () => 强化界面(s) }] });
      } },
      { text: '返回', onClick: () => 装备背包(s) },
    ],
  });
}

function 生成随机装备(稀有度) {
  const 槽位名 = Object.keys(槽位表);
  return 生成装备(稀有度, 槽位名[Math.floor(Math.random() * 槽位名.length)]);
}

/** 成就与图鉴 */
function 成就图鉴(s) {
  const 成就 = s.stats.成就;
  const 成就表 = {
    披甲噬祖: { 描述: '首次穿戴装备', 获得: !!成就['披甲噬祖'] },
    禁忌觉醒: { 描述: '获得首个隐藏技能', 获得: !!成就['禁忌觉醒'] },
    诸天共鸣: { 描述: '首通诸天之心位面', 获得: !!s.stats.首通诸天 },
  };
  const 技能槽 = s.player.技能槽;
  const 隐藏列表 = [...new Set([
    ...Object.values(技能槽).filter((v) => v && v.隐藏).map((v) => v.名),
    ...s.inventory.隐藏技能,
  ])];
  let body = '<h4>成就</h4>';
  for (const [k, v] of Object.entries(成就表)) {
    body += `<div class="diff-row">${v.获得 ? '🏆' : '🔒'} ${k} — ${v.描述}</div>`;
  }
  body += `<h4>隐藏技能图鉴（${隐藏列表.length}/${隐藏技能表.length}）</h4>`;
  for (const h of 隐藏技能表) {
    const 有 = 隐藏列表.includes(h.名);
    body += `<div class="diff-row">${有 ? '✨' : '❓'} ${h.名}（${h.路线}）${有 ? '' : '· 未觉醒'}<br><span class="small">${h.描述}</span></div>`;
  }
  body += '<h4>路线基因锁</h4>';
  for (const r of 路线列表) {
    body += `<div class="diff-row">${r} Lv${s.player.基因锁[r] || 0}/6 ${路线表[r].位面}${已激活(s, r) ? ' ✅' : ''}${是否封印(s, r) ? ' 🔒封印' : ''}</div>`;
  }
  body += '<h4>组合技</h4>';
  const 已激活名 = 已激活路线(s);
  for (const [k, v] of Object.entries(组合技表)) {
    const [a, b2] = k.split('+');
    const 激活 = 已激活名.includes(a) && 已激活名.includes(b2);
    body += `<div class="diff-row">${激活 ? '🔥' : '❄️'} ${v.名}（${k}）${激活 ? '· 已激活' : '· 需双路线'} <br><span class="small">${v.描述}</span></div>`;
  }
  状态中心实例.打开模态({
    title: '成就与图鉴',
    body,
    buttons: [{ text: '关闭', onClick: () => 状态中心实例.关闭模态() }],
  });
}

function 玩法说明() {
  状态中心实例.打开模态({
    title: '玩法说明',
    body: `
      <h4>三通道成长</h4>
      <p><b>技能通道</b>：进入与已激活路线匹配的位面 → 三选一可学该路线技能。</p>
      <p><b>属性通道</b>：不匹配位面学不到技能 → 三选一给通用属性。</p>
      <p><b>装备通道</b>：全位面共享！不匹配位面装备掉率 ×1.5，位面之主 100% 保底蓝装。</p>
      <h4>核心规则</h4>
      <p>· 每局 5 阶段，阶段 3/4 结束有 3 选 1。</p>
      <p>· 击杀基因 → 通关后转化永久属性（1% = 100 基因）。</p>
      <p>· 通关对应路线 +1 段基因锁（战力加成，累计最高 +120%）。</p>
      <p>· 隐藏技能仅匹配位面 0.1% 掉落，跨局永久刻印。</p>
      <p>· 战力 = (攻/10 + 血/100 + 速/220)÷3 × 基因锁加成 × 装备加成。</p>
    `,
    buttons: [{ text: '关闭', onClick: () => 状态中心实例.关闭模态() }],
  });
}

function 确认重置(s) {
  状态中心实例.打开模态({
    title: '确认重置',
    body: '<p class="danger">将清空所有永久属性、装备、技能槽与隐藏技能！不可恢复。</p>',
    buttons: [
      { text: '确认重置', style: 'danger', onClick: () => {
        localStorage.removeItem('shizu_save_v1');
        location.reload();
      } },
      { text: '取消', onClick: () => 状态中心实例.关闭模态() },
    ],
  });
}
