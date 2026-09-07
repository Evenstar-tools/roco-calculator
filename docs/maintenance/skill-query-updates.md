# 技能查询数据维护

## 更新 S4 内容

沿用现有数据维护流程更新 `data/snapshots/current.json` 中的技能、精灵和学习关系，然后运行 `npm run data:skill-query`。开发启动和 Web 构建的 `data:runtime` 已包含此步骤，无需改查询 UI。线上仍需正常提交、部署，正在打开的旧网页需要刷新，不是实时读取飞书。

生成资源：`public/data/skill-query/catalog.json`。映射报告：`output/skill-query/data-report.json`。未知能耗/威力保持 `null`，不要填零占位；真实零值会显示为零。

技能归属赛季使用 `data/skill-query/bwiki-seasons.json` 中 BWIKI 技能栏 `data-param6` 字段，优先于旧 S3 表。运行 `node scripts/import-skill-query-seasons.mjs` 可全量重新读取并生成带修订号、抓取时间、哈希的记录；缺失字段、来源冲突或基线技能未覆盖时阻止写入。变更清单位于 `output/skill-query/season-audit.json`。S4 新技能尚未出现在本次 BWIKI 553 条列表中，继续使用快照首次收录赛季，不伪称已经从 BWIKI 核实。

普通查询顶部为“所属赛季”筛选，默认全部赛季；“赛季新技能”按技能归属筛选，未保存 S2 快照也不影响列出 S3 的 57 个新技能。“老精灵新学”才使用相邻快照比较。菜单入口为配置组最后的“技能检索”。

家族代表改为最早可学习形态，不能学的幼体不作为代表；途径筛选后按匹配形态选代表。页面内缓存预取结果，菜单打开时预取代码与资料；重新打开无需重复下载或解码，失败可重试，网页刷新后重新获取。

## 新增后续赛季

先冻结上一赛季快照，将 `data/skill-query/seasons.json` 中上一赛季的路径指向冻结文件，再追加新赛季和快照路径，并设置 `currentSeason`。清单按时间从旧到新排列；界面对比所选赛季与其前一赛季，自动区分新技能、老精灵新增学习关系，不将新精灵计入老精灵新增。

稳定保留精灵和技能 ID；同名不等于同一身份。已有技能的首次赛季沿用最早记录，不会随着选择新赛季改变。

## S3 基线及来源边界

用户提供的飞书 S3 表 revision 610 已完整读取 553 个技能，规范化源文件为 `data/skill-query/s3-source.json`。重新导入命令：`node scripts/import-skill-query-source.mjs <完整的飞书读取结果.json>`；输入必须为包含完整 annotated_csv 的结果，不能截断。

该表与历史快照存在 292 条缺失关系，查询生成器将其补入基线及后续赛季，防止误报为 S4 新学。不修改伤害计算器快照。查询学习面包含不同进化形态，因此数量可能大于源表只列基础形态的数量。获取途径合并保留源表与快照信息。

这是历史关系持续有效的口径：如果正式公告明确删除某个技能或学习关系，必须同时修订该补充策略，不能仅从当前快照删掉关系。生成器遇到未知技能、精灵身份或重复赛季会直接报错。当前未实现移除关系展示。

技能详情使用所选赛季项目快照，提供对应 BWIKI 链接；本轮不是全量实时 BWIKI 复核。32 条 S4 老精灵新增关系已与仓库内赛季公告补丁逐条核对，未收录的资料不视为不能学习。

## 验收与回退

运行 `npm run data:skill-query`、`npx vitest run --config config/vite.config.mjs tests/domain/skill-query.test.js`、`npm run e2e -- tests/e2e/skill-query.spec.js`。端到端测试包含构建、320/390/1440 像素、暗色、失败重试、无结果、赛季切换与关闭后保留计算器配置；截图仍须实际读回。

面板按需加载，只读取资料，不写计算器配置。回退本功能只撤销 App/菜单入口、`src/features/skill-query`、生成与导入脚本、查询资源和 package 脚本接入。不要回退同工作区的手机身份标签、特殊速度及其他用户改动。
