# 伤害计算过程表述与同版本发布 · 2026-10-08

## 范围

用户确认优化公式表述，并要求推送Web、Release及小程序。沿用网页／桌面2.2.5、小程序1.1.19；只修改展示与对应回归，不修改计算核心或历史标签。原有AGENTS.md改动保持不动。

## 展示与兼容

- 静态威力用真实值摘要；百分比加成从计算记录中的真实基数展开，顺风、雨天等在同区相加。未取整数只有与真实取整结果相符时才展示。
- 显示威力明确向下取整和克制倍率；没有后续倍率时不重复显示相同整数。单段总伤害只保留合计与段数，固定加成、多段、最终倍率和独立追加继续呈现。
- 手动显示威力不再重套自动来源。旧记录缺少步骤时用箭头连接已确认数值，不拼出虚假的等式；缺威力基础不把攻击面板变化当作固定威力。
- 保留伤害分子的四舍五入及除防御后的向下取整。每段伤害仍读取原计算记录，未更改威力或伤害数值。

## 本轮验收

相关组件、旧记录、手动输入和发布关键回归通过；独立工作树链接依赖的WASM读取使用已有本机验证配置，未改变产品安全设置。旧高级摘要断言仍要求无效雨天出现，已按现行“仅展示有效天气”规则纠正，并保留反向水系生效检查。

生产构建、共享核心镜像、数据及体积门禁通过，关键浏览器链路通过。最终Web入口为main-BpJQfLpE.js，核心仍为calculator-core-BlG6b2YZ.js。桌面、390竖屏亮暗、手动静态／显示与克制分支均由真实浏览器操作并读回截图。画面位于output/playwright/formula-wording-20261008。

微信开发者工具原生390逻辑视口验收通过：合法沉溺配置顺风与雨天后247.5→247、伤害196；原位手填显示123后不重复加成、伤害97；普通单段与末尾取整正确。全wx存储测试前备份，finally恢复并重启读回一致。报告为artifacts/formula-wording-20261008/native/native-formula-report.json；这是原生开发工具验收，不是真机测试。

## 平台状态

微信官方CLI已上传同版本1.1.19开发包，使用当前网页核心2.2.5；本轮成功回执artifacts/formula-wording-20261008/miniapp-upload-result.json已读回。未提审或正式发布。

源码9babaaf已推送main；[发布检查](https://github.com/Evenstar-tools/roco-calculator/actions/runs/37796117980)的validate、miniapp与e2e全部通过。[Web](https://rococalc.top/)自动部署后，由独立浏览器在1920与390视口回查真实公式、伤害和换行；线上入口main-BhHlyj25.js、样式main-BKFk2-W6.css，核心仍为calculator-core-BlG6b2YZ.js。线上截图为output/playwright/formula-wording-20261008/online-1920-light-verified.png与online-390-light.png。

[v2.2.5 Release](https://github.com/Evenstar-tools/roco-calculator/releases/tag/v2.2.5)已替换同版本Windows安装包；仅保留本轮版本化附件RoCo-Calculator-2.2.5.exe，asset ID 622125886，138903618字节，发布页与展开附件入口均已读回。按正式附件名重新下载后，与本地最终包逐字节一致；未移动v2.2.5历史标签。旧同版本安装包保留在installers/v2.2.5/previous/洛克计算器-2.2.5-a117bae.exe，最终包归档到installers/v2.2.5/洛克计算器-2.2.5.exe。安装包内资源核对及独立离线启动通过；安装包未签名，未执行完整安装流程。不主动生成额外交付校验清单。
