# 提交、测试与发布检查单

## 提交前

- [ ] 在独立分支/工作树开发，起点来自最新 `origin/main`。
- [ ] 工作树无来源不明的大量生成文件。
- [ ] 规则改动有来源、参数说明、失败测试和回退点。
- [ ] 数据改动有精灵、技能、特性、学习集和素材差异统计。
- [ ] 未修改用户分享、收藏、配置库和队伍 schema；如有修改则已补迁移测试。

## 版本号单一事实来源

- [ ] 版本号只改两处：根 `package.json`（网页 / 桌面）与 `miniapp/package.json`（小程序）。
- [ ] 在 `CHANGELOG.md` 与 `src/data/user-release-notes.js` 顶部各新增一条对应新版本的记录。
- [ ] 同步展示型版本文件：`public/sw.js` 的 `CACHE_NAME`、`miniapp/src/version.js` 的 `MINIAPP_VERSION` 与 `MINIAPP_UPDATE_DATE`。
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

## Web

```text
npm run build
npm run e2e
```

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
- [ ] 更新应用内用户版更新记录，只写用户可理解的变化，且不复述历史版本条目。
- [ ] 创建 Git 标签与 GitHub Release，仅上传带版本号的安装包。
- [ ] Release 不上传 WebApp ZIP、小程序 ZIP 或 `SHA256SUMS.txt`；校验文件仅保留在本地发布归档。
- [ ] 不再提供固定文件名的直链；应用内和网页入口统一打开当前 Release 页面。
- [ ] 发布后下载回读，核对文件大小和 SHA256。
- [ ] 线上站点验证真实版本，不以本地构建成功代替线上发布。
- [ ] 本机安装包只保留当前稳定版和上一稳定版；旧版由 Release 保存。
