# UI/UX 优化轮工作流(出图 → 确认 → 实施 → 验收)

适用场景:用户提出"跑一轮 UI/UX 优化""审计观感和交互""再来一批 UX 改进"等请求时,按本流程执行。
核心约束:**任何视觉改动在用户确认对比图之前不得落入代码**;后端/纯逻辑改动可以直接做,做完汇报。

## 固定顺序与批次

1. 先小程序(miniapp),后 Web/桌面(两者互通,一套改动同时覆盖)。
2. 每个平台为一个独立批次:实施 → 验收 → 单独提交,不跨平台混提交。
3. 一轮结束后如用户说"再跑一轮",从阶段 A 重新开始,轮次编号 +1(artifacts 目录后缀)。

## 阶段 A:审计与出图

### 环境

| 平台 | 启动命令 | 地址 |
| --- | --- | --- |
| 小程序 H5 预览 | `npm --prefix miniapp run dev:h5` | `http://localhost:10087` |
| Web | `npm run dev` | `http://localhost:5173` |

先查 `terminals` 里是否已有 dev server 在跑,不要重复起。

### 步骤

1. 用 Playwright(项目自带 `@playwright/test`)写一次性脚本放 `tmp/`,对当前 UI 做全面截图巡检:首页空态、双方配置、四技能面板、条件条、结果栏/结果抽屉、菜单、各弹层;移动宽度(390px)和窄档(320px)、亮暗两主题都要覆盖。
2. 从截图中挑出 3~6 个候选改动点,每个点做 **before/after 对比图**:
   - after 效果用 `page.evaluate` 注入 CSS/DOM 模拟,**不改仓库代码**;
   - 每个候选点注入后立即截图并**还原 DOM**,再做下一个,避免脏效果串图(教训:W1 after 图混入了 W3 的注入痕迹);
   - 所有候选点的前后对比**合成为一张大图**(sharp 或 canvas 拼接),每格标注编号①②③…和一句话说明。
3. 产物统一放 `artifacts/<mini|web>-ux<轮次>/`,命名 `mock-<m|w><编号>-before/after.png`、合成图 `mockups-combined.png`。

### 呈现给用户

- 给**本地绝对路径**并用 `![](路径)` 内嵌(聊天内嵌链接可能裂开,路径必须同时以文本形式可复制);
- 逐条编号列出改动点、一句话动机;
- 明确等待确认,**不动手**。

## 阶段 B:用户确认

- 用户按编号裁剪,如"小程序的1不要""2的胶囊不要其他都做"——只删被点名的部分,同一编号内未被点名的子项照做。
- "不要说明要功能"类反馈 = 去掉说明性文字,把交互本身做成真功能。
- 有歧义时先复述理解再开工,不要猜。

## 阶段 C:实施

- 只做确认通过的项;实现以 after 注入的 CSS 为基准,但要落到正式样式分层:
  - Web 样式在 `src/styles/` 分片内,暗色覆盖写到对应 dark 段(注意 `12-ui-refresh-results.css` 的 dark 规则在级联后段,hover 等新规则要放在它之后);
  - 小程序样式在 `miniapp/src/pages/index/styles/`,注意窄屏断点在 `responsive.css`;
  - 行为改动走既有 state 通道(如 `dispatch({ type: "direction/update", ... })`),新增 prop 两处 `ResultRail`(App 桌面栏 + WorkspaceOverlays 移动抽屉)都要接。
- 交互元素若从 `div` 变 `button`,必须补 `background: transparent`(UA 默认底色)并检查亮暗两主题 hover。

## 阶段 D:验收(每批必做)

小程序批:

```powershell
npm --prefix miniapp test -- --run
node tmp/<验证截图脚本>.mjs        # H5 实测截图,肉眼核对
npm run miniapp:build              # weapp 构建
git add <仅本批文件>; git commit
```

Web 批:

```powershell
npm test          # 全量单测（pretest 校验当前权威核心与小程序镜像）
npm run lint
npm run e2e
npm run build     # 含性能预算门禁
node tmp/<验证截图脚本>.mjs        # 亮暗两主题实测截图
git add <仅本批文件>; git commit
```

验收要求:

- 新交互必须补至少一个单测(参考 `tests/ui/app-integration.test.jsx` 的"四技能模式下点击技能结果行可切换当前技能");
- 截图读回是硬性验收项,不能只看测试绿;
- 提交必须**逐文件 add**,严禁 `git add -A`——工作区可能有其他会话的在途改动(如 `trait-effects`、`check-core-drift.mjs`)。

## 已知坑(踩过的)

| 坑 | 处置 |
| --- | --- |
| 直接 `npx vitest run` 报 `document is not defined` | 必须带 `--config config/vite.config.mjs`,或用 `npm test` |
| Taro H5 元素拦截点击 | 用 `aria-label` 定位 + `click({ force: true })` |
| 截图被底部固定结果栏遮挡 | 先 `el.scrollIntoView({ block: "center" })` 再按 boundingBox 裁剪 |
| 小程序遮罩不渲染变暗 | 遮罩必须带 `@keyframes` 淡入动画强制合成层 |
| E2E 点击偶发丢失 | 用 `expect().toPass()` 重试包裹(见 `data-source-dialog.spec.js` 的 `openMenuItem`) |
| Web 默认主题非亮色 | 截图脚本用头部"切换主题"按钮切换,两主题各拍一次 |
| 四技能默认态 | "具体版"默认即四技能模式,技能自动带出,无需手选 |

## 汇报模板

结果先行:每批列出提交号、确认项如何落地(含被裁剪项的说明)、验收数字(单测/E2E/构建门禁),并内嵌关键验证截图。区分"已实施+已验收"与"跳过(用户裁剪)"。
