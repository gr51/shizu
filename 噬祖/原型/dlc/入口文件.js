// ===== 入口文件.js · 初始化与装配（吸收 WordSimulator DLC 入口）=====

import { 事件中心实例 } from '../core/事件中心.js';
import { 触发中心实例 } from '../core/触发中心.js';
import { 词库中心实例 } from '../core/词库中心.js';
import { 状态中心实例 } from '../core/状态中心.js';
import { 界面中心实例 } from '../core/界面中心.js';
import { 读档, 存档 } from '../core/属性中心.js';
import { 词库注册表 } from './数据/词库.js';
import { 游戏, 随机位面 } from './游戏.js';
import { 大厅 } from './大厅.js';

// 词库注册（全局数据包）
for (const lib of 词库注册表) 词库中心实例.注册词库({ ...lib });

// 推进按钮：前进 = 推进一步（触发事件中心）
let 当前游戏 = null;

document.addEventListener('DOMContentLoaded', () => {
  界面中心实例.初始化();

  // 推进按钮
  const btn = document.getElementById('btnAdvance');
  btn.addEventListener('click', () => {
    事件中心实例.推进({ 中断: false });
  });

  // 返回大厅（游戏内广播）
  事件中心实例.订阅('返回大厅', (s) => {
    大厅(s);
  });

  // 开始新局（难度选择广播）
  事件中心实例.订阅('开始新局', ({ s, 难度 }) => {
    当前游戏 = new 游戏(s);
    const 位面 = 随机位面(s);
    当前游戏.开始新局(难度, 位面);
  });

  // 读档进大厅
  const 存档数据 = 读档();
  存档(存档数据);
  大厅(存档数据);
  界面中心实例.设置提示('欢迎来到噬祖 · 诸天噬灵');
});

export { 当前游戏 };
