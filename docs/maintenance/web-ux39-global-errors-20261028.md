# UX39 Web 多语言错误与显示优化 · 2026-10-28

基线 `c54e157`，沿用 Web 2.2.8、现有 UI 和 S3 季中数据。用户要求完成后再跑一轮优化，以网页端为主、多语言不留中文报错；本轮据真实可达缺陷直接修复，不新做一套页面。仅本地验证、独立提交，不推送部署；原有小程序、S5 及文档在途改动保留。

## 已完成

1. **加载与操作失败**：WebEntry 接入工作区错误边界，异步模块失败显示当前语言的重载入口；Deer 数据加载不展示底层 HTTP/JSON/网络异常，重载按钮复用现有标准样式。分享未知错误提供检查链接或重试的指引；保留已登记错误和原始引用 ID。引导导入错误保存源键，切语言即时更新；承伤工具意外计算失败和导出失败统一当前语言。
2. **真实计算条件提示**：用 Global S3 技能生成结果，补齐八类缺条件诊断（条件数值、位置、相邻威力、向心力位置、对手威力、层数、对手能量、灾厄自伤）。结果栏、技能提示与明细共用现有翻译入口；未改引擎、判定或伤害。新增 UI 译文同步语言主表并人工按语境复核，不覆盖客户端官方行。
3. **英文列宽和手机标签**：移除英文四技能旧列宽覆盖，恢复当前布局，威力输入从 27px 回到桌面 68px，连击与伤害不再挤压。Deer 手机卡片原先由 CSS 写死的两条中文改读本地化 data-label；国服和日文桌面布局保持现有规则。

## 验证

受影响回归通过，按首次失败定位后仅复跑修复对应文件，未重复跑全站发布门禁：

```powershell
npx vitest run --config config/vite.config.mjs tests/ui/runtime-entry-errors.test.jsx tests/ui/global-data-load-errors.test.jsx tests/ui/web-entry.test.jsx
npx vitest run --config config/vite.config.mjs tests/ui/share-server-boundary.test.jsx tests/ui/first-run-guide.test.jsx tests/ui/damage-comparison-export.test.jsx
npx vitest run --config config/vite.config.mjs tests/ui/damage-comparison-export.test.jsx
npx vitest run --config config/vite.config.mjs tests/ui/global-calculator-localization.test.jsx tests/ui/power-draft-input.test.jsx
npx vitest run --config config/vite.config.mjs tests/ui/global-tools-localization.test.jsx
py -3 -X utf8 scripts/localization/language-table.py check
```

修改的 JS/JSX 与测试 ESLint、Git 差异空白检查通过。语言表校验零错误；既有历史/S5 待补条目保留，本次不声称全表逐句完成审校。

真实浏览器使用本地 `http://127.0.0.1:4228/`，独立 Playwright 会话 `roco-next-01a099fe`：

- 1920×1080 英文桌面：阻断 CalculatorRouter 模块，显示英文失败和 Reload；放通后点击按钮恢复真实计算器。故障注入产生的预期 console error 单独识别，正常恢复后无新增产品错误。
- 日文 Deer：注入资料 503，显示日文错误；放通后重载恢复。320px 暗色按钮实测高 40px，可达且无横向溢出。
- Cygrail 使用 Calamity：默认显示已翻译的自伤条件；通过设置菜单 EN→JA 后精灵和技能保持，提示即时变日文；启用应对后恢复实际 217 伤害。
- 真实威力输入 10.5 保留草稿，显示英文整数错误；修正后可继续操作。
- 英文四技能在 1920/1080/768/621/390 宽度检查布局，威力与连击输入可读，页面宽度不超出视口。
- 日文 Deer 390px 暗色开启追击，实际读取 ::before 内容为日文的单招/追击最低层数；两条原中文未残留。

验收范围是上述已触发流程和回归，不将默认数据未出现 warnings 推断为全部非默认组合都已遍历。小程序、线上入口、数据版本及伤害公式未修改。

## 最终截图

- [英文桌面：条件提示、完整数字列](../../output/playwright/global-polish-ux39-20261028/en-calamity-condition-1920-final.png)
- [英文 621：四技能列宽](../../output/playwright/global-polish-ux39-20261028/en-skills-621-final.png)
- [英文 390：无效威力输入](../../output/playwright/global-polish-ux39-20261028/en-power-error-390-final.png)
- [日文 320 暗色：失败与重载](../../output/playwright/global-polish-ux39-20261028/ja-tool-load-error-dark-320.png)
- [日文 390 暗色：恢复与本地化阈值标签](../../output/playwright/global-polish-ux39-20261028/ja-tool-recovered-dark-390.png)
- [英文模块失败](../../output/playwright/global-polish-ux39-20261028/en-page-error-1920.png)

以上为本机实际截图，保存在忽略的 output 目录。未带 final 的早期英文条件截图记录了修复前列宽；早期 Deer 亮色失败截图尚为旧按钮，不作为最终布局证据。

最终截图经独立只读复核通过。专用 Playwright 会话已关闭并读回确认；未对其他会话执行关闭操作。
