# S5 野外骰子接入与系别组合边界

日期：2026-11-07。开发基线：国服正式源码 `112d42f3`。本次是本地功能开发，不更新发布 pin、不构建安装包、不推送、不上传小程序。

本地分支为 `feature/pve-dice-20261107`。原国服维护工作树仍有并行的野怪模型、回放及预览链改动，本次未写入该树。主干整合纳入其中已独立复现的预览缺失映射门禁（null/undefined均阻断依赖的方向）；未把尚在研究的模型调参一起带入，后续仍须合并其有效校准并复跑交叉用例，不直接以本分支整树替换。

## 本次完成

- `public/tools/s5-nature/data/dice.json` 补齐4种玩法资料与40项效果配置。原效果ID、BUFF引用及基础效果顺序/重复项保留；静态资料不宣称当前全部可获得。
- 按明确标量映射试算基础、强攻、固守、加速、物理/魔法强化、全能、巧劲，以及配置明确的通用防御/物攻提升。各项均标为试算，不标为服务器公式实战验证。
- 全能19和全属性100%的33只作用双攻、双防、速度，不加生命。速度仅进入面板，不自动触发先手/技能条件。
- 双方独立选本场实际效果；每侧一个预设或一份合计手填，不把整颗骰子的所有骰面叠加。同一ID重复输入只应用一次；不同来源叠加未证时拒绝自动合并。
- 我方手动战斗面板可声明已含骰子属性，跳过重复面板乘法；固定威力仍另算。配置生成面板重置该标记。
- 手填显示威力与已含相关骰子攻防的面板不能同时编码；明确提示恢复基础面板或清空显示威力，不从整数面板逆推小数。
- 倍率输入清空即删除该覆盖；空白保持空白，无隐藏null或伪装成1。
- 原有显示威力、旧最终威力存档保留。增加“条件 → 已知最终威力”的显式入口、互斥处理和恢复自动。

## 抵抗、克制与极化/钝化

### 已确认的原始事实

| 效果 | 原表描述 | BUFF → base |
| --- | --- | --- |
| 7 克制 | 克制系数增加为250% | 20420180 → 2042018 |
| 14 强力克制 | 克制系数增加为350% | 20420190 → 2042019 |
| 8 抵抗 | 抵抗系数降低为40% | 20420200 → 2042020 |
| 15 强力抵抗 | 抵抗系数降低为25% | 20420210 → 2042021 |

四项走 `buffbase_order=42`，原枚举为 `BFT_CHANGE_SDT_RATIO`。`BFT_O_FORTYTWO` 实际为142，不能混用。觉醒属性93/94与此不是同一参数命名空间。

按team读取我方/敌方 `selected_face_info.dice_buff_cfg_id` 的客户端归属链已恢复；参数运算的实际消费者、攻防作用方向、双系组合、与极化/钝化先后及取整仍未闭合。已有r1实录缺双方骰面，r2本轮只读时尚无对局，不能用其补证。

### 当前行为

1. 四项可选并保存，显示准确原文，数值描述仅记录，不套通用最终倍率。
2. 纯中性关系可维持原伤害；免疫不变成伤害。结果仍是试算，公式验证标志为false。
3. 非纯中性关系（包括两个非中性因子相抵为1）在自动及显示威力路径暂停试算，说明尚未验证的组合。
4. 用户确知包含本系/系别/极化钝化的最终单段威力时，可显式手填最终威力；它跳过上述换算，不代表自动公式已经验证，面板攻防和命中次数另处理。
5. 其他事件类骰面明确提示未适配，不当作无效果忽略。

回合末恢复、侵蚀、连击、额外释放、能耗、印记、惊喜、临时等级及大成功/失败的完整事件结算不在本批。

## 回归边界

- 基础物攻312、骰子1.1，与声明已含骰子的整数面板343，均为显示60.5、伤害62。此处整数面板是实测输入，不反推343.2。
- 自动显示48.4与手填显示48.4保持相同49伤害；保留既有防重复逻辑。
- 已含面板只跳本侧属性处理，不抑制对侧骰子或固定威力。
- `vendor/damage.mjs`、觉醒/野怪攻防模型未修改。原取整夹具仍保留55×1.5→82、分子20054、最终117等边界。
- 旧none、manual-power-plus-40和unresolved-all-stats-plus-30 ID保留。旧全能未生效记录不静默改成生效，提示重新选择正式全能条目。

## 验证入口与结果

```powershell
node node_modules/vitest/vitest.mjs run --config config/vite.config.mjs tests/domain/s5-nature --maxWorkers=2
node node_modules/vitest/vitest.mjs run --config config/vite.config.mjs tests/domain/damage.test.js tests/domain/calculate.test.js --maxWorkers=2
node node_modules/eslint/bin/eslint.js public/tools/s5-nature/matchup-preview.mjs public/tools/s5-nature/matchup-ui.mjs scripts/pve/build-dice-catalog.mjs tests/domain/s5-nature-dice.test.js tests/domain/s5-nature-dice-catalog.test.js tests/domain/s5-nature-preview-settings.test.js
git diff --check
```

上述定向验证通过。浏览器实际检查了目录选择和刷新保留、全能五项/生命不变、清空倍率、保存手动面板、已含标记持久化、重新生成后重置、未知系别组合暂停、已知最终威力恢复及返回自动。查看1365px桌面与390px手机实际截图，修正勾选框纵向排列；页面未横向溢出。

截图在忽略目录 `output/playwright/dice-all-stats-desktop.png`、`dice-all-stats-mobile.png`；仅本地验收，不随功能打包添加宣传素材。此次未执行全项目发布门禁或小程序验收，不声称已经上线。

## 原始资料再生成

原清单来自已有本地解码的 `SEASON_BONUS_DICE_CONF`、`SEASON_BONUS_DICEBUFF_CONF`、`SEASON_DICE_CONF`、`BUFF_CONF`、`BUFFBASE_CONF`、`ATTRIBUTE_CONF`。产品数据保留所用记录；原始文件路径/用户隐私路径不写入公开JSON。

```powershell
node scripts/pve/build-dice-catalog.mjs --input <dice-source-records.json>
```

生成器核对原字段后才映射标量；证据缺失时降为未支持，不按文案关键词猜数值。
