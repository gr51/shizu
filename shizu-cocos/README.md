# shizu-cocos —— Cocos Creator 3.8 工程

《噬祖·诸天噬灵》的**产品工程**。游戏逻辑与配表就在这里（`assets/scripts/core` 与 `data`），
仓库根目录的 `tests/` 与 `web/` 都是直接引用这份代码，不是副本。

```
shizu-cocos/
├── package.json                    工程清单（Creator 3.8.8）
├── tsconfig.json                   allowJs（core/data 是 JS，game 是 TS）
├── types/cc.d.ts                   ⚠ 编辑器外类型检查用的**声明桩**，非官方定义
├── settings/v2/packages/           引擎模块 / 设计分辨率 960×640 横屏
└── assets/
    ├── scenes/Main.scene           Canvas + Camera + GameRoot 组件
    └── scripts/
        ├── core/    *.js           零 DOM、零 cc 依赖的游戏逻辑（177 项测试守护，含 Cocos 流程 smoke）
        ├── data/    *.js           位面 / 路线 / 技能 / 隐藏技能 / 装备 / 文案 配表
        ├── platform/storage.ts     Web · 微信 · 抖音 三端存档适配（注入式）
        └── game/                   Cocos 组件层
            ├── GameRoot.ts         主控：大厅 / 局内 / 结算 / 图鉴 / 背包
            ├── UiKit.ts            程序化 UI 构件（Graphics + Label，无预制体）
            └── ModalLayer.ts       全屏弹层
```

## 第一次在编辑器里打开时

1. Cocos Dashboard → 导入本目录。
2. 编辑器会为缺 `.meta` 的文件生成 meta。`GameRoot.ts.meta` **已手工写好并被
   `Main.scene` 引用**（uuid `65b58870-54c5-4d3c-807d-bc94533ed1b0`），不要删。
3. 打开 `assets/scenes/Main.scene` 另存一次 —— 现有场景是手写的最小 JSON，
   编辑器另存后会规范化。
4. 点预览。当前无任何美术资源，界面全部由 `UiKit.ts` 用 `Graphics` + `Label` 画出，
   所以能直接跑，不会缺资源报错。

## 当前完成度

| 部分 | 状态 |
|---|---|
| 核心逻辑（基因锁 / 三通道 / 掉落 / 装备 / 存档 / 难度进化） | 完成，65 项测试 |
| Cocos 组件层（大厅 / 裂缝卡 / 局内 / 三选一 / 槽位冲突 / 结算 / 图鉴 / 背包） | 完成，冒烟测试跑通整局 |
| 实时动作战斗（单摇杆 / 自动索敌 / 闪避无敌帧 / 吞噬爆发） | **未做** —— 见下 |
| 美术 · 音频 · 特效 | **未做**，全部程序化占位 |

## 下一步：接实时战斗

现在的战斗是**回合交锋**（点「前进」推进一次），由 `core/combatModel.js` 把
文档的实时数值压成回合概率。这是网页原型阶段的权宜之计。

接实时战斗时：
1. 新建 `game/battle/` 实现单摇杆 + 自动索敌 + 闪避无敌帧 + 吞噬爆发（整体策划 2.3）。
2. 敌人数值仍从 `core/dungeon.js` 的 `generateDungeon()` 取 —— 那层已经按红线 1/2 生成好了，不要另起炉灶。
3. `core/run.js` 的三选一、结算、基因锁充能全部复用，只把 `step()` 换成实时伤害结算。
4. **删除 `core/combatModel.js`**，同时删掉 `run.js` 里对它的引用。

`core/combatModel.js` 顶部记了一个有用的反推结论：
文档的 HP/攻击比例要求玩家**被有效命中率 ≤ 8%**，
这直接量化了实时战斗里闪避该有多强，可作为手感调参的起点。

## 验证

本工程的验证命令在仓库根目录：

```bash
npm run verify   # 单元测试 + 类型检查 + 组件层冒烟测试
```

`npm run smoke` 会用 `tools/cc-shim` 顶替 `cc` 模块，在 Node 里真的实例化
`GameRoot`、建节点树、开裂缝、打完整局、走结算、验证落盘。
它验证不了像素，但能保证这层代码**被执行过** —— 上一版工程最缺的就是这个。
