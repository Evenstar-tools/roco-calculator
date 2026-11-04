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
  - **技能本身**：`field` 为 basePower、cost、description，或 `label` 以“威力”“能耗”“技能效果”结尾。技能威力不能写成种族值。精灵身上的技能改动 `label` 必须写成“技能名·字段”（如“透镜实验·威力”），按更新浏览靠这个前缀把改动合到技能卡上，并列出会用的精灵；没有前缀的会落到“其他”。
  - **学习面**：`kind: "learnset"`。新增写 `after`（技能名），移除写 `before`（技能名），页面靠它写出“+ 技能名 / − 技能名”。
  - **特性**：`kind: "trait"`，或 `kind: "wording"` 且 `label` 以“特性·”开头。
  - 其余归入“其他”（新增首领形态、进化路径、形态等）。纯新增实体（`kind: "new"`）不算平衡记录。
  - 两种视图、筛选按钮和速览格用同一组名称和顺序：种族值、技能本身、特性、学习面、其他（`BalanceHistoryPanel.jsx` 的 `GROUPS`）。
- 数值改动的 `before`、`after` 用数字；文本改动写完整原文，不要截断或改写，页面会逐词比较前后两段并标出差异。

## 二、每次更新的步骤

1. **导入数据**：按[赛季更新手册](../season-update-runbook.md)导入新资料。导入脚本（`scripts/bwiki/apply-*.mjs`）用 `mergeEntityChangeInfo` 合并 `changeInfo`，保留旧批次。
2. **生成运行数据**：在国服源码工作区运行 `npm run data:runtime`，生成 `public/data/runtime.json`。
3. **核对数据**：抽查新批次在回顾页的显示，包括：
   - 侧栏出现新日期，标题下写“资料日期 资料 · 记录日期 记录”；
   - 速览五格的数量与源资料一致（例如 S5 圣龙宝藏：种族值 40 只 ↑26 ↓14、技能本身 10 项 ↑5 ↓3、特性 8 只、学习面 205 只、其他 7 只）；
   - 技能卡列出的“N 只精灵会用”与各精灵的“技能名·字段”记录一致；
   - 文本差异标记落在真正改动的词上；
   - 家族名用基础形态。
4. **测试**：

   ```bash
   npx vitest run --config config/vite.config.mjs tests/features/balance-history.test.js tests/features/balance-history-text-diff.test.js tests/ui/balance-history-panel.test.jsx
   ```

   然后跑发布门禁 `npx vitest run --config config/vitest.release.config.mjs`。
5. **界面验收**：电脑尺寸为主，看 1920×1080 和 1440×900 的亮色与暗色，另看 1024、768 和 390 宽不溢出、不挤成窄列。每次都看整个弹窗，不能只看改动的那一行。必须打开这几处：
   - 按精灵回查：搜一个有变体的精灵（如岚鸟），看改动小签和差异标记；
   - 按更新浏览：新批次默认概览，逐个点速览格只看一类，再点一次恢复全部；
   - 技能卡：效果差异和“会用的精灵”名单；
   - 学习面：点开一个“家族 ×N”，看各形态名单；
   - 更新内搜索：搜一只精灵、一个技能、一个不存在的词；
   - 换一个旧批次（如 S4 9月10日、季中平衡），确认没有空白分类。
6. **发布**：
   1. 国服源码分支逐文件提交并推送；
   2. 在主线把 `config/preview-release.json` 的 `sourceRevision` 指向新提交；
   3. 同步版本号：`package.json`、`package-lock.json`、`public/sw.js` 的缓存名、预设库的 `appVersion`（国服源码和主线各改一份）；
   4. 写更新说明：`src/data/user-release-notes.js`、`CHANGELOG.md`、[版本记录](../releases/README.md)。当前版本条目会进 JS 包，越短越省体积；必须有一条写明“国际服S3季中”；
   5. 主线本地先跑一次含 RUM 的正式构建（PowerShell：设 `VITE_RUM_ENABLED=true` 和任一 `VITE_RUM_ID` 后 `npm run build`；Git Bash 的 tar 会把 `D:` 当远程主机而失败），确认体积门禁通过，再推送 main，EdgeOne 自动部署网页；
   6. 需要发桌面版时，用 `node scripts/build-desktop.mjs` 打 Windows 安装包，发 GitHub Release，只放带版本号的安装包。只改网页时可以不发，但要在版本记录里写明最新安装包仍是哪一版。

## 三、显示规范（改界面时必须守住）

1. **先速览，再分类。** 按更新浏览的顶部是五个速览格（只显示有内容的类），写明种族值几只、增强几只、削弱几只，技能几项、增强几项、削弱几项，特性、学习面、其他各几只。点一格只看这一类，再点恢复全部；换批次、换赛季或改搜索时恢复全部。不再用“精灵 / 技能”和“全部 / …”两排按钮。
2. **每类用最自然的主语。**
   - 种族值以精灵为主语：一只一行，头像、名字、各项“生命 87→98 +11”小签、“总和 +26”。同家族放进一个框，框头写“X家族 N 只同批调整”；家族按总和从高到低排，增强在前。
   - 技能以技能为主语：一项一张卡，技能图标、名字、增强/削弱/改写标签，威力、能耗小签和效果差异写在一起，卡底写“N 只精灵会用”和名单。精灵身上的同一技能改动不再逐只重复。同一改写被记成“技能效果”和“机制”两条时只列一条。
   - 学习面以技能为主语：“+ 技能名 / − 技能名”，下面写人数并直接列出名单；新增在前、移除在后，各按人数排序。
   - 特性和其他：完全相同的改动只列一次，左边写所有适用的精灵。
3. **每条改动都要看得出改的是谁。** 名单直接写出名字，不允许只写数量。同家族三只及以上拿到同一改动时折成“X家族 ×N”，点开显示各形态全名；两只以下直接写名字。技能卡的使用者名单超过约五行时在原位滚动。2026-11-03 曾有一版只剩“1 只精灵”和数值，用户完全看不懂改的是谁，这条就是那次的教训。
4. **精简只能去掉重复，不能丢信息。** 对象、改前改后的值、日期、来源都必须保留。相同改动可以合并，但合并后仍要能看到涉及哪些精灵。
5. **增减方向按玩家理解着色。** 绿色是增强，红色是削弱。能耗、冷却这类越小越好的数值，降低算增强（标绿），升高算削弱。技能卡的标签：数值改动全部增强为“增强”，全部削弱为“削弱”，其余（含只改效果文字）为“改写”。按精灵回查用同一套小签和颜色。
6. **改前/改后标出差异。**
   - 删掉的内容标红并加删除线，新增的内容标绿。
   - 数值整体标出，例如“+75”到“+85”标整个值，不只标一个数字。
   - 夹在两处改动之间的单个相同字并入改动。
   - 几乎整段重写（共同部分不到 20%）时不标，避免整段飘色。
   - 原文逐字保留，不增删字符。
7. **家族名用基础形态。** 优先取没有变体名的成员，例如“雪绒鸟家族”；全员都是变体时用基础名，例如“鸭吉吉家族”。不要显示“雪绒鸟（春天的样子）家族”。头像同样取这个成员。
8. **不重复的标签。** 标题已含赛季时不再加赛季标签。侧栏计数写“N 次调整”，不在窄侧栏里折出单独的字。批次标题照抄资料的 `label`，日期只在标题下写一次。
9. **尺寸。**
   - 宽度 ≥1200px：弹窗 1280×960（受视口限制），侧栏 248px；速览五格一行。
   - 901–1199px：弹窗 1040×780，侧栏 224px；速览五格仍一行，种族值小签可折成两行。
   - 宽度 ≤900px：速览改成一行横向滚动；种族值行改为“名字、总和”一行、小签另起一行；学习面、特性名单移到技能名下方。
   - 宽度 ≤760px：全屏，上下排布；速览格只留类名和数量。
   - 字号不小于 12px，正文 13–14px。
10. **只读。** 回顾页不写计算配置和存档。
11. **体积。** 发布构建的 JS gzip 总量有 512 KiB 硬上限（`scripts/verify-performance-budget.mjs`），不得调高。2.3.4 含 RUM 正式构建为 511.85 KiB；2.3.5 改版换掉旧概览后约 511.9 KiB，余量不到 0.1 KiB。为此：
    - 分类小标题旁的读法提示（“同家族放一起，增强在前”等）和技能卡的“增强 / 削弱 / 改写”字样写在 `balance-history.css` 的 `content` 里，改文案要改样式表；
    - 再加功能前先估算体积：可以用国服源码按 `config/vite.cn.config.mjs --mode cn` 构建、`npm run performance:verify` 对比改前改后，主线 service worker 比国服源码大约 0.86 KiB，要一起算；
    - 超出时先精简同功能代码或当前版本说明，不能放宽门禁。

## 四、代码位置

- 界面：`src/features/balance-history/BalanceHistoryPanel.jsx`、`balance-history.css`
- 索引与分类：`src/features/balance-history/history-index.js`，包括 `classifyHistoryItem`、家族合并和按更新分组 `groupBatch`（种族值按家族、技能合卡、学习面按技能、相同特性/其他合并）
- 文本差异：`src/features/balance-history/text-diff.js`
- 入口：`src/App.jsx`、`src/components/Toolbox.jsx`（仅国服）
- 测试：`tests/features/balance-history.test.js`、`tests/features/balance-history-text-diff.test.js`、`tests/ui/balance-history-panel.test.jsx`、`tests/ui/balance-history-entry.test.jsx`

各阶段实现记录见[家族合并](balance-history-family-20261103.md)、[按更新精简](balance-history-overview-20261103.md)和[UX45 速览加分类改版](ux45-release-20261104.md)。本文是最新规范，与这些阶段记录冲突时以本文为准。
