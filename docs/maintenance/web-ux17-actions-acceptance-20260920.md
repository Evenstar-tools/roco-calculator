# UX17 成员快捷操作验收

## 确认与范围

用户已确认 `artifacts/web-ux17/mockups-combined.png` 的两行两列布局，并要求上排补全为五字“设为攻击方／设为防御方”。下排“从攻方复制／从防方复制”不变。仅成员配置页展示，左侧原有按钮及 `06eb290` 恢复的完整侧栏均保留；未授权推送，本轮仅本地提交，版本保持 2.2.2。

## 实现

- 上排复用 `onApply(side, selectedMember)`，将当前队员设置到主界面；行为与左侧攻／防入口一致，包括关闭队伍面板。空位或待修复成员禁用。
- 下排复用 `onCaptureSide(side, activeTeam.id, selectedIndex)`，从主界面复制到选中队位；不复用相反方向的回调。
- 按 ui-ux-preview 与 design-craft 执行确认后实施、真实截图比对。使用 Phosphor 2.1.10 的 ArrowSquareOut / ArrowSquareIn bold 原始路径，不重绘；下排旋转 180 度，沿用攻红防蓝。
- 直接导入全部字重使 JS gzip 达到 348.64 KiB，超过 348 KiB 硬门禁。改为仅携带所需 bold 路径的 SVG symbol 资源，保留外观及 currentColor；最终 JS 347.95 KiB、CSS 55.94 KiB，未扩大预算。构建目录图标资源与源文件 SHA-256 一致。

## 验收

- 队伍组件 30 项通过，新增反向操作、选中第 2 位、空位禁用及左侧按钮保留回归。资源化后重复运行顶部操作和侧栏切页两项，均通过。
- 关键单测 1792 项、最终 E2E 11 项及 lint 通过。E2E 已包含生产构建与体积校验。
- 真实页面分别点击上排设置攻击方／防御方，主界面精灵正确；下排从攻／防复制，当前第 3 队位分别变为对应精灵，四方向通过。
- 1440/1920 按钮均为 110×36px；390 下为 173.5×44px，320 下为 138.5×44px。每个尺寸均为两行两列，无文字或按钮宽度溢出。
- 亮色、暗色与 390 窄屏实测截图已读回，图标实际可见；静态图标请求 200。未验收小程序或桌面安装包。

## 证据

- `artifacts/web-ux17/actions-acceptance/preview.html`：确认方案／实际实现对照，phase 为 acceptance。
- `artifacts/web-ux17/actions-acceptance/mockups-combined.png`：验收合图。
- `artifacts/web-ux17/actions-actual.png`、`actions-dark.png`、`actions-390.png`：实际运行截图。
- `artifacts/web-ux17/verify-actions.js`：四方向点击及四尺寸测量。

参考图成员为布灵，实际测试成员为同族布灵布灵；成员数据不作为对照项。实际布局沿用原组件的尺寸规则，上排文字较确认图补全一字，其余动作方向、图标及排列一致。
