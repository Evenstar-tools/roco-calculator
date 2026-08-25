# 桌面版当前开发交接（2026-08-24）

## 当前目标

继续处理桌面版计算核心，不打包、不碰小程序：

1. 修正“听桥”反弹口径。
2. 补齐“虫群”受五类奉献影响的完整逻辑。
3. 用用户给出的实战截图验收：18 层恶魔狼王借“听桥”反弹 5 层女王蜂“虫群”，只反弹连击中的一段，实战显示 `抵抗 543`。

## 已核实的参考资料

- BWiki“听桥”：减伤 60%；应对攻击时造成武系物理伤害，威力与被应对技能相等。
  - https://wiki.biligame.com/rocom/%E5%90%AC%E6%A1%A5
- BWiki“虫群”：基础威力 20、能耗 7、默认 1 段，受奉献影响。
  - https://wiki.biligame.com/rocom/%E8%99%AB%E7%BE%A4
- BWiki 技能图鉴中的五类奉献：
  - 飞断：威力 `+20`
  - 虫群过境：连击 `+1`
  - 捆缚：额外增加 `2` 层中毒
  - 假寐：能耗 `-2`
  - 虫茧：吸血 `+10%`
  - https://wiki.biligame.com/rocom/%E6%8A%80%E8%83%BD%E5%9B%BE%E9%89%B4
- 参考页“面板威力”口径：技能威力结算后，再折入本系、克制、天气、能力等级等面板乘区并取整。
  - https://rocopvp.tzrain.wiki/battle-use-guide

## 已锁定的计算口径

### 听桥

- 继承对方当前攻击技能的**单段面板威力**。
- 固定按 1 段反弹，不继承原技能连击数。
- 继承后不再次计算听桥自身的本系、克制、天气、能力等级或其他威力乘区。
- 仍使用听桥方的物攻和被反弹方的物防进入伤害公式。
- UI 文案改成：`反弹「虫群」· 单段面板威力 65`（数值随场景变化）。
- 当前错误：`withListenBridgeCounters()` 传入 `sourceAttack.result.skillPower`，并在听桥计算中再次套面板乘区，截图中因此只显示威力 20。
- 实战 `543` 排除了“继承静态威力 20”“继承两段总威力”“再次套武系克制”等方案，符合继承约 `65` 的单段面板威力后结算。

### 虫群

五类奉献必须分别处理，不能混成一个“增加连击”输入：

- 威力奉献次数：每次静态威力 `+20`。
- 连击奉献次数：每次连击 `+1`。
- 中毒奉献次数：每次额外施加 `2` 层中毒；仅开启负面状态结算时参与合计。
- 吸血奉献次数：每次吸血能力 `+10%`，显示但不直接改技能伤害。
- 减费奉献次数：每次能耗 `-2`，最低为 `0`。

保留旧字段 `donationHitBonus` 的读取兼容，避免已有个人配置丢失。

## 代码位置

- `src/domain/calculate.js`
  - `calculateSkillResult()` 的 `lockedPower` 目前仍会继续套面板乘区。
  - `selectedAttackForCounter()` 当前检查 `result.skillPower`。
  - `withListenBridgeCounters()` 当前传递 `sourceAttack.result.skillPower`。
- `src/domain/skill-effects.js`
  - 当前“虫群”只有 `donationHitBonus`。
- `src/domain/skill-rules.js`
  - 需要新增虫群复合规则，返回威力、连击、能耗、吸血和中毒元数据。
- `src/domain/negative-status-rules.js`
  - “捆缚”已有固定 4 层中毒；“虫群”尚未读取奉献中毒次数。
- `src/domain/trait-effects.js`
  - “悼亡”当前最大层数是 10，需要允许实战 18 层，建议上限 99。
- `src/components/FourSkillEditor.jsx`
  - 当前听桥提示需改成“单段面板威力”。

## 测试优先顺序

1. 先改测试并确认失败：
   - 听桥继承来源技能 `panelPower`，来源为 2 段时听桥仍为 1 段。
   - 构造 `攻击值 1668 / 单段面板威力 65 / 物防 180`，期望听桥伤害 `543`。
   - 听桥方本系、克制等乘区设成非 1，仍不得二次应用。
   - UI 显示“单段面板威力”。
   - 虫群五类奉献分别验证威力、连击、中毒、吸血和减费。
   - 悼亡允许 18 层。
2. 再实现最小改动。
3. 运行定向测试、`npm test`、`git diff --check`。

## 工作区边界

当前 `main` 有以下既存未提交内容，属于用户此前改动，不能覆盖或清理：

- `CHANGELOG.md`
- `src/data/user-release-notes.js`
- `src/styles.css`
- `tests/ui/floating-undo-layout.test.js`

本任务尚未写入听桥/虫群代码。后续只提交与本交接目标直接相关的改动；未收到明确要求前不打包、不发飞书、不处理小程序。
