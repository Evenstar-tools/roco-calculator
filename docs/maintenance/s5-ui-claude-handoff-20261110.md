# S5 性格计算 UI · Claude 接手说明

更新：2026-11-11。本文是本次 UI 工作的统一接手入口，覆盖用户意图、现有实现、目录、未完成项和验证方法。接手时先核对真实 Git 状态，再按用户接下来的要求推进。

**当前阶段：2026-11-11 第二批已按用户“提交并上线”授权上线。生产地址：https://rococalc.top/tools/s5-nature/index.html 。国服源码固定到 `8c36311a`（分支 `fix/s5-css-budget-20261111`），主线发布提交 `e323a1a9`，验收记录提交 `c71d2549`。第一批（`f2dfee93` / `bb7453b2`）见第 10 节，第二批见第 11 节；后文标明的早期本地状态为历史记录。**

## 1. 从哪里接手

| 位置 | 用途与状态 |
| --- | --- |
| `D:/codex/worktrees/roco-s5-player-flow-20261110` | **功能工作树。** 分支 `feature/s5-player-flow-20261110`，远端头 `44482326`。2026-11-11 时另有会话在此进行未提交的 evil-exchange 功能（改动 `matchup-preview.mjs`、`matchup-ui.mjs`、`player-flow.mjs`、`player-flow.css`、`ui.mjs` 与本文），不在已上线范围。 |
| `D:/codex/worktrees/roco-s5-css-budget-20261111` | 分支 `fix/s5-css-budget-20261111`（`8c36311a` + 本文更新），基于 `44482326`，只含 CSS 预算清理。**线上国服 pin 指向这里的 `8c36311a`。** 需合入功能分支，见第 11 节。 |
| `D:/codex/worktrees/roco-s5-player-flow-release-20261110` | 发布工作树，分支 `release/s5-player-flow-20261110` 跟踪 `origin/main`；两批发布、更新日志与发布记录均从这里推送。 |
| `http://127.0.0.1:8843/tools/s5-nature/index.html` | 当前真实源码预览，Vite 服务；交接时仍在运行。 |
| `D:/codex/rock-calculator-public` | 主仓库、发布编排及其他工作。已有未提交文档改动，勿 reset、清理或整体覆盖。 |
| `D:/codex/rock-calculator-public/artifacts/web-ux-s5-player-flow-20261109` | 旧 UI 示意稿与迭代截图，`proposal.html / proposal.js / proposal.css`；用于理解设计过程。 |
| `http://127.0.0.1:8842/proposal.html?v=6&example=hammer42` | 上述旧示意稿。这里的示例参数、夹具和独立演示代码不属于正式实现。 |
| `D:/codex/worktrees/roco-s5-nature-ui-claude-20261106` | 旧 Claude 工作树，停在早期实现；本次不要接到这里。 |

本批产品提交：

- `d771ca07`：玩家测试动线、物防／魔防与 HP 对照、手机布局、结果区域。
- `9daaa8f1`：独立属性证据、伤害 ±1 容错、冲突判读及回归。
- 本批源代码基线 `2ce65cc3`；以上两个提交是本次 UI 的实现范围。本文后续文档提交不改变产品版本。

发布来源容易混淆，以下为发布前交接快照（当前来源以第 10 节为准）：

- 主目录本地 `main` 为 `7477609e`，其中 `config/preview-release.json` 指向旧源码 `a5aa9434`。
- 本机缓存的 `origin/main` 为 `f395343b`，其中的国服指向为 `2e0def29`；它与本批基线 `2ce65cc3` 的 `public/tools/s5-nature/` 无差异。
- 上述是本次读取的本地 Git 状态，并非重新验收线上部署。正式合并时刷新来源、核对差异；不能只往主目录自己的 UI 文件里复制代码。
- 本实施工作树没有 `config/preview-release.json` 和 `scripts/build-cn-release.mjs`，这两项在主仓库发布编排中。现在不修改发布指向、版本、Global 或小程序。

先读本工作树 `AGENTS.md`；工作区通用规则见 `D:/codex/AGENTS.md`。详细历史见 [实施与验收记录](s5-player-flow-ui-20261110.md)，状态池见 [web-ux-backlog.md](web-ux-backlog.md) 的 UX25。

## 2. 用户要完成的事，以及已确认的取舍

玩家在游戏中遇到野怪，想判断“是不是我想要的性格”，据此决定继续测试、捕捉或换下一只。原页面需要上下翻找配置，解释文字多，三列标题把伤害与 HP 的关系混在一起，造成误判和反复纠错。

必须保留的方向：

1. 上方双方配置块、我方四个技能的对照表、野怪两个出招行，以及点击标记的操作逻辑。
2. **最大 HP 始终优先可见，任何测法都需要它。** 等级和异色会改变 HP；不把它只放进“测生命”子页。
3. Web 桌面优先，手机也能真正完成操作。不能靠缩小字体解决拥挤。
4. 生命重复标签使用图标与共享表头；用户明确不接受满屏“生命”两个字、重复模型提示和教学段落。
5. 国服原有多余外围可以裁剪；现有公式、有效数据和必要条件保留。不得因为清 UI 顺手重写计算模型。
6. 不把点击预估数值当作实测，不因为用户选了目标性格就提前过滤真实候选。

**建议动线（已有大部分实现，后文单列缺口）：**

```text
选择野怪：精灵 / 等级 / 异色
             ↓
查看常驻最大 HP；目标性格可选
             ↓
已有最大 HP 读数 → 直接录入，无需先配置我方
需要交战测算    → 选择测法 → 调整出战配置 / 配招 → 输入实测
             ↓
看已确认属性、仍待区分项和完整性格候选
             ↓
下一只：清本场记录，保留可复用的配置
```

当前野怪等级入口为 41／42／43／41–43 全部；我方等级支持 1–60，已放在出战行精灵旁，星级显示 5–10 星。手机展开一次出战配置即可修改等级。

两种测法在桌面上下同页，手机用同级页签切换，不做强制分步向导：

| 测法 | 玩家操作 | 直接证据 |
| --- | --- | --- |
| 测生命／防御 | 我方出招，选择四招之一，填实际伤害与剩余百分比 | 物攻技能对应野怪物防；魔攻技能对应野怪魔防；伤害与余血可反推最大 HP |
| 测物攻／魔攻 | 野怪出招，选其物攻／魔攻技能，填我方掉血 | 我方承伤面板必须正确；来伤用于判断野怪对应攻击属性 |

## 3. 已实现的 UI 与判读规则

### 布局和矩阵

- 桌面：上方双方配置，下方测试工作区和右侧结果栏。两种测法共用配置、最大 HP 和结果。
- 我方出招：三列表示被测防御的 **下降／不变／上升**。每列的大数字是该防御档预测伤害，下方三档心形图标对应 HP 下降／不变／上升时的剩余百分比。
- 防御和 HP 并非三个可以相加的“性格桶”。同一伤害可能对应多种完整性格，必须结合 HP 证据区分。
- 不存在的性格组合显示 `—`；真实 `0%` 保留，不能用横线替代。若四招同时包含物攻、魔攻，按每行技能对应的防御属性读表。
- 野怪出招：两个技能行分别显示攻击下降／不变／上升的预测伤害；可录总伤或单段伤害，多段条件仍可编辑。
- 手机：最大 HP 顶栏常驻；我方四招按槽切换；换招和条件按需展开；底部可跳到结果，输入聚焦或结果进入视野时底栏避让。
- 旧右上角“新目标／撤销／更多”、重复模型说明和旧结果栏已从当前可见界面隐藏。

### 选择、记录和清空

| 操作 | 现有行为 |
| --- | --- |
| 选择目标性格 | 高亮关注项、显示目标是否仍在候选，并按目标属性切测法；不参与求解条件 |
| 点击预估格 | 只标记；不填写伤害／余血，不改候选 |
| 切换测法页签 | 保留两边实测；结果汇总两边证据，而非仅看当前页 |
| 清空本页 | 只清当前方向的实测与标记，不清另一方向及独立最大 HP |
| 下一只 | 清各档案本场出招读数、受击读数、标记、直接 HP 和野怪骰子；保留精灵选择、等级、异色、我方配置、目标、双方配招与技能条件 |
| 修正等级、异色、性格、骰子、技能条件 | 保留原始读数，用新条件重算；这是纠错路径 |
| 换我方某个技能 | 清该槽的实测及标记；其他槽保留。手填条件按技能 ID 保存，换回原技能可能恢复原条件 |
| 改野怪种类 | 清当前目标相关记录，重新选择来招，重置野怪骰子和异色等目标条件 |

骰子效果参与实际计算；“已核对／未核对”只是核对状态，不能当作计算开关。默认无骰子也不等于玩家实际没有骰子。换对应精灵或骰子效果会使核对状态失效。

### 容错、属性证据和完整候选

- **按预测伤害判阈值：预测 >50 时，允许实测 ±1；预测 ≤50 时精确匹配。** 预测 50／实测 51 不匹配；预测 51／实测 50 可匹配。双方出招共用同一匹配函数。
- 单段输入先乘段数转换总伤，随后只允许总伤 ±1，不能扩大成每段 ±1。
- 余血百分比、直接最大 HP 保持精确；根据实际伤害反推 HP 的区间不放宽；不修改玩家输入或原伤害公式来凑匹配。
- HP、双防、双攻分别保留独立证据。一条错误只影响相关属性；同属性的所有记录仍求交，零命中或矛盾记录不能被自动丢弃。
- 全局完整性格仍取全部证据交集。候选身份保留 `等级:性格ID`，防止拼接不同等级的记录。
- 直接实测最大 HP 与“伤害＋余血”推算的 HP 共同求交，任何一方不能覆盖另一方的冲突。
- 右侧去掉泛化“有读数未吻合”大标题；存在局部结论时显示“已判断 X 项”，冲突留在具体属性与技能差值旁。
- 两项独立属性都能判断，但合起来无合法性格时，不显示虚假完整候选，也不宣告目标已排除。
- 我方出招的 KO／0% 记录不用于确认性格；野怪来伤超过我方最大 HP，仍可保留原始伤害作为攻击证据。

**原投诉案例：** 42 级异色锤头鹳，最大 HP 三档为 672／738／804；深渊罗隐四招中档伤害 502／538／681／322。只凭物攻伤害可判断物防档，不能直接判断“加生命”或“减魔防”。结合最大 HP=738，生命和物防均不变，莽撞仍在候选。回归使用的 `502＋32%` 中，32% 是测试夹具，不冒充评论者提供的实测。

## 4. 代码目录与真实接线

以下路径相对当前实施工作树：

```text
public/tools/s5-nature/       本工具源代码；原生 HTML / CSS / ESM
  index.html                 DOM 骨架、样式声明、启动调用
  web-startup.mjs             Service Worker 策略检查、并行加载、显示页面
  load-data.mjs               并行读取目录、骰子、特性、样本及预设
  ui.mjs                     唯一 session、存档、档案、全页装配
  player-flow.mjs             新动线、手机交互、直接 HP、新结果栏
  player-flow.css             新版布局与结果样式，最后加载
  matchup-ui.mjs             技能/条件/读数控件、预测矩阵、匹配和属性证据
  matchup-preview.mjs        按完整性格与等级生成双方伤害和 HP 预测
  measurement-comparison.mjs 实伤+余血反推 HP；按等级身份求证据交集
  own-presets.mjs             国服配置读取与专用预设
  own-panel.mjs               我方面板生成
  own-trait.mjs               特性条件与作用
  awakening.mjs               星级相关逻辑
  wild-hp.mjs                野怪最大生命
  wild-attack.mjs            野怪双攻模型
  wild-defense.mjs           野怪双防模型与校准点
  wild-forms.mjs              野怪形态/种族解析
  engine.mjs                 旧记录求解；部分函数仍被现行预测复用
  calibration.mjs            旧记录与历史样本对照
  hp-inverse.mjs              血量与游戏百分比相关逻辑
  picker.mjs / picker.css     搜索选择器
  styles.css / matchup.css / web.css  既有基础及 Web 布局
  assets/                    包括本批 hp-outline.svg
  data/                      目录、骰子、特性、野怪数据和样本
  vendor/                    已有伤害、属性与运行关系依赖
tests/domain/s5-nature-*.test.js     计算/比较/配置等定向测试
tests/e2e/s5-nature.spec.js          当前页面的维护 E2E
tests/build/s5-nature-ui-bundle.test.js  工具单包构建测试
scripts/build-s5-nature-ui.mjs       工具打包入口
scripts/s5-bwiki-runtime.mjs        国服运行数据和工具打包接入
docs/maintenance/                  本文、实施记录和 UX25 待办
artifacts/s5-player-flow/           本机截图、复现脚本、临时测试配置
```

主要调用链：

```text
index → web-startup.startTool → ui
  ├─ loadToolData → 恢复运行关系 / session / 默认配置
  └─ render
     ├─ engine.solve → 旧记录/校准区域
     ├─ matchupUi.render → previewMatchup → renderVerdict / uiVerdict
     └─ playerFlow.render → 合并直接 HP → 可见结果 / 手机摘要
```

关键函数定位：

| 文件 | 优先查看 |
| --- | --- |
| `ui.mjs` | `persist`、`presetProfile`、`autoGenerateProfile`、`renderProfiles`、`profile-tabs` 事件、末尾 `mountPlayerFlow` 装配 |
| `player-flow.mjs` | `normalizePlayerFlow`、`outgoingReadingVerdict`、`incomingReadingVerdict`、`clearCard`、`nextTarget`、`render`、`mountPlayerFlow` |
| `matchup-ui.mjs` | `observationMatch`、`readOutgoingObservations`、`readIncomingObservation`、`observationDifference`、内部 `state`、`renderVerdict` |
| `measurement-comparison.mjs` | `intersectNatureCases`、`compareObservedHp` |
| `own-presets.mjs` | `resolveOwnPreset`、`getOwnSkillIds` |

接线时特别注意：

- **可见右栏是 `#flow-result`，不是旧 `#preview-verdict`。** 新结果读 `matchupUi.getResult()`；旧 `engine.solve()` 不是它的求解入口。
- `getPreview().uiVerdict` 包含 `matching / candidates / evidence / hpComparison / axesEvidence`；`axesEvidence[属性]` 包含 `matching / candidates / used / conflict`。
- **直接 HP 在 `player-flow.render()` 中才合并。** 如果重构结果组件，只读取 `getPreview().uiVerdict` 会漏掉 `session.playerFlow.hp`。
- 样式顺序：`styles.css → picker.css → matchup.css → web.css → player-flow.css`。新布局通过移动既有 DOM 和最后覆盖样式实现。
- 被隐藏的旧节点仍有脚本引用。清理旧界面可以继续做，但必须同时解除读取、事件和调用依赖；直接删 HTML 会破坏启动。
- `engine.mjs` 的 `targetLevels / wildPanel` 仍被预测复用；`wild-defense.mjs` 的校准点仍参与数值计算。不能把它们当成废弃 UI 一起删除。
- 页面已有启动缓存保护。布局工作不绕过 `startTool()`，不改为直接加载 `ui.mjs`。

## 5. 状态与持久化

唯一会话存储键：`roco-pve-nature-manual-v1`。没有为新 UI 另起一套存档。`ui.mjs` 的 `persist()` 还兼容 `window.pveNaturePersistence.save`。

| 状态位置 | 内容 |
| --- | --- |
| `session.targetId / level / wildStatFormId` | 当前野怪、等级、形态 |
| `session.profiles[]` | 我方档案：精灵、等级、星级、性格、个体、面板等 |
| `profiles[].preview` | 我方四招、手填条件、骰子、特性、`observed` 实测、`picked` 标记 |
| `session.preview` | 野怪异色、骰子、来招、`incomingDamages`、输入单位和受击标记 |
| `session.playerFlow` | 当前页签、目标、手机技能槽、直接 HP、骰子核对签名 |
| `session.observations` | 旧顺序实测记录，不是当前四招／双攻输入的数据源 |

`window.pveNatureUi.getSession/getPreview` 返回副本，修改返回对象不会自动保存。`setSession()` 校验整份存档并保存，主要供现有导入和复现使用；正常局部操作沿用传入的 `commit()`。纯渲染用 `saveLayout(false)`，不在首次加载时把恢复失败的旧存档覆盖成默认值。

预设读取是另一条通道：`own-presets.mjs` 只读主计算器的 `rock-calculator.servers.cn.spirit-configs.v2`，不写回。罗隐／迪莫优先专用预设；其他精灵先个人配置，再内置配置库。本工具已支持另存、改名和删除 1–12 套配置，存入自身会话的 `profiles[]`。

## 5.1 方案 A 落地与后续迭代（Claude · 2026-11-10～11，已上线，见第 11 节）

用户在两套重做方案中选定“以 A 为主”：桌面四招对照表 + 读数旁直接给结论，手机单招查询。改动范围：

| 文件 | 改动 |
| --- | --- |
| `player-flow.mjs` | 重写挂载：新建 `#flow-setup`（野怪一行 `#flow-wild-card`、出战一行 `#flow-own-card`），把既有控件按 ID 移入；`#versus-grid` 保留但隐藏。读到的 HP 改为行内输入 `#flow-hp-value`（弹窗删除）。每招读数下新增 `#flow-row-verdict-out-N / -in-N`，由导出的 `outgoingReadingVerdict / incomingReadingVerdict` 生成。结论栏增加五项属性来源和 30 格矩阵，点格设目标。手机：出战摘要 `#flow-own-summary`、野怪“条件”展开 `#flow-wild-more`、顶栏 `#flow-next-top`。 |
| `ui.mjs` | `#profile-tabs` 改为“我的配置”下拉 `#profile-select` + 另存／改名／删除（`#config-dialog`）；配置 1–12 套，可选 `label`（≤24 字）；切配置后保存；`presetProfile` 保留原等级。 |
| `matchup-ui.mjs` | 受击读数按配置保存：`session.preview.incomingByDefender[配置ID:精灵ID]` 暂存 `skillIds / overridesList / units / damages / picks` 整套，切回恢复，读数始终跟着产生它的来招、条件和口径；没有暂存的配置沿用当前来招但不带读数；换目标、下一只清空。 |
| `index.html` | 新增 `#config-dialog`。 |
| `player-flow.css` | 末尾追加 v7 样式层（桌面、821–1100、手机、≤350）。旧层仍在，新层覆盖。 |

每招读数旁的结论：防御只看伤害（±1 按预测伤害判断）；伤害和余血都有时，生命档与右栏一样用 `compareObservedHp` 实伤＋余血反推，不从容错后的预测命中取生命档。一段吻合、一段冲突时分段标色（如绿色“物防不变”＋红色“生命对不上（推算 441–452）”）。对照表同一口径（`matchup-ui.mjs` 的 `defenseCellsMarkup`）：防御格的绿色只看伤害，生命百分比下划线只在实伤＋余血反推与该档最大生命一致时出现；只有余血时仍按预测余血对照。

删除配置时，引用它的旧顺序记录（`observations` 中我打敌／敌打我）一并删除，血量和毒伤记录保留；导入校验未放宽。

公式、±1 容错、独立属性证据、直接 HP 求交都没有改。下表第 6 节的五项已按上述方式处理；第 5 项（改条件保留旧读数）仍按纠错路径保留，手填条件靠技能旁“手填”标记和“恢复自动”识别。

**v8 布局调整（用户 2026-11-10 追加）**：设置区改回图 2 式“我方 | 野怪”左右两列、每项一行（我方：等级+星级、性格、个体、骰子、特性；野怪：等级+异色、血量+读到 HP、骰子、特性、目标+搜索范围）。新增左侧野怪头像栏 `#flow-roster`：按 S5 异色 → S2 异色 → 通行证 → 火红尾、云梦豚排列，均取 `catalog.targetGroups[].families[].spiritIds[0]` 初始形态；点选走原 `#target-species` change 路径，从异色组点进默认打开异色。821–1100 宽改为顶部横排，手机由“选野怪”按钮展开、选完收起。目前头像是普通配色小头像，项目内没有异色立绘素材。

**v9（发布后本地追加，未推送）**：上方两卡等高对齐，野怪行序为等级｜血量（含异色，手机异色移到等级排）｜目标｜骰子｜特性｜搜索范围，我方骰子、特性与之同高；“下一只”改名“清空读数”。头像栏改为只放立绘、无名字，小图顺着往下排、整栏滚动（中等宽度和手机为横排）。立绘素材位于 `public/assets/spirits/roster/<精灵ID>.png`（44 张，原图 1024，裁透明边后长边 192px，约 1.7 MB，懒加载），来源与校验值见同目录 `manifest.json`：S2 16 张为 BWIKI 异色立绘（`JL <拼音> yise.png`，幽影树、嘟嘟煲文件名为 youlingshu、duudbao）；S5、通行证、火红尾、云梦豚为普通立绘，来自 BWIKI 或 Candymo 页面实际加载的 `Pet1024` 图。**S5 异色立绘在 BWIKI 与 Candymo 都未收录**，S5 组暂用普通立绘，异色计算仍由点选时自动打开的异色开关负责。下载与处理脚本、原图在 `artifacts/s5-shiny-portraits-20261110/`（本机产物，不入库）。

**v10（本地，未推送）**：两卡底行并入标题行（我方“预设 · 面板”，野怪“搜索范围”；手机搜索范围收进“条件”），卡片与对照表行高压紧，1440×900 一屏放下。**用户 2026-11-11 要求先撤下整列立绘栏**（观感不理想、一屏放不下的不要），页面恢复“上方两卡 + 测试区 | 结论栏”；立绘成品与来源清单已移出发布目录，保存在 `artifacts/s5-shiny-portraits-20261110/roster-export/`（含 `manifest.json`），以后需要可再接回。“目标”标签保持原名。

**v11（本地，未推送）**：我方标题行只留精灵和“我的配置”，另存／改名／删除／载入推荐预设／详细面板收进“⋯”菜单（`#flow-own-menu`，原按钮仍由 `ui.mjs` 渲染并隐藏，菜单项转发点击）。立绘改为**异色目标抽屉**：左侧边缘竖直居中的把手 `#flow-roster-tab` 展开 `#flow-roster` 浮层，不占主界面版面；只收有异色形态（`hasShinyForm`）的初始形态，顺序 S5 → S2 → 通行证 → 火红尾、云梦豚；点选即切换目标、打开异色并收起，Esc／点外部／× 收起。立绘 23 张为异色（S2 全部、通行证 6 只、火红尾），S5 与热团团、新月鹭、地银链、沉金兽、云梦豚暂无异色立绘来源，用普通立绘。没有异色形态的精灵（如棋棋）不显示异色开关，已有回归。“目标”恢复原名。

**v12 与清理（本地，未推送）**：异色目标栏改为桌面（≥821px）左侧内嵌一列（无外框、透明底，默认展开，“‹ 收起”后只剩左侧边缘竖直居中的“异色”把手，展开状态记在 `playerFlow.roster`）；手机不提供该栏。随后清理 `player-flow.css`：① 删除引用源码已不存在的 class/id 或只作用于已隐藏旧版 `#versus-grid` 的选择器（85 个）；② 用 9 种宽度 × 5 种状态（有候选、目标已排除、生命冲突、部分判断与多段、空）的浏览器 CSS 覆盖率删除从未命中的规则（交互态、`[hidden]`、减少动效保留，67 条）；③ 删除同一选择器在后面相同或更宽作用范围内被重写的旧声明（269 条）。文件由 1094 行 / 77.6 KB 降到 900 行 / 61.1 KB；每轮清理后 47 张状态截图与清理前逐像素一致。清理脚本与截图在 `artifacts/s5-player-flow/`（`clean-css*.py`、`state-shots.mjs`、`state-shots/`）。`ui.mjs` 的 `profileLabel`、`MAX_PROFILES` 改为模块内常量。隐藏的旧 `#versus-grid` DOM 仍被 `ui.mjs` 引用（如 `#swap-direction`、`#own-card`），本轮未删。

**v13（本地，未推送）**：① 异色目标栏记住栏内滚动位置（`playerFlow.rosterScrollTop`）：收起再展开、选中目标、刷新、切到手机宽度再回来都保持原位，不再追到选中项或弹回顶部；隐藏时读到的 0 不覆盖记录，滚动后立即收起也会落盘（此段由并行会话实现，Claude 接手复核并实测）。② 骰子说明去重：选择框已写明效果，`#own-dice-note / #target-dice-note` 只在资料缺失、双系系数或未接入结算时显示警告。③ 删除易误解的“战斗面板已含骰子属性”勾选（`.dice-panel-source label` 隐藏，原状态字段保留），改为任一方开骰子时显示一行“显示面板已包含双方骰子属性，如需手填面板需清除骰子”。④ 野怪标题行“搜索范围”下拉按内容宽度显示，不再截字。⑤ 骰子行标签与开关顶部对齐。

Codex 复核（[s5-ui-claude-review-20261110.md](s5-ui-claude-review-20261110.md)）提出的三项已修复，并补 E2E「plan A review」：A 填数→B 换招→A 及多段单段口径、刷新；163／64% 行内与右栏一致判生命冲突；带旧记录的配置删除后刷新正常恢复。非阻塞项同步处理：矩阵点格与下拉设目标一致切测法；≤350 宽矩阵表头去图标不折行。

最新复核补充：上述原始复现已通过，另发现两个已复现的存档边界待修：① 前一版仅含 `damages/picks` 的旧暂存缺技能上下文，仍会把旧读数恢复到当前来招；② 删除配置后旧 `incomingDefender` 未重置，渲染会把被删配置重新放回暂存，反复另存／删除后可超过暂存上限并导致刷新恢复失败。详情见复核文档最新状态；不能把普通切换和单次删除通过扩大为旧暂存迁移、反复删除也通过。

自检脚本：`artifacts/s5-player-flow/check-plan-a.mjs`（26 项），截图脚本 `shoot.mjs`；截图 `artifacts/s5-player-flow/screenshots/a-*.png`。

## 6. 动线复核问题（原记录；处理结果见末列与 5.1）

下表是方案 A 之前核实的问题及当时的建议。前四项已在 5.1 实施并有回归；第五项按纠错路径保留，见表后说明。

| 优先级 | 问题与复现 | 建议落点 / 验收 |
| --- | --- | --- |
| 高 | 我方等级支持 1–60，却藏在默认收起的详细面板；外层只显示星级。展开后又有重复六项数值摘要。 | `ui.mjs`、`index.html`、`player-flow`。等级放在精灵旁，等级与星级明确区分；收起高级项仍能看到当前等级；去重复摘要。 |
| 高 | 换我方精灵或“载入预设”会把等级重置为 60，并替换性格、个体和配招。仅两个档案槽，无任意多套配置的保存/命名入口。 | `presetProfile / resolveOwnPreset`。区分推荐预设与个人常用配置；若实施保存，应含等级、星级、性格、个体、骰子、特性、四招及手填条件。 |
| 高 | **切档案受击读数丢失，刷新可能恢复旧档案和旧读数。** 输入受击 11 → 切另档为空 → 切回仍为空 → 再切另档并刷新，回到旧档和 11。 | `ui.mjs` 的 `profile-tabs` 未调用持久化；`matchup-ui.state()` 根据 `incomingDefender` 清共用来伤。建议按我方配置隔离来伤并保存当前档案。测试必须包括切回与刷新。 |
| 中 | 手机改我方等级要先展开配置，再展开详细面板；野怪等级、异色、直接 HP 入口也在折叠区。 | `player-flow`。常用条件易见易改，避免两次展开加长距离滚动；390/320 宽度实测。 |
| 中 | 改条件保留读数是纠错功能；实际换了一套出战条件时可能误用旧记录。换回技能还会恢复该技能旧手填条件。 | 保留纠错路径及“下一只”的清场语义；手填条件需可识别、可恢复自动。不要一改等级就清掉用户用于纠错的实测。 |

处理结果：① 等级在出战行精灵旁，详细面板不再承担等级入口；② 换精灵、载入预设保留等级，“我的配置”可存 1–12 套命名配置；③ 受击读数连同来招、条件、口径按配置保存，切回与刷新恢复；④ 手机出战摘要点一次展开，野怪等级、异色、最大生命、读到的 HP 常驻；⑤ 改条件仍保留读数以便纠错，手填条件有“手填”标记和“恢复自动”，不同出战配置的读数已隔离。

这些问题的复现脚本在 `artifacts/s5-player-flow/audit-entrypoints.js`、`audit-profile-switch.js`；截图为 `flow-audit-own-details.png`、`flow-audit-mobile-config.png`、`flow-audit-mobile-details.png`。

## 7. 运行、复验与交付

本机依赖是 Junction：本工作树 `node_modules` 指向 `D:/codex/rock-calculator-public/node_modules`。不要重装或清理共享依赖来解决普通页面问题。搬到其他机器时需要按锁文件安装，不把 Junction 当作可移植的依赖包。

进入工作树并核对状态：

```powershell
Set-Location -LiteralPath 'D:\codex\worktrees\roco-s5-player-flow-20261110'
git status --short --branch
git log -3 --oneline
```

8843 未运行时才启动，避免重复占端口：

```powershell
npm run data:runtime
npx vite --config config/vite.config.mjs --host 127.0.0.1 --port 8843 --strictPort
```

与当前逻辑相关的定向测试（有相关代码变更再运行）：

```powershell
npx vitest run --config config/vite.config.mjs tests/domain/s5-nature-measurement-comparison.test.js tests/domain/s5-nature-preview-settings.test.js tests/domain/s5-nature-web-startup.test.js tests/build/s5-nature-ui-bundle.test.js
npx playwright test tests/e2e/s5-nature.spec.js --config artifacts/s5-player-flow/playwright.local.config.js --grep 'player flow compares|paired measurements|separates HP evidence'
```

`playwright.local.config.js` 使用已启动的 8843，不再构建/启动另一个服务；其中路径为本机绝对路径，换工作树时要同步修改。这个文件与 `artifacts/` 截图是本地产物，不随 Git 自动交付。正式发布门禁另按项目规则执行，当前本地验证不等于生产验收。

已完成的验证范围：

- 现有双方技能、标记与实测分离、合法防御/HP 分支、0% 和多段输入。
- 预测 50/51 的容错边界，503 可匹配预测 502，504 超出容错；原读数不改写。
- 偏差保留其他属性、同属性冲突不丢弃、直接 HP 与推算 HP 冲突、跨等级不拼接。
- 双攻分别加但没有共同性格时，保持分项结果且不伪造完整候选；无效输入不连带无关属性。
- 本地桌面及 390/320 布局与操作、定向域测试、相关 E2E、工具单包构建和定向 ESLint。**尚未验手机真机软键盘，也未验本批线上部署。**

建议看这些实际截图：

- [桌面正常对照](../../artifacts/s5-player-flow/screenshots/s5-axis-evidence-desktop.png)
- [局部冲突仍保留有效属性](../../artifacts/s5-player-flow/screenshots/s5-axis-evidence-independent.png)
- [390 手机相同冲突状态](../../artifacts/s5-player-flow/screenshots/s5-axis-evidence-independent-390.png)
- [直接 HP 冲突](../../artifacts/s5-player-flow/screenshots/s5-axis-evidence-hp-conflict.png)
- [320 手机正常对照](../../artifacts/s5-player-flow/screenshots/s5-axis-evidence-320.png)
- [测双攻页面](../../artifacts/s5-player-flow/formal-attack.png)

评论区证据在 `artifacts/s5-player-flow/comment-319678585393-20261110.json`；锤头鹳夹具复现见 `replay-comment-case.js`；双攻／局部冲突复现见 `check-cross-axis.js`。这些是证据与诊断脚本，不是第二套产品实现，也不是全部实测数据集。

主仓库还保留以下研究交接，涉及数值追溯时再读：

- `D:/codex/rock-calculator-public/docs/maintenance/s5-hammerstork-replay-20261109.md`
- `D:/codex/rock-calculator-public/docs/maintenance/s5-evolution-defense-handoff-20261109.md`
- `D:/codex/rock-calculator-public/docs/maintenance/s5-latest-competitor-comparison-20261109.md`

上述研究文件中的发布版本、系数状态是当时快照，不能覆盖本工作树现行代码与本次用户确认的规则。主目录这些文档有尚未提交的工作，不混入本 UI 的提交。

## 8. Claude 接手后的收口方式

1. 读本文，检查本工作树状态，打开 8843 的真实页面；优先复用现有入口，保留已确认方向。
2. 依据用户下一步要求处理第 6 节待办。对其他保留部分不重新做一轮风格探索，不把旧 demo 复制回产品。
3. 调整后验证真实操作和受影响的持久化、清空边界，按改动范围做最小充分测试并读回截图。
4. 更新本交接和 UX25：分别写清已实现、已验证、剩余问题。保持可交给用户确认的本地预览。
5. 本批已获用户确认并完成国服 Web 发布；后续新增改动沿用当次授权。发布保持 Git → `origin/main` → EdgeOne 自动部署 → 生产站验收，重新核对固定源码及后续修复。桌面安装包和小程序发布不在本批范围。

## 9. 进入页面卡顿优化（Codex · 2026-11-10；下列为发布前测量）

用户授权优化进入时的读取／卡顿。本轮保持当前界面、公式和完整搜索范围，调整启动执行方式：

- `ui.mjs`：省去默认配置生成前的重复渲染；精灵筛选和搜索行按查询／范围复用。隐藏 select 仅存当前选项，完整目录留在搜索器数据中。
- `matchup-ui.mjs` / `picker.mjs`：六个技能控件同样不再预先创建整份隐藏 option；鼠标、键盘选中时同步真实值。回到初始形态的程序选择入口也已适配。
- `web-startup.mjs`：旧 Service Worker 验证通过后，HTML／启动文件缓存回填与 CSS/UI 并行；界面就绪即显示，启动 Promise 仍等待回填完成后返回。缓存安全门保持原有规则。

本机 8843、1366×900、4 倍 CPU 降速、禁用 HTTP 缓存，预热后交替测优化前后各三次，中位数如下。这是本地模拟，未测线上网络或手机真机：

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 首屏显示并经过两帧 | 1393 ms | 1034 ms |
| 数据响应结束至初始化完成 | 520 ms | 377 ms |
| 长任务阻塞合计（各任务超出 50 ms 的部分） | 666 ms | 345 ms |
| 初始隐藏及可见 option 总量 | 2249 | 215 |

原始交替测量保存在 `D:/codex/worktrees/roco-s5-player-flow-20261110/output/playwright/s5-startup-paired-results.txt`；`s5-startup-paired.cjs` 使用本轮改动前保留的三个源文件作为浏览器响应，不覆盖工作树来回切版本。

已验证：现有 S5 页面回归、补充的键盘选择／保存的进化形态转回初始形态／刷新恢复、启动和数据加载测试、正式单包构建测试；桌面与 390 手机实际截图已读回，手机无页面横向溢出。以上优化仍在本工作树，未发布。工作期间并入的 Claude 判读／存档修复保留，本轮不将这些修复归为性能改动。


## 10. 本批上线授权 · 2026-11-10

用户明确要求“先把新ui推上线试试”，已进入正式国服 Web 发布流程。发布源码保留最新冥古龙／阿布等级修复，包含新 UI、独立判读、伤害容错和进入加载优化。两处已复现的存档边界及局部高亮建议继续按复核记录跟进。本节更新前的“未提交／未发布”为当时记录；最终提交与线上验收以本节后续追加和发布记录为准。

发布构建发现CSS超过现有上限；用户明确“旧的不保留了”。已清理旧布局无入口样式和重复覆盖，正式工具由Vite按原层叠顺序合并压缩CSS，输出单一指纹样式，移除旧分散CSS产物。没有改变体积上限，配置与实测数据继续保留。

### 已上线与生产验收

- 2026-11-10 21:41–21:43（北京时间），生产页已切换到新 UI：https://rococalc.top/tools/s5-nature/index.html 。
- 国服源码 pin：`f2dfee93588a0d00a9375977b782cb3b32aaa295`；首个主线发布提交：`bb7453b2c733e7103cf39f007dcaa21c9ae08e35`。国际服及小程序 pin 未变。
- 生产资源可访问，桌面及 390 手机实际显示、配置切换、等级、生命冲突判读、刷新恢复、键盘选择已验证；旧 Service Worker 缓存升级成功。手机真机软键盘未测。
- 旧样式与重复 UI 模块已从正式产物移除；页面仅加载一个合并 CSS，保留配置和实测存储。加载优化已随本批生效，本地降速测量见第 9 节，不将其当作线上网络性能数据。
- 首次云端检查有一条旧存档用例被输入后的自动保存抢先覆盖；已将旧存档 fixture 改为新文档初始化前装载，在生产页连续三次通过。该修正只涉及测试，不改变线上产品代码；最终云端状态可从主线 Actions 回查。
- 继续保留的待办：无技能上下文的旧预览受击记录兼容、反复删除配置产生孤立暂存、生命冲突时预测格高亮细化。具体复现见 `s5-ui-claude-review-20261110.md`，本批未处理。
- 发布编排及证据位于 `D:/codex/worktrees/roco-s5-player-flow-release-20261110`；记录为 `docs/maintenance/s5-player-flow-release-20261110.md`，线上桌面／手机截图位于 `output/playwright/s5-live-desktop.png` 与 `s5-live-mobile.png`。

## 11. 第二批上线 · 2026-11-11

用户授权：“提交并上线”。范围为 5.1 节 v7～v13 的全部内容：我方／野怪两列对齐与“⋯”配置菜单、“清空读数”、宽屏可收起的异色目标栏（44 张立绘，记住展开状态与滚动位置，手机不提供）、复核三项修复、生命判读与对照表高亮统一反推口径、骰子提示精简、搜索范围不截字、样式清理。

### 提交与指向

| 项 | 值 |
| --- | --- |
| 功能提交 | `b67c19f9`（代码、测试、`public/assets/spirits/roster/` 立绘）；交接 `44482326`；均在 `feature/s5-player-flow-20261110` |
| CSS 预算清理 | `8c36311a`，分支 `fix/s5-css-budget-20261111`（基于 `44482326`） |
| 国服 pin | `config/preview-release.json` → `8c36311a1f7c103b23a4667ffd305a4b6dc803e6` |
| 主线 | 发布 `e323a1a9`，验收记录 `c71d2549`；缓存版本 `rock-calculator-webapp-v2.3.17-20261111-player-flow-r2` |
| 国际服 / 小程序 | pin 未变 |

### CSS 预算

首次构建 CSS gzip 97.41 KiB，超过 96 KiB 硬上限。未调预算，改为浏览器累积判定：5 种状态 × 9 种宽度及菜单、弹窗、异色栏交互下，按层叠顺序逐条停用规则，命中元素计算值不变才删除（交互态选择器保留），五个工具样式共删 210 条；47 张状态截图逐像素一致，构建后 95.89 KiB。**余量仅约 0.1 KiB**，后续新增 S5 样式时需同步删减，或先和用户确认预算。脚本：`artifacts/s5-player-flow/css-redundancy.mjs`、`clean-css-redundant.py`、`state-shots.mjs`（本机产物）。

### 验证

- 发布前：发布单测 2948 项、正式聚合构建、发布浏览器回归 66 项通过。
- 线上：部署资源检查 81 项；生产站 S5 回归 5 项；1440 桌面异色栏、立绘加载与点选，390 手机无异色栏、无横向溢出；控制台无错误、无失败请求。截图与日志在发布工作树 `output/playwright/s5-live-r2-*.png`、`output/s5-player-flow-release/r2-*.log`。
- 手机真机软键盘仍未测。

### 运行注意

- 正式构建和 CLI 发布测试需在 **PowerShell** 运行；Git Bash 的 GNU tar 会把 `D:` 盘符当远程主机，报 `Cannot connect to D:`。
- 改样式后用 `state-shots.mjs`（清理前后各拍一组）逐像素比对；单条停用检测不到“两条规则设同值”的情况，必须用累积式脚本。

### 待办

1. **合并分支**：把 `fix/s5-css-budget-20261111` 合入 `feature/s5-player-flow-20261110`。功能工作树的未提交改动也改了 `player-flow.css`（末尾追加新样式），合并时保留其新增、采用本分支删除；合并后先跑构建预算再继续开发。
2. 合并完成后可删除工作树 `roco-s5-css-budget-20261111`（8844 预览服务已关闭）。
3. S5 异色立绘：BWIKI 与 Candymo 尚未收录，S5 组与热团团、新月鹭、地银链、沉金兽、云梦豚暂用普通立绘；来源上线后按 `public/assets/spirits/roster/manifest.json` 的方式补齐。
4. 隐藏的旧 `#versus-grid` DOM 仍被 `ui.mjs` 引用，未删除。
