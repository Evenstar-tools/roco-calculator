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
