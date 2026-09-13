# 技能使用摘要修复 · 2026-09-13

## 本次边界

保留现有布局与样式，修正摘要内容，不新增天气或异常状态机制，不把效果预览直接用于伤害计算。

- 零次隐藏使用次数和空明细，不显示累计威力／连击零值。
- 当前计算值直接取已解算的威力、等级、速度与最终连击，手动威力标注来源；历史记录不再次叠加。
- 折射水、火、冰、毒、幽、恶系尚未参与结算的效果明确标注仅记录。
- 小程序能力状态与折射次数、来源、仅记录效果共同保存，避免重开后只剩增益而丢失记录。

## 回归触发条件

修改使用摘要、手动参数、战斗状态保存时，必须检查以下情景：

1. 从未使用：没有零次累计行、没有空明细，预览不增加伤害。
2. 携带光、电、水技能并实际触发折射：魔攻与速度按当前状态展示；水系能耗只记录。
3. 手动改威力及能力等级：立即采用当前值，次数不增加，不再叠加历史威力。
4. 重新打开小程序：次数、来源与仅记录状态不丢失。
5. 单技能、四技能、精简模式及 320px 窄屏、亮暗主题，文本不横向溢出。

## 验证入口

- 核心状态：`tests/state/battle-activation.test.js`。
- 网页：`tests/ui/skill-usage-summary.test.jsx`、`tests/ui/skill-editors.test.jsx`、`tests/ui/app-integration.test.jsx`。
- 浏览器交互：`tests/e2e/uiux-skills-traits.spec.js`。
- 小程序：`miniapp/tests/skill-usage-panel.test.jsx`、`miniapp/tests/persistence.test.js`。
- 本机原生实测脚本、报告与截图：`output/playwright/usage-native-check.mjs`、`usage-native-report.json`、`usage-native-*.png`。
- 本机网页截图：`output/playwright/usage-zero.png`、`usage-active-desktop.png`、`usage-active-320.png`、`usage-active-320-dark.png`、`usage-manual-desktop.png`。

当前核心基线为 `57ade8e55842ee377139f8e4bfc028afd283781f`；网页／桌面源码版本 2.0.2，小程序源码版本 1.1.16。生产构建不代表已上传或公开发布，桌面安装包未重打。
