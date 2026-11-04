# 微信小程序 AI 联调收口 · v1.2.3 · 2026-11-04

## 源码与范围

- 工作树`D:/codex/rock-mini-ai-closeout`，分支`codex/miniapp-ai-closeout-20261104`。
- 从`origin/main@e3d34e7`正常合并已上传小程序分支`0bbaf78`，合并提交`c6529f8`保留完整历史；1.2.1生命输入/下注暗修复、1.2.2只读AI接口及UX44均完整进入。
- 根因修复来源`d4a0aa0`，本树接续为`5973754`。小程序独立版本由1.2.2升为1.2.3，更新日期2026-11-04。
- Web保持2.3.4、独立网页核心保持2.2.8，`config/miniapp-release.json`保持`a7c9f951b0560cd1fe5bc7dcd2695c2051076c3f`，249项内置预设及数据不变。没有改两服网页发布pin、缓存、E2E、桌面或公式。
- 桌面增加国际服按用户要求暂缓，本轮没有新增桌面任务。

## 已定位并修复的宿主问题

- 之前10秒诊断等待没有等完冷宿主，也没有取得实际`invalid_parameters`回包；超时本身不能证明应用根因。延长冷启动诊断并取得参数错误后，再由输入探针定位了独立存在的应用校验问题。
- 微信宿主以跨realm普通对象传参，本地`Object.prototype`身份相等校验误拒了这些对象；没有缺少AI代码或登录失效证据。
- 宿主临时输入探针确认参数原型与本地不同，但constructor为Object且该原型处于对象根部。修复普通对象识别，保留对数组、类实例及非法输入的拒绝；接口协议和计算链路未改。
- 新增跨realm回归，修复前失败、修复后通过。临时诊断探针不进入正式生产源码。

## 已取得的原生证据

- 官方微信`agent tool`在旧隔离工程的端口9460完成真实调用，报告`D:/codex/rock-mini-ux44-release/output/miniapp-v1.2.2-ux44/ai-closeout/native-cases-report.json`，`passed: true`。
- 资料查询保留岚鸟不同形态；唯一ID的龙鱼先发制人对春天岚鸟返回51伤害/1段；极夜乌拉塔下注暗对龙鱼返回274伤害且自身49%；黑猫密探午夜噪音返回105伤害/5段。
- 歧义形态和不可学技能分别返回`ambiguous_entity`、`unlearnable_skill`，没有伪造伤害。
- 各案例完整MCP structuredContent、content文本与传入参数均与编译AI API的`local_reference`对照一致；不是仅凭CLI退出码或本地API测试判为原生通过。
- 暖调用每例约1.4秒；该结果不替代冷宿主所需等待，也不把之前诊断等待不足与真实跨realm校验bug混为同一故障。
- 对照案例与旧工程逐项官方回包均在旧树同一`ai-closeout`目录；旧工程完整自然语言查询也返回岚鸟4种形态，记录为该目录`chat-query-acceptance.json`。

## 最终1.2.3产物的原生回查

- 最终工程`D:/codex/rock-mini-ai-closeout/miniapp`已单独完成官方原子接口复验：`output/miniapp-v1.2.3-ai-closeout/ai/native-cases-report.json`为`passed: true`，六项完整MCP结果与对照一致。最终工程直接资料查询返回岚鸟4种形态，不沿用旧产物结论。
- 最终工程单工具自然语言伤害对话已取得真实`tool_result`和完整`finalText`，同一toolCallId配对成功；答复为51伤害、13.46%、剩余328/379，与工具结果一致。证据`ai/chat-single-damage-native.log`及`ai/chat-single-damage-acceptance.json`，后者断言通过。
- 首次查询的`tools/result`超时与后续断连记录保留在同一`ai`目录，包括首次`native-cases-final.log`；恢复后原样六案例全部通过，记录为`native-cases-final-recovered.log`。这些现象不用于猜测平台根因，也不据此修改产品协议。
- 另一次多工具聊天CLI捕获虽返回`completed/finished`，捕获内容没有全部工具结果、伤害调用或最终答复，因此该次捕获记录单独不足以证明业务完成；也不据此断言捕获结束后的普通UI行为。历史边界及官方捕获器只读依据见`ai/host-capture-boundaries.md`。
- 随后的实际原生多工具聊天UI已完整完成四次`searchRocoData`和一次`calculateRocoDamage`，最终答复51伤害、13.46%、剩余328/379，真实界面读回为`ai/chat-multitool-ui-readback.txt`。完整多工具查加算链路已有实际UI通过证据，CLI捕获局限不能再被写成该链路尚未完成。
- 已恢复debug为true，回执`ai/chat-debug-restored.log`。

## outputSchema实测修复接续

- 上述完整多工具UI当时仍显示工具结果的`outputSchema`校验警告；查询龙鱼的实测记录见`ai/query-schema-warning-ui.txt`。实际计算与答复已完成，响应声明遗漏是本轮随后修复的具体问题。
- 只补齐`mcp.json`两接口的真实响应字段：精灵/技能/特性、控件及visibleWhen、formulaSteps、assumptions、health、meta与错误candidates/natures/controls/inputs等；共享definitions与本地引用为所有对象声明properties、所有数组声明items。MCP envelope、接口实际结果、公式与协议不变，不用additionalProperties:true吞告警；完整compact元数据为9,790字节。
- `tests/miniapp/ai-skills-build.test.js`新增静态结构完整性与编译公共API实际查询、技能、特性、伤害和已知负例的递归字段校验；目标测试、定向ESLint及diff检查通过。独立校验对现有六份真实原生structuredContent运行AJV和逐字段检查，全部有效且无漏声明告警；这属于schema与既有结果对照，不冒充最新生产产物的实际UI消警复验。
- schema修正后的正式生产构建再次通过，日志`output/miniapp-v1.2.3-ai-closeout/schema-followup/production-build.log`，主包仍为1,747,418字节，五组受限API启动检查通过。
- schema修正后的最终产物已在重新打开工程后的首次自然语言对话中完成查询、学习面确认、伤害计算与最终答复；所有调用显示成功，无outputSchema校验警告，仍为51伤害、13.46%、剩余328/379。真实界面已读回，证据`schema-followup/chat-final-native-ui.png`及`chat-final-native-ui-acceptance.json`，没有用CLI部分捕获当作最终答复。
- 同一产物的官方六原子案例再次全部通过，完整structuredContent和传入参数与对照一致，记录`schema-followup/native-cases-report.json`及`native-cases-recovered.log`。先前直接CLI首调用超时保留为`cold-cli-cases-report.json`、`cold-cli-first-query.native.json`；本次首次聊天未先调用工具预热即已走通，不把后续暖工具验证写成冷CLI调用稳定性通过。
- debug已恢复true，回执`schema-followup/debug-restored.log`。同1.2.3开发版重传、最终输入提交及主线CI按下段最终回执记录。

## 本次生产门禁与接续

- 本树正式生产构建`npm run miniapp:build:prod`通过，含249项预设生成、来源与绑定校验、共享核心漂移检查、AI分包、生产包体及五组Android受限API启动检查；日志`output/miniapp-v1.2.3-ai-closeout/production-build.log`。
- `npm run miniapp:test`全量通过，含新增跨realm回归；日志同目录`miniapp-tests.log`。
- root定向AI独立构建、发布门禁与平台日志隔离测试通过，命令`npx vitest run --config config/vite.config.mjs tests/miniapp/ai-skills-build.test.js tests/miniapp/release-gate.test.js tests/docs/release-notes.test.js`；日志`root-ai-release-tests.log`。
- 受影响AI服务、测试、版本入口及root构建/门禁脚本以`eslint --no-ignore`定向检查通过，退出码0；日志`lint.log`。根ESLint原配置忽略miniapp，因此显式取消该忽略后检查本轮相关文件。
- 生产产物为本树`miniapp/dist`，不复用旧1.2.2目录；主包1,747,418字节。机器可读门禁摘要为同目录`verification-summary.json`，最终产物原生证据与本地测试分别记录。
- 2026-11-04约15:49，官方CLI以版本1.2.3和AppID`wx82f11dfdd3d28bc8`返回`√ upload`，这是第一次1.2.3开发版上传；输入提交`d5489afb690e237c4233e7d68b8c9c57b8fe389e`。首次回执`wechat-upload.log`、`wechat-upload-result.json`；微信处理后总包2,539,020字节、主包1,851,675字节、skills分包687,345字节。该历史回执不代表后续schema修正产物已重传。
- 约15:50上传后普通原生回读通过，`post-upload-readback.json`为`passed: true`，AppID相符、环境develop，设置小程序v1.2.3/核心v2.2.8/S5快照一致。这是本地DevTools运行时回读，不是后台正式版本列表查询。
- 源码主线同步沿用Git提交→推送origin/main；首次远端引用回读及CI结果记录在同目录`source-sync.json`和`verification-summary.json`，schema修正后的最终推送及CI由根任务继续。CI采用[项目Actions](https://github.com/Evenstar-tools/roco-calculator/actions/workflows/ci.yml)的实际运行结论。Web产物、发布pin与桌面版本不变，本轮没有手动部署Web、发布桌面、提交审核或公开上线。

## 外部状态边界

- 微信AI平台评测官方目前暂未开放，记录平台现状，不把本地或宿主联调成功写成平台评测通过。
- 普通DevTools截图已实际读回；149×321缩略图不足以支持精细视觉结论，也不代替实体手机证据。该事实限定本次证据范围，不新增持续质量待办。
- 未提审、未公开上线符合本轮开发版授权；后台正式线上版本AI代码提示与平台评测分别记录，不影响已经取得的官方开发工具AI调用证据。
