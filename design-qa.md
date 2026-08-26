# 微信小程序完整视觉与交互 QA

- source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-bdad7da8-72ee-407b-93ec-2ab0c2073321.png`
- final WeChat runtime: `artifacts/native-qa-20260810/wechat-multidevice-final-window.png`、`artifacts/native-qa-20260810/wechat-ipad-final-window.png`、`artifacts/native-qa-20260810/wechat-ipad-pro-final-window.png`
- focused comparison: `artifacts/reference-fidelity-quick-controls-comparison.png`
- native interaction evidence: `artifacts/native-qa-20260810/wechat-quick-controls-selected-native.png`、`artifacts/native-qa-20260810/wechat-quick-controls-reset-native.png`
- complete H5 interaction evidence: `artifacts/interaction-matrix-20260810/`
- multi-device visual evidence: `artifacts/device-matrix-20260810/`
- viewport coverage: 手机/窄屏 `320 x 568`、`320 x 844`、`344 x 882`、`360 x 640`、`360 x 780`、`375 x 667`、`375 x 812`、`390 x 844`、`393 x 852`、`412 x 915`、`430 x 932`；iPad `768 x 1024`、`810 x 1080`、`820 x 1180`、`1024 x 768`、`1180 x 820`、`1366 x 1024`
- normalization: 参考局部图 `520 x 189 px`；微信局部裁切 `346 x 166 px`。参考图只定义六列对齐、无框默认态和填充选中态，不把裁切比例及参考图的额外角标当作本轮代码目标。
- state coverage: 默认主页、正面性格选择/取消、个体切换、攻守交换、双方精灵搜索与遮罩关闭、参数面板、性格选择器、设置、配置记忆、重置本页、四技能与技能搜索、手动威力、连击数、战斗条件、结果详情、单技能恢复。

## Final findings

最终轮无遗留 P0/P1/P2 问题。

- 六维快捷区不再显示“普通”按钮或按钮内的 `60`；左侧只保留“性格 / 个体”行标，摘要保留 `个体全60`，详细参数页保留真实数值编辑。
- 六维摘要已改为结构化底栏：性格、增益属性、绿色上箭头、减益属性、红色下箭头、个体摘要分别排版；字号、基线、分隔间距和底栏背景均按最终设计图收敛，`320–1366px` 全部保持单行且无裁切。
- 性格与个体严格共用 `固定标签列 + 六个等宽列`；运行时几何门禁要求每行恰好六个按钮且最大宽差不超过 `0.5px`，17 档视口全部通过。
- 默认按钮无边框、无微信原生伪元素框；点击后仅填充浅绿色。正面性格支持再次点击取消并恢复无修正态，真实微信模拟器已验证。
- 攻守切换已改用项目内 PNG 双向箭头；小程序源码不再引用 SVG 图标。
- “数值调整”文字按钮已移除，整个“攻击方设置 / 防守方设置”标题区作为触控入口，避免按钮遮挡和微信原生按钮样式污染。
- 精灵搜索层在手机安全边距内完整显示；双方搜索、结果选择、遮罩关闭均已覆盖。设置标题、战斗条件标题、弹层关闭按钮不再换行或互相挤压。
- 技能选择层移除重复的右侧“选择 / 已选”文字列，整行继续作为触控目标；搜索框与结果行左右边界差不超过 `1px`，最窄 `320px` 下无内部溢出或右侧裁切。
- 四技能、条件、参数和结果子界面均保持底部安全区；结果栏、血条、伤害百分比和箭头未被裁切。
- 字体、行高与轴标签沿用现有小程序令牌；局部图中标签和图标基线清楚，无换行、截断或随机宽度。
- 320px 手机的六维标签由 `9px` 提升为 `10px`；头部只保留单一“设置”入口，避免窄屏下重复操作与无效数量占位。
- 手机结果栏高度会随底部安全区同步增加，安全区不再挤占结果内容；最窄 `320 x 568` 上的搜索、参数、条件和结果弹层均通过完整入框检查。
- iPad 的六维列距统一为 `3px`；`1024–1199px` 结果侧栏收敛为 `260px`，给双侧快速配置保留完整触控宽度，`1200px` 以上恢复 `320px` 结果侧栏。
- 精灵头像、属性图标、六维图标继续使用项目真实 PNG；所有图片使用等比包含模式，未发现占位图、SVG 回归或失真。
- H5 视觉复核发现 Taro 的 `aspectFit` 内层图片对非正方形六维 PNG 产生二次偏移，导致图标右半越界后被父容器裁切；现已对六维、状态角标、攻守箭头和结果箭头的 H5 内层图片统一归一化，真实微信与 H5 均显示完整。
- 状态角标、攻守切换和结果箭头均由可信图标库渲染为 96 × 96 PNG；资产门禁检查透明边界、画布尺寸和安全留白，禁止把低质量 SVG 原样转成 PNG。
- 印记层数输入框改为节点常驻、未选中时隐藏并禁用，规避 Taro H5 在动态挂载受控输入框时 `inputRef` 尚未建立的生命周期错误。

## Comparison history

1. 快捷区：修复按钮内 `60` 造成的图标拥挤；移除多余文字按钮；六列重新对齐。
2. 资源：将攻守箭头从 SVG 替换为 PNG，并增加源码级门禁，禁止该 SVG 回归。
3. 弹层：修复设置标题换行、条件标题与副标题合并、搜索层超框及遮罩无法收起的同类风险。
4. 微信差异：真实微信把参数入口渲染成宽按钮框，最终改为带 `role=button` 的触控 View；重载生产包后确认框体消失。
5. 全交互：按用户实际操作顺序逐项覆盖手机主流程及 iPad 子界面，未发现控制台错误、页面错误或水平滚动。
6. 无框六维控件：发现微信原生 `Button` 默认伪元素边框与自动外边距未彻底重置，同时“普通”按钮占用了标签列。修复为纯文本行标、六个 `width: 100%`/`margin: 0` 的等宽按钮，并清除按钮边框及 `::after`；微信最终截图与参考图同屏复核后无新增 P0/P1/P2。
7. 图片运行时：同屏对照确认六维 PNG 在 H5 中仅显示一半，根因是 Taro 生成的内层 `<img>` 横向偏移；归一化后重新生成手机/iPad 截图和真实微信截图，图标、角标与箭头均完整。
8. 输入生命周期：完整交互矩阵定位到选择印记后立即编辑层数的 Taro H5 异常；加入节点身份回归测试并改为常驻输入节点后，手机与 iPad 矩阵恢复零异常。

## Runtime and interaction checks

- 小程序单元/组件测试：`24/24` 文件、`242/242` 用例通过。
- 网页核心回归：`55/55` 文件、`927/927` 用例通过。
- 响应式门禁：17 档视口全部通过，横向溢出均为 `0.0px`；每个可见六维行按钮宽差不超过 `0.5px`，图片全部使用 `contain` 且未裁切。
- 手机/iPad 交互矩阵：双方搜索、参数、设置、配置记忆、重置本页、技能、条件、结果等全部通过，无 console error / page error。
- 资产门禁：4 个控制 PNG 均为 `96 × 96`，透明边界安全留白通过；六维 PNG 与项目原始清单一致。
- 微信生产构建：小程序 `0.1.1`、网页核心 `1.4.3`；主包 `2,022,333 bytes`，低于 2 MiB；产物 SHA256 `94e2e2e6aaeee231d5a359666c6eea995b0d3538949893dfdde189c9e3bacb86`。
- 微信真实运行：开发者工具 Stable `2.01.2510290`、AppID `wx82f11dfdd3d28bc8` 已通过官方 CLI 重新打开生产项目并启用自动化通道。原生 iPhone 14 Pro 启动截图已复核；本轮技能弹层通过官方自动化通道的 AppService 真实事件链完成 10 项运行态检查。开发者工具当前版本的 `App.captureScreenshot` 接口无响应，因此弹层视觉截图使用同视口 H5 图，原生端用实际节点几何、状态类和事件闭环佐证，不把 H5 截图标成原生截图。

## 2026-08-11 技能分类选择器

- 设计参考：`artifacts/2026-08-11-skill-picker-categories/reference-generated.png`。
- 同屏对照：`artifacts/2026-08-11-skill-picker-categories/comparison-reference-vs-phone-v2.png`；弹层起点、圆角、左右边界、分类、搜索框、列表密度及选中态已收敛，无 P0/P1/P2。
- 交互结构：全部、物理、魔法、变化、防御五类按当前精灵的可选技能动态计数；重复点击已选分类返回全部；分类与技能名、属性、拼音搜索取交集。
- 状态闭环：当前技能行保留浅绿色选中态和项目统一 PNG 勾选图；无结果时提供清除筛选；关闭、选中、遮罩退出与重新打开均复位筛选。
- 原生证据：`artifacts/2026-08-11-skill-picker-categories/native/native-skill-picker-acceptance.json`。微信原生 `430 x 834` 视口通过 10 项检查：44px 触控目标、5 类入口、默认选中、筛选、搜索交集、空状态、清除、选择关闭、遮罩关闭和安全边界。
- 响应式证据：手机、`320px` 窄屏和 iPad 截图均通过，分类栏在窄屏横向滚动且不压缩文字，iPad 弹层最大宽度 `760px`。
- 资产：搜索与选中图标均为可信来源的 PNG，微信源码未新增 SVG；图标使用 `aspectFit`，无裁切、拉伸或错误留白。

## 2026-08-11 结果详情排版复刻

- source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-93a2d284-dc6c-4033-9f2c-0bc4baaee830.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-83c85ce6-324d-4ff8-b92e-225091d0407c.png`
- implementation screenshots: `artifacts/2026-08-11-result-layout/native/wechat-production-cold-result-phone.png`、`artifacts/2026-08-11-result-layout/native/wechat-production-cold-result-bottom-phone.png`
- viewport and normalization: 微信开发者工具 Stable `2.01.2510290` 的 iPhone 14 Pro 模拟器；原生窗口裁图 `362 x 786 px`。桌面结果参考为 `324 x 541 px`，公式参考为 `1007 x 274 px`；同屏对照按内容区等高归一化，评估响应式信息层级、排版和完整性，不把桌面与手机的固有宽高差异当成缺陷。
- state: 四技能模式，扫尾为当前技能，结果详情打开；顶部摘要、四技能结果、伤害计算过程与底部分享操作均已覆盖。
- full-view comparison: `artifacts/2026-08-11-result-layout/comparison-native-result-final.png`
- focused formula comparison: `artifacts/2026-08-11-result-layout/comparison-native-formula-final.png`
- responsive evidence: `artifacts/2026-08-11-result-layout/h5/`、`artifacts/2026-08-11-result-layout/viewports/`
- primary interactions: 四个技能结果逐项切换、结果弹层打开/关闭/滚动、手机与 iPad 主要子界面；无 console error / page error。

### Findings

- 无遗留 P0/P1/P2。伤害数值、三态百分比、剩余 HP、血条、四技能排行与四段公式过程均按桌面版的信息层级迁移到手机弹层。
- 手机端保留关闭按钮，不在详情弹层重复桌面侧栏的攻守切换与目标 HP 编辑；攻守切换和目标 HP 已由主页悬浮结果栏承担，避免同一任务出现两套入口。
- iPad 采用更宽的弹层和双列工作区，结果详情保持桌面式横向公式行；手机端公式在同一语义顺序下自动换行。
- 字体层级、行高、颜色令牌、圆角、边距、血条和选中态均沿用项目现有设计系统；未新增 SVG、占位图或自绘图标。

### Comparison history

1. 首轮真实微信截图仍显示旧结果弹层，确认产物已更新但开发者工具热重载保留旧实例；清理编译缓存并冷启动项目后加载新版组件。
2. 冷启动截图发现原生 `scroll-view` 采用内容盒导致右侧百分比和公式末项被裁切；为结果滚动区补充 `width: 100%`、`min-width: 0`、`box-sizing: border-box`，新增 CSS 回归断言。
3. 修复后重新生产构建并冷启动，顶部与底部原生截图右侧内容完整；320、390、820 结果页专项检查、17 档视口和手机/iPad 交互矩阵全部通过。

## 2026-08-11 最简设置、配置记忆与重置

- 顶部删除“配置 N”和“更多”，只保留一个“设置”入口；小程序端移除配置库、内置配置与 JSON 导入相关界面和测试路径。
- 设置面板只保留“配置记忆”和“重置本页”。配置记忆默认开启；关闭时清除旧页面快照，关闭期间不读取也不写入；重新开启会立即保存当前页，微信重新编译后仍能恢复开启状态。
- “重置本页”使用原生确认弹窗，确认后仅恢复当前计算页默认值，不修改收藏数据；取消时不产生状态变化。
- 开关实际触控高度为 `44px`，可视轨道保持 `32px`。真实微信点击回归曾发现装饰伪元素截获触控，已通过禁用装饰层指针事件修复，并验证开启、关闭、重新开启及重启恢复闭环。
- H5 最终回归覆盖 17 档手机/iPad 视口，横向溢出均为 `0.0px`；手机与 iPad 全交互矩阵通过。对应证据位于 `artifacts/2026-08-11-settings-simplification/viewports-final-2/` 与 `artifacts/2026-08-11-settings-simplification/interactions-final-2/`。
- 微信原生手机证据：`artifacts/2026-08-11-settings-simplification/native/wechat-production-final-settings-2.png`、`wechat-production-final-memory-off.png`、`wechat-production-final-memory-restored.png`、`wechat-production-final-memory-restart-2.png`、`wechat-production-final-reset-confirmation.png`、`wechat-production-final-reset-complete.png`。
- 微信原生 iPad 证据：`artifacts/2026-08-11-settings-simplification/native/wechat-ipad-main-primary-final.png`、`wechat-ipad-settings-final.png`、`wechat-ipad-memory-off-final.png`、`wechat-ipad-memory-restored-final.png`。设置面板居中、无遮挡，主页面保持双栏布局。
- 最终生产包：小程序 `0.1.1`、网页核心 `1.4.3`；主包 `2,022,333 bytes`；产物 SHA256 `94e2e2e6aaeee231d5a359666c6eea995b0d3538949893dfdde189c9e3bacb86`。

## 2026-08-11 战斗条件“完成”按钮对齐修复

- source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-6d14f331-d969-4f17-9918-71af5984fc4b.png`；截图显示微信原生按钮左右自动外边距把“完成”推到标题栏中部。
- implementation screenshot: `artifacts/2026-08-11-condition-close-phone-final-build-open.png`；微信开发者工具 Stable `2.01.2510290`，iPhone 12/13 Pro `390 x 844`、Dpr 3，战斗条件弹层打开状态。
- full/focused comparison: `artifacts/2026-08-11-condition-close-comparison.png`。修复后按钮右边缘与标题栏保持约 `14px` 内边距，按钮与标题栏垂直中心偏差不超过 `1px`。
- root cause and fix: 通用弹层关闭按钮规则缺少 `margin: 0`，微信原生 `Button` 保留左右自动外边距；补齐归一化后，技能、参数、战斗条件和结果弹层的关闭按钮统一锚定右侧。
- behavior: 在最终生产构建中实际点击“完成”，弹层正常关闭；关闭后主页面及悬浮结果栏保持可用。
- regression: 小程序 `24/24` 文件、`242/242` 用例通过；17 档手机/iPad 视口全部通过，横向溢出均为 `0.0px`；新增标题栏右边距与垂直居中几何门禁。
- final package: 主包 `2,022,342 bytes`；产物 SHA256 `5852d74ad6d924c19ea3cdaa9d0c9ef051e9050b4f7f6a9e20a172b62934884d`。

## 2026-08-22 队伍防守面分析

- source visual truth: `docs/images/team-defensive-type-analysis-mock.png`
- implementation screenshot: `output/playwright/team-defensive-type-analysis.png`
- state: 六人队伍，队伍抽屉切换到“分析”，展开一个属性行。
- viewport coverage: 桌面 `1440 x 900`、深色模式 `1440 x 900`、移动端 `390 x 844`。
- interaction coverage: 成员/分析切换、重点/全部切换、单行展开/收起、六人详情、空队伍、缺失成员提示。

### Findings

- 右侧保留“成员 / 分析”两个局部页签，队伍编辑入口、攻防载入和成员配置未被分析功能挤出主流程。
- 默认只列出存在弱点的重点属性；“全部”覆盖 18 种属性。每行以属性图标、弱/抗数量和倍率分布完成首层判断。
- 同一时间只展开一个属性；详情显示槽位、头像、名称和最终防守倍率，双属性精灵按合并后的最终倍率只统计一次。
- 桌面、深色模式和移动端均无横向滚动；移动端自动改为双列队伍成员和单列分析详情，主要触控目标不低于 44px。
- 倍率数量使用 `×0.5 · 2` 形式，避免被误读为连续乘法；红色只表示弱点，绿色只表示抗性或免疫。
- 未新增队伍存储字段，不改变队伍预设兼容性，不影响既有伤害计算和属性克制算法。

### Regression

- 单元/组件：79 个测试文件、1227 项测试通过。
- 浏览器：31 项 Playwright 验收通过，包含新增的六人队伍分析、手动威力输入与完整主流程交互。
- 数据：594 只精灵、553 个技能校验通过；验收矩阵 16 项通过。
- 构建：生产构建通过；无阻塞型性能预算超限，只有既有 JS 体积基线警告。

final result: passed

---

# 队伍分析视觉验收

## 证据

- 设计源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-fe3691b5-d53c-4cd7-98db-db527ef598e7.png`
- 设计源像素：1536 × 1024；为匹配实现视口，取顶部 1536 × 864 后按 1× 密度归一化为 1280 × 720。
- 最终实现：`D:\codex\rock-calculator-public\artifacts\design-qa\team-analysis-final-1280.png`
- 最终实现像素 / CSS 视口 / 密度：1280 × 720 / 1280 × 720 / devicePixelRatio 1。
- 同屏对照：`D:\codex\rock-calculator-public\artifacts\design-qa\comparison-final.png`（左侧设计，右侧实现）。
- 补充状态：`team-member-1280.png`、`team-analysis-1024.png`、`team-analysis-390.png`、`team-analysis-dark-1024.png`、`team-matchup-dark-1024.png`。
- 验收状态：亮色分析页，3/6 成员，防守矩阵；另检查暗色矩阵、对位、来源详情和成员配置。

## 全景与重点区域对照

- 全景：导航、顶部成员条、双模式工具栏、18 属性矩阵、右侧双汇总的层级和顺序与设计一致。
- 重点区域：逐项放大检查属性图标、精灵头像、倍率色块、愿力开关、矩阵行头和汇总区；均使用项目真实图片资源与 Phosphor 图标。
- 成员配置：保留原双栏编辑结构，仅在性格行加入血脉选择，没有扩大或重排成员页主体。
- 响应式：1024px 下汇总移至矩阵底部；390px 下队伍条和矩阵在各自容器内滚动，页面本身没有横向溢出。

## 必查表面

- 字体：沿用项目现有字体栈、字号和字重；表头及倍率在缩放后仍可辨识，无异常换行。
- 间距：主要卡片、标签、矩阵和汇总保持紧凑节奏；窄屏触控按钮不小于 44px。
- 色彩：沿用现有主题变量；红色表示危险/受阻，绿色表示抗性/克制，并始终保留倍率文字。
- 图片：精灵头像和属性图标均来自项目素材，无占位位图、CSS 绘图或自制 SVG。
- 文案：按用户要求将“矩阵”改为“分析”；“防守承伤、技能打击面、愿力冲击、对位”语义明确。
- 交互：三视图、矩阵模式、愿力开关、单元格详情、对手选择、攻击方向切换均已实际操作；浏览器控制台无 error/warning。

## 对照迭代记录

### Pass 1

- [P2] 矩阵行头同时显示头像和截断名称，扫描噪声高；改为头像主导，名称保留在可访问文本和提示中。
- [P2] 右侧只显示当前模式汇总，与设计稿同时展示防守/打击概览不一致；改为双汇总常驻。

### Pass 2

- [P2] 双汇总首次实现后在 720px 高度被裁切；压缩汇总行距、字号和内边距，1024px 断点改为底部横排。

### Pass 3

- 复验 1280 × 720、1024 × 768、390 × 844 和暗色主题；此前 P2 均已关闭。
- 设计中的 12 个展示槽位未照搬：项目真实队伍模型固定为 6 位，保留 6 位是产品约束。
- 设计中的“矩阵”标题按用户明确指示改为“分析”；成员/分析一级切换和队伍管理栏按“成员配置界面不要大改”保留。

### Pass 4

- 复验旧队伍未显式保存血脉时的愿力分析：普通精灵按普通血脉、首领精灵按首领血脉推导，显示值与计算值一致。
- 实际点击矩阵单元格后切换防守/打击模式，来源详情立即清空；概览/分析/对位、攻击方向和对手队伍切换同样不会残留旧来源。
- 防守汇总把 `×0` 只计入免疫，不再同时计入抗性；浏览器实测交互通过，布局与 Pass 3 无视觉变化。

### Pass 5

- 对照源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-3a30f91a-9349-4363-b248-46e65865d8a3.png`。
- 最终实现：`D:\codex\rock-calculator-public\artifacts\design-qa\team-matchup-manual-final.jpg`（1280 × 720）。
- 同屏对照：`D:\codex\rock-calculator-public\artifacts\design-qa\team-matchup-manual-comparison.jpg`（设计源裁切缩放至 1280 × 720，左侧设计、右侧实现，合成图 2560 × 720）。
- 验收状态：对位页切换“现场编辑”，导入三名成员的既存队伍副本，成员详细配置收起，6×6 对位表保持首屏可见。
- [P2] 初版默认展开完整成员编辑器，导致对位表跌出首屏；改为六槽位头像条默认收起，点击槽位后再展开，并提供“收起现场配置”。
- 导入后的修改仅作用于现场副本；切回“已保存队伍”后仍读取原队伍，未出现反向写入。
- 最终复验未发现 P0、P1 或 P2 视觉差异。

## 后续精修（P3）

- 有完整 6 人队伍时可再细调顶部头像条密度，但不影响当前功能或可读性。

### Pass 6：竖排成员与三栏分析结构

- 设计源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-21eb5229-9cfd-42d3-8db6-bb39eb05e763.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-699f0039-b6bf-4e49-9e28-b3e0596cd46e.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-06eb699d-42ca-4d65-9eb3-05c38fe6dbdb.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-a2b8eb42-7dba-430b-bd8e-88a1442aeab0.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-5b5af6c1-2374-4834-a2ff-6f7c42800756.png`。
- 最终实现：`artifacts/design-qa/team-member-three-tabs-final.png`、`artifacts/design-qa/team-analysis-vertical-six-final.png`、`artifacts/design-qa/team-matchup-vertical-six-final.png`。
- 同屏对照：`artifacts/design-qa/team-analysis-vertical-comparison.jpg`、`artifacts/design-qa/team-matchup-vertical-comparison.jpg`。
- 像素 / CSS 视口 / 密度：最终实现均为 1280 × 720 / 1280 × 720 / devicePixelRatio 1；设计源按同高裁切并等比缩放到对照面板，避免把原始截图尺寸差异误判为布局差异。
- 状态：完整六人队伍；分别打开成员、分析和对位三个一级页签。分析页为防守承伤矩阵，对位页为已保存队伍模式。
- 首轮发现的 [P1]：分析区重复横排成员条，破坏左侧竖排配置工作流；分析矩阵首屏只能看见 3/6 成员；对位第六行跌出首屏；倍率文字在紧凑单元格中存在越界风险。
- 修复：一级页签固定为“成员 / 分析 / 对位”；成员竖排始终保留，删除分析和对位中的重复横排成员条及嵌套导航；矩阵行高、首列、倍率单元格、对位行高和底部汇总统一收紧，并补齐省略与不换行规则。
- 复验：成员页保持原竖排配置结构；分析矩阵 6 行最末行底部为 533px，左侧第六槽底部为 647px；对位表 6 行最末行底部为 676px；三页浏览器溢出扫描均为空数组，未发现文字超框。
- 字体与文案：沿用现有字体栈和设计令牌；三栏标题完整显示，倍率使用等宽数字且不换行，长队伍名和技能名按容器截断。
- 布局与间距：97vw 扩展抽屉保留 300px 竖排成员列，右侧只承载当前分析任务；矩阵汇总改为底部紧凑条，不再占用矩阵横向空间。
- 色彩与图片：继续使用现有红、绿语义色、官方精灵头像和属性图标，没有新增占位图、CSS 图形或自制 SVG。
- 交互：实际切换三个一级页签、矩阵模式和对位来源；选中单元格后切换一级页签会清空旧详情，未发现控制台错误。
- 最终复验无遗留 P0、P1、P2；聚焦区域已由两张同屏对照覆盖矩阵密度、六行可见性、头像清晰度和文字边界，无需追加单独裁切图。

### Pass 7：参考站紧凑色块与实心倍率字

- 设计源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-439be0e5-2a8e-413f-8bef-6a27bfd582fb.png`（1100 × 121px）；该图只作为格子密度、色块和倍率文字风格依据，不作为整页布局目标。
- 修改前证据：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-dc2ac610-71ae-4dd2-97a0-8c17754a80c7.png`、`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-48249064-214a-4c38-9b46-dad16428a5d9.png`。
- 最终实现：`artifacts/design-qa/team-analysis-compact-solid-final.jpg`、`artifacts/design-qa/team-matchup-compact-solid-final.jpg`；像素 / CSS 视口 / 密度均为 1280 × 720 / 1280 × 720 / devicePixelRatio 1。
- 同屏对照：`artifacts/design-qa/team-analysis-compact-solid-comparison.jpg`。参考图等比放大到 1280px 宽后与完整实现上下排列，保留原始纵横比；重点比较属性表头、连续色块、倍率字重和色块间距。
- 状态：完整六人队伍；分析页为防守承伤，对位页为已保存队伍。实际切换“技能打击面”验证同一色块规则继续生效。
- 初轮 [P1]：分析格实际为约 45 × 42px，内部按钮 40 × 32px；高圆角、显式描边和浏览器计算出的 400 字重使矩阵呈现为分散按钮，明显弱于参考站的连续色块观感。
- 修复：分析矩阵固定到最大 640px，单元格约 32 × 30px，内部色块约 29 × 24px；圆角收为 4px、常态描边透明，安全/危险背景提高到 22%/18% 混色；倍率使用 9px、800 字重。
- 对位同步：表格最大 640px，行高 40px，倍率色块高 24px；首列保留 108px，并强制“攻击方 \\ 防守方”单行，避免紧凑化造成标题折行。
- 浏览器几何复验：分析与对位滚动容器 `scrollWidth - clientWidth = 0`，页面水平溢出为 0；分析最长 `×0.25` 文案 `scrollWidth - clientWidth = 0`；对位六行末行底部位于 604px，首屏完整。
- 字体、颜色、图片和文案：倍率字由继承的 14px/400 收敛为 9px/800，增强小尺寸实心感；继续使用项目属性图标和精灵头像，未新增图片替代、CSS 图形或自制 SVG；倍率和名称语义未改变。
- 最终同屏复验未发现遗留 P0、P1、P2。与参考站的差异仅剩产品结构：参考图把防守与打击同时并排，本项目仍由现有双模式切换，属于既定交互约束，不在本轮改动范围。

### Pass 8：整页流式适配与移除横向拖拽条

- 设计问题源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-8130fd89-bd34-4ed0-bc8b-722c011ee933.png`（664 × 30px），明确显示矩阵底部横向拖拽条。
- 最终实现：`artifacts/design-qa/team-analysis-fluid-no-scroll-final.jpg`、`artifacts/design-qa/team-matchup-fluid-no-scroll-final.jpg`；像素 / CSS 视口 / 密度均为 1280 × 720 / 1280 × 720 / devicePixelRatio 1。
- 同屏对照：`artifacts/design-qa/team-analysis-fluid-no-scroll-comparison.jpg`。顶部保留问题截图原始纵横比并等比放大，底部为完整分析页，直接检查拖拽条、整页占比和文字边界。
- 初轮 [P1]：矩阵与对位表使用 636px 固定最小宽度，右侧工作区低于该值时必然产生横向滚动；摘要在窄断点仍使用固定 74px 列宽，也会把文字和汇总推到容器外。
- 修复：分析与对位表取消固定最小宽度，矩阵布局改为 100% 占用右侧工作区；滚动容器固定 `overflow-x: hidden`，表格列由 `table-layout: fixed` 随工作区等比缩放，倍率色块最大宽度保持 32px 并居中，不因页面变宽而失去紧凑感。
- 窄工作区策略：使用容器查询而非只看浏览器宽度；工作区低于 560px 时隐藏可省略的倍率“×”前缀、字号降到 8px、成员行头和头像同步收窄、双汇总改为上下排列并隐藏重复小标签。
- 对位适配：首列改为 `clamp(80px, 15%, 108px)`，成员名继续省略显示；每个对位按钮新增完整 `aria-label`，视觉截断不损失可访问语义。
- 浏览器复验：分析矩阵 `clientWidth = scrollWidth = 878px`、横向差值 0、滚动条高度 0；对位表横向差值 0；全页 `scrollWidth - clientWidth = 0`；可见叶子文本超框扫描为空，最长倍率文案也无裁切。
- 字体、间距、颜色和图片：继续沿用 Pass 7 的 9px/800 倍率字、24px 色块高和实心红绿状态；表格随整页变宽，但色块保持紧凑；精灵头像与属性图标继续使用项目真实资源。
- 最终同屏复验未发现遗留 P0、P1、P2；横向拖拽条已完全移除，分析和对位页均完整利用右侧区域。

### Pass 9：消除分析页剩余空栏并让详情区收口

- 问题源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-2049be91-4e8b-4adb-9740-e38a10cf11ec.png`（1107 × 693px），红框标出矩阵右侧旧固定宽度空栏及单元格详情下方空区。
- 最终实现：`artifacts/design-qa/team-analysis-fill-unused-space-final.png`；像素 / CSS 视口 / 密度为 1107 × 693 / 1107 × 693 / devicePixelRatio 1。
- 同屏对照：`artifacts/design-qa/team-analysis-unused-space-comparison.png`（左侧问题源，右侧最终实现；两侧均为同尺寸、同亮色主题、六人队伍、技能打击面并选中单元格）。
- 初轮 [P2]：旧截图仍显示 Pass 7 的 640px 固定矩阵，右侧留下约 100px 空栏；当前流式矩阵复测为 `clientWidth = scrollWidth = 710px`，已完整铺到工作区右边界。
- 初轮 [P2]：右侧编辑列与六人竖排列表等高，但详情条仅 70px，高度结束后留下约 114px 无效空区。修复为右侧编辑列纵向弹性布局，分析页占用页签之后的剩余高度；选中详情区使用剩余轨道，底边与编辑列同为 677px，且未越过抽屉边界。
- 字体与文案：完整可见文本溢出扫描为空；仅命中本来就以 1px 隐藏的 `sr-only` 精灵名称，属于可访问文本，不是视觉超框。
- 间距与布局：矩阵仍保持 30px 行高、24px 色块和 9px/800 倍率字；没有恢复横向拖拽条，也没有改变左侧六人竖排配置结构。
- 色彩、图片和图标：沿用现有主题令牌、官方精灵头像、属性图标和 Phosphor 图标，没有新增近似绘图或占位资源。
- 交互与运行态：实际切换到“分析 → 技能打击面”并点击单元格；矩阵横向差值 0、全页横向差值 0，浏览器控制台无 error/warning。
- 最终同屏复验未发现遗留 P0、P1、P2。

### Pass 10：单元格详情恢复紧凑高度

- 问题源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-d5d09b96-881a-4ace-b7c9-1e8f24194c8e.png`（1103 × 837px），用户明确标注 Pass 9 的拉伸详情卡过大。
- 最终实现：`artifacts/design-qa/team-analysis-compact-detail-final.png`（1103 × 834px）；CSS 视口为 1103 × 837，浏览器截图比视口少 3px，比较时只裁去问题源底部 3px，不做缩放。
- 同屏对照：`artifacts/design-qa/team-analysis-compact-detail-comparison.png`（左侧问题源裁切，右侧最终实现）。
- [P1] Pass 9 把详情条填满了右侧剩余高度，在 837px 高窗口中膨胀到约 400px，来源链路只占中间一行，形成新的巨大空卡。修复为固定 70px 上限、三行自动网格轨道并靠上排列；详情卡实测高度 70px。
- 矩阵继续完整铺满横向工作区，六行、18 属性、双汇总均在首屏可见；左侧六人竖排未调整，页面横向溢出为 0。
- 字体、倍率色块、图标、颜色和文案均未改变；本轮只收紧详情区高度，没有恢复拖拽条或旧固定矩阵宽度。
- 最终同屏复验未发现遗留 P0、P1、P2。

### Pass 11：队伍成员选择栏与默认计算器统一

- 设计源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-94d25306-e7e6-4a78-9cf0-f383852c03d2.png`（队伍成员现状）与 `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-702091ac-b24d-4637-893f-73a7681b0e0e.png`（默认计算器目标）。
- 浏览器全景证据：`artifacts/design-qa/team-picker-empty.jpg`（734 × 918，亮色主题，对位现场编辑空成员并展开选择栏）；聚焦同屏对照：`artifacts/design-qa/team-picker-comparison.png`（现状、目标、修复后三栏并列）。本轮目标仅为选择栏组件一致性，聚焦图已可清楚检查标题、搜索框、选项行、头像、图鉴号、阶段、选中态和滚动容器，无需再增加整页缩放对照。
- [P1] 队伍页原先虽然渲染同一个 `SpiritPicker`，但传入原始图鉴；默认计算器传入带收藏/完整配置优先级、进化链和标准素材字段的 `selectableSpirits`，因此两处列表顺序与搜索展开结果可能分叉。修复为从计算器视图模型将同一份选择数据贯穿到队伍成员页及“对位 → 现场编辑”。
- [P2] 队伍变体的“成员”标题缺少默认选择栏已有的胶囊底色。补为现有强调色胶囊，保留队伍语义，不冒充攻击方或防御方。
- 交互复验：空成员展开后显示同一套图鉴顺序与 12 项初始预览；搜索、键盘可访问角色、选项头像及两行文本结构均由同一组件提供。浏览器控制台 error/warning 为 0。
- 最终同屏复验未发现遗留 P0、P1、P2；容器宽度随队伍侧栏响应式收缩，组件层级、间距和交互与默认计算器一致。

### Pass 12：窄屏顶部队伍按钮切换为纯图标

- 问题源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-016d8748-164f-410f-bd1c-ce5cf90dda31.png`（745 × 969，浏览器内容宽度约 745px，红框标出顶部队伍按钮）。
- 最终实现：`artifacts/design-qa/header-icon-only-745.jpg`（745 × 896，CSS 视口 745 × 896，亮色精简版）；同屏重点对照：`artifacts/design-qa/header-icon-only-comparison.png`。对照裁掉问题图的浏览器外壳，只比较同为 745px 宽的应用标题栏。
- [P1] `621–760px` 断点只隐藏“精简版 / 具体版”文字，队伍按钮仍参与文字布局；空间不足时文字被裁切而非真正退出布局。修复为在同一 `max-width: 760px` 规则中隐藏 `.team-action span`，并把按钮收为 38 × 38px、清除横向内边距、图标居中。
- 触控边界：详细版在 620px 以下继续保留 44px 队伍按钮；精简版沿用同组 38px 紧凑图标按钮，不改变主题和菜单按钮。
- 视觉复验：745px 下精简版、具体版、队伍均只显示真实 Phosphor 图标；三个按钮无文字残留、裁切或异常空白，品牌标题保持完整。浏览器控制台 error/warning 为 0。
- 最终同屏复验未发现遗留 P0、P1、P2。

### Pass 13：对位来源收敛与暗色浮层修复

- 问题源：`C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-5c5c2350-9977-47c2-a6c7-a6408964241f.png`（1920 × 1035，右侧浏览器区域标出“已保存队伍 / 现场编辑”冗余来源按钮与暗色精灵下拉白底）。
- 最终实现：`artifacts/design-qa/team-matchup-dark-picker-fixed.png`（1200 × 900，暗色主题、对位页、现场 1 号位精灵列表展开）；同屏对照：`artifacts/design-qa/team-matchup-dark-picker-comparison.png`。
- [P1] 对位页原有两套来源模式，把“选保存队伍”和“导入后编辑”拆成两层选择。修复为进入对位即显示一个现场副本：可从现有队伍导入、继续现场调整、直接查看对位；删除两个来源按钮及保存队伍直连分支，导入仍使用深拷贝，不修改保存队伍。
- [P1] `.spirit-picker__options` 亮色白底未加入暗色交互面分组，导致暗色主题下文字对比失效。修复后实测背景 `rgb(36, 39, 54)`、文字 `rgb(241, 243, 251)`、边框 `rgb(75, 82, 108)`；同类审计补齐队伍删除确认按钮，技能下拉原本已正确使用暗色令牌。
- 视觉与交互复验：暗色对位页中仅保留“成员 / 分析 / 对位”一级栏；导入、六个现场槽位和展开后的精灵列表均位于同一任务流；未出现硬编码白底、低对比文字或新增横向滚动。浏览器控制台 error/warning 为 0。
- 最终同屏复验未发现遗留 P0、P1、P2。

final result: passed
