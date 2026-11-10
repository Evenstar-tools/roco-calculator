# S5 性格计算 UI · Claude 接手说明

更新：2026-11-10。本文是本次 UI 工作的统一接手入口，覆盖用户意图、现有实现、目录、未完成项和验证方法。接手时先核对真实 Git 状态，再按用户接下来的要求推进。

**当前阶段：国服 Web 本地候选已实现，未推送、未上线。用户要求“等我确认后更上线”；交接本身不改变这个边界。**

## 1. 从哪里接手

| 位置 | 用途与状态 |
| --- | --- |
| `D:/codex/worktrees/roco-s5-player-flow-20261110` | **当前实施工作树，继续开发用这里。** 分支 `feature/s5-player-flow-20261110`。写交接前工作树干净。 |
| `http://127.0.0.1:8843/tools/s5-nature/index.html` | 当前真实源码预览，Vite 服务；交接时仍在运行。 |
| `D:/codex/rock-calculator-public` | 主仓库、发布编排及其他工作。已有未提交文档改动，勿 reset、清理或整体覆盖。 |
| `D:/codex/rock-calculator-public/artifacts/web-ux-s5-player-flow-20261109` | 旧 UI 示意稿与迭代截图，`proposal.html / proposal.js / proposal.css`；用于理解设计过程。 |
| `http://127.0.0.1:8842/proposal.html?v=6&example=hammer42` | 上述旧示意稿。这里的示例参数、夹具和独立演示代码不属于正式实现。 |
| `D:/codex/worktrees/roco-s5-nature-ui-claude-20261106` | 旧 Claude 工作树，停在早期实现；本次不要接到这里。 |

本批产品提交：

- `d771ca07`：玩家测试动线、物防／魔防与 HP 对照、手机布局、结果区域。
- `9daaa8f1`：独立属性证据、伤害 ±1 容错、冲突判读及回归。
- 本批源代码基线 `2ce65cc3`；以上两个提交是本次 UI 的实现范围。本文后续文档提交不改变产品版本。

发布来源容易混淆，交接时核对结果如下：

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

当前野怪等级入口为 41／42／43／41–43 全部；我方等级支持 1–60，星级显示 5–10 星（等级入口尚有第 6 节所述问题）。

两种测法是同级页签，不做强制分步向导：

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
| `player-flow.mjs` | `normalizePlayerFlow`、`clearTab`、`nextTarget`、`render`、`mountPlayerFlow` |
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

预设读取是另一条通道：`own-presets.mjs` 只读主计算器的 `rock-calculator.servers.cn.spirit-configs.v2`，不写回。罗隐／迪莫优先专用预设；其他精灵先个人配置，再内置配置库。不要把“已有自动存档”误认为“已有完整的多套常用配置管理”。

## 6. 尚未处理的动线问题

本节是已核实问题和建议方向；尚未实现。用户先要求梳理动线，后明确实施的是独立判读与伤害容错。Claude 应按用户下一步要求选择范围，不把本表写成已完成。

| 优先级 | 问题与复现 | 建议落点 / 验收 |
| --- | --- | --- |
| 高 | 我方等级支持 1–60，却藏在默认收起的详细面板；外层只显示星级。展开后又有重复六项数值摘要。 | `ui.mjs`、`index.html`、`player-flow`。等级放在精灵旁，等级与星级明确区分；收起高级项仍能看到当前等级；去重复摘要。 |
| 高 | 换我方精灵或“载入预设”会把等级重置为 60，并替换性格、个体和配招。仅两个档案槽，无任意多套配置的保存/命名入口。 | `presetProfile / resolveOwnPreset`。区分推荐预设与个人常用配置；若实施保存，应含等级、星级、性格、个体、骰子、特性、四招及手填条件。 |
| 高 | **切档案受击读数丢失，刷新可能恢复旧档案和旧读数。** 输入受击 11 → 切另档为空 → 切回仍为空 → 再切另档并刷新，回到旧档和 11。 | `ui.mjs` 的 `profile-tabs` 未调用持久化；`matchup-ui.state()` 根据 `incomingDefender` 清共用来伤。建议按我方配置隔离来伤并保存当前档案。测试必须包括切回与刷新。 |
| 中 | 手机改我方等级要先展开配置，再展开详细面板；野怪等级、异色、直接 HP 入口也在折叠区。 | `player-flow`。常用条件易见易改，避免两次展开加长距离滚动；390/320 宽度实测。 |
| 中 | 改条件保留读数是纠错功能；实际换了一套出战条件时可能误用旧记录。换回技能还会恢复该技能旧手填条件。 | 保留纠错路径及“下一只”的清场语义；手填条件需可识别、可恢复自动。不要一改等级就清掉用户用于纠错的实测。 |

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
5. **等用户明确确认上线后，才进入发布合并。** 重新核对正式国服来源，保留后续修复，走 Git → `origin/main` → EdgeOne 自动部署 → 生产站验收。当前不推送、不部署、不打包桌面或小程序。

