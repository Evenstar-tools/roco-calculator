# 国际服网页发布 · 2026-10-28

## 本轮授权与产物

用户明确授权移除 CBT、检查多语言与功能后发布 `/en/` 和 `/jp/`，数值采用 S3 季中。

- 国际服源码：`61446db1c2c7b18b3bd9862b41e23720ed3d46e6`，分支 `codex/s5-plan-20261022`。
- 发布数据与规则：`global-s3-midseason-2026-08-13`；592 精灵、571 技能（含18愿力派生）、227 特性。
- 固定源码组合构建：`config/global-release.json` + `scripts/build-global-release.mjs`；代码与数据在 `/global-assets/`，入口为 `/en/`、`/jp/`、`/global/zh-CN/`，保留 `/global/ja/`。
- 正式国服与现有 `/pre/` 数据、核心和版本 pin 保持，国际服显式选择，不启用地区自动分流。本轮无小程序变更。

## 验收

- S3 源数据生成检查、独立规则分支与真实物理/魔法攻防数值检查通过；修正10项S4硬编码及连带超导规则。新增规则采用实体显式 ruleset，不替换CN行为。
- 英日中切换保留配置与伤害；592精灵正式名称覆盖；原始规范ID独立于界面译文。主表在源码分支 `data/localization/global/`，可持续查缺。
- 主界面、四技能、特性、技能和属性查询、传动、速度与耐久榜、电鹿、队伍、配置库、分享、迁移及服务器隔离回归通过。
- 英日1440px桌面与390px手机实际渲染检查；修复Class/Cost挤压、抗性标签遮盖、结果列裁切与电鹿“精灵预设”漏译。
- `npm run build` 通过：acceptance/core-current/data-bindings/performance 和固定源码组合构建。
- 正式发布树 release 单元回归通过；旧 `/global/ja/` canonical 断言改为 `/jp/` 后定向复验通过。
- `E2E_PREBUILT=1 npm run e2e` 通过，包含国际服英→日、刷新、离线仍为23伤害，国服核心与查询回归。
- 组装脚本对缺manifest、跨目录资源、链接目录先失败；夹具验证根入口及 `/pre/` 文件未被Global复制改写。

## 已有机制边界

沿用当前工具能力范围。蓄能轰击的普通技能历史降费、赤子之心全技能降费、留学生全技能加费仍未自动建模；本轮未按猜测新增机制。传动工具中原有不支持项保留真实说明。

## 上线回查

正式推送后回查 `/en/`、`/jp/` 的真实资源、版本、选择精灵及伤害；未回查前不把构建通过当作上线完成。

### 首次线上回查

正式入口发布提交 `00e28579e2f42c904e1becffd7e23bf6b7032eda` 已回读 origin/main。2026-10-28 17:05 后普通地址 `/en/`、`/jp/` 返回200，均引用 `/global-assets/assets/main-DVeFK8BR.js`，运行数据版本正确。

线上实测：Dimo→Meodow / Flash 为23伤害；切到日文并刷新，ディーモ与ニャジカル及23伤害保留；390px页面无横向溢出；继续切到国际服中文，名称和配置保留。页面可见文本未出现 CBT、Unverified、CN reference、翻訳未対応。

国服运行数据仍 `s4-2026-09-10`，`/pre/` 仍为本轮发布前 `/pre/assets/main-BhTCj6EQ.js`。截图保存在源码工作树 `output/playwright/global-localization-20261028/live-en.png`、`live-jp-mobile.png`。

最终接入复查发现并修复国服旧分享解析器拒绝正式Global配置：仅允许与固定Global数据、规则版本一致的分享信封用于切服提示，保留国服计算/导入边界。协议、入口、Node22直接导入及ESLint通过；生产构建和原pin组装成功；真实E2E确认Global分享→CN切服提示→/en/恢复配置，CN原配置与隔离存储保持。该补丁随本次追加发布。首轮线上提交的远端CI已通过。

### 跨服分享线上回查

追加发布 `94c95c75767c171a4afed18c5ccdf090ead822e0` 已回读 origin/main。2026-10-28 17:20后国服加载 `/assets/main-DTxH16pE.js`，真实Global分享在CN显示“这份分享配置属于国际服”；点击“在国际服打开”进入 `/en/`，Dimo、Meodow、Flash与23伤害恢复。

### 窄屏译文收尾

线上实测发现响应式CSS伪元素固定中文，补齐耗能、属性、威力、连击、迸发提示与上次有效结果；源码pin更新至 `90b64bf3e25c2fbe6c19fe34d644e542093930d6`。中文→EN→JA切换保留手填威力的定向回归、既有手机/雷暴回归、ESLint和语言表检查通过。上轮跨服分享补丁的完整远端CI通过。

最终组合构建通过；英日切换、刷新、离线、跨服分享定向E2E通过。新增真实浏览器伪元素检查，320px/390px均无横向溢出，Common保持完整单行。390px截图人工读回通过，路径为源码工作树 `output/playwright/global-localization-20261028/en-mobile-labels-final.png`。

### 最终线上验收完成

发布提交 `de6ca146b72f9a7068a7adf0a3728f46ba1f9664` 已推送并回读origin/main。2026-10-28 17:30后普通 `/en/`、`/jp/` 均引用 `/global-assets/assets/main-BCKZdSXO.js`；线上390px实测英文Cost/Power/Combo、日文コスト/威力/連撃正确，日文刷新保留ディーモ与23伤害，无横向溢出、CBT或旧核验提示。最终远端CI全部成功：https://github.com/Evenstar-tools/roco-calculator/actions/runs/40664374473 。

线上数据仍为 `global-s3-midseason-2026-08-13`，国服 `s4-2026-09-10` 与原 `/pre/assets/main-BhTCj6EQ.js` 保持。最终真实手机截图在源码工作树 `output/playwright/global-localization-20261028/live-en-mobile-final.png` 和 `live-jp-mobile-final.png`；桌面截图为同目录 `live-en.png`。本线程验收浏览器已关闭并回读列表为空。该段为发布后本地证据，不为追加记录再次推送。

### 多语言接续与国服赛季装扮

本轮用户明确授权两者一起上线。Global源码固定至 `e1e55f89f9be3f151e585e52b2150a61160423a0`，保持S3季中数据；CN正式版、原 `/pre/` pin、小程序均不改。

- 补齐攻防特性原实体引用、正式形态名、速度候选及搜索、技能习得方式、传动记录和承伤Markdown/XLSX导出的英日显示；修正Global ID导致的最终形态筛选漏项。导出数值与中文结果一致。
- 国服S1–S5既有装饰、招牌精灵及明暗配色共享到Global，新用户默认S3；旧显式无装饰选择保留。主题、随机和经典配色按服务器独立保存，语言切换保留配置。
- 实际检查929px五主题、1280px英文四技能、390px日文主界面与设置；随机刷新换主题，切语言保持当前主题和23伤害。英文Class宽度修正后Common不折词。截图在源码树 `output/playwright/global-themes-localization-20261028/`。
- 全S3实体和特性显示、工具导出、形态映射、天气差异、主题存储等定向回归通过；ESLint、语言表同步与检查通过。正式客户端原文行保留，项目语境译文单独维护。

组合构建、生产包E2E与线上回查在下方接续记录。

生产组合构建、release单元回归和全部发布E2E通过。新增E2E在真实Global包检查默认S3、切S5后英日切换/刷新/离线保持主题与23伤害，并检查1280/390/320px英文Common不折词。生产预览速度榜恢复普通最终形态、英文Profile分隔符正确。正式推送后继续回查公网。
