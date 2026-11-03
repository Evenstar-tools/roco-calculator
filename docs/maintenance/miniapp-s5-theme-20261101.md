# 小程序 S5 主题接续 · 2026-11-01

- 本轮范围：微信原生小程序 S5 发布；沿用已确认的 S5「圣龙宝藏」深青、暖金和环境背景，不改 Web、不生成新图，不重做计算页。
- 来源基线：国服已发布源码 `a7c9f951b0560cd1fe5bc7dcd2695c2051076c3f` 的 `src/theme/season-themes.js`、`src/styles/20-s4-season.css` 和 `docs/design/season-themes.md` 第 7–9 节。背景为既有自制装饰，参考官方 PV [BV1C8nH69Ekq](https://www.bilibili.com/video/BV1C8nH69Ekq/) 的 00:09.8 / 00:49.8 帧，不称官方原画或游戏实景复刻。
- 沿用运行资产：`https://rococalc.top/assets/season/s5-dragon-treasure.webp`，2000×667 WebP；本轮确认响应 200、`image/webp`。复用已有 `PUBLIC_ASSET_ORIGIN`，不向主包复制大图。小程序手机布局不新增大角色。
- 包体余量：S1–S3 改用同域 `/assets/season/s1-night-discovery.webp`、`s2-carnival.webp`、`s3-storybook.webp`，本轮逐一确认响应 200、`image/webp`。取消这三张本地图片的运行时 import，源文件继续保留便于回退；S4 场景和狼王仍随主包，保留完整离线主题。
- 离线 / 域名 / 图片解码失败：移除失败的场景图片，保留对应赛季的本地 CSS 渐隐、标题、设置与计算功能；不阻塞启动，不显示错误占位图，不自动循环请求。用户仍可切回完整本地的 S4。
- 默认与兼容：无偏好或非法偏好默认 S5；保留已存 S1–S4、随机模式及经典计算配色。随机抽选纳入 S5，继续排除上次主题。切外观不修改赛季数据、当前配置、计算和分享状态。页面与启动标题显示「洛克计算器 · S5」，微信导航与主题选择保留完整赛季名「圣龙宝藏」。
- 验收边界：状态、选择器、远程场景失败和既有 S4 主题由小程序主题测试覆盖；微信原生启动、设置操作和最终画面由本轮发布主流程验收，不能以 H5 或单元测试代替。
