# 洛克计算器 AI CLI 交接

## 交接目标

这套 CLI 只供 AI 计算、复算和解释伤害，不提供人类交互界面。它直接复用桌面版与小程序的确定性计算核心，使用项目内当前数据快照，不调用网络服务。

## 最短交接方式

把整个 `rock-calculator-public` 仓库交给 AI，并把工作目录设为仓库根目录。支持 `AGENTS.md` 的代理会自动读到“AI 计算与验算”规则；支持项目 Skill 的代理还会自动发现：

```text
.agents/skills/rock-calculator-cli/SKILL.md
```

无需复制计算源码、数据文件或长提示词。AI 的普通调用路径固定为：

```text
用户自然语言
  -> AI 写入紧凑 JSON
  -> npm run -s cli -- calculate
  -> 需要时 npm run -s cli -- explain
  -> AI 用精简结果回答
```

若接收方不支持项目 Skill，但支持项目指令，只需明确要求它“先读取仓库根目录的 AGENTS.md”。若两者都不支持，把 `.agents/skills/rock-calculator-cli/SKILL.md` 作为系统提示的一部分即可。

## 环境准备

要求 Node.js 22 或更高版本。首次拿到仓库后执行：

```powershell
npm ci
npm run -s cli -- meta
```

不需要启动网页、Electron 或微信开发者工具。可选执行 `npm link`，将命令注册为全局 `rock-calculator`；项目内 AI 默认使用 `npm run -s cli --`，不依赖全局安装。

## 机器协议

查看当前版本与数据：

```powershell
npm run -s cli -- meta
```

查看紧凑输入契约：

```powershell
npm run -s cli -- schema
```

名称检索：

```powershell
npm run -s cli -- search spirit "迪莫"
npm run -s cli -- search skill "光球" --spirit "迪莫"
```

最小输入文件：

```json
{
  "schemaVersion": 1,
  "mode": "single",
  "level": 60,
  "attacker": {
    "spirit": "迪莫",
    "skill": "光球"
  },
  "defender": {
    "spirit": "水蓝蓝",
    "skill": "水炮"
  }
}
```

计算与解释：

```powershell
npm run -s cli -- calculate --input tmp/rock-cli-input.json
npm run -s cli -- explain --input tmp/rock-cli-input.json --direction forward
```

四技能模式使用 `"mode": "four"` 和每侧的 `"skills": [...]`。技能元素既可以是名称/ID，也可以是带 `context`、`overrides`、`type`、`category` 的对象。方向参数放在 `forward` 或 `reverse` 中；其中 `skill` 从 1 开始计数。精确字段以 `schema` 命令的实时输出为准。

## 输出和验收

- 成功只向 stdout 输出一行 JSON，退出码为 `0`。
- 用户输入、实体解析或参数错误只向 stderr 输出结构化 JSON，退出码为 `2`。
- 内部故障退出码为 `1`，错误码为 `INTERNAL_ERROR`。
- `calculate` 默认不返回公式链；只有 `explain` 展开指定方向，控制 AI 上下文体积。
- 每次计算都返回产品版本、数据版本、规则版本和 `inputDigest`。交接问题时应同时提供输入 JSON 与这些字段。

## “验算”的准确含义

CLI 与产品界面复用同一套核心，因此能确认名称解析、输入配置、版本、计算结果和公式过程，也能检查 GUI 是否把相同配置正确传给核心。它不能作为独立实现证明核心公式本身无误；独立验证仍需权威样例或另一套公式实现。
