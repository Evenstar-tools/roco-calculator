# 英文搜索入口与后续语言适配 · 2026-10-08

## 目的与范围

让搜索 Roco Kingdom 伤害计算、PvP 配置、队伍搭配和属性克制的英语用户找到可读说明，并能进入现有工具。本次新增 `/en/` 英文使用说明，完整对应 `/guide/` 的三步骤、六工具、五 FAQ；未翻译计算器本身或精灵数据，未声明国际服计算兼容。

英文页有独立 canonical、英文标题/摘要、WebPage 结构化信息。中英文说明互设 `en`、`zh-Hans`、`x-default` 语言版本，默认指向中文说明。中文计算器首页与电鹿页仅提供英文说明链接，不作为已翻译的英文应用语言版本。站点地图收录四个真实页面，不为工具箱内面板造 URL。

## 官方核词与搜索意图

核验日期：2026-10-08。来源均为游戏官网、发行工作室或官方 Steam 页面，不以玩家社区翻译替代官方名称。

| 中文概念 | 本次英文 | 依据与边界 |
| --- | --- | --- |
| 国际版名称 | Roco Kingdom | [国际官网](https://rocokingdom.com/)、[Morefun Studios](https://morefunstudios.com/)、[官方 Steam 商品页](https://store.steampowered.com/app/4821880/Roco_Kingdom/?l=english)当前均如此命名；主标题不附加 World。 |
| 洛克王国：世界 | Roco Kingdom: World | 仅作为国服游戏名的既有英文表述在介绍中出现一次，不取代当前国际正式名。 |
| 精灵 | Jini / Jinies | 官方 Steam 正文分别使用单复数，全文统一。 |
| 技能 / 特性 | skills / traits | 对现有工具的通用功能说明；尚未证实国际版菜单字段的正式定名。宣传中的 skill traits 和 move 不足以建立完整官方 UI 词库。 |
| 属性克制 | type matchups | 面向工具用途的解释用语；官方宣传使用 elemental matchups，未取得完整属性名称表。 |
| 个体 / 性格 | individual stat values / personality | 解释国服现有参数，不声称是国际版菜单定名。 |
| 电鹿斩杀线 | KO threshold tool | 按工具用途命名，保留带语言标记的中文真实入口；不臆造精灵官方英文名。 |

围绕 `Roco Kingdom damage calculator`、`Roco Kingdom PvP calculator`、`Roco Kingdom team planner`、`type matchups`组织自然内容。这些是根据产品用途推定的搜索意图，**未取得搜索量或排名数据，不称为高流量关键词**。

[官方国际测试 FAQ](https://store.steampowered.com/news/app/4821880/view/710032620636866293?l=english)提示测试文本、本地化和平衡可变化。未找到官方国服/国际服数值与规则对照；没有证据证明完全相同或不同。首屏、摘要和 FAQ 明确 China-server S4 data 以及 international-server stats and rules have not been verified，不把英语说明误称为国际服计算器。

语言 URL 与对应版本链接依据 [Google 多语言网站指南](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)；正文与导航采用英语，中文只保留实际 UI 标签及国服原名，并标注 `lang="zh-CN"`。页面无需 JavaScript，不新增埋点或第三方资源。

## 下轮完整英语适配的交接

1. 使用现有精灵、技能、特性的稳定 ID 建立官方英文名映射，记录来源与确认状态；未知名称保留原名，不根据中文自造“官方”词。国际版发布或测试资料变化后重新核词。
2. 抽离真实应用界面文案，再接入语言切换与分享/错误提示。正式英文计算器拥有对应独立 URL 后，才与中文计算器互设语言版本；本次 `/en/` 始终是说明页。
3. 先取得国际版规则、数值和实测样例，核验计算结果，再决定是否提供国际版数据。语言翻译与服务器规则兼容分别验收。

## 验证与发布状态

- 基础译文校对已完成：中英结构与能力范围对齐，Jini 单复数统一，中文仅出现在显式语言标记内，HTML/JSON-LD 可解析，无未替换占位符。独立复核修正了“防守抗性”的英文范围，保留抗性与弱点两项。
- 未宣称完成国际版官方词库或逐句深度 LQA；当前基础校对对应本次网页范围。
- 本地验证：SEO/发布说明专项回归通过，完整 `npm run build` 门禁通过，中文说明的 320px 深浅色无 JavaScript 阅读/FAQ/返回入口与抓取文件回归通过。英文生产页桌面、实际 760px/320px 宽度无横向溢出，FAQ 可正常展开；桌面实页截图保留在 `artifacts/seo-20261008/english-desktop.png`。
- `npm test` 中四个既有套件因 node_modules 指向本机共享依赖目录，被 Vite 文件访问边界拒绝加载；其余套件通过。仅用忽略目录 `.tmp/seo-local-validation.config.mjs` 明确允许本机测试依赖路径后，这四个套件全部通过；未改产品或提交测试环境配置。
- 公网部署、语言切换和 Google 提交状态将在实际验收后追加，不以准备文件代替上线成功。
