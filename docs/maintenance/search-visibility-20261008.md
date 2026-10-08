# 网站与仓库搜索可见性优化 · 2026-10-08

## 目的与范围

用户搜索 `roco kingdom calculator`、`roco calculator` 和“洛克计算器”未看到本项目。此次改进官网与唯一公开仓库 `Evenstar-tools/roco-calculator` 的真实品牌、功能文字和相互关联，同时核实 Google 收录；不以标签修改或请求已受理承诺排名。

开始前将工作树从 `7d702b4` 快进到当时最新 `origin/main` `a117bae`，保留其他任务已发布的 2.2.5 雨天与手机优化。仅发布 Web 与仓库内容，不重打 Windows、不改小程序、计算公式、RUM 或付费服务。

## 本次实际诊断

- 2026-10-08 本机官方 URL 只读 HTTP 检查：首页、`/robots.txt`、`/sitemap.xml`、`/en/` 均 200，分别为 HTML、text/plain、application/xml、HTML；未见 X-Robots-Tag 限制。有效 robots 允许抓取，站点地图四个规范 URL 可解析。该检查不冒充 Googlebot 结果。
- 当前 Search Console 已验证属性 `https://rococalc.top/`，沿用已授权账号。首页网址检查明确“网址已收录到 Google”；Googlebot 智能手机版上次抓取 2026-10-08 15:21:37，抓取成功、允许抓取及索引，Google 选择规范网址为所检查首页。
- 英文 `/en/` 网址检查也已确认“网址已收录到 Google”；Googlebot 智能手机版上次抓取 2026-10-08 15:51:47，抓取成功、允许抓取及索引，Google 选择规范网址为 `/en/`。早先英文说明未收录的记录现已过时。
- 首页引荐来源为 `https://shiny.momolab.cc/pages/toolbox.html`；未检测到引荐站点地图。此真实引荐说明站点已通过外链被发现，但不能推断具体搜索词排名。
- 站点地图报告仍“无法读取此站点地图”、发现网页 0，读取日期 2026-10-08；无更具体 HTTP 错误提示。索引汇总仍“正在处理数据，请过 1 天左右再来查看”，不是确认全站零索引。
- 第一次首页检查长时间等待后取消；从网页索引报告再次查询最终获得上述首页收录结果。没有实际登录失效。
- 本次 Chrome 实际 Google 查询 `roco kingdom calculator` 第一页已经展示 `https://rococalc.top/en/`，标题仍为上一轮 Roco Kingdom Damage Calculator Guide。查询环境提示香港与个性化结果，不能称全球固定排名；这是本轮新源码发布前的事实，不将其归因为本轮改动。`roco calculator` 与中文词尚不据此确认。
- 用户截图仅证明其当次查询结果未展示本项目；不能据此断言全站未收录，也没有可靠关键词搜索量、全地区排名数据。

## 改动

- 网站首页与电鹿页同步初始及路由运行时标题、摘要、社交摘要、真实 WebApplication 与 WebSite，统一 RocoCalc、洛克计算器、Roco Calculator 的品牌关系及唯一仓库。
- 双语说明标题、正文与结构化信息保持一致，补充源码/规则/反馈入口；英文自然说明 Roco Kingdom calculator 的伤害、队伍与属性用途。保留中文 UI、国服 S4、国际服数值与规则未验证的边界。
- 不新增关键词页、不使用关键词堆砌、伪造评论/评分或无效 FAQ 富结果。
- README 中文保留实用内容并补齐双语导航与可点击官网入口；新增英文 README，补齐真实功能、运行方式和限制，数据计数与当前 CLI meta 的 622 形态、581 技能一致。
- GitHub description 已改为自然中英介绍；homepage 保持 `https://rococalc.top/`；保留原有技术主题，增补 roco-calculator、roco-kingdom-calculator、team-builder、game-tools。API 写后回读一致。

## 核验与上线

- 数据校验、生产构建（包含验收矩阵、当前共享核心、运行数据、资料绑定及体积门禁）通过。
- 定向 SEO 测试与本机当前关键单元/集成门禁通过；本机使用既有 `.tmp/seo-local-validation.config.mjs` 扩展依赖 junction 的文件读取范围，不修改正式门禁。
- 使用本次唯一构建运行当前发布 E2E：包含抓取文件、双语指南无 JavaScript / 明暗主题 / 320px阅读与跳转、离线、计算与查询关键链路，全部通过。
- `git diff --check` 通过；源码、README 和用户日志写后已读回。公开部署、CI 与 Google 新内容验证另记以下。

## 来源和证据

- 当前收录证据：`artifacts/search-visibility-20261008/google-home-index-before.txt`、`google-home-index.png`。
- 英文收录详情：`google-en-index-before.txt`；目标词第一页面展示：`google-roco-kingdom-query-before.txt` / `google-roco-kingdom-query.png`（均在本轮证据目录）。
- HTTP 初始响应：`artifacts/search-visibility-20261008/http-before.json` 及对应正文。
- 仓库元数据回读：`artifacts/search-visibility-20261008/github-metadata-after.json`。
- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google site names](https://developers.google.com/search/docs/appearance/site-names)
- [Ask Google to recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [GitHub repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

## 后续判断

首页与英文说明索引已存在，短期应观察新内容的 Google 真实抓取结果、关键词曝光与位置。重复请求不保证更快；不将更改当天的搜索结果当 SEO 最终效果。站点地图读取状态待 Google 报告更新后再判定，不为无证据的 CDN 拦截猜测关闭安全防护。
