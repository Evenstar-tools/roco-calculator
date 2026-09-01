# 2026-09-10 赛季资料更新执行单

状态：等待资料更新。本文用于资料发布后的直接执行，不代表已经确认新赛季名称、版本号或具体改动。

## 当前基线

| 项目 | 基线 |
| --- | --- |
| Git | 制定执行单时的 `origin/main`：`f39b481b84953d1437668be4a2424556621a6a1a` |
| Web / 桌面 | 以根 `package.json` 的 `version` 为准；执行前 `node -p "require('./package.json').version"` |
| 微信小程序 | 以 `miniapp/package.json` 的 `version` 为准；`miniapp/src/version.js` 的 `WEB_CORE_VERSION` 记录其镜像的网页核心发布标签 |
| 数据快照 | `data/snapshots/current.json`，当前 `s3-2026-08-13-midseason`，规则版本 `2026-08-13` |
| 数据量 | 以 `data/snapshots/current.json` 的 `meta.counts` 为准；当前精灵 594、技能 553、学习集 594、特性 228、属性关系 18、人工覆盖 5 |
| BWIKI 基线 | 精灵筛选 `41360`、技能筛选 `40653` |
| `current.json` | SHA256 `5D06E2CDC0DD5463DA31FAE24AFCB3E4CF7E20B49ECC72CA172D5777B09B818C` |
| `runtime.json` | SHA256 `60154ACD9BFE9F90F39393B509263CA77A6F86C3D86CD8EC993904B93E085029` |
| 头像清单 | SHA256 `A83458CCA72F13A66759DCF39EA7FA471A0AA4B579AB6BEB327661E687A72352` |

当前仓库未包含 `data/sources/`。候选构建前必须准备已核验的赛季 CSV 和 BWIKI 详情页缓存；两者通过 `.gitignore` 保持本地，不提交来源缓存。

## 启动条件

每次检查先运行：

```powershell
Set-Location 'D:\codex\rock-calculator-public'
npm run -s data:check-updates
```

状态解释：

- `status=unchanged`：继续等待，不改数据。
- `status=changed`：立即进入来源登记和差异核验；修订变化只代表候选更新，不直接证明数值正确。
- `buildReady=false`：可以收集公告、页面和实测证据，但不能执行 `npm run data:build`。
- `buildReady=true`：筛选页已变化，且赛季 CSV 与详情缓存齐备，可以建立候选快照。

正式开始至少满足以下一项：

1. 官方公告明确给出赛季、平衡或数据调整；
2. BWIKI 精灵筛选或技能筛选修订号变化，并能在页面差异中确认有效数据变化；
3. 用户提供 9 月 10 日的新赛季资料、截图或实测数据。

来源冲突按“游戏实测或官方公告 > 最新 BWIKI > 公开参考站”处理。无法确认的动态规则保持手动输入或暂不参与计算，不猜数值。

## 资料清单

| 类别 | 必要内容 | 落地位置 | 完成标准 |
| --- | --- | --- | --- |
| 官方信息 | 赛季名称、生效时间、完整公告、平衡说明 | 本文“执行记录”与新快照 `meta.sources` | 链接、日期、摘要齐全 |
| 精灵目录 | 图鉴号、形态、阶数、属性、种族值、特性、进化链 | 赛季 CSV、`data/snapshots/current.json` | 稳定 ID 不漂移，新增删除可解释 |
| 技能目录 | 属性、类别、能耗、威力、描述 | BWIKI 技能筛选与当前快照 | 与旧快照 `meta.counts.skills` 的差异逐项归类 |
| 学习集 | 每个形态的技能与获得方式 | BWIKI 详情缓存、`learnsets` | 无未知技能引用，无缺失形态 |
| 特性与动态规则 | 层数、位置、应对、连击、生命、能量、最终伤害等条件 | `src/domain`、规则参数与测试 | 默认、触发、边界、双向均有回归 |
| 属性关系 | 18 属性克制、抵抗、免疫 | `typeChart` | 18 项完整且矩阵测试通过 |
| 素材 | 精灵头像、属性图标、路径、摘要、尺寸 | `public/assets` 与 manifest | 无缺图、错图、远程依赖泄漏 |
| 常用配置 | 新增精灵默认性格、个体、四技能、特性参数 | 配置库 JSON | 只更新有证据的配置，旧用户配置可读 |
| 版本显示 | 赛季标题、数据版本、Web、桌面、小程序版本 | 根 `package.json`、`miniapp/package.json` 与三端生产文件 | 三端显示与快照一致；门禁和测试自动从两个 `package.json` 派生 |
| 发布说明 | CHANGELOG、应用内简版记录、验证报告 | `CHANGELOG.md`、`src/data/user-release-notes.js`、`docs/verification` | 首条记录版本等于根 `package.json` 版本，且不复述历史条目 |

## 当日执行步骤

### 1. 建立隔离工作区

```powershell
Set-Location 'D:\codex\rock-calculator-public'
git fetch origin
git status --short --branch
git worktree add 'D:\codex\worktrees\rock-calculator-season-20260910' -b 'season/2026-09-10' origin/main
Set-Location 'D:\codex\worktrees\rock-calculator-season-20260910'
npm ci
npm ci --prefix miniapp
```

若分支或工作树已存在，先检查其状态并继续使用，禁止新建同名副本或删除未知改动。

### 2. 固化旧版基线

```powershell
$SourceRoot = 'D:\codex\rock-calculator-sources\2026-09-10'
New-Item -ItemType Directory -Path $SourceRoot -Force | Out-Null
Copy-Item -LiteralPath '.\data\snapshots\current.json' -Destination (Join-Path $SourceRoot 'baseline-current.json')
npm run -s cli -- meta
Get-FileHash -Algorithm SHA256 '.\data\snapshots\current.json','.\public\data\runtime.json','.\public\assets\spirits\manifest.json'
npm run data:validate
npm test -- --run --testTimeout=30000
npm run miniapp:test
```

把命令输出、公告链接和抓取时间填入本文末尾执行记录。

### 3. 准备来源输入

```powershell
$SourceRoot = 'D:\codex\rock-calculator-sources\2026-09-10'
$env:ROCOM_S3_CSV = Join-Path $SourceRoot 'rocom_world_season_2026-09-10_spirits.csv'
$env:ROCOM_BWIKI_CACHE = Join-Path $SourceRoot 'bwiki_cache'
Test-Path -LiteralPath $env:ROCOM_S3_CSV
Test-Path -LiteralPath $env:ROCOM_BWIKI_CACHE
npm run -s data:check-updates -- --json
```

`ROCOM_S3_CSV` 是历史遗留环境变量名，新赛季仍复用该入口；它不代表候选数据仍属于 S3。

### 4. 先写差异测试

按实际资料逐项建立失败断言，再修改快照或规则：

- 新增、删除、改名和新形态的稳定 ID 与图鉴顺序。
- 种族值、属性、特性、技能、学习集和素材绑定。
- 技能基础威力、能耗、连击与动态面板威力。
- 特性触发、临时状态、回合状态和分享恢复。
- 新旧快照兼容与常用配置回读。

定向测试必须先失败，确认失败原因正是新资料尚未适配；随后只做满足该条规则的最小实现。

### 5. 更新构建器并生成候选快照

赛季 ID、赛季名称和抓取数量期望已改为命令行参数，不再是脚本常量。仍需检查 `scripts/bwiki/build-snapshot.mjs` 中的以下旧赛季内容：

- `snapshotVersion`、`rulesVersion`；
- CSV 来源标题、URN、日期；
- 旧 S3 目录补丁与季中平衡补丁的适用范围。

不要直接复用 `apply-s3-midseason-catalog.mjs` 或 `apply-s3-midseason-balance.mjs` 处理新赛季。新资料需要独立、可重复执行的补丁或完整快照构建步骤。

抓取数量校验是防刮取回归的门禁，必须显式传入本次核对后的期望值；缺参数时脚本直接报错并打印用法。

```powershell
npm run data:build -- --season-id '<新赛季ID>' --season-name '<新赛季名称>' --expect-spirits <核对后的精灵数> --expect-skills <核对后的技能数>
node scripts/bwiki/sync-assets.mjs
npm run data:runtime
npm run data:validate
npm run data:verify-bindings
npm run -s cli -- meta
git diff --stat -- data/snapshots public/data public/assets
```

`npm run data:validate` 默认按新快照自身的 `meta.counts` 校验内部一致性；需要对照外部核对值时追加 `-- --expect-spirits <数量> --expect-skills <数量>`。

`npm run data:verify-bindings` 同时执行头像绑定校验和图片体积门禁（单图边长与 ≤200 KiB）。新赛季头像必须先压到门禁内，再进入构建。

上一快照会自动归档到 `data/snapshots/seasons/<旧赛季ID>.json`，新快照写入 `data/snapshots/current.json`。候选快照必须记录上一快照 ID、增删数量、来源修订、抓取时间和内容 SHA256。

### 6. 补齐规则和界面

规则只在 Web 权威核心中实现，再同步小程序：

```powershell
npm run miniapp:sync-core
npm run test:core-drift
```

重点检查以下生产文件中的旧赛季显示，不做全仓机械替换：

- `src/App.jsx`、`src/components/AppHeader.jsx`；
- `miniapp/src/app.config.js`、`miniapp/src/index.html`；
- `miniapp/src/components/AppHeader.jsx`、`LoadingState.jsx`、`ErrorState.jsx`；
- `miniapp/src/pages/index/index.jsx` 与 `index.config.js`；
- `miniapp/src/version.js`；
- 对应 Web、小程序、桌面品牌和分享测试。

### 6.5 版本号与发布说明

版本号只有两个事实来源：根 `package.json`（网页 / 桌面）与 `miniapp/package.json`（小程序）。发版时只做三件事：

1. 修改根 `package.json` 的 `version`；
2. 修改 `miniapp/package.json` 的 `version`；
3. 在 `CHANGELOG.md` 顶部和 `src/data/user-release-notes.js` 顶部各新增一条对应新版本的记录。

门禁脚本、测试断言和发布说明校验都从这三处派生，不需要再逐个改测试里的版本字符串或发布文案：

- `scripts/miniapp/verify-release.mjs` 的期望版本读取两个 `package.json`；
- `tests/docs/release-notes.test.js` 校验首条记录版本等于根 `package.json` 版本、日期格式、首屏摘要精简，且不复述历史条目；
- `tests/ui/workspace-overlays.test.jsx` 与 `tests/e2e/data-source-dialog.spec.js` 从 `src/data/user-release-notes.js` 读取首条记录的标题与摘要做断言。

仍需手动同步、且已有测试兜底的展示型版本文件：

- `miniapp/src/version.js`：`MINIAPP_VERSION` 与 `MINIAPP_UPDATE_DATE` 是小程序界面展示内容，`WEB_CORE_VERSION` 是共享核心漂移比对使用的已发布网页核心标签；`miniapp/tests/app-shell.test.jsx` 校验 `MINIAPP_VERSION` 等于 `miniapp/package.json` 版本，`tests/miniapp/shared-core.test.js` 校验 `WEB_CORE_VERSION` 不超前于根 `package.json` 版本。
- `public/sw.js` 的 `CACHE_NAME`：必须随网页版本改动才能失效旧缓存；`tests/service-worker/sw-cache.test.js` 校验它等于根 `package.json` 版本。

数据数量、精灵数、技能数不再写进桌面代码或测试：桌面离线冒烟从打包内 `data/runtime.json` 的 `meta.counts` 自校验，测试从 `data/snapshots/current.json` 派生。

### 7. 完整门禁

```powershell
npm run data:validate
npm run acceptance:verify
npm run test:core-drift
npm test -- --run --testTimeout=30000
npm run build
npm run e2e
npm run miniapp:test
npm run miniapp:build:prod
git diff --check
```

额外人工验收：

- Web 桌面宽屏、390px 移动端、离线刷新与更新后缓存。
- 桌面端离线启动、外链、数据版本和完整头像。
- 小程序真机搜索、四技能、配置恢复、队伍分析、分享接收和冷启动。
- 选取至少 3 组新赛季实战样本，用 CLI 保存 `inputDigest` 和完整结果。

### 8. 提交与发布边界

推荐拆分提交：

1. 来源登记、差异报告、失败测试；
2. 数据快照与素材；
3. 通用规则与特殊适配；
4. 小程序同步和界面；
5. 版本、更新说明和验证报告。

资料处理完成后先提交可审查结果。打桌面包、上传小程序、部署 Web、创建 GitHub Release 或发送飞书，均在用户明确要求后执行。

## 完成判定

- [ ] 权威来源、抓取时间、修订号和冲突裁决有记录。
- [ ] 新旧快照差异已按精灵、技能、特性、学习集、属性表、素材分类。
- [ ] 所有动态描述已归类为自动规则、手动输入或暂不支持。
- [ ] Web 和小程序共享核心零漂移。
- [ ] 三端赛季名称、数据版本和数量一致。
- [ ] 全部门禁通过，`git diff --check` 无错误。
- [ ] 回退点明确，未覆盖用户收藏、队伍、配置和分享状态。

## 执行记录

| 字段 | 记录 |
| --- | --- |
| 首次检测时间 | 待填 |
| 触发来源 | 待填 |
| 官方公告 | 待填 |
| 精灵筛选修订 | 基线 `41360`，候选待填 |
| 技能筛选修订 | 基线 `40653`，候选待填 |
| 赛季名称 / 生效时间 | 待填，不预设 |
| 来源 CSV SHA256 | 待填 |
| 详情缓存页数 / 修订摘要 | 待填 |
| 候选快照 ID / SHA256 | 待填 |
| 数据差异 | 待填 |
| 规则差异 | 待填 |
| 定向测试 | 待填 |
| 全量门禁 | 待填 |
| 未决问题 | 待填 |
| 提交 / 回退点 | 待填 |
