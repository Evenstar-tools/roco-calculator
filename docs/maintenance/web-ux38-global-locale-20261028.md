# UX38 国际服多语言本地验收 · 2026-10-28

本轮在 `codex/s5-plan-20261022` 的 `e1e55f8` 基线上修复，原版 UI、S3 季中数据和伤害规则保持不变。用户授权为继续打磨多语言；沿用既有方向直接修复漏译与语境错误，不另做新界面。独立本地提交，不推送或部署。

## 改动

- `src/components/GlobalTeamDraftExchange.jsx`：按 ID 本地化导入成员名；文件入口跟随页面语言，显示原文件名；取消选择保留预览，同文件可重新读取。
- `src/components/ConfigLibraryDialog.jsx`、`src/hooks/useConfigLibraryFlow.js`：差异字段、性格、个体、技能属性、错误细节本地化；错误存源键，切语言即时更新；未知 ID 和参数原样保留；修复文件入口和未选文件时“已是最新”的错误状态。
- `src/hooks/useStoredCalculatorData.js`：收藏、取消收藏和存入队伍提示按实体 ID 读取显示名，存储仍用原始 ID 和数据。
- `src/components/TeamDrawer.jsx`、`TeamAnalysisPanel.jsx`：用户队名原样展示，自动新建名称继续用当前语言，复制只翻译后缀。
- `src/components/TeamMemberEditor.jsx`：血脉属性用 `typeName`，普通为 Common / ノーマル，首领保留对应语境。
- `src/i18n/team-messages.js`、`data/localization/global/language-table.csv` 与派生文件：补导入/分享错误文案并人工语境复核，未覆盖客户端官方行。

## 本地验证

使用现有 `http://127.0.0.1:4228/` Vite 服务与独立 Chromium 验收会话，未访问线上写入入口。

```powershell
npx vitest run --config config/vite.config.mjs tests/ui/global-feature-localization.test.jsx tests/ui/config-library-dialog.test.jsx tests/ui/team-server-locale.test.jsx tests/ui/team-member-types.test.jsx tests/hooks/use-stored-calculator-data.test.jsx tests/ui/share-server-boundary.test.jsx
```

通过。覆盖真实 S3 名称、英日切换、源 JSON 与自定义队名保持、复制/默认命名、文件读取失败重试和取消、有效签名但不存在精灵引用的分享拒绝、血脉保存值保持。已修正一条旧占位 Global 的过时测试：正式入口拒绝将本场形态存入个人预设/队伍，产品逻辑未改变。

修改的 JS/JSX 及测试 ESLint、`git diff --check` 通过；语言表 `sync` / `check` 通过，官方来源和插值校验无错误。主表既有待补/待审项继续保留，本次不声称全表逐句完成审校。按本地修改范围验证，未运行发布构建或发布门禁。

真实操作包括队伍 JSON 导入并加载 Dimo、英日收藏反馈、语言菜单切换、配置库差异与错误详情、长文件名、损坏 JSON 失败后原路径文件修复重选。1440×1000 桌面、390×844 日文亮色、320×844 英文暗色均已读图；窄屏页面和对话框无横向溢出，确认/取消可达。浏览器页面没有 console error。独立视觉复核未发现阻碍操作或理解的问题。

## 真实截图

以下为本次最终实现；JSON 中的自定义名称和引用 ID 是保留的用户输入，不作 UI 翻译。

- [英文队伍导入桌面](../../output/playwright/global-polish-20261028/en-team-import-desktop-final.png)
- [日文配置差异桌面](../../output/playwright/global-polish-20261028/ja-library-desktop.png)
- [日文队伍导入 390](../../output/playwright/global-polish-20261028/ja-team-import-mobile.png)
- [日文确认导入 320](../../output/playwright/global-polish-20261028/ja-team-import-320.png)
- [英文文件错误暗色 320](../../output/playwright/global-polish-20261028/en-import-error-dark-320.png)
- [英文差异暗色 320](../../output/playwright/global-polish-20261028/en-library-dark-320.png)
- [英文收藏反馈](../../output/playwright/global-polish-20261028/en-favorite.png)
- [日文收藏反馈 390](../../output/playwright/global-polish-20261028/ja-favorite-mobile.png)

截图为本机验收产物，放在忽略的 output 目录，未上传至公开仓库。最初的 `en-team-import-desktop.png` / `en-library-mobile.png` 是修复原生文件控件前的画面；`ja-team-bloodline-desktop.png` 捕获到过渡动画帧，不用作最终视觉证据。

专用 Playwright 会话 `roco-next-01a099fe` 已关闭，结束后会话列表为空。Chrome 扩展最初截图连接中断，随后改用此独立验收路径；该扩展临时标签无法手动清理，保持未标记以交由工具回合结束自动清理。未操作用户已有浏览器页面。
