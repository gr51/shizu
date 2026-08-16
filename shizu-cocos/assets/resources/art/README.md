# 运行时资产目录（由 tools/gen-pixel-assets.mjs 生成后复制而来）

Cocos 的 `resources.load()` 只能读 `assets/resources/` 下的东西，
所以像素资产在这里放一份运行时副本。**不要手动改这里** ——
改 `tools/pixel/` 的源，然后 `npm run art` 重新生成。
