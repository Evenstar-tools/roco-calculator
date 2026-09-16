# 贡献指南

感谢参与洛克计算器的改进。

## 提交问题

- Bug 请提供精灵、性格、个体、技能、触发条件、期望结果和实际结果。
- 规则修正请附上可核查的游戏描述、BWIKI 页面或截图证据。
- UI 问题请提供窗口尺寸、系统版本和截图。
- 不要在公开 Issue 中提交账号、令牌、私人队伍资料或其他敏感信息。

## 本地开发

```bash
npm ci
npm run data:validate
npm test
npm run e2e
npm run build
```

## 修改原则

- 伤害结果必须保持确定性，不引入随机区间。
- 技能和特性规则应集中在 `src/domain/`，并新增可复现测试。
- 不要修改旧本地存储键或分享结构，除非同时提供迁移与兼容测试。
- 界面改动需覆盖桌面、窄窗口和 390px 移动视口。
- 不要提交 `dist/`、`release/`、`安装包/`、测试报告或本机路径。

## 更新记录分工

- `CHANGELOG.md` 是 GitHub 完整维护记录，保留网页、桌面、小程序的功能、修复及发布验收历史；平台专属条目注明平台和版本，未正式发布的开发上传不能写成已上线。
- `src/data/user-release-notes.js` 是网页／桌面用户日志，只写该端可感知的变化。小程序独立版本、兼容性、构建上传与提审记录只进入仓库日志；跨端条目保留网页／桌面的影响即可。
- 小修复沿用当前版本，追加当前版本记录；不为记录整理或小程序独立更新抬升网页版本。清理用户日志不得删减仓库历史。
- 提交前运行 `npx vitest run --config config/vite.config.mjs tests/docs/release-notes.test.js`，同时检查版本覆盖和平台边界。

## Pull Request

PR 应说明：

1. 修改内容和原因。
2. 对用户操作或计算结果的影响。
3. Bug 的根因或规则证据。
4. 已运行的验证命令。

建议使用简短、可追踪的提交信息，例如：

```text
fix: preserve avatar manifest across startup race
feat: add reviewed skill power rule
docs: clarify season snapshot update
```
