# 赛季装饰：来源、接入范围与验收

更新日期：2026-10-20。本页合并 10 月 19 日国服 2.2.6 的主题行为与国际版既有素材记录；历史验收不替代本次上线验收。

后续赛季执行流程见根目录 [design.md](../../design.md)，可通过项目 Skill `$roco-season-design` 调用。

本文是赛季装饰的统一维护说明。S1–S3 新背景的完整生成记录另存 [season-imagegen-prompts.md](season-imagegen-prompts.md)；S4 的旧生成记录已在本文保留。素材研究证据为本地 [SOURCES.md](../../output/season-research-20261016/SOURCES.md)，其来源、日期和使用边界在下文摘录，不能只依赖未纳入版本管理的研究目录。

## 1. 功能边界

- 赛季主题只控制图片、装饰和配套颜色，不切换精灵目录、数值、计算规则、服务器或已有配置。
- 国服默认主题为 S4；国际服默认使用中性主题。两服现在均可在显示设置手动选择 S1–S4 装饰，偏好按服保存；主题选择不表示真实赛季或数据版本，不能据此推定国际服首发赛季。
- 本地 `seasonPreview=s1|s2|s3|s4` 用于装饰验收，入口由 `src/theme/season-themes.js` 限定在回环地址；正式入口不得把预览参数当数据版本选择。S1–S3 预览标题需明确“装饰预览”，不能把当前国服数据伪装成旧赛季。
- 沿用计算器现有界面、精简/具体模式与操作位置；不增加宣传横幅。图片不拦截点击，不进入读屏；重要文字和按钮不能压在角色或高对比细节上。

### 国服 2.2.6 与本次整合保留的行为

国服初始与旧值 `default` 均显示 S4，不提供重复的默认选项。切换装饰不改变 S4「季中」标题、游戏数据、伤害规则或用户配置；亮暗模式独立保存。国服不增加切服入口，Global 保留既有三语入口与按服存档边界。

主题下拉旁的交织箭头是持久开关：开启后立即换另一套，偏好保存 `random` 而非本次抽中的主题；每次页面进入时重新抽取，避开上次主题。再点箭头关闭随机并固定当前主题；同页编辑或亮暗切换不重抽。下拉显示“随机 · Sx”，手动选择任一赛季（包括当前抽中的赛季）也会固定并退出随机。Global 临时预览不是已保存选择，从预览开启随机仍执行随机选择。

“计算界面保持经典配色”默认关闭并独立记忆。勾选后计算控件与结果区使用 S4 原有的亮暗基础配色，所选赛季的页头、背景和角色不变；不改变随机模式、输入或计算结果。主题、上次随机主题及经典配色按服隔离，国服继承已有偏好。存储不可用时仍允许本会话切换，但不保证刷新后保存。

手机保留低对比场景，不把大幅角色挤入操作区。宽屏显示各季招牌精灵；电鹿独立工具页继续不使用赛季角色。国服 2.2.6 原验收覆盖 1920px 桌面、929px 窄窗口和 390px 手机，证据在 `output/playwright/release226-20261019/`、`artifacts/cn-release-226-20261019/`；国际入口整合需另做本次回归。

## 2. S1–S3 官方赛季依据

以下均指《洛克王国：世界》国服正式上线后的 2026 年赛季。日期来自 2026-10-16 保存的官方公开页面；页面副本不是更早的互联网历史快照，不推定停机切换的具体时刻。

| 赛季 | 国服时间范围 | 官方名称、发布时间及更替依据 | 代表精灵 |
| --- | --- | --- | --- |
| S1 暗夜拾光 | 2026-03-26 开始；2026-05-21 更替 S2 | [官方 TapTap PV](https://www.taptap.cn/moment/783830735785034123)，原发北京时间 2026-03-19 23:03:30；[S1 继承 FAQ](https://www.taptap.cn/moment/804494041285657619)，2026-05-15 | 龙息帕尔 |
| S2 狂欢怪谈 | 2026-05-21 开始；2026-07-16 更替 S3 | [官方 B 站 PV](https://www.bilibili.com/video/BV1td526HE1G/)，原发 2026-05-14 09:00；[官方 TapTap PV](https://www.taptap.cn/moment/803709038264058143) 的原发时间相同，页面“修改于05/15”不是原发日；[S2 继承 FAQ](https://www.taptap.cn/moment/824058191917616565)，2026-07-08 | 机幕方舟 |
| S3 铅字幻梦 | 2026-07-16 开始；2026-09-10 更替 S4 | [官方 B 站 PV](https://www.bilibili.com/video/BV1FnMG6oEjA/)，原发 2026-07-09 07:30；[官方 TapTap 活动及 PV](https://www.taptap.cn/moment/824256168003111920)，原发北京时间 2026-07-09 12:19:44；[S3 继承 FAQ](https://www.taptap.cn/moment/844222634156624676)，2026-09-02 | 加尔；[官方铅绘棱镜球展示](https://www.bilibili.com/video/BV1wmNH6EEkF/)同时确认加尔家族含黑化加尔 |

研究中已核对 B 站发布者“洛克王国世界”的官方账号简介及 TapTap 原页的 `is_official` 标记。未取得“巡天幻星属于 S3”的官方证据，本轮不采用。

### 官方 PV 封面与自制场景的区别

研究保存的三张原始封面均为 1920×1080 RGB，带游戏 Logo、赛季中文和完整宣传构图。它们作为氛围与配色参考，**不是无字地图或可直接平铺的官方场景层**。

| 赛季 | 官方封面原图 | 本轮背景方向与文件 |
| --- | --- | --- |
| S1 | [TapTap 原图](https://img2-tc.tapimg.com/moment/etag/FpUJDISHgJqR1ZGH8KUOyNGnpon6_20260319230317.jpg) | 冷蓝/蓝紫夜景、建筑水面、星光；`public/assets/season/s1-night-discovery.webp` |
| S2 | [TapTap 原图](https://img2-tc.tapimg.com/moment/etag/FmuquOzTWjXShzk9At1Lz9jVS0Wv_20260513193117.jpg) | 紫红马戏帷幕、帐篷、暖色串灯；`public/assets/season/s2-carnival.webp` |
| S3 | [TapTap 原图](https://img2-tc.tapimg.com/moment/etag/FsNiTj9O41Ukyx_cD9OuLyhHtG3E_20260709120230.jpg) | 书页、出版社、纸片森林与童话气氛；`public/assets/season/s3-storybook.webp` |

2026-10-19 复核：S1 的建筑、水面与星光取自上方官方 PV 封面；生成提示词将其延伸为冷蓝古堡庭院。它没有复刻赛季大厅。重新读取的[官方公告](https://www.taptap.cn/moment/783830735785034123)称大厅为“箱中研究室”；用户记忆中的图书馆与本图不是同一来源层。当前没有取得足以确认书架布局的官方实机帧，不否定用户记忆，也不把自制庭院称为官方场景。本轮展示原封面与自制原稿说明来源，未重新生成背景。

这三张运行时场景均通过内置 **image_gen** 参考对应官方 PV 制作，是自制装饰，不是官方地图实景、原画或官网下载层。角色另行使用透明原图，不由场景生成步骤重绘。已落盘场景为 2000×667 RGB WebP；原始 PNG 留在 `artifacts/season-themes-20261016/source/`。生成提示词见 [season-imagegen-prompts.md](season-imagegen-prompts.md)。已在真实页面核对背景、透明角色和裁切；S1/S2 调整为脸部可辨的缩放与纵向位置。

历史活动页 `https://rocom.qq.com/act/a20260706preview/` 在本次研究时已覆盖为 S4，首屏资源使用 `/20260828/` 路径，不能因 URL 含 20260706 就把它当 S3 原场景。《世界》官网为 `rocom.qq.com`；`roco.qq.com` 当前是旧页游官网，不混用。

### 透明角色图的来源边界

S1–S3 全身图取自《世界》BWIKI 社区镜像。研究已实际读取，三张均为 1024×1024 RGBA、alpha 范围 0–255，不是 128px 头像放大；没有取得更早的官方上传 URL，不能标成“官网直接发布”。导出 WebP 时保留原角色与透明通道，不生成替代角色。

| 精灵 | 页面 | 原图 URL | 研究原文件 |
| --- | --- | --- | --- |
| 龙息帕尔 | [BWIKI](https://wiki.biligame.com/nrc/龙息帕尔) | [透明原图](https://patchwiki.biligame.com/images/nrc/e/eb/2gvw6p16v57af900g7dgc3ekxstyk07.png) | `s1-longxipaer-portrait-community.png` |
| 机幕方舟 | [BWIKI](https://wiki.biligame.com/nrc/机幕方舟) | [透明原图](https://patchwiki.biligame.com/images/nrc/2/22/4a5q5q7324whz660nz4d2lc82gm0fio.png) | `s2-jimufangzhou-portrait-community.png` |
| 加尔 | [BWIKI](https://wiki.biligame.com/nrc/加尔) | [透明原图](https://patchwiki.biligame.com/images/nrc/a/a5/hsvtkoz0139lvgbckbemggqebib02um.png) | `s3-jiaer-portrait-community.png` |

对应运行时角色为 `public/assets/season/s1-longxipaer.webp`、`s2-jimufangzhou.webp`、`s3-jiaer.webp`，已核对均为 512×512 RGBA，与 `src/theme/season-themes.js` 配置一致。使用已有 Chromium canvas 等比编码，只做格式与尺寸转换，不生成式修改角色。透明像素的 RGB 含贴图填色，无 alpha 预览可能出现色块；不能直接去掉透明通道。

研究还保存了 BWIKI 赛季手册背景，但其画面含边框和游戏自造文字，只作配色/纹样参考，不当作无字场景。相关旧资源表的 128×128 头像候选不用于标题区大图。

## 3. S4 既有素材来源与生成记录

S4 主题名为“月涌狂想”，当前国服工具标题使用“S4「季中」”。主题原图延续，不因阶段标题变化伪造一套新素材。

| 运行时文件 | 原始素材与处理 | 来源性质 |
| --- | --- | --- |
| `public/assets/season/s4-moon-night.webp` | 原稿 `moon-panorama-ai.png`，2172×724 RGB；等比输出为 2000×667 WebP | 内置 image_gen 参照 [官方 S4 PV](https://www.bilibili.com/video/BV1notF6GE8F/) 制作的概念装饰，不是官方原画 |
| `public/assets/season/s4-silver-wolf.webp` | 用户原色透明图 `wolf.png`，1032×863 RGBA；等比输出为 486×406 WebP | 用户提供的银月狼王原素材；未重绘角色。另参考 [官方月涌棱镜球封面](https://www.bilibili.com/video/BV11btW6UEEC/) 确定视觉方向 |
| `miniapp/src/assets/season/` 下同名两图 | 与 Web 运行时素材相同的独立本地副本 | 小程序独立打包依赖，不由 Web CSS 或清单自动更新 |

原始来源记录位于旧工作区 `D:/codex/rock-calculator-public/artifacts/s4-header-design-2026-09-06/设计计划.md`，其中 2026-09-06 的设计阶段记录明确区分官方参考、自制背景和用户原色角色。该目录与 `tmp/export-s4-desktop-assets.mjs` 被 Git 忽略，因此在此保存必要来源；不能只指向本机缓存。

银月狼王原始路径为 `C:/Users/Administrator/Desktop/s4新精灵/高清版_抠图处理/01_高清透明PNG/原色/11-03_银月狼王.png`。2026-10-16 只读核对时，此文件、设计目录中的 `wolf.png` 和 `moon-panorama-ai.png` 均存在，尺寸与上述记录一致。没有据此推定角色原图的官方分发 URL。

旧导出脚本明确使用 `moon-panorama-ai.png → s4-moon-night.webp`（宽 2000、WebP quality 0.86）和 `wolf.png → s4-silver-wolf.webp`（宽 486、quality 0.94），等比绘制后保留图片内容与透明通道。图片先由小程序提交 `e5ac260` 引入，再由 Web 提交 `9b77d73` 引入。

`docs/manual-cover/s4-moon-manual-cover.png` 是后来参考上述两图生成的手册封面；它不是页头原始来源。旧主目录未跟踪的 `docs/design/video-covers/` 是视频封面规范，明确不约束产品界面，也不是尚未整合的 S4 页头方案。

### S4 原始完整提示词

以下原样保留旧 `imagegen-prompt.md` 的英文提示词，用于复现与来源说明。引用图为设计目录中的 `official-pv.jpg`；角色不参与生成。提示词中的 “official creature artwork” 是当时的生成用语，实际角色证据仍以“用户提供原素材”为准，不扩张为已验证的官方下载来源。

```text
Use case: stylized-concept. Create a refined panoramic environmental art asset for a very short navigation header of a Roco Kingdom World S4 fan calculator. The attached OFFICIAL S4 PV cover is a STYLE AND WORLD REFERENCE, not a UI to copy. Output one very wide landscape image, about 3:1 aspect ratio, highest useful resolution. No lettering, no logo, no UI, NO CHARACTERS, no wolf (we will place original official creature artwork separately). Extract the official art's distinctive hand-painted fantasy lunar setting: midnight indigo sky, chalk-silver moon terrain, warm tiny five-point wish-stars, sparse turquoise flowing star trails, pale ruined arched moon bridge. Compose it to still work after cropping to an extremely thin horizontal ribbon: all salient motifs near the middle horizontal band; at 60% across a small partial cratered ivory moon, at 75% a restrained luminous golden star and one elegantly curved golden ribbon; low pale ruined arch silhouettes along bottom; center-left and all extreme edges dark calm negative space. Palette should follow reference, deep ink navy, faded periwinkle, luminous ivory, limited teal and moon-gold accents. Tender adventurous storybook 3D game world, lightly textured matte painterly forms. Refined and restrained, no anime people, no generic space photo, no neon cyberpunk, no decorative excessive glow, no huge bright planet occupying frame. This is an atmospheric background for navigation text in front, not an advertising hero. Original scene composition derived from reference motifs.
```

## 4. 接入范围与原界面约束

下表记录 S4 既有覆盖点，也是本轮新增主题的整合清单。不能只改页头 `<img>`，遗漏暗色页面或弹窗背景；**表中“需覆盖”不代表本轮已经验收通过。**

| 层面 | 实际入口 | 现状与需保留的行为 |
| --- | --- | --- |
| 主题选择 | `src/theme/season-themes.js`、`src/runtime/WebEntry.jsx`、`RuntimeContext.jsx` | 主题清单提供场景和角色；运行时同步 `data-season` 与场景/角色 CSS 变量。中性主题不能残留 S4 图片或独有装饰。主题与数据、服务器选择解耦。 |
| 页头 | `src/components/AppHeader.jsx`、`src/styles/20-s4-season.css` | 场景、透明角色、装饰分别分层；S4 保留星轨与星点。绝对定位、`aria-hidden`、空 alt、禁止指针交互。标题与操作区保持原有位置。 |
| 深色页面 | `20-s4-season.css` 的 `body::before`、页头伪元素 | S4 原实现把月夜与角色延伸至页面顶部 240px，再向内容区淡出；深色页头 DOM 装饰透明。新主题必须同时替换这一层，不能与浅色角色错位或叠成两份。 |
| 二级标题 | `src/styles/22-secondary-season.css` | 队伍、技能查询、显示设置、收藏配置、来源、获取应用和更新面板标题使用低透明度场景。浅色/深色分别处理，不能漏成固定 S4。 |
| 空状态 | `22-secondary-season.css` 的队伍空态、技能查询空态 | 场景通过径向遮罩柔和消失；不得抢正文、形成硬边或撑大容器。 |
| 文字与控件 | `20-s4-season.css`；基础样式 `03-base-shell.css`、`10-compact-workspace.css` | S4 既有深蓝底 `#101b35`、奶白标题 `#f4f2e5`、金色赛季字 `#ecd78c`、金色选中态 `#e0ce95`，并有 hover/focus 配色。新增主题不能只换背景而让标题、模式/队伍/主题/菜单按钮失去对比度。禁用态、焦点和选中态仍需可辨认。 |
| 同文件中的非装饰规则 | `20-s4-season.css` | 还包含技能威力基准控件、结果数字、能力图标、撤回按钮等对比度规则。不能为换赛季整文件重置，误删已有功能样式。 |
| 精简/具体模式 | `AppHeader.jsx`、`13-responsive-mobile.css`、`20-s4-season.css` | 两种模式共用页头；≤620px 竖屏复用现有单按钮切换，横屏/宽屏保留既有模式入口。需比较实际切换前后的尺寸、排列和外框。 |
| 手机/窄屏 | `20-s4-season.css`、`13-responsive-mobile.css` | 原 S4 在 801–1100px 调整角色位置；≤800px 隐藏角色/星轨/星点，保留低对比场景；≤620px 暗色吸顶栏用实底阻止滚动正文透出；≤360px 收紧间距。S1–S3 在 801–1100px 按角色调整尺寸与坐标，预览使用短标题腾出留白，不再整体隐藏角色；S4 原策略不变。新主题沿用可读性与无溢出要求，不能机械照搬不适合角色长宽比的裁切。 |
| 桌面客户端 | `desktop/main.mjs`、`package.json` 的 `dist/client` 打包 | 使用同一 Web 组件与 CSS，没有独立桌面赛季实现。既有窗口默认 1440×900、最小 900×640。Web 改动不等于安装包已重打或已验证。 |
| 电鹿例外 | `src/features/deer/deer.css`、`AppHeader` 的 `pageTitle` 分支 | 独立工具页取消赛季页头图片，保留实底、边线、标题与操作；顶栏底色/边线和返回按钮悬停色接入赛季变量，S4 原色作为兼容回退。右侧鹿影属于电鹿自己的装饰。依据 [电鹿装饰验收](../maintenance/deer-decoration-2026-09-16.md) 的“顶栏装饰纠正”，不得恢复月球或把全身角色裁成不可辨识碎片。 |
| 小程序 | `miniapp/src/components/SeasonBackdrop.jsx`、`AppHeader.jsx`、`pages/index/styles/season.css`、`app.config.js`、`theme.json` | 目前独立保留 S4，未据本轮 Web 主题工作自动新增 S1–S3。已有满幅渐隐场景、窄屏角色位置和系统深色适配，覆盖设置/选择弹层；本地图片副本与 CSS 需分别维护。H5 预览不能代替微信原生验收。 |

Web 的 `src/styles.css` 在基础、深色及响应式样式后导入 `20-s4-season.css`、`22-secondary-season.css`。新增变量或覆盖规则需同时核对导入次序与选择器优先级，避免后写的手机规则恢复固定 S4。

## 5. 盘点差异与最终验收

只读对照 `D:/codex/rock-calculator-public` 与本轮工作树时，没有发现旧目录独有、未提交的 S4 页头/CSS/运行时图片设计。两套 S4 运行时图及小程序副本相同；旧标题“月涌狂想”与当前“季中”的区别来自后续版本，当前 CSS 另含已提交的手机暗色吸顶实底修复。不得用旧目录覆盖本轮国际服改动。

现有回归入口包括：

- `tests/smoke/app-shell.test.jsx`：装饰语义与主页操作。
- `tests/e2e/uiux-desktop-panel.spec.js`：桌面多宽度、深浅主题、角色位置与背景资源。
- `tests/ui/header-portrait.test.jsx`、`tests/e2e/uiux-compact-mobile.spec.js`：手机标题及模式切换。
- `tests/ui/deer-page.test.jsx`：工具页不混入主页赛季图片。
- `miniapp/tests/app-shell.test.jsx`、`miniapp/tests/portrait-css.test.js`：小程序装饰、系统主题与样式边界。

历史截图说明见 [竖屏标题验收](../maintenance/portrait-header-acceptance.md) 和 [双模式页头验收](../maintenance/web-ux18-header-acceptance-20260920.md)。已有测试文件或旧截图不代表本轮新素材已经通过。二级装饰曾删除精确锁定透明度等参数的穷举测试，原因见 [测试裁剪记录](../maintenance/test-suite-slimming-20260920.md)；功能操作与真实画面仍要验收。

本轮网页验收结果（2026-10-16）：

| 必验项 | 结果与证据 |
| --- | --- |
| S1–S3 场景与角色实际文件、透明通道、来源对应、无变形 | 通过。三套 WebP 以等比尺寸加载，场景不含生成文字，角色不重绘。S1/S2 宽桌面裁切已修正，脸部可辨。 |
| S4 原外观保留 | 同一页面分别加载本轮与 HEAD 旧季节 CSS，1280、844、390 三种宽度的深浅截图一致；范围是页头、背景与空工作区，不扩大为全页面像素回归。 |
| S1–S3 及中性主题的深浅色与二级界面 | 已实际检查三季桌面深浅、手机竖横屏、中英日入口、设置及工具弹窗。Global 默认中性主题，场景伪元素不绘制、没有赛季图片请求。 |
| 两种模式与响应式 | 原精简/具体控件复用，标题和操作位置不重做。1920/1280 宽桌面及 900/844/390 窄屏检查通过；801–1100 的 S1–S3 深浅都不画角色，标题无截断或横向溢出。S4 断点保持。 |
| 主题预览与数据隔离 | 单元及入口回归覆盖本地预览白名单、线上参数不生效、Global 默认中性及切语言保留主题。实际 CN 依次预览 S1–S4 后，银月狼王/罗隐、掠影 39 伤害与撤销记录保持。没有修改伤害公式；Global 国际计算与自动分流仍关闭。 |
| 电鹿工具页例外 | S3 深浅截图确认顶栏没有赛季图，原鹿影、工具操作保留；仅顶栏颜色接入主题。 |
| 自动验证与构建 | `season-theme.test.jsx`、`header-portrait.test.jsx`、`locale-common.test.jsx`、`web-entry.test.jsx`、`global-workspace.test.jsx` 相关回归通过；指定改动 ESLint、差异检查、最终 Vite 生产构建通过。真实页面会话控制台没有错误或警告。不宣称全仓库旧测试全部通过。 |

### 真实截图与本地复核入口

- `output/playwright/seasons-20261016/`：`s1/s2/s3-header-light.png`、`s1/s2/s3-desktop-light.png`、`s1/s2/s3-desktop-dark.png` 是当前实际网页；另有手机深浅、`cn-s3-preserved.png` 和 `deer-s3-light.png` / `deer-s3-dark.png`。S1/S2 桌面截图已用最终生产构建更新。
- `output/playwright/global-20261016/`：`common-season-s4-*` 与 `common-season-s4-baseline-*` 是 S4 外观对照；`common-season-narrow-*` 是最终窄桌面验收；`review-season-*` 是独立复核，最终修正以 `review-season-final-*` 为准，早期 S1/S2 桌面截图仅作问题记录。
- 最终生产预览为 `http://127.0.0.1:4196/en/?seasonPreview=s1`，把末尾改为 `s2` / `s3` 可看对应方案；`/cn/` 为原 S4。普通 `/en/` 继续使用中性主题。参数仅本机有效，不保存为赛季偏好、不进入分享协议。
- 测试运行使用本机忽略目录中的 `tmp/vite-local-test.mjs`，只为依赖 junction 的 WASM 读取放行。构建记录为 `tmp/season-build-final.log`，没有因本机条件改变产品测试配置。

### 本轮未覆盖

未重打或安装桌面客户端，未进行微信原生运行验收，也未给小程序新增 S1–S3；现有小程序 S4 图和样式原样保留。浏览器截图不替代实体手机或海外网络验证。国际服实际赛季、正式实体译名与数值/规则仍待核实，本轮仅完成装饰准备，不为 Global 绑定国服赛季。

本文不构成推送、部署、桌面打包或小程序发布授权。

## 6. 用户主题选择与招牌精灵补齐 · 2026-10-19

- 国服与Global原显示设置新增“赛季主题 / Theme / テーマ”，国服选项为 S1 暗夜拾光、S2 狂欢怪谈、S3 铅字幻梦、S4 月涌狂想；Global 另外提供默认（无赛季装饰）。赛季名称依用户指定保留中文，不编造官方译名。
- 手动主题按服保存，切语言共用该服偏好；默认恢复国服S4、Global中性。临时预览不写入偏好，手动选择移除seasonPreview且保留其他query/hash。亮暗与季节装饰独立，换季不改亮暗、目录、规则、当前配置或计算结果。
- 原801–1100px规则隐藏了S1–S3角色，导致侧栏可见背景却没有招牌精灵。本轮取消该隐藏，分别调整透明原图的宽度/位置/裁切，预览在该宽度使用短标题，保留操作区。S4现有图与布局不改。手机≤800px沿用原S4策略，以低对比背景为主，不把大图挤入控件。
- 来源说明、图片和生成记录仍由本文及season-imagegen-prompts.md维护；本轮没有替换或重绘角色，没有改背景原图。网页之外的平台未重新打包或验收。

本轮验证：受影响主题状态、设置三语、WebEntry保存/切服/切语言/预览退出/草稿保护，以及原页头回归通过；定向ESLint与git diff --check通过。最终Vite生产构建通过，原App超过500kB提示仍存在，本轮不扩成拆包或发布。

真实生产预览4196已验：929px浅色和900px暗色S1–S3角色可辨，390px中英日设置无横向溢出；CN和Global逐个切S1–S4、刷新恢复、按服隔离、切语言保持、默认恢复、亮暗保持均通过。预览S1可直接选择正式S1并保存，其他query保留；hash保留另由WebEntry回归验证。控制台无错误或警告。独立只读评审确认929px角色未遮挡文字，并发现同预览选项无法持久化的边界，已修复并复验。

证据在 `output/playwright/global-20261019/`：`s1/s2/s3-final-header-929.png`、`s1/s2/s3-character-dark-900.png`、`theme-settings-cn-mobile.png`、`theme-settings-en-mobile.png`、`theme-settings-ja-mobile.png`。该分支当时正式运行版本仍 2.2.5，尚未提交、推送或部署；此处为 10 月 19 日国际分支历史记录。
