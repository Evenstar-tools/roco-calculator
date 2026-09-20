# 圣甲虫别名与暖阳次数适配

2026-09-20，Web 2.2.2；按用户要求实施，未提交、未推送。

## 改动

- 圣凯布米龙增加社区搜索别名“圣甲虫”，官方名称不变，不给前置形态额外添加别名。
- 暖阳接入既有 stack_scaled 规则，增加“其他火系技能使用次数”输入，默认 0，沿用同类次数控件 0–20 范围；静态威力 = 70 + 40 × 次数。
- 次数指上次暖阳重置后使用其他火系技能的次数，不含暖阳自身。程序不模拟逐回合出招，使用暖阳后需手动清零；不声称已实现自动统计或自动重置。
- 复用既有单技能／四技能动态条件控件，没有新增 CSS 或页面布局。按 design-craft 检查标签及输入在宽窄屏的可读性。
- 同步小程序共享 skill-effects 源码镜像；未打包或验收小程序原生界面。

## 验收

- 实施前测试确认别名和暖阳次数规则均缺失；实施后 4 文件 228 项相关测试通过（skill-rules、snapshot-extras、skill-editors、search-index）。规则数量由 106 更新为 107。
- test:core-current、lint、git diff --check 通过。
- 真实浏览器：刷新后按“圣甲虫”搜索命中圣凯布米龙；四技能模式 0／1／3／0 次对应静态威力 70／110／190／70；单技能模式 2 次对应 150。
- 1920×1080、390×844 亮暗截图检查，次数输入框无横向溢出，沿用技能行样式；测试后两种模式次数均恢复 0。
- 定向 Vite 构建、service worker 压缩、体积门禁通过：JS gzip 348.15 KiB／硬上限 348.25 KiB，CSS gzip 55.96 KiB／56 KiB；未再提高预算。未重跑全量 E2E，不宣称线上已生效。

证据：`artifacts/web-ux20/verify-warm-sun.js`、`verify-warm-sun-single.js`；截图 `warm-sun-light.png`、`warm-sun-dark.png`、`warm-sun-mobile-light.png`、`warm-sun-mobile-dark.png`、`warm-sun-single.png`。
