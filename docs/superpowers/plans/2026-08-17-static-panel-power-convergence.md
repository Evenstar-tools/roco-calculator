# 静态威力与面板威力收口实施计划

**目标：** 在 v1.5.7 内将“实际威力 / 面板威力”改为“静态威力 / 面板威力”，采用手动静态威力冻结固定威力层的方案 A，并保持未手动覆盖时的既有伤害结果。

**架构：** 计算域新增明确的自动静态层，将“技能自身规则 + 技能自身百分比 + 固定威力增减”与后续特性、印记、外部威力区、本系、克制、天气和能力等级分开。手动静态覆盖替换静态层；手动面板覆盖替换最终面板层。UI 只消费计算结果，不自行拼算威力。

---

## 任务 1：先锁定设置与输入契约

**修改：**

- `tests/state/display-settings.test.js`
- `tests/domain/power-override.test.js`
- `tests/ui/power-draft-input.test.jsx`

**步骤：**

1. 增加默认返回 `static` 的失败测试。
2. 增加旧 `actual` 设置迁移为 `static`、`panel` 保持不变的测试。
3. 增加 `static` 手动覆盖与旧 `actual` 覆盖兼容测试。
4. 增加静态、面板威力均只接受整数的输入测试。
5. 增加恢复按钮不再显示“自动”文字，但仍具备无障碍名称的测试。
6. 运行上述三组测试并确认因新行为尚未实现而失败。

## 任务 2：拆分静态威力和完整威力链

**修改：**

- `src/domain/calculate.js`
- `src/domain/power-override.js`
- `tests/domain/calculate.test.js`

**步骤：**

1. 增加自动静态威力字段，包含技能自身规则、技能自身百分比和固定威力增减。
2. 将特性、血脉、契约、印记、外部百分比威力区放在静态层之后。
3. 保持自动计算使用既有精度，静态显示值单独四舍五入。
4. 将 `static` 手动覆盖放在固定威力增减之后，确保羽化加速等不重复叠加。
5. 保持 `panel` 手动覆盖直接进入伤害公式。
6. 返回 `staticPower`、`panelPower` 和对应来源；保留旧字段作为内部兼容别名。
7. 增加以下失败测试后实现：
   - 特性和印记改变面板威力但不改变静态威力。
   - 固定威力状态改变自动静态威力。
   - 手动静态威力冻结固定威力层。
   - 恢复后重新读取固定威力状态。
   - 自动模式改造前后伤害回归值一致。

## 任务 3：收口设置、单技能和四技能界面

**修改：**

- `src/state/display-settings.js`
- `src/components/DisplaySettingsDialog.jsx`
- `src/components/PowerDraftInput.jsx`
- `src/components/SingleSkillEditor.jsx`
- `src/components/FourSkillEditor.jsx`
- `tests/ui/skill-editors.test.jsx`
- `tests/ui/app-integration.test.jsx`

**步骤：**

1. 将可见文案统一为“静态威力 / 面板威力”。
2. 默认模式改为 `static`，内部兼容读取旧 `actual`。
3. 单技能和四技能静态栏读取 `staticPower`，面板栏读取 `panelPower`。
4. 所有威力输入使用整数步进和整数校验。
5. 删除技能行的“自动”来源文字。
6. 手动覆盖时只显示恢复图标及 Tooltip，不占用额外文字空间。
7. 动态规则说明改成“静态威力”。
8. 写失败测试覆盖默认静态、切换面板、手动冻结、恢复自动和重启保存，再实现到通过。

## 任务 4：更新公式、说明和用户版更

**修改：**

- 伤害计算过程对应组件和格式化逻辑
- `src/data/user-release-notes.js`
- 相关文档测试

**步骤：**

1. 公式顺序改为“静态威力 → 外部威力结算 → 面板威力 → 每段伤害 → 总伤害”。
2. 删除“手动实际威力”和其他旧口径文案。
3. 更新 v1.5.7 用户记录，说明默认静态威力、可切换面板威力及恢复方式。
4. 增加文档与可见文案零残留测试，允许旧兼容代码中的内部 `actual` 标识暂时存在。

## 任务 5：共享核心、回归与构建验收

**执行：**

```text
npm run data:validate
npm test -- --run
npm run miniapp:sync-core
npm run test:core-drift
npm run miniapp:test
npm run miniapp:build
npm run acceptance:verify
npm run e2e
npm run build
git diff --check
```

**专项验收：**

- 闪击、鸣沙陷阱等动态技能显示整数静态威力。
- 羽化加速自动改变静态威力；手动静态值不再被其重复增加。
- 特性、印记、本系、克制、天气和能力等级只改变面板威力与伤害。
- 面板手动值直接进入伤害公式。
- 切换口径前后自动伤害一致。
- 旧分享、精灵记忆、队伍和本地显示偏好可恢复。
- 桌面与 Web 构建结果一致，不升级 v1.5.7 版本号。
