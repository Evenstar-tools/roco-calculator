# 品牌搜索与可复现指南示例 · 2026-10-09

## 目标与授权

用户反馈普通 Google 搜索 `roco calculator` 与 `洛克计算器` 整页未出现官网，并在本线程批准“处理”前述针对性方案。目标是让已有页面更清楚地说明品牌、用途和真实操作结果；不把 Search Console 已收录当作这些词的搜索命中。

沿用 `codex/seo-20261008` 工作树，开始前从 `origin/main` 快进至 `ded6899`。公开维护与发布目标仍为 Evenstar-tools/roco-calculator。本轮仅 Web 和仓库内容，沿用 2.2.5，不恢复已删除的启动介绍页，不修改计算规则、数据、采集、云函数、费用或其他平台发布。

## 实现

- 首页 title、Open Graph、Twitter 及运行时标题统一为“洛克计算器｜洛克王国：世界 PVP 伤害计算与配队”。页面内品牌及现有工具保留，空 root 和直接进入计算器的行为不变。
- 英文静态指南 title 与分享、WebPage 名称统一为“Roco Calculator — Roco Kingdom PvP Guide”，主标题及计算入口体现同一品牌。它仍是英语操作说明，计算器界面和精灵资料为中文，国服 S4 与国际服未验证的说明保持可见。
- 中英指南新增 `#example-heading` 案例，列双方精灵、特性、等级、性格、个体、HP、战斗条件、两招伤害与能耗，给出结果解读和真实画面。目录链接与中英 README 均能直达本例；不另建关键词页面。
- 宽屏结果并列，320px 逐项堆叠；图片按真实1265×712比例显示，约99KB、延迟加载，可打开原尺寸，不增加说明页脚本或采集。
- 中英 README 提供同一实例与官网入口，英文标题采用自然的 Roco Calculator 品牌。GitHub About、官网字段和现有主题已满足关联用途，本轮不重复堆标签。

## 数值依据与验证边界

按项目 `.agents/skills/rock-calculator-cli/SKILL.md` 使用正式 CLI 查询与复算；未将完整数据快照或核心源码用于普通计算。迪莫（最好的伙伴）→水蓝蓝（浸润），双方60级、普通性格、六项个体全60，满HP425/349，没有额外战斗效果。

| 技能 | 基础威力 / 能耗 | 伤害 | 目标HP占比 | 剩余HP |
| --- | --- | ---: | ---: | ---: |
| 闪光 | 60 / 1 | 68 | 19.5% | 281 |
| 光球 | 80 / 2 | 90 | 25.8% | 259 |

两次 CLI 为 exact，无警告；产品2.2.5，数据与规则版本s4-2026-09-10。原始输入、calculate/explain返回和自动生成的inputDigest保存在 `artifacts/seo-targeted-20261009/example-{flash,light-ball}.{input,calculate,explain}.json`。本地真实UI也得到68/90与对应HP；截图使用四技能并列显示，图注明确模式。CLI复用产品核心，这证明本版本输入可复现，不是独立游戏实战校准。

## 验收与生产证据

本文记录内容、口径和验收入口；实际发布回读与时间单独保存在 `artifacts/seo-targeted-20261009/live-readback.json`，不以本地构建代替公网发布。

- lint、现有发布关键单测（包括SEO与用户日志）及生产构建/核心镜像/数据/性能预算门禁通过。仅本地临时配置允许已有依赖junction的真实目录，没有放宽生产配置。
- CLI与真实UI复现，双语静态HTML、canonical、hreflang、标题与schema一致性，以及目录、图片、FAQ与既有入口核对。
- 320px新目录跳转的首轮用例漏等返回目录的视口状态，定位日志后沿用既有等待方法；不为此修改产品行为。受影响双语明暗用例回跑通过，已成功的其他关键用例不重复执行。
- 真实桌面与窄屏图片在 `artifacts/seo-targeted-20261009/` 及 `guide-qa/`；独立复核确认数字、图片与语言范围一致。发现英文配置过密后只精简重复条件描述，不另建布局或交互。

- 首次发布的 Linux CI 发现英文页320px主入口低于首屏，本机Windows未复现；缩短重复的首屏介绍、导航和按钮文案，保留中英文品牌、中文界面及国服/国际服范围说明，未放宽视口验收。最终公网与CI状态仍以上述生产证据文件为准。

## 搜索效果跟进

继续沿用已有每日普通Google搜索监测，分别核验三个原查询词；不把新标题已上线、请求已提交或页面已收录写成词排名已改善。本轮不重复请求编入索引或提交站点地图，不向社区、B站或其他联系人自动发消息。

Google官方依据：[标题](https://developers.google.com/search/docs/appearance/title-link)、[对用户有用的内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)、[可抓取链接](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)。标题可能由Google重新选择，重新抓取和处理需要时间，不能承诺特定排名。
