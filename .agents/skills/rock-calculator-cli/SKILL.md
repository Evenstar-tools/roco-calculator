---
name: rock-calculator-cli
description: Use the project-local deterministic CLI whenever an AI needs to calculate, recalculate, explain, or compare Rock Kingdom World PVP damage. Applies to matchup questions involving spirits, skills, natures, IVs, HP, marks, weather, triggers, overrides, or formula verification; ordinary use must not load the calculation source or full data snapshot into context.
---

# 洛克计算器 CLI

在仓库根目录调用项目内 CLI。计算和复算以 CLI 返回的版本、输入摘要与结果为准。

## 工作流

1. 先用 `npm run -s cli -- meta` 确认 `seasonId`、`catalogVersion` 与 `sourceRevision`。默认入口与当前国服 Web 共用发布 pin；不要拿历史工作区的 CLI 代替当前版本。名称或 ID 不确定时再检索：

   ```powershell
   npm run -s cli -- search spirit "精灵名"
   npm run -s cli -- search skill "技能名" --spirit "精灵名"
   ```

2. 需要确认输入字段时调用 `npm run -s cli -- schema`。不要为普通计算读取 `src/domain/` 或完整数据快照。
3. 将 UTF-8 JSON 输入写入被忽略的 `tmp/rock-cli-input.json`，避免 Windows shell 转义中文和结构化参数。
4. 先运行精简计算：

   ```powershell
   npm run -s cli -- calculate --input tmp/rock-cli-input.json
   ```

5. 只有用户要看公式、结果异常或需要验算过程时，按方向展开：

   ```powershell
   npm run -s cli -- explain --input tmp/rock-cli-input.json --direction forward
   ```

   四技能模式可增加 `--skill 1` 至 `--skill 4`。

## 输入与结果边界

- 优先使用中文全名；CLI 会解析为稳定 ID。出现 `ENTITY_AMBIGUOUS` 时从候选中选择 ID，不能猜。
- 普通精灵等级 60；特殊等级精灵沿用网页默认，按需传入每侧 `level`（例如冥古龙 99／89）。普通性格、六项个体 60、满生命。用户给出的条件必须显式写入输入，不要依赖对话中的隐含状态。
- 天气使用顶层 `weather`，已有异常层数使用 `negativeStatuses`；选中筑梦不会自动启用霞光梦境，也不会自动推进回合叠寄生。异常结算需显式开启 `calculationOptions.includeNegativeStatusSettlement`，并区分直接伤害与 `damagePresentation` 的结算展示。
- `calculate` 返回双向精简结果；`explain` 只展开一个方向或一个技能，避免无必要的大输出。
- 回答时至少保留赛季／资料版本、规则版本、`sourceRevision`、`inputDigest`、双方名称、技能、伤害、HP 百分比和是否致命。历史 `dataVersion`／`rulesVersion` 可能保留兼容标识，当前赛季以 `seasonId`／`catalogVersion` 为准。
- 该工具复用产品的权威计算核心，能复算、解释并检查配置，不构成对核心公式的独立第三方验证。
- 只有 CLI 返回 `INTERNAL_ERROR`、结果与同一版本 GUI 不一致，或用户明确要求诊断实现时，才检查源码。
