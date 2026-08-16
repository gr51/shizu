# 像素风美术资产（由 tools/gen-pixel-assets.mjs 生成）

原生低分辨率手绘 + 整数倍放大（nearest neighbor）。**不要用图像编辑器缩放**，
那会破坏像素网格；要改尺寸请改生成脚本里的 scale 倍率。

- 角色/敌人/图标：ASCII 精灵图，源在 `tools/pixel/creatures.mjs` / `bosses.mjs` / `scenes.mjs`
- 背景：程序化分层剪影，源在 `tools/pixel/scenes.mjs`
- 调色板：`tools/pixel/palette.mjs`（全局只有 深青 + 琥珀 两种强调色）

重新生成：`npm run art`
风格校验对照表：`npm run art:preview`（含纯黑剪影验收行）
