# 洛克计算器验收矩阵

本矩阵只记录当前仓库可复查的实现和验收证据。状态含义：

- **通过**：当前实现已有自动测试或本轮人工证据。
- **部分**：能力可用，但仍有明确覆盖缺口。
- **待验证**：证据不足，不作为已交付能力。

发布前运行 `npm run acceptance:verify`。矩阵不记录固定用例数量、本地预览地址或跨版本截图。

| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |
| --- | --- | --- | --- | --- |
| 双方精灵选择与搜索 | 通过 | `src/components/SpiritPicker.jsx`、`src/components/SpiritStep.jsx` | `tests/ui/calculator-sections.test.jsx`、`tests/ui/app-integration.test.jsx` | 新增精灵数据时继续由数据校验保证引用有效。 |
| 性格、六维与个体配置 | 通过 | `src/components/NatureSelect.jsx`、`src/components/NatureStatsStep.jsx`、`src/components/StatTile.jsx` | `tests/domain/natures.test.js`、`tests/ui/icons-and-natures.test.jsx`、`tests/ui/stat-tile.test.jsx` | 新性格命名仍需随赛季数据同步。 |
| 单技能搜索、动态输入与结果 | 通过 | `src/components/SingleSkillEditor.jsx`、`src/components/SkillPicker.jsx` | `tests/ui/skill-editors.test.jsx`、`tests/domain/skill-rules.test.js` | 新增动态技能必须同时补规则和交互用例。 |
| 四技能双方配置与快捷比较 | 通过 | `src/components/FourSkillEditor.jsx`、`src/domain/calculator-view-model.js` | `tests/ui/skill-editors.test.jsx`、`tests/domain/calculator-view-model.test.js` | 新增槽位状态时必须验证攻防方向隔离。 |
| 双向确定性伤害与取整 | 通过 | `src/domain/calculate.js`、`src/domain/damage.js` | `tests/domain/calculate.test.js`、`tests/domain/damage.test.js` | 新发现的游戏内取整例外需作为独立回归样例登记。 |
| 结果栏、生命值和击倒判断 | 通过 | `src/components/ResultRail.jsx`、`src/components/HealthInput.jsx` | `tests/ui/result-rail.test.jsx`、`tests/ui/app-integration.test.jsx` | 新增额外伤害来源时需验证合计与生命占比。 |
| 技能动态威力与特性条件 | 部分 | `src/domain/skill-effects.js`、`src/domain/trait-effects.js` | `tests/domain/skill-rules.test.js`、`tests/domain/traits.test.js` | 已登记规则有自动验证；快照中新出现且未登记的描述仍需人工判定。 |
| 状态技能触发与清理 | 部分 | `src/domain/skill-status-effects.js`、`src/state/calculator-session.js` | `tests/domain/skill-status-effects.test.js`、`tests/state/calculator-session.test.js` | 跨槽、换人和重复触发的统一生命周期仍需进一步收口。 |
| 双方印记、星陨附加伤害与雨天 | 通过 | `src/domain/marks.js`、`src/domain/calculate.js` | `tests/domain/marks.test.js`、`tests/domain/calculate.test.js`、`tests/ui/app-integration.test.jsx` | 新天气或印记类型需增加独立规则证据。 |
| 分享导入、版本迁移与异常提示 | 通过 | `src/state/share.js`、`src/state/calculator-session.js` | `tests/state/share.test.js`、`tests/state/calculator-session.test.js`、`tests/ui/app-integration.test.jsx` | 后续 schema 升级必须保留旧链接迁移样例。 |
| 精灵个人配置记忆与收藏 | 通过 | `src/state/spirit-configs.js`、`src/state/favorites.js`、`src/hooks/useStoredCalculatorData.js` | `tests/state/spirit-configs.test.js`、`tests/state/favorites.test.js`、`tests/hooks/use-stored-calculator-data.test.jsx` | 存储 schema 新增可变字段时需补深复制验证。 |
| 多队伍、六人配置与快捷载入 | 通过 | `src/state/team-presets.js`、`src/components/TeamDrawer.jsx`、`src/components/TeamMemberEditor.jsx` | `tests/state/team-presets.test.js`、`tests/ui/team-drawer.test.jsx`、`tests/ui/app-integration.test.jsx` | 后续新增队伍成员可变字段时必须继续验证个人配置、队伍副本和计算状态互不共享。 |
| 离线 Web 与 Windows 桌面包 | 部分 | `public/sw.js`、`desktop/main.mjs`、`scripts/build-desktop.mjs` | `tests/desktop/offline-paths.test.js`、`tests/desktop/branding.test.js` | 尚缺 Service Worker 离线命中与回退测试，也未取得本轮安装包构建和启动人工证据。 |
| 常见移动视口和底部结果交互 | 通过 | `src/styles.css`、`src/components/WorkspaceOverlays.jsx` | `e2e/uiux-team-presets.spec.js`、`tests/ui/workspace-overlays.test.jsx` | 新增浮层或底部控件时需复查安全区与遮挡。 |
| Web 与微信小程序共享计算源 | 通过 | `scripts/miniapp/shared-source-manifest.mjs`、`scripts/miniapp/check-core-drift.mjs` | `tests/miniapp/shared-core.test.js`、`miniapp/tests/calculation.test.js` | 小程序平台交互仍由其独立组件测试负责。 |
| 首屏数据、技能列表与缓存性能 | 部分 | `scripts/runtime-snapshot.mjs`、`src/components/SkillPicker.jsx`、`public/sw.js` | `tests/data/runtime-snapshot.test.js`、`e2e/uiux-team-presets.spec.js` | 尚未建立真实产物体积预算、冷热加载和交互耗时阈值。 |

## 发布接线

- CI 显式运行 `npm run acceptance:verify`。
- Web 构建在生成运行时数据前执行 `npm run acceptance:verify`。
- 桌面打包复用 Web 构建，因此继承同一门禁。
- 当前仓库没有独立站点发布脚本或独立发布命令；发布以 CI、Web 构建和桌面打包的实际路径为准，不在此虚构额外命令。
