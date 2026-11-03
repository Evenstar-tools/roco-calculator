# 平衡调整回顾：更新方法与显示规范

国服工具箱的“赛季平衡性调整回顾”只读运行数据，不单独维护一份资料。每次赛季或平衡更新，只要把新批次正确写进精灵和技能的 `changeInfo`，回顾页就会自动出现新批次。本文写清楚数据怎么写、怎么更新、界面必须守住哪些规则。国际服没有这个入口，也不加载这个模块。

## 一、数据从哪里来

每只精灵（`spirits[]`）和每个技能（`skills[]`）可以带一个 `changeInfo`：

```json
{
  "patch": { "id": "s4-2026-09-10", "seasonId": "S4", "label": "S4 月涌狂想 9月10日数据", "date": "2026.09.10", "displayDate": "2026.09.10", "sourceUrl": "https://…" },
  "items": [
    { "kind": "stat", "field": "hp", "label": "生命", "before": 108, "after": 131 },
    { "kind": "mechanic", "field": "description", "label": "技能效果", "before": "…完整原文…", "after": "…完整原文…" }
  ],
  "history": [ { "patch": { "…": "更早的批次" }, "items": [] } ]
}
```

- `patch`、`items` 是最新一批；`history` 按从新到旧保存以往各批。导入新批次时，旧批次推进到 `history`，不能覆盖，也不能把同一批次重复累加。
- `patch.id` 是批次的唯一身份，格式为 `s{赛季}-{YYYY}-{MM}-{DD}`。同一次更新在所有精灵和技能上必须使用同一个 `id`、`label` 和 `date`，回顾页靠它把各处的改动合成一个批次。
- `patch.label` 是侧栏和标题的显示名。名称以赛季开头时（如“S4 月涌狂想…”），页面不再另加赛季标签。
- `displayDate` 只在资料展示日期和记录日期不同时填写；`sourceUrl` 只有 http(s) 链接才显示成“资料来源”，内部 URN 显示为“未提供在线链接”。
- `items[].kind` 决定改动归到哪一类（见 `classifyHistoryItem`）：
  - **种族值**：`kind: "stat"`，并且 `field` 是六维之一（hp、physicalAttack、physicalDefense、magicalAttack、magicalDefense、speed）。
  - **技能调整**：`field` 为 basePower、cost、description，或 `label` 以“威力”“能耗”“技能效果”结尾。技能威力不能写成种族值。
  - **学习面调整**：`kind: "learnset"`。
  - **特性调整**：`kind: "trait"`，或 `kind: "wording"` 且 `label` 以“特性·”开头。
  - 其余归入“其他调整”。纯新增实体（`kind: "new"`）不算平衡记录。
- 数值改动的 `before`、`after` 用数字；文本改动写完整原文，不要截断或改写，页面会逐词比较前后两段并标出差异。

## 二、每次更新的步骤

1. **导入数据**：按[赛季更新手册](../season-update-runbook.md)导入新资料。导入脚本（`scripts/bwiki/apply-*.mjs`）用 `mergeEntityChangeInfo` 合并 `changeInfo`，保留旧批次。
2. **生成运行数据**：在国服源码工作区运行 `npm run data:runtime`，生成 `public/data/runtime.json`。
3. **核对数据**：抽查新批次在回顾页的显示，包括：
   - 侧栏出现新日期；
   - 种族值、技能、学习面、特性各自归类正确；
   - 文本差异标记落在真正改动的词上；
   - 家族名用基础形态。
4. **测试**：

   ```bash
   npx vitest run --config config/vite.config.mjs tests/features/balance-history.test.js tests/features/balance-history-text-diff.test.js tests/ui/balance-history-panel.test.jsx
   ```

   然后跑发布门禁 `npx vitest run --config config/vitest.release.config.mjs`。
5. **界面验收**：电脑尺寸为主，看 1920×1080 和 1440×900 的亮色与暗色，另看 390 宽窄屏不溢出。每次都看整个弹窗，不能只看改动的那一行。必须打开这几处：
   - 按精灵回查：搜一个有变体的精灵（如岚鸟）；
   - 按更新浏览：选新批次看默认概览；
   - 展开一条技能效果，看差异标记；
   - 展开一条涉及多只精灵的改动，看名单。
6. **发布**：
   1. 国服源码分支逐文件提交并推送；
   2. 在主线把 `config/preview-release.json` 的 `sourceRevision` 指向新提交；
   3. 同步版本号：`package.json`、`package-lock.json`、`public/sw.js` 的缓存名、预设库的 `appVersion`；
   4. 写更新说明：`src/data/user-release-notes.js`、`CHANGELOG.md`、[版本记录](../releases/README.md)；
   5. 构建并推送 main，EdgeOne 自动部署网页；
   6. 用 `node scripts/build-desktop.mjs` 打 Windows 安装包，发 GitHub Release。Release 只放带版本号的安装包。

## 三、显示规范（改界面时必须守住）

1. **每条改动都要看得出改的是谁。** 概览行涉及 1–2 只精灵时，在行首直接写头像和名字；更多时写“N 只精灵”，展开后列出完整名单（超过约五行时在原位滚动，不把下一条推远）。不允许只写数量。2026-11-03 曾有一版只剩“1 只精灵”和数值，用户完全看不懂改的是谁，这条就是那次的教训。
2. **精简只能去掉重复，不能丢信息。** 对象、改前改后的值、日期、来源都必须保留。相同改动可以合并成一行，但合并后仍要能看到涉及哪些精灵。
3. **改前/改后标出差异。**
   - 删掉的内容标红并加删除线，新增的内容标绿。
   - 数值整体标出，例如“+75”到“+85”标整个值，不只标一个数字。
   - 夹在两处改动之间的单个相同字并入改动。
   - 几乎整段重写（共同部分不到 20%）时不标，避免整段飘色。
   - 原文逐字保留，不增删字符。
4. **家族名用基础形态。** 优先取没有变体名的成员，例如“雪绒鸟家族”；全员都是变体时用基础名，例如“鸭吉吉家族”。不要显示“雪绒鸟（春天的样子）家族”。头像同样取这个成员。
5. **不重复的标签。** 标题已含赛季时不再加赛季标签。侧栏计数写“N 次调整”，不在窄侧栏里折出单独的字。
6. **尺寸。**
   - 宽度 ≥1200px：弹窗 1280×960（受视口限制），侧栏 248px。
   - 760–1199px：弹窗 1040×780，侧栏 224px。
   - 宽度 ≤760px：全屏，上下排布。
   - 字号不小于 12px，正文 13–14px。
7. **只读。** 回顾页不写计算配置和存档。
8. **体积。** 发布构建的 JS gzip 总量有 512 KiB 硬上限（`scripts/verify-performance-budget.mjs`），不得调高。2.3.2 构建为 511.96 KiB，余量很小；加功能前先估算体积，必要时先精简同功能代码或更新说明。

## 四、代码位置

- 界面：`src/features/balance-history/BalanceHistoryPanel.jsx`、`balance-history.css`
- 索引与分类：`src/features/balance-history/history-index.js`，包括 `classifyHistoryItem`、家族合并和批次汇总 `summarizeBatchChanges`
- 文本差异：`src/features/balance-history/text-diff.js`
- 入口：`src/App.jsx`、`src/components/Toolbox.jsx`（仅国服）
- 测试：`tests/features/balance-history.test.js`、`tests/features/balance-history-text-diff.test.js`、`tests/ui/balance-history-panel.test.jsx`、`tests/ui/balance-history-entry.test.jsx`

各阶段实现记录见[家族合并](balance-history-family-20261103.md)和[按更新精简](balance-history-overview-20261103.md)。本文是最新规范，与这些阶段记录冲突时以本文为准。
