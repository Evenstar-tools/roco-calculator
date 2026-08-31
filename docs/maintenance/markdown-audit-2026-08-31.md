# Markdown 文档清理记录（2026-08-31）

## 结论

- 审计范围：仓库内 Git 跟踪的 `*.md`，共 103 个。
- 本次删除：41 个，均无当前入口、脚本或测试引用，且内容已由代码、测试、`CHANGELOG.md` 或现行维护文档接替。
- 保留：62 个已跟踪文档，另有 1 个正在编辑的未跟踪演示稿。
- 恢复方式：删除内容仍保留在 Git 历史中，可从本次清理提交的父提交按路径恢复。

## 已删除

### 已完成的实施计划（36 个）

这些文件记录开发步骤，不是现行规格；对应功能已经进入代码、测试和版本记录，仓库外部也没有引用。

- `docs/superpowers/plans/2026-08-03-beast-flower-bloodline-trait.md`
- `docs/superpowers/plans/2026-08-03-config-library-preview.md`
- `docs/superpowers/plans/2026-08-03-counter-skill-and-safe-reset.md`
- `docs/superpowers/plans/2026-08-03-direct-trait-damage.md`
- `docs/superpowers/plans/2026-08-03-fair-pigeon-balance-trait.md`
- `docs/superpowers/plans/2026-08-03-favorite-config-library-import-export.md`
- `docs/superpowers/plans/2026-08-03-jal-choice-trait-and-skill-row-layout.md`
- `docs/superpowers/plans/2026-08-03-poison-hp-hit-count-traits.md`
- `docs/superpowers/plans/2026-08-03-unicorn-seven-slots-refraction.md`
- `docs/superpowers/plans/2026-08-04-contract-shape-trait.md`
- `docs/superpowers/plans/2026-08-04-sprout-mark-positive-buff.md`
- `docs/superpowers/plans/2026-08-04-wing-extension-trait.md`
- `docs/superpowers/plans/2026-08-05-miniapp-v0.1.1-web-v1.4.3.md`
- `docs/superpowers/plans/2026-08-05-release-hardening-v1.4.4.md`
- `docs/superpowers/plans/2026-08-06-miniapp-phone-release-ui.md`
- `docs/superpowers/plans/2026-08-07-miniapp-mobile-battle-workbench.md`
- `docs/superpowers/plans/2026-08-07-miniapp-reference-first-minimal-ui.md`
- `docs/superpowers/plans/2026-08-10-miniapp-reference-fidelity.md`
- `docs/superpowers/plans/2026-08-10-miniapp-six-stat-grid-search-overlay.md`
- `docs/superpowers/plans/2026-08-10-miniapp-skill-picker-categories.md`
- `docs/superpowers/plans/2026-08-12-desktop-promotion-settings.md`
- `docs/superpowers/plans/2026-08-12-first-run-guide.md`
- `docs/superpowers/plans/2026-08-12-miniapp-result-actions.md`
- `docs/superpowers/plans/2026-08-12-miniapp-v0.1.2-full-sync.md`
- `docs/superpowers/plans/2026-08-13-first-run-spirit-picker-spotlight.md`
- `docs/superpowers/plans/2026-08-13-miniapp-desktop-parity-ux.md`
- `docs/superpowers/plans/2026-08-13-s3-midseason-miniapp-sync.md`
- `docs/superpowers/plans/2026-08-13-type-coverage-panel.md`
- `docs/superpowers/plans/2026-08-14-bloodline-magic-photosynthetic-healing.md`
- `docs/superpowers/plans/2026-08-14-miniapp-share-flow.md`
- `docs/superpowers/plans/2026-08-17-panel-power-display-and-additive-power-zone.md`
- `docs/superpowers/plans/2026-08-17-power-input-mode-convergence.md`
- `docs/superpowers/plans/2026-08-17-static-panel-power-convergence.md`
- `docs/superpowers/plans/2026-08-18-workspace-governance-and-handoff.md`
- `docs/superpowers/plans/2026-08-21-miniapp-v1.6-parity-sync.md`
- `docs/superpowers/plans/2026-08-21-team-defensive-type-analysis.md`

### 被替代的旧快照（5 个）

| 路径 | 删除理由 | 现行替代 |
| --- | --- | --- |
| `artifacts/洛克计算器-版本更新记录-v1.5.6.md` | 旧版汇总副本，无入口引用 | `CHANGELOG.md`、应用内更新记录 |
| `docs/design/miniapp-v0.1.2-measurements.md` | 旧版静态尺寸表，当前小程序布局已经重构 | 当前组件、样式与响应式测试 |
| `docs/maintenance/current-desktop-handoff-2026-08-24.md` | 一次性交接已完成，目标规则已落入代码和测试 | `docs/maintenance/maintainer-handoff.md` |
| `docs/releases/v1.2.3.md` | 独立旧版本说明已无入口，内容与发布历史重复 | `CHANGELOG.md`、`docs/releases/README.md`、Git 标签 |
| `docs/releases/v1.6.0-detailed-report.md` | 未形成现行稳定版的阶段报告，测试数字和状态已过期 | `CHANGELOG.md`、后续版本验收记录 |

## 保留

- 根目录与社区治理：`README.md`、`CHANGELOG.md`、`AGENTS.md`、贡献、安全、行为准则和第三方声明。
- 当前维护入口：赛季更新、发布检查、维护交接、AI CLI 交接和本次审计记录。
- 规则与架构依据：`docs/superpowers/specs/` 32 个设计规格、伤害计算说明、属性/技能审计和验收矩阵。
- 发布证据：`docs/verification/` 的 11 份小程序验收与交付记录。它们虽对应旧版本，但用于区分构建、上传、飞书交付和正式发布，不属于无效文档。
- 发布总览：`docs/releases/README.md`。

## 未处理

- `design-qa.md`：当前工作区正在修改，属于在途验收记录。
- `docs/design/miniapp-compact-workspace-demo.md`：当前未跟踪的在途小程序演示稿。

两者均未纳入本次删除，待对应开发任务完成后再判断是否归档。
