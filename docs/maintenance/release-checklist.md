# 提交、测试与发布检查单

## 提交前

- [ ] 在独立分支/工作树开发，起点来自最新 `origin/main`。
- [ ] 工作树无来源不明的大量生成文件。
- [ ] 规则改动有来源、参数说明、失败测试和回退点。
- [ ] 数据改动有精灵、技能、特性、学习集和素材差异统计。
- [ ] 未修改用户分享、收藏、配置库和队伍 schema；如有修改则已补迁移测试。

## 版本号单一事实来源

- [ ] 版本号只改两处：根 `package.json`（网页 / 桌面）与 `miniapp/package.json`（小程序）。
- [ ] 网页／桌面升级版本时，在 `CHANGELOG.md` 与 `src/data/user-release-notes.js` 顶部各新增对应记录；同版本修复追加当前版本。小程序独立发布只追加仓库日志的平台小节，不新增或污染网页用户记录。
- [ ] 同步展示型版本文件：`public/sw.js` 的 `CACHE_NAME`、`miniapp/src/version.js` 的 `MINIAPP_VERSION` 与 `MINIAPP_UPDATE_DATE`。
- [ ] 根版本变更后同步 `public/data/presets/pvp-popular-configs.json` 的 `appVersion`，运行 `node scripts/miniapp/build-common-spirit-config.mjs public/data/presets/pvp-popular-configs.json miniapp/src/data/common-spirit-config.json` 重建内置预设及压缩载荷，再运行 `npm --prefix miniapp test -- --run tests/common-spirit-config.test.js`；这是预设来源版本，不代表升级小程序独立版本。
- [ ] 不修改任何测试或门禁脚本里的版本字符串与发布文案；它们全部从上述来源派生，出现需要手改的断言就是回归，应改断言的取数方式而不是改字面量。

## 通用门禁

```text
npm run data:validate
npm run acceptance:verify
npm run test:core-drift
npm test
node scripts/miniapp/verify-release.mjs --preflight
git diff --check
```

`npm run data:validate` 默认按快照自身的 `meta.counts` 校验内部一致性；精灵数、技能数不再写死在门禁脚本、桌面代码或测试里。

### 按改动范围选择测试

- `npm test`：日常关键验收，保留全部计算规则与存档状态测试，以及二维码、萌化、模式切换、撤回、工具和电鹿关键操作。纯逻辑在 Node 环境运行，不启动模拟浏览器。
- `npm run test:full`：保留的完整单元/组件专项；改动组件时可追加文件路径，例如 `npm run test:full -- tests/ui/deer-page.test.jsx`。不要向 `npm test` 传不在关键清单内的文件。
- `npm run e2e`：构建当前源码后验证关键浏览器链路；不再穷举全部主题和分辨率。
- `npm run e2e:full`：宽窄屏、主题、面板布局等完整浏览器专项；修改布局或全局样式时运行对应文件，大范围交互改版时运行全部。
- 修改构建、桌面、数据导入或共享核心校验脚本时，另跑 `tests/build`、`tests/desktop`、`tests/data` 或 `tests/miniapp` 中对应专项；这些脚本的自测不必每次发布全部重跑。
- CI 在同一工作区先构建，再以 `E2E_PREBUILT=1` 验证该产物，避免第二次安装与构建。此开关仅用于刚完成构建且源码未改变的情况，本地默认不复用旧包。
- 实际数据校验、验收证据、当前共享核心、资源绑定和体积门禁不取消；小程序生产发布的历史核心校验与包体门禁也不取消。

## Web

2026-09-20 经确认的体积预算：总资源预警 15.5 MiB／阻断 16.5 MiB，JS gzip 320／348 KiB，CSS gzip 50／56 KiB，原始 JS 1088／1152 KiB，运行数据 1.5／1.625 MiB。本次仅按用户批准为异常与印记说明窗微调 JS/CSS 硬上限，预警不变。以 `scripts/verify-performance-budget.mjs` 为执行来源；超过预警先检查新增依赖和重复资源，超过硬上限停止发布，不自动扩容。小程序主包平台限制仍为 2 MiB。

```text
npm run e2e
```

`e2e` 已包含一次完整 Web 构建，无需在它前面重复执行 `npm run build`。只打包、不运行浏览器验收时仍使用原有 `npm run build` / `npm run desktop:pack`。

- [ ] 首屏、精简版、具体版、单技能、四技能和移动端无阻塞。
- [ ] 新版本号、标题、用户更新日志和数据版本一致。
- [ ] 静态资源使用仓库相对路径，离线和线上路径均可加载。

## 微信小程序

```text
npm run miniapp:sync-core
npm run test:core-drift
npm run miniapp:test
npm run miniapp:build:prod
```

- [ ] 共享核心零漂移。
- [ ] 小程序版本号与发布说明已更新。
- [ ] 首次六步引导未进入小程序。
- [ ] 真机验证搜索、选择、计算、配置恢复和结果展示。

## 桌面端

```text
npm run desktop:pack
npm run desktop:release-assets
```

- [ ] 全新目录安装、离线启动、卸载和重装通过。
- [ ] 头像、运行数据、配置库导入导出和本地记忆可用。
- [ ] 安装包产品名、图标、快捷方式、版本号和签名正确。
- [ ] 仅生成一个带版本号的安装包。
- [ ] `SHA256SUMS.txt` 记录该安装包的 SHA256，仅随本地发布归档保留。
- [ ] 从安装包解包后验证运行资源。

## 发布

- [ ] 已完成“版本号单一事实来源”一节的全部改动。
- [ ] 应用内用户记录只写网页／桌面用户可理解的变化，不混入小程序独立版本、构建上传与提审过程，且不复述历史条目；GitHub `CHANGELOG.md` 保留各平台完整维护记录。
- [ ] 运行 `npx vitest run --config config/vite.config.mjs tests/docs/release-notes.test.js` 验证用户日志与仓库记录的边界。
- [ ] 创建 Git 标签与 GitHub Release，仅上传带版本号的安装包。
- [ ] Release 不上传 WebApp ZIP、小程序 ZIP 或 `SHA256SUMS.txt`；校验文件仅保留在本地发布归档。
- [ ] 不再提供固定文件名的直链；应用内和网页入口统一打开当前 Release 页面。
- [ ] 发布后下载回读，核对文件大小和 SHA256。
- [ ] `rococalc.top` 已绑定 GitHub 自动部署：先推送 `origin/main`，再比对线上首页、Service Worker、运行数据及 JS/CSS 与本地发布构建的哈希；只有线上未更新或部署失败时才进入腾讯云控制台排查，不把控制台登录当作默认发布前置条件。
- [ ] 线上站点验证真实版本，不以本地构建成功代替线上发布。
- [ ] 本机安装包只保留当前稳定版和上一稳定版；旧版由 Release 保存。
