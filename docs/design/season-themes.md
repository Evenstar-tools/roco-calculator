# 赛季外观维护

## 范围

国服 2.2.6 沿用已有布局，在显示设置提供 S1–S4 外观。初始与旧值 `default` 均显示 S4，不再提供重复的默认选项。主题只改变图片和配色，不改变 S4「季中」标题、游戏数据、伤害规则或用户配置；亮暗模式独立保存。

手机保留低对比场景，不把大幅角色挤入操作区。宽屏显示各季招牌精灵；电鹿独立工具页继续不使用赛季角色。国际入口、语言和存档隔离不属于本次国服发布。

## 素材来源

本次复用隔壁开发已确认的原素材，没有重新生成或重绘角色。

| 主题 | 场景 | 角色 |
| --- | --- | --- |
| S1 暗夜拾光 | `s1-night-discovery.webp`，参考 [PV 封面](https://img2-tc.tapimg.com/moment/etag/FpUJDISHgJqR1ZGH8KUOyNGnpon6_20260319230317.jpg) 自制 | `s1-longxipaer.webp`，来自 [BWIKI 龙息帕尔](https://wiki.biligame.com/nrc/龙息帕尔) 社区透明图 |
| S2 狂欢怪谈 | `s2-carnival.webp`，参考 [PV 封面](https://img2-tc.tapimg.com/moment/etag/FmuquOzTWjXShzk9At1Lz9jVS0Wv_20260513193117.jpg) 自制 | `s2-jimufangzhou.webp`，来自 [BWIKI 机幕方舟](https://wiki.biligame.com/nrc/机幕方舟) 社区透明图 |
| S3 铅字幻梦 | `s3-storybook.webp`，参考 [PV 封面](https://img2-tc.tapimg.com/moment/etag/FsNiTj9O41Ukyx_cD9OuLyhHtG3E_20260709120230.jpg) 自制 | `s3-jiaer.webp`，来自 [BWIKI 加尔](https://wiki.biligame.com/nrc/加尔) 社区透明图 |
| S4 月涌狂想 | 保留既有 `s4-moon-night.webp` 自制月夜图 | 保留用户提供原素材导出的 `s4-silver-wolf.webp` |

运行时文件均在 `public/assets/season/`。自制场景不是官方地图实景；S1 的古堡庭院取自封面氛围，不冒称复刻赛季大厅或图书馆。角色与场景分别分层，透明角色仅等比转格式。

完整研究与生成记录保留在国际服开发分支同路径及 `docs/design/season-imagegen-prompts.md`，不为发布国服引入国际运行时代码。

## 验收

通过主题状态与控件回归，检查 1920px 桌面、929px 窄窗口和 390px 手机的真实画面及设置操作。切换 S1–S4 不改变精灵、技能或伤害；旧默认值正确映射 S4。发布证据与桌面包核验位于本轮 `output/playwright/release226-20261019/`、`artifacts/cn-release-226-20261019/`。
