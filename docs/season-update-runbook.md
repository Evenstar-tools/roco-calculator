# 赛季数据更新

运行时只读取仓库内的构建快照，不会现场抓取网页。更新赛季数据前，请准备已核验的赛季 CSV 与 BWIKI 页面缓存，并通过环境变量指定路径。

```powershell
$env:ROCOM_S3_CSV='.\data\sources\rocom_world_s3_spirits.csv'
$env:ROCOM_BWIKI_CACHE='.\data\sources\bwiki_cache'
```

`ROCOM_S3_CSV` 是历史遗留变量名，新赛季仍可复用；赛季身份以候选快照的 `meta` 为准。`data/sources/` 不入库，缺少 CSV 或详情缓存时不得运行候选构建。

只读检查 BWIKI 筛选页是否产生新修订：

```powershell
npm run -s data:check-updates
```

`status=changed` 只表示需要开始差异核验，不表示页面中的每项数值都可直接采用。2026 年 9 月 10 日更新使用[专用执行单](maintenance/season-update-2026-09-10.md)。

## 更新前登记

每次赛季或平衡性更新先建立独立分支，并记录：

- 公告日期、赛季名称和生效时间。
- 官方公告、BWIKI 页面、公开参考页和实测证据链接。
- 预计变动的精灵、技能、特性、学习集、属性表和素材范围。
- 当前 Web、桌面、小程序版本及数据快照摘要。
- 上一稳定版本与回退标签。

不要直接在现有脏工作树中并入新赛季数据。

## 更新流程

1. 建立基线：

   ```bash
   npm ci
   npm run data:validate
   npm test
   ```

2. 构建候选快照：

   ```bash
   npm run data:check-updates
   npm run data:build
   ```

   运行前必须确认检查结果为 `buildReady=true`，并更新构建器内的赛季 ID、名称、规则日期和预期数量；不得让旧 S3 常量进入新赛季快照。

3. 同步素材：

   ```bash
   node scripts/bwiki/sync-assets.mjs
   ```

4. 生成并审查差异：

   - 精灵：稳定 ID、形态、属性、种族值、特性、进化链。
   - 技能：威力、能耗、类型、属性、描述、学习集。
   - 规则：固定威力、百分比威力、应对、连击、层数、生命、能量和位置条件。
   - 素材：头像数量、路径、摘要、尺寸与缺失项。

5. 动态规则按以下顺序处理：

   1. 先分类为数据改动、通用规则、精灵特性、技能特例或战斗临时状态。
   2. 有明确纸面证据时写规则参数和自动计算。
   3. 依赖玩家当前战斗信息时提供最少输入控件。
   4. 没有可靠依据时保持“需要输入”或“不参与计算”，不要猜测数值。
   5. 每条规则补默认、触发、边界、双向和回归测试。

6. 同步三端：

   ```bash
   npm run miniapp:sync-core
   npm run test:core-drift
   npm run miniapp:test
   npm run miniapp:build:prod
   ```

7. 执行发布门禁：

   ```bash
   npm run data:validate
   npm test
   npm run test:core-drift
   npm run build
   npm run e2e
   npm run miniapp:test
   npm run miniapp:build:prod
   git diff --check
   ```

## 数据要求

- 精灵形态使用稳定 ID，进化链中的不同形态不得合并。
- 技能和学习集引用必须存在。
- 素材清单中的路径、摘要、宽高必须可以重新计算。
- 快照中不得包含本机盘符、`file:///` 地址、令牌或私有缓存路径。
- 特殊技能与特性的规则修改必须附测试和可核验依据。
- Web 权威计算核心和小程序镜像必须通过漂移检查。
- 数据变动不得静默覆盖用户收藏、配置库、队伍或分享状态。

## 提交拆分

推荐按可独立回退的顺序提交：

1. 来源、差异报告和失败测试。
2. 数据快照和素材。
3. 通用计算规则。
4. 特殊技能与特性适配。
5. 小程序同步与三端 UI。
6. 版本号、更新日志和发布物。

不要把大型生成数据、业务规则、UI 重构和发布版本号压在一个无法审查的提交中。

## 回滚

从 Git 历史建立独立分支，恢复上一份已验证的赛季快照及对应素材和规则；重新运行完整门禁后再发布。不要直接手改大型 JSON，也不要用破坏性命令覆盖工作区。
