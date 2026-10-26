# 洛克计算器维护交接

## 2026-10-27：S5 抢先网页独立入口

- 用户已授权网页 `/pre` 上线，正式 S4 页仅加工具箱入口，预览采用固定源码双构建及独立存档/资源/缓存边界。完整实现、验收与后续更新入口见 [本轮交接](s5-pre-web-release-20261027.md)。
- 抢先源提交固定在 `config/preview-release.json`，后续在 S5 工作树开发并审核后更新 pin。当前未知 S5 数值和机制继续阻断计算；不更新桌面安装包或小程序。最终线上回查记录保存在 `output/pre-release-online/`。

## 2026-10-23：队伍卡片拖动排序（2.2.7）

- 用户授权：卡片按住拖动调整顺序，拖动期间其他区域变暗；保留现有静止布局。
- 独立工作树：`D:/codex/worktrees/roco-team-drag-20261022`，分支 `codex/team-roster-drag-20261022`，基于 `4630a88`。主工作树已有其他任务的未提交内容，本轮未改动它。用户于 2026-10-23 授权提交上线 Web、更新 Windows 与 Release；版本 2.2.7，小程序不发布。
- 交互参考：[Atlassian 拖拽设计规范](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines/)的浮卡与落点反馈、[SortableJS](https://github.com/SortableJS/Sortable)的长按延迟与移动阈值。不新增运行时依赖。
- 实现：`useRosterDrag` 处理鼠标拖动、手机长按、遮罩和取消；`TeamRoster` 展示浮卡及落点；队伍仓库 `moveMember` 按插入顺序整体移动成员，仅松手时保存，保留空位、技能和全部成员配置。当前编辑成员跟随新位置；普通点击与攻防按钮保持原行为。另支持 Alt＋方向键相邻移动。
- 已验：相关状态和交互用例、定向 ESLint、`git diff --check`、正式 Web 构建通过；正式产物实页验证鼠标排序、刷新保留、完整配置保留、Esc／拖出取消、手机长按排序／短滑不排序／触摸取消。1440×960 桌面、390×844 手机亮暗截图读回和独立视觉复核通过。手机使用 Chromium 原生触摸事件模拟，未做微信原生或桌面安装包验收。
- 验收发现并修复：手机媒体样式把浮卡压窄；拖动后的误点抑制误吞队伍列表之外的关闭点击。后者已并入维护用例。
- 本地预览：`http://127.0.0.1:4230/`（正式构建产物）。实页截图与复现脚本在该工作树 `artifacts/team-drag/`；`dragging-desktop.png`、`dragging-mobile.png`、`dragging-mobile-dark.png` 分别为桌面、手机亮色、手机暗色拖动态。
- 2.2.7 发布验收：数据、共享核心、预设镜像、用户日志和关键浏览器门禁通过。单元门禁在共享 node_modules 的本机路径限制下使用临时 fs.allow 配置，已通过项保留，仅补验工作进程启动超时文件；未修改产品构建配置。Windows 安装包解包资源与最终 Web 构建逐字节一致，原生离线启动及实际桌面拖动、取消、刷新保留通过；使用隔离用户目录，没有改动用户桌面存档。未执行安装／卸载或真机触摸验收。
- 发布证据入口：本工作树 `artifacts/team-drag/release-227/` 保存打包核对、离线自检、桌面实页截图及后续公网／Release 回读。源码以 `v2.2.7` 标签、远端 `main` 和对应 Release 的实际状态为准；GitHub 只保留版本化 Windows EXE，不额外生成校验清单。

## 当前 `main` 产品基线

- Web / 桌面端版本：根 `package.json` 的 `version`，这是网页与桌面版本号的唯一事实来源。
- 微信小程序版本：`miniapp/package.json` 的 `version`；`miniapp/src/version.js` 的 `WEB_CORE_VERSION` 记录它镜像的已发布网页核心标签。
- 门禁脚本与测试断言一律从上述两个 `package.json` 派生，不再复制版本字符串。
- 桌面端由 Web 构建产物通过 Electron 离线封装。
- 微信小程序复用 Web 的计算核心，但拥有独立页面、状态适配和发布流程。

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `src/domain` | Web 与桌面端计算规则的权威实现 |
| `src/data` | Web 运行时补充数据、规则和用户更新日志 |
| `src/state` | 分享、收藏、配置库、队伍和显示设置 |
| `scripts/bwiki` | 数据构建、素材同步和校验 |
| `scripts/miniapp` | 共享核心同步、小程序发布校验 |
| `miniapp/src/shared` | 由同步流程维护的小程序共享计算核心 |
| `public/data` | 运行时数据与预设（`runtime.json`、`presets/`） |
| `data/snapshots` | 权威审计快照（`current.json` 与历史赛季） |
| `desktop` | Electron 入口与离线路径处理 |
| `tests` | Web、桌面、共享核心、数据、UI 与发布门禁 |

## 权威关系

1. 伤害公式、技能规则和特性规则以 `src/domain` 为准。
2. 小程序共享文件不得单独手改；先修改 Web 权威文件，再运行 `npm run miniapp:sync-core`。
3. `data/snapshots/current.json` 是当前数据快照，`public/data/runtime.json` 是构建生成物。
4. 精灵、技能、属性、学习集和头像必须通过数据校验后才能进入发布。
5. 用户状态兼容以分享参数、本地存储 schema 和配置库 schema 为边界，不随赛季更新直接覆盖。

## 接手顺序

1. 查看 `git worktree list` 和每个工作树的 `git status --short --branch`。
2. 不在脏工作树中执行清理、回退或批量格式化。
3. 从 `origin/main` 建立独立工作树处理新需求。
4. 先运行 `npm ci`、`npm ci --prefix miniapp` 和基础测试，再开始修改。
5. 规则改动先写失败测试；数据改动先保存来源和差异报告。
6. 完成后按 `release-checklist.md` 逐项验收。

## 赛季更新

赛季数据、技能数值、特性描述和特殊规则分开处理：

- 数据字段变化进入数据构建与校验。
- 可以从描述确定的统一规则进入规则表和参数。
- 依赖层数、应对、生命、能量或技能位置的规则必须提供明确输入控件。
- 缺少可靠依据的内容保持“需要输入”或“不参与计算”，不得猜值。
- 每个特殊规则至少覆盖默认、触发、边界、双向和分享恢复场景。

详细流程见 [赛季数据更新](../season-update-runbook.md)。

BWIKI 资料更新可先用 `npm run -s data:check-updates` 做只读判断；2026 年 9 月 10 日更新按[专用执行单](season-update-2026-09-10.md)处理。

## 发布与回退

- Web、桌面和小程序分别构建、分别验收，不能用其中一个成功替代另外两个。
- 桌面安装包保留 SHA256、版本说明和签名证书。
- GitHub Release 是长期历史发布库；本机默认只保留当前稳定版和上一稳定版。
- 回退时恢复同一版本的数据、规则、素材和状态 schema，重新运行完整门禁后再发包。

详细检查项见 [发布检查单](release-checklist.md)。
