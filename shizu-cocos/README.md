# shizu-cocos —— Cocos Creator 工程壳（尚未接入代码）

> 当前状态：**空壳**。原先这里的脚本已在重建时全部删除，游戏逻辑现位于 `../web/`。

## 这里现在有什么

```
shizu-cocos/
├── package.json                  # 工程清单（Creator 3.8.8）
├── settings/v2/packages/         # 引擎模块 / 设计分辨率 / 构建配置
└── assets/
    └── scenes/Main.scene         # 手写的最小场景：Canvas + Camera，未挂任何脚本
```

## 为什么是空的

重建前这里有两套互不相干的东西：

- 一个与《噬祖》毫无关系的双摇杆射击 Demo（`GameController/GameModel/GameRenderer`），
  是照《以撒的结合》做的手感验证，却被 README 描述成了本游戏的主控；
- 一层照策划文档写的 `core/` + `data/`，编译得过，但**没有任何代码路径引用它**，
  从未被执行过。

两者都已删除。逻辑重写在 `../web/src/core/`，那一层零 DOM、零 `cc` 依赖，
配有 65 项针对《开发实现指南》九条编码红线的测试，可直接整体搬进本工程。

## 移植步骤（下一阶段）

1. Cocos Dashboard 导入本目录，让编辑器**重新生成** `.meta` 与场景
   （现有 `Main.scene` 是手写 stub，编辑器打开后另存一次即可规范化）。
2. 把 `../web/src/core/` 与 `../web/src/data/` 整层复制到 `assets/scripts/`，
   `.js` 改 `.ts` 并补类型标注 —— 这两层不含任何浏览器 API，改动量只有类型。
   唯一需要适配的是 `core/save.js` 的存储适配器：
   ```ts
   // web:    localStorage
   // 微信:   wx.getStorageSync / wx.setStorageSync
   // 抖音:   tt.getStorageSync / tt.setStorageSync
   ```
   适配器已经是**注入式**的（`createSaveRepo(storage)`），换实现即可，不动业务逻辑。
3. `../web/src/ui/` **不移植** —— 那是 DOM 渲染层，Cocos 侧重写为组件/预制体。
4. `../web/src/core/combatModel.js` **不移植** —— 那是把实时战斗压成回合制的抽象层，
   Cocos 侧改由真实碰撞 + 无敌帧决定，该文件届时废弃。

## 待办：与文档不符的配置

`settings/v2/packages/project.json` 目前是 **960×640 横屏**，
而《噬祖-整体策划》1.1 指定的是**竖屏**（微信 + 抖音小游戏）。
移植时需在编辑器里改为竖屏设计分辨率。
