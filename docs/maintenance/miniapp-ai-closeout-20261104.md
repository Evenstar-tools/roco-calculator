# 微信小程序 AI 联调收口 · v1.2.3 · 2026-11-04

## 源码与范围

- 工作树`D:/codex/rock-mini-ai-closeout`，分支`codex/miniapp-ai-closeout-20261104`。
- 从`origin/main@e3d34e7`正常合并已上传小程序分支`0bbaf78`，合并提交`c6529f8`保留完整历史；1.2.1生命输入/下注暗修复、1.2.2只读AI接口及UX44均完整进入。
- 根因修复来源`d4a0aa0`，本树接续为`5973754`。小程序独立版本由1.2.2升为1.2.3，更新日期2026-11-04。
- Web保持2.3.4、独立网页核心保持2.2.8，`config/miniapp-release.json`保持`a7c9f951b0560cd1fe5bc7dcd2695c2051076c3f`，249项内置预设及数据不变。没有改两服网页发布pin、缓存、E2E、桌面或公式。

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
- 对照案例与逐项官方回包均在旧树同一`ai-closeout`目录。本证据验证根因修复后的宿主调用；1.2.3最终生产产物仍需单独原生回查，不直接沿用旧产物结论。

## 本次生产门禁与接续

- 本树正式生产构建`npm run miniapp:build:prod`通过，含249项预设生成、来源与绑定校验、共享核心漂移检查、AI分包、生产包体及五组Android受限API启动检查；日志`output/miniapp-v1.2.3-ai-closeout/production-build.log`。
- `npm run miniapp:test`全量通过，含新增跨realm回归；日志同目录`miniapp-tests.log`。
- root定向AI独立构建、发布门禁与平台日志隔离测试通过，命令`npx vitest run --config config/vite.config.mjs tests/miniapp/ai-skills-build.test.js tests/miniapp/release-gate.test.js tests/docs/release-notes.test.js`；日志`root-ai-release-tests.log`。
- 受影响AI服务、测试、版本入口及root构建/门禁脚本以`eslint --no-ignore`定向检查通过，退出码0；日志`lint.log`。根ESLint原配置忽略miniapp，因此显式取消该忽略后检查本轮相关文件。
- 生产产物为本树`miniapp/dist`，不复用旧1.2.2目录；主包1,747,418字节。机器可读门禁摘要为同目录`verification-summary.json`，不将这些本地结果代替下一步最终产物原生验收。
- 本阶段仅本地提交，未推送、未上传、未部署Web或发布桌面。根任务随后在最终产物上完成官方AI调用与普通首开回读，再上传1.2.3开发版并按授权同步主线；没有提交审核授权。

## 外部状态边界

- 微信AI平台评测官方目前暂未开放，记录平台现状，不把本地或宿主联调成功写成平台评测通过。
- 本轮不提交审核或公开上线；实体手机、后台正式线上版本AI代码提示与平台评测分别记录，不影响已经取得的官方开发工具AI调用证据。
