# 项目中英日语言表

**常驻维护入口：[language-table.csv](language-table.csv)。** 按稳定key维护，每个单元格只保存一个场景下的译文。CSV为UTF-8 BOM，可在Excel中筛选；也可直接用文本编辑器修改。

当前正式译文来自国际客户端 **1.61.0.91**。本目录统一收纳精灵、形态、介绍、技能、特性、机制说明、界面术语和项目文案。国服S5预览文本独立标记为`cn_preview`，不推定国际服开放状态。旧提取结果继续作为来源证据保存在`data/research/global-client-20261028/`，日常维护只改本目录主表。

## 文件用途

| 文件 | 用途 |
|---|---|
| [language-table.csv](language-table.csv) | 唯一手工维护表 |
| [language-table.json](language-table.json) | rows保留主表原文，plainByKey另存去富文本后的中英日；供脚本查词，不直接改 |
| [待补与复核.csv](待补与复核.csv) | 空译文、旧译待审、多义词、源文变化、缺少中文源等问题，一条问题一行 |
| [coverage.json](coverage.json) | 最近同步的覆盖范围与检查摘要 |
| [sources.json](sources.json) | 每个key的原来源、生成基线、客户端版本、原表索引及项目旧译证据 |
| [source-config.json](source-config.json) | 当前采用的客户端研究资料与项目数据入口；换客户端时更新这里 |
| [ui-source-inventory.json](ui-source-inventory.json) | 当前词典定义覆盖链、静态漏键、未接t的可见文本和未解析动态调用 |

Global 显示层已按 ID 使用本表生成的小型实体词库，完整审校表不会打包进页面。计算使用独立的 S3 季中中文快照与赛季规则；显示译文不会覆盖计算名称、描述或数值。生成顺序、API 与规则边界见 [runtime-data.md](runtime-data.md)。界面文案仍由项目 i18n 模块提供，本表收录当前定义以供维护和查漏。

## 关键列

- `key`：稳定主键，禁止随意改名。实体含类别、游戏ID和字段；无正式ID条目用项目ID；原生术语用表/行/字段或locres namespace/key；界面用完整中文i18n键；概念包含场景和中文标签。
- `zh`：当前译文对应的源中文；有正式客户端来源时为客户端中文。无中文源时留空。
- `zh_project`：当前项目使用的中文，可与`zh`不同。**国际服英文/日文对应`zh`，不自动视作国服`zh_project`的翻译。** 两版描述不同会列入复核。
- `en`、`ja`：译文。保留官方富文本、占位符、大小写和标点；缺失时为空，不能用中文或拼音填充。
- `en_status`、`ja_status`：各语言来源/审核状态，见下表。
- `review_status`：整行的语境状态；`source_verified`只表示来源已核，不表示机制数值或开放状态已核。
- `source_ref`、`context`、`notes`：准确来源、使用场景和维护说明。手工确认的译文必须填写notes。

| 语言状态 | 含义 |
|---|---|
| `client_verified` | 与所列客户端原文逐值一致 |
| `client_issue` | 客户端自身存在占位/异常原文，待处理 |
| `project_existing` | 项目原有译文，尚未确认为正式译法 |
| `missing` | 缺失，译文列应为空 |
| `draft` | 人工候选，尚未确认 |
| `manual_reviewed` | 已按语境人工确认，notes写清依据 |

整行`review_status`允许：`source_verified`、`needs_context`、`needs_review`、`source_issue`、`missing_client`、`missing_zh`、`cn_preview`、`manual_reviewed`。具体含义写在notes及复核表中；完成手工审核时更新语言状态和整行状态，不能只填文字而保持missing。

## 查词、补缺与同步

在项目根目录执行，Python只使用标准库；读取现有界面词典需要Node.js。

```powershell
# 按中文、英文、日文、游戏ID、项目ID或来源键查询
py -3 -X utf8 scripts/localization/language-table.py find "物攻"
py -3 -X utf8 scripts/localization/language-table.py find "200312"

# 查仍需处理的条目；limit控制返回条数
py -3 -X utf8 scripts/localization/language-table.py find --needs-review --limit 30
py -3 -X utf8 scripts/localization/language-table.py find --group ui_missing

# 只读检查主表、当前来源与JSON导出是否一致
py -3 -X utf8 scripts/localization/language-table.py check

# 补入来源清单新增的key，刷新JSON、来源和缺口表
py -3 -X utf8 scripts/localization/language-table.py sync
```

日常顺序：查词/缺口 → 核对来源及上下文 → 修改CSV中的译文、状态和notes → `sync` → `check`。手工改写过的译文不能继续标为`client_verified`；有新官方依据时先更新来源材料，再逐项确认主表。

`sync`只追加新的key，**已有行的所有单元格保持不变**，所以重跑不会清掉手工翻译。源中文或国服对应文本变更会列入复核；已标官方的译文与新源不符时，更新问题报告并停止写主表/JSON。来源中消失的旧key保留，待人工确认是否归档，不自动删除。手工处理后再次同步即可。

检查结果区分：

- `errors > 0`：重复键、列错位、官方来源不一致、确认译文丢占位符、空值状态矛盾或JSON未同步，需要处理。
- `needsReviewRows > 0`：已登记的翻译缺口或语境问题；不是丢行，也不等于基础校验失败。

## 覆盖与使用边界

- 当前国服正式实体、桥表缺席的“降雨/午夜爆音”、运行时追加的18个愿力冲击都登记。愿力冲击已按本机客户端属性与技能类型补入正式 ID 和三语文本，源文在 `client-wish-power.json`；其他无正式国际 ID 的条目保持待核。
- 同一项目特性对应多个游戏ID时保留各ID，不能按中文名称去重。
- 官方精灵名、形态、介绍、技能/特性说明和背景文案分字段保存；原始可选字段为空时不凭空补出。国服有形态词而客户端 form 为空的 30 项已按其他实体的官方同名形态或 `project-form-labels.json` 补译，主表标 `manual_reviewed`，运行时标 `project_reviewed`，不冒充该实体客户端原文。
- 属性全称/简称、六维、玩家性格、战斗天气与机制词按原生来源键保存。`普通`属性和无修正性格、`Priority`和速度决定的先行动、`Close`和开关关闭保持各自语境。
- i18n键使用当前`src/i18n/messages.js`实际合并结果；重复定义的全部模块来源保存在sources.json，旧译不冒充官方。
- `ui_missing`收录已调用t/translateUi但未登记词典的静态中文；`ui_visible`收录未登记的可见JSX文本与title/placeholder/aria-label。后者可能是句子片段，按文件和语境保留，不自动按同词套译。收集器使用项目现有`@babel/parser`，需先安装项目依赖。
- 已登记但未包t的可见文本、动态变量/模板/拼接调用另列在ui-source-inventory.json；需结合真实页面检查。静态盘点不等于全运行时覆盖。历史扫描条目继续保留，已移除或已改造的来源会显示 `not_in_current_inventory`，不作为当前漏译统计。
- 英日已有、中文未恢复的抗性方向标签保留空中文；不通过反译伪造源文。
- S5精灵、专属技能及公告文本只是项目待译清单，本任务没有继续开发S5或改变预览功能。

原生界面中未纳入当前项目所需词的完整查阅库、内部/占位条目仍在[研究资料入口](../../research/global-client-20261028/ui/README.md)，不把客户端全部剧情文案自动塞进日常主表。

维护逻辑回归：

```powershell
py -3 -X utf8 tests/localization/test_language_table.py
```

该检查验证保留手工值、增量补行、源文变化、占位符和 CSV 读回；正式客户端原文与项目语境审核分别记录，结构通过不等于全部待审译文已完成逐句校对。

`s3-display-overrides.json` 记录 3 项有证据的 S3 显示校订，主表独立放入 `display_override` 组并标 `manual_reviewed`。对应正式原文行保持原样。显示词库读取主表的校订行；后续维护仍以本表为入口，不能改原文并继续标为 `client_verified`。
