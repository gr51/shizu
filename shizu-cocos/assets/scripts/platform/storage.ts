// ===== platform/storage.ts · 存档存储适配（Web / 微信 / 抖音）=====
// 对应《噬祖-开发实现指南》3.2「存储适配器（双端统一）」。
//
// core/save.js 的 createSaveRepo(storage) 是**注入式**的，所以换平台只换本文件，
// 业务逻辑一行不动。Cocos 的 sys.localStorage 本身已经把三端封装好了，
// 这里再显式兜一层 wx / tt，是为了 Cocos 之外（如小游戏原生构建）也能直接用。

import { sys } from 'cc';

/** 与 core/save.js 约定的接口 */
export interface StorageLike {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

declare const wx: any;
declare const tt: any;

/** 微信小游戏 */
function wxStorage(): StorageLike | null {
  if (typeof wx === 'undefined' || !wx?.getStorageSync) return null;
  return {
    get: (k) => wx.getStorageSync(k) || null,
    set: (k, v) => wx.setStorageSync(k, v),
    remove: (k) => wx.removeStorageSync(k),
  };
}

/** 抖音小游戏 */
function ttStorage(): StorageLike | null {
  if (typeof tt === 'undefined' || !tt?.getStorageSync) return null;
  return {
    get: (k) => tt.getStorageSync(k) || null,
    set: (k, v) => tt.setStorageSync(k, v),
    remove: (k) => tt.removeStorageSync(k),
  };
}

/** Cocos 统一层（Web / 原生 / 已适配的小游戏都走这条） */
function cocosStorage(): StorageLike {
  return {
    get: (k) => sys.localStorage.getItem(k),
    set: (k, v) => sys.localStorage.setItem(k, v),
    remove: (k) => sys.localStorage.removeItem(k),
  };
}

/** 内存兜底：存储不可用时不让游戏崩，只是本次不留档 */
function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

export function createStorage(): StorageLike {
  const impl = wxStorage() ?? ttStorage() ?? cocosStorage();
  try {
    const probe = '__shizu_probe__';
    impl.set(probe, '1');
    impl.remove(probe);
    return impl;
  } catch (e) {
    console.warn('[storage] 平台存储不可用，降级为内存存储（本次进度不会保存）', e);
    return memoryStorage();
  }
}
