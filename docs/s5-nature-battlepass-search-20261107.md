# 通行证初始形态检索 · 2026-11-07

用户要求：野怪检索加入通行证精灵，共 10 只初始形态。

已加入默认初始形态检索和优先排序，新增“通行证初始形态”筛选；选择器标注“通行证”。S2 / S5 原分组与全部精灵目录保留。

| 赛季 | 初始形态 | PetBase ID |
| --- | --- | --- |
| S1 | 绒绒、犀角鸟 | 3244、3309 |
| S2 | 小雪人、爆焰仔 | 3531、3572 |
| S3 | 咬咬小子、足尖元件 | 3710、3718 |
| S4 | 热团团、新月鹭 | 3574、3764 |
| S5 | 地银链、沉金兽 | 3799、3802 |

名单来源：`D:/codex/worktrees/roco-plugin-web-release-20261105/output/local-package-lists-20261105/spirits/combined-local-spirit-lists.json` 的 `battlepass_families`。S1–S4 有 `BATTLE_PASS_THEME_CONF` 核对；S5 沿用总表已核奖励资料与本地进化链对应。全部已有完整 catalog 数据，此次只补目标分组，不改数值。小雪人、爆焰仔、咬咬小子、足尖元件的 `wildStrengthStage` 仍为 2，其余六只为 1。

浏览器已逐只检索并切换，核对独立筛选恰有 10 只、部分名称搜索、S2 / S5 原检索及两份分组数据一致性。1280 / 390 宽实际截图已读回，无横向溢出：`output/playwright/s5-battlepass-targets-1280.png`、`output/playwright/s5-battlepass-targets-390.png`。

本地实现与验收完成。本次用户授权将确定有益的内容推送上线，通行证检索先行推送；用户随后明确要求骰子接通一并发布、同步通行证强度阶位。本轮再次逐只对照总表的 `stength_stage`，与 catalog 全部一致，并补充完整 10 只字段断言。上线结果另行回查。通行证名单接入保持各物种已有血量、强度阶位和防御参数；骰子接入范围见 `docs/s5-nature-type-dice-20261107.md`。
