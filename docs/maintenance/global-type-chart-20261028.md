# 国际服 18 系克制图 · 2026-10-28

本地完成并验收；未提交、推送、部署或重新打包。范围仅国际服工具箱，国服入口、原属性查询和计算规则均保留。

## 实现

- 新增独立「18 系克制图」入口。18×18 单属性表，行攻击、列防御；点选高亮行列并显示完整属性名与倍率。
- 复用 `snapshot.typeChart` 和计算核心 `getTypeMultiplier`，不维护另一份相性数据。拒绝缺格、缺行、未知/重复属性与非法倍率，不以默认 1× 伪造有效表。
- 复用原工具弹窗、属性图标和主题色；支持中英日。手机仅表格内滚动，固定表头与首列；明暗均适配。
- 一个键盘入口进入矩阵，方向键移动，Home/End 跳行首尾，Ctrl+Home/End 跳整表首尾；Tab 保持在弹窗内，Esc 关闭并恢复工具箱焦点。
- 新增文案已录入语言主表，按本工具语境标记 `manual_reviewed`，不冒充客户端官方文本。

## 验收

- 定向通过：`tests/ui/type-chart.test.jsx`、`tests/ui/toolbox.test.jsx`、`tests/ui/type-query-panel.test.jsx`、`tests/ui/global-tool-boundary.test.jsx`、`tests/ui/global-tools-localization.test.jsx`。
- 逐格对照国际服已采用的 S3 相性表与计算核心；普通→幽为 0.5×，地→翼为 1×。这是现有基线一致性验证，本轮没有重新核验游戏客户端相性。
- 新增组件、入口、词典与测试的 ESLint 通过；语言主表 `sync` / `check` 通过。原有待审条目不属于本轮新缺口。
- 实际浏览器：1366×960 英文和中文桌面、390×844 日文亮色、320×740 日文暗色；点击、键盘移动、关闭焦点恢复通过，无破图或页面横向溢出。390px 滚至右下角后首列与表头仍固定。320px 页面宽度为 320px，表格在自身容器内滚动。
- 独立只读视觉复核无阻断项。一次英文验收脚本把火→火误写为 0.5×；核对当前相性表后修正验收预期为 1×，产品数据未改，中文/日文真实操作及逐格测试通过。

## 入口与截图

本地开发：`http://127.0.0.1:4235/global/zh-CN/`、`/en/`、`/jp/`，进入工具箱。

- [中文桌面](../../output/playwright/global-type-chart-zh-desktop.png)
- [英文桌面](../../output/playwright/global-type-chart-en-desktop.png)
- [日文手机](../../output/playwright/global-type-chart-ja-mobile.png)
- [日文手机滚动后](../../output/playwright/global-type-chart-ja-mobile-scrolled.png)
- [320px 日文暗色](../../output/playwright/global-type-chart-ja-320-dark.png)

本轮仅关闭自建 `roco-desktop-01a03327` 验收浏览器；保留其他会话。后续发布时再执行发布门禁。
