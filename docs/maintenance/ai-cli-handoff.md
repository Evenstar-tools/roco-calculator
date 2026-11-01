# 洛克计算器 AI CLI 交接

## 交接目标

这套 CLI 只供 AI 计算、复算和解释伤害，不提供人类交互界面。默认国服入口复用当前 Web 发布 pin 的数据构建和最终结算入口，包含特殊等级、S5 结算与未实装机制限制；不调用网络服务。主线旧快照、小程序与国际服有各自维护边界，不能据此宣称已同步。

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

首次调用从本地 Git 导出 `config/preview-release.json` 固定源码到被忽略的 `output/`，后续复用同一版本；发布 pin 改变后自动切换。缺少该提交时明确报错，按提示先 fetch 对应提交；不会偷偷联网或退回 S4。无发布 pin 的 S5 源码仓可使用本工作区规则，输出不声称对应已发布版本。

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

特殊等级按每侧 `level` 输入，例如 `"attacker":{"spirit":"冥古龙","level":89,"skill":"荒芜之噬"}`。省略时沿用网页默认，普通精灵保持 60；旧的顶层 `level` 只允许 60，避免把单一系数误当成双方完整面板变化。

筑梦专题可先 `search skill "筑梦" --spirit "鸡麻麻"`。已进入霞光梦境时显式传入 `"weather":"dream"`；已有 3 层寄生时传入 `"negativeStatuses":{"defender":{"parasitism":3}}`，并用 `"calculationOptions":{"includeNegativeStatusSettlement":true}` 开启结算。CLI 不模拟整回合，选中技能不会自动施放天气或增加寄生层数。`totalDamage` 保留直接伤害语义，异常结算单列在 `negativeStatusSettlement`，合并展示口径见 `damagePresentation`。

## 输出和验收

- 成功只向 stdout 输出一行 JSON，退出码为 `0`。
- 用户输入、实体解析或参数错误只向 stderr 输出结构化 JSON，退出码为 `2`。
- 内部故障退出码为 `1`，错误码为 `INTERNAL_ERROR`。
- `calculate` 默认不返回公式链；只有 `explain` 展开指定方向，控制 AI 上下文体积。
- 每次计算都返回产品版本、数据版本、规则版本、当前 `seasonId`／`catalogVersion`、发布 `sourceRevision` 和 `inputDigest`。历史数据／规则标识可能保留 S4 兼容值，不能只看它判断当前赛季。交接问题时同时提供输入 JSON 与这些字段。

## 后续同步

每次国服赛季、资料或计算规则更新，CLI 与 Web 共用发布 pin，无需手抄一份 CLI 数据。执行 `npm run cli:test`，确认默认入口的检索、特殊等级、性格、天气、异常结算和机制限制；发布关键测试也覆盖默认入口。协议旧快照夹具保留用于兼容回归，不代表默认 CLI 数据。国际服数据未核验时继续拒绝计算，不能混入国服新增精灵。

## “验算”的准确含义

CLI 与产品界面复用同一套核心，因此能确认名称解析、输入配置、版本、计算结果和公式过程，也能检查 GUI 是否把相同配置正确传给核心。它不能作为独立实现证明核心公式本身无误；独立验证仍需权威样例或另一套公式实现。
