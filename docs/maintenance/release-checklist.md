# 提交、测试与发布检查单

## 提交前

- [ ] 在独立分支/工作树开发，起点来自最新 `origin/main`。
- [ ] 工作树无来源不明的大量生成文件。
- [ ] 规则改动有来源、参数说明、失败测试和回退点。
- [ ] 数据改动有精灵、技能、特性、学习集和素材差异统计。
- [ ] 未修改用户分享、收藏、配置库和队伍 schema；如有修改则已补迁移测试。

## 通用门禁

```text
npm run data:validate
npm run acceptance:verify
npm run test:core-drift
npm test
git diff --check
```

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
```

- [ ] 全新目录安装、离线启动、卸载和重装通过。
- [ ] 头像、运行数据、配置库导入导出和本地记忆可用。
- [ ] 安装包产品名、图标、快捷方式、版本号和签名正确。
- [ ] 生成 SHA256，并从安装包解包后验证运行资源。

## 发布

- [ ] 更新 `package.json`、小程序版本和完整 `CHANGELOG.md`。
- [ ] 更新应用内用户版更新记录，只写用户可理解的变化。
- [ ] 创建 Git 标签与 GitHub Release，上传安装包、证书和 SHA256。
- [ ] 发布后下载回读，核对文件大小和 SHA256。
- [ ] 线上站点验证真实版本，不以本地构建成功代替线上发布。
- [ ] 本机安装包只保留当前稳定版和上一稳定版；旧版由 Release 保存。
