# 桌面版 v1.6.7 S4 前瞻验收

验收时间：2026-09-02（Asia/Shanghai）

## 交付物

- 安装包：`installers/v1.6.7/洛克计算器-1.6.7.exe`
- 文件大小：109,874,540 B
- SHA256：`1263FCE67BAA5F4DE47A360CCEA1BC413271458445EDAAB15D4B2AB4ECE01B1A`
- FileVersion / ProductVersion：`1.6.7` / `1.6.7`
- 快照身份：`s4-preview-2026-09-02`
- 赛季标识：`S4前瞻`

`installers/v1.6.7/SHA256SUMS.txt` 与重新计算的安装包哈希一致，`release/洛克计算器-1.6.7.exe` 与归档副本哈希一致。1.6.6 安装包保持原文件，不覆盖、不重打。

## 用户界面验收

- Web、PWA、桌面窗口和小程序源码标题统一为“洛克计算器 · S4前瞻”，窄屏页眉显示“S4前瞻”。
- 非最终形态在搜索结果、精灵卡片、队伍和结果空态只显示“种族值待确认”；用户界面不再显示内部核验日期。
- 390 × 844 实测 `scrollWidth === innerWidth === 390`，无横向溢出。
- 截图：`output/playwright/s4-preview-header-390.png`
- 截图：`output/playwright/s4-preview-wolf-placeholders-390.png`
- 截图：`output/playwright/s4-preview-placeholder-card-390.png`
- 参考/实现对比：`output/playwright/s4-preview-header-comparison.png`
- 参考/实现对比：`output/playwright/s4-preview-wolf-comparison.png`
- 参考/实现对比：`output/playwright/s4-preview-placeholder-comparison.png`

用户提供的参考图是旧界面局部截图，未包含完整视口信息；本轮用它们确认文案和状态位置，并以 390px 实际页面补做无溢出验收，不把局部截图当作完整页面几何基准。

## 自动验证

- Web / 共享核心：100 个测试文件、1607 项通过。
- 微信小程序：41 个测试文件、412 项通过。
- 端到端：Chromium 33 项通过。
- `npm run lint`、`npm run data:validate`、`npm run data:verify-bindings`、`npm run build` 均通过。
- 数据读回：617 个精灵、553 个技能、617 个学习集、617 个本地头像。
- 桌面离线烟测：`output/desktop-smoke-v1.6.7-s4-preview.json` 返回 `ok: true`，页眉、攻防选择器、快照身份和数据数量均正确。
- 打包内容检查：未发现当前界面的旧占位日期；离线资源中的 S4 前瞻标题与占位短句存在。

## 已知边界

- 安装包与 1.6.6 一样未配置 Authenticode 代码签名，Windows 可能显示未知发布者。
- 本轮未执行 Git 提交、推送、Tag、GitHub Release、WebApp 部署或微信小程序上传。
- 12 个成长形态的种族值、26 个新技能完整参数及复杂特性的正式规则仍等待正式资料验收。
