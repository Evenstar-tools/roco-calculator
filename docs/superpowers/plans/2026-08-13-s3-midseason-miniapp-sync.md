# S3 Midseason Miniapp Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端 S3 季中平衡规则与两只缺失精灵完整同步到网页和微信小程序，并生成可提交的生产包。

**Architecture:** 领域规则继续由根项目维护并通过共享核心脚本同步到小程序。数据更新由可重复执行的目录补丁和季中平衡补丁依次生成，运行时只消费生成后的离线快照。

**Tech Stack:** Node.js ESM、React、Taro、Vitest、BWIKI 构建脚本、微信开发者工具。

## Global Constraints

- 保留桌面工作区未提交的无关改动，不整体复制工作树。
- 新增精灵必须带稳定 ID、来源、学习集、特性和 HTTPS 图片。
- 所有生产改动必须先有失败测试，再执行最小实现。
- 只有全量测试、生产构建和微信原生运行通过后才提交代码。

---

### Task 1: 建立季中数据失败测试

**Files:**
- Create: `tests/data/s3-midseason-balance.test.js`
- Test: `tests/data/s3-midseason-balance.test.js`

**Interfaces:**
- Consumes: `public/data/current.json`
- Produces: 对季中元数据、594 精灵、两只新增精灵、博物特性及平衡数值的行为门禁。

- [ ] **Step 1: 写入桌面端季中断言和两只精灵完整性断言。**
- [ ] **Step 2: 运行 `npm test -- tests/data/s3-midseason-balance.test.js`，确认因旧快照和缺失精灵失败。**
- [ ] **Step 3: 记录失败原因必须是 `s3-2026-08-13-midseason`、594 或新增对象缺失。**

### Task 2: 生成 594 精灵季中快照

**Files:**
- Create: `scripts/bwiki/apply-s3-midseason-catalog.mjs`
- Create: `scripts/bwiki/apply-s3-midseason-balance.mjs`
- Modify: `public/data/current.json`
- Create: `public/data/seasons/s3-2026-08-13-midseason.json`
- Modify: `public/assets/spirits/manifest.json`
- Create: `public/assets/spirits/spirit_5f3eaa6f91c32c93.png`
- Create: `public/assets/spirits/spirit_ad25e8d39ea8f904.png`

**Interfaces:**
- Consumes: 旧 S3 快照、BWIKI 精灵筛选和固定详情页修订。
- Produces: `applyS3MidseasonCatalog(snapshot)` 与 `applyS3MidseasonBalance(snapshot)`，最终离线快照包含 594 精灵。

- [ ] **Step 1: 实现目录补丁，抓取并验证宝藏小狐、宝藏沙狐，拒绝未知技能和修订漂移。**
- [ ] **Step 2: 同步桌面端季中平衡补丁脚本。**
- [ ] **Step 3: 依次运行目录补丁和平衡补丁，生成当前快照与赛季快照。**
- [ ] **Step 4: 运行素材同步，确认两张新增图片及清单存在。**
- [ ] **Step 5: 运行 `npm run data:validate` 和聚焦数据测试，确认通过。**

### Task 3: 同步领域规则和小程序运行时

**Files:**
- Modify: `src/domain/skill-effects.js`
- Modify: `src/domain/skill-rules.js`
- Modify: `src/domain/skill-status-effects.js`
- Modify: `src/domain/trait-effects.js`
- Modify: `tests/domain/skill-rules.test.js`
- Modify: `tests/domain/skill-status-effects.test.js`
- Modify: `tests/domain/trait-effects.test.js`
- Generated: `miniapp/src/shared/domain/*`
- Generated: `public/data/runtime.json`
- Generated: `miniapp/src/data/bundled-runtime.json`

**Interfaces:**
- Consumes: 桌面端已验证的季中规则差异。
- Produces: 网页和小程序共享的季中计算行为。

- [ ] **Step 1: 先同步季中规则测试，运行聚焦测试确认旧实现失败。**
- [ ] **Step 2: 应用最小领域规则差异并运行聚焦测试通过。**
- [ ] **Step 3: 执行共享核心同步、运行时快照生成和 core drift 检查。**

### Task 4: 全量验证与提交

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Generated: `miniapp/dist/**`

**Interfaces:**
- Consumes: 已同步的数据和规则。
- Produces: 通过门禁的微信生产包和可追溯 Git 提交。

- [ ] **Step 1: 运行根项目全量测试和小程序全量测试。**
- [ ] **Step 2: 运行数据验证、网页生产构建与 `miniapp:build:prod`。**
- [ ] **Step 3: 在微信开发者工具检查 594 精灵、季中版本和运行错误。**
- [ ] **Step 4: 检查 Git diff 只包含本次数据与规则同步。**
- [ ] **Step 5: 提交并推送 Git，然后上传微信代码。**
