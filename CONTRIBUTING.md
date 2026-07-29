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
