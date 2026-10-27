# UX36 主界面改动对比与种族值试算 · 2026-10-27

用户已确认前后对比方案并要求实施，入口改为选中精灵原有的改动详情栏。范围仅网页与 Windows 桌面版，包含响应式手机网页；本轮未操作小程序代码、路径、同步、构建或开发者工具。保留 S5 工作树已有改动，未提交、推送或部署。

## 已落地

- 精灵卡原改动提示中放置两个默认关闭的独立开关：对比本期改动、自定义种族值。未改动精灵也可通过卡上的种族值试算入口编辑。
- 主结果及精简/具体四技能行显示前后伤害；单技能结果、双向计算、移动网页底栏和结果抽屉同步。伤害 HP、相对变化和最大生命占比百分点分开呈现；冻结斩杀线不充当额外伤害。
- 六维输入保留官方值参照，可恢复官方；自定义按双方、精灵和形态隔离，交换双方时跟随配置。无效草稿不进入计算，失焦恢复最后有效值。
- 两个开关串联时，比较“记录调整前”与“当前自定义试算”。改动来源可展开，试算项明确标为自定义。
- 试算值仅留在本页，不写入官方数据、精灵配置、工作会话或分享协议。刷新默认关闭；普通存档与分享保留官方种族值。
- 全精灵承伤及其他独立工具继续使用官方数据；试算期间，承伤入口明确标注“官方值”，不把本页的试算结果冒充该榜单来源。
- 百分比 HP 输入保存官方尺度的绝对值，再由比较两侧按各自最大生命投影；绝对 HP 输入保留绝对语义。输入模式绑定数据、精灵、形态、生命个体、性格及具体 HP/%，避免新配置误用旧模式。
- 复用共享 `buildCalculatorViewModel`，未修改计算核心或内部公式。副本重建精灵索引，保留头像、官方 ID、形态属性和继承特性。

## 当前数据边界

正式数据仍为 S4，现有改动记录包含 9/10 正式调整和 10/14 季中调整。每次只回放所选提示栏对应 `patch.id` 的记录，其余沿用当前值；界面显示实际补丁日期和来源。这不是完整的 S5 历史数据包，也不把 S3 快照当作 S5 更新前数据。

可核验的六维、技能基础威力和能耗先校验 `after` 与当前值一致，再使用记录中的 `before`。未审阅的特性/技能机制、连击规则或记录冲突显示“不可对比”，当前侧普通计算保持可用。没有通过替换描述、伪造版本或放宽国际服限制来制造历史结果。

后续导入已核验 S5 数据时沿用实体改动记录链路；真正涉及旧规则的条目仍需对应规则适配与回归，不能仅凭新旧文案启用比较。

## 验证

- 定向 Vitest：模型、输入模式生命周期、真实 App 开关/编辑/恢复/存档、改动提示、结果栏及移动抽屉通过，已接入 `config/vitest.release.config.mjs` 的日常入口。
- 涉及文件 ESLint、Git 差异空白检查通过。直接执行 Web Vite 生产构建通过，未执行小程序同步或发布门禁。
- 原有 `app-integration.test.jsx` 扩展检查仍有三项失败：旧分享解码断言及两处 `Math.round` 面板断言。用临时配置载入 HEAD 原 `App.jsx` 回放相同三项，结果一致；本轮未修改这些既有协议或公式。
- 真实 Chromium：1920×1080 明暗、精简/具体、四技能、双向、手机网页 390×1080 及 320px 宽检查通过；未出现横向溢出。改动详情支持悬停后直接点击编辑，输入焦点保留。
- 独立视觉复核发现暗色精简选中行的浅底浅字，已仅修正开启对比时的暗色行背景并重截复核通过。
- Electron：当前生产构建使用原 `app://calculator/` 离线协议验证（独立测试存储、隐藏窗口；仅测试入口覆盖根路径及窗口可见性）。对比、编辑、恢复、刷新通过，运行时无页面错误；未生成安装包。

真实验收样本为烈火守护 → 迪莫，当前双方中性性格、个体 60、火焰冲锋：记录调整前 **71**，当前 **58**；自定义物攻种族值 **100** 后为 **65**。关闭及刷新恢复 **58**。这组是已记录 S4 数值的实际计算，不是 S5 数据或前次示意图的演示值。

## 证据

本地预览：`http://127.0.0.1:4215/cn/?seasonPreview=s5`。S5 参数仅切换装饰，数据身份保持 S4。

截图目录：`output/playwright/ux36-implemented-20261027/`

- `desktop-recorded.png`：记录调整前与当前值。
- `desktop-controls.png`：原改动栏内的两个开关及六维编辑。
- `desktop-dark.png`、`desktop-detailed-dark.png`：暗色与具体版。
- `mobile-controls.png`、`mobile-compact.png`、`mobile-result.png`、`mobile-dark.png`：响应式网页。
- `electron-desktop.png`、`electron-evidence.json`：Electron 实际计算与恢复/刷新读回。

前次效果模拟保留在 `artifacts/web-ux36/proposal/`，不作为本轮真实实现截图。

## 改动文件

- `src/features/balance-comparison/`：`model.js`、`useBalanceComparison.js`、`SpiritComparisonControls.jsx`、`ComparisonResults.jsx`、`BalanceComparisonContext.jsx`。
- `src/App.jsx`、`src/components/SpiritStep.jsx`、`SpiritPicker.jsx`、`EntityChangeHint.jsx`：选中精灵入口和独立试算状态。
- `src/components/CompactSkillEditor.jsx`、`FourSkillEditor.jsx`、`SingleSkillEditor.jsx`、`HealthInput.jsx`、`ResultRail.jsx`、`WorkspaceOverlays.jsx`：各结果入口及输入单位接线。
- `src/styles.css`、`src/styles/26-balance-comparison.css`。
- `tests/features/balance-comparison.test.js`、`tests/hooks/balance-comparison.test.jsx`、`tests/ui/balance-comparison-flow.test.jsx`、`tests/ui/balance-comparison-results.test.jsx`、`config/vitest.release.config.mjs`。
- 本记录与 `docs/maintenance/web-ux-backlog.md` 的 UX36 状态；其他 S5 改动维持原状。

## 最终用户变更 · 2026-10-27

本文前述双列和历史比较为先前实现记录。用户随后明确要求“全部去掉，只留种族值编辑”，最终已移除比较入口、历史回放、双列与逐技能差值，手调直接显示当前单个结果。保留恢复官方，并增加恢复上次手调值；只有原有改动说明与种族值编辑保留。存档、分享及其他工具不采纳手调草稿，小程序不在本次范围。

最终回归与公开 `/pre/` 发布验收见 `docs/maintenance/s5-pre-web-release-20261027.md`；不将中途本地比较修复当作已上线功能。
