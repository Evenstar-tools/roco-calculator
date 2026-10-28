# Global 运行时数据与显示词库

## 生成入口

```powershell
py -3 -X utf8 scripts/localization/build-entity-catalog.py
node scripts/localization/build-global-snapshot.mjs
```

两条命令均支持 `--check`。先生成显示词库，再生成 Global 数据；构建脚本不会改写国服快照、客户端目录或小程序。

## 计算数据

`data/snapshots/global/s3-midseason.json` 从固定的 `s3-2026-07-15.json` 经现有 `applyS3MidseasonBalance` 补丁得到 S3 季中基线，再接现有 18 属性愿力冲击派生项。版本标识为 `global-s3-midseason-2026-08-13`。共 592 精灵、571 技能（含 18 派生技能）、227 特性。

全部计算名称、描述、数值、类型和规则保持基线中文；实体 ID 统一加 `cn-placeholder:`，以保持早期 Global 配置引用兼容，`reference.sourceId` 保留原始 ID。引用关系一并转换。对外运行时为 `public/data/global-runtime.json`，技能查询目录为 `public/data/global/skill-query/catalog.json`。

常用配置输出到 `public/data/global/presets/pvp-popular-configs.json`。只收录全部精灵、技能及特性引用均存在于本基线的原有配置；排除项记录于 `popular-presets-audit.json`。该配置模板不向快照导入国服 S4 实体或数值。

## 显示词库

`src/data/global-entity-text.js` 只包含正式实体名称、形态、描述及来源状态，不打包完整语言审校表。来源为常驻 `language-table.csv`；本表的 18 属性愿力冲击名称及描述已从 `client-wish-power.json` 补入，按属性、类型、威力 80、能耗 2、伤害规则核对，仅用于名称映射和显示，不覆盖计算数值。`client-display-traits.json` 保留早期非计算占位目录所需的两条原生特性来源。

显示接口位于 `src/runtime/global-entity-localization.js`：

- `localizeGlobalCatalog(snapshot, locale)`：按快照和语言缓存的显示副本。
- `localizeGlobalSpirit/Skill/Trait(entity, locale)`：控件显示投影。
- `getGlobalEntityText(kind, entityOrId, field, locale, fallback)`：ID 查词。
- `getGlobalEntityTextByName(kind, chineseName, field, locale, fallback)`：只在同名记录译文一致时返回译文。

Global 正式快照中的精灵特性严格依照其 S3 `traitIds` 显示。切勿将显示投影送入计算引擎。国服快照不会被这些接口翻译。别名与搜索文本保留中、英、日名称，切换语言不改实体 ID。

官方缺失的 30 个形态标签使用相同中文形态已核实译法，或 `project-form-labels.json` 中的项目描述；已填回主表并标记 `manual_reviewed`，生成词库标记 `project_reviewed`。没有正式名称的非 S3 实体标记不可新增选择；不猜测名称。S3 本基线所有实体均有正式名称。

`s3-display-overrides.json` 记录三个源文/基线差异的显示校订：做好事英文受益方、光度换算日文数值、整点报时中文新增限制。主表以 `display_override` 独立行保留校订文本，原始官方记录及客户端文本保持原样。生成词库按主表读取校订。留学生的 S3 描述为空，显示原生正式描述；不添加或改写引擎规则，这一基线缺口单独记录。

## 定向验证

`tests/domain/global-s3-runtime.test.js` 覆盖全量 S3 数据及引用保持、三语显示与计算分离、选精灵后的四技能/特性/能力面板/伤害、愿力前缀、常用配置过滤，以及孢子、撒娇、光度换算在原始 S3 与 Global 前缀版本中的结算一致性。历史未定版 Global 草稿继续由旧占位测试覆盖。

## 独立赛季机制

生成实体显式携带 `calculationRuleset: s3-midseason-2026-08-13`，共享引擎据此读取 S3 的条件威力、连击、降费、能力变化和异常层数。国服默认分支保持现有 S4/S5 行为。`tests/domain/global-s3-rules.test.js` 以 S3 原文独立数值验证这些规则，不能用“同一最新版引擎处理两份 ID”代替赛季机制校验。雷暴继承超导降费也随 S3 采用 -1。
