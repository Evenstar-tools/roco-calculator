# 网站使用量统计

状态（2026-09-26）：广州 RUM 应用 159589 已开通，网站已通过 GitHub main 同步在 EdgeOne 生产环境发布，后台已收到三类事件；每分钟用量保护已部署；只有生产域名 https://rococalc.top 且 VITE_RUM_ENABLED=true、VITE_RUM_ID 已设置才采集。桌面、本地、预览不采集。

## 指标口径与查看方法

按 Asia/Shanghai 自然日查看，采样设为 100% 后才能按完整采集口径解释。网络失败、拦截、离线都会造成漏计。

| 指标 | 口径 | RUM 查询 |
| --- | --- | --- |
| 每日访客 | 当日有上报的匿名浏览器标识 AID 去重 | 页面访问 → 统计维度选择设备数（AID）；匿名浏览器去重，不能解释为精确自然人数 |
| 浏览次数 | 首次文档加载及主计算器/电鹿路由切换各一次；刷新再计，弹层不计 | 自定义事件 page_view 次数；SDK 自带 PV 仅文档加载，不与此相加 |
| 访问会话 | 30 分钟没有点击、键盘、滚动或统计事件后再次活动开新会话 | session_start 次数；严格去重用 AID + ext2；跨午夜不主动拆分 |
| 功能使用次数 | 首次进入主计算器/电鹿及每次打开功能；自动计算和重绘不增加 | 自定义事件先筛选 feature_view，再选 ext1 分组；未筛选时会混入其他事件 |

功能编码：calculator 主计算器、deer 电鹿斩杀线、skills 技能查询、types 属性查询、transmission 传递、speed 速度排行、durability 耐久排行、rankings 其他排行、teams 队伍、desktop 下载入口。
这里统计的是功能打开次数，不是完成计算、成功下载或保存队伍次数。

## 接入
1. 广州 Web 应用 ID 为 159589；SDK 使用上报 ID Dv3ovhEPXPRZx6XD0R，不是数字应用 ID。
2. 部署环境配置 VITE_RUM_ENABLED=true 和 VITE_RUM_ID，重新构建发布。
3. 打开首页、技能查询、切换电鹿并返回；确认后台收到 page_view、feature_view、session_start，核对功能名。刷新应增加浏览次数但在 30 分钟内不增加会话。
4. 在 RUM 自定义事件查看上述次数；只采集 PV 与自定义事件，性能、错误、接口日志不启用。
5. 回退：VITE_RUM_ENABLED=false 后重新构建发布；RUM 控制台停止应用上报可用于紧急停止。

## 限制与费用
不采集输入配置、队伍名、完整 URL 或查询参数。匿名 ID 存于 localStorage，网络上报仍会暴露网络层 IP/UA；上线前应同步网站实际隐私说明。换设备、清理存储会形成新访客。多标签页复用会话；同时首次开多个标签页有 localStorage 竞争，严格分析需按会话 ID 去重。
历史未采集数据不能补回；日 UV 不可直接求和得到累计人数。跨保留期长期留存需要另行安排导出，本次不启用额外数据库或调度服务。
腾讯云主账号每日共享 50 万条免费额度，广州超额按 0.34 元/万条；免费额度不是零超支硬保证。用户已确认开通及协议，但要求自动停报；保护任务已启用：达到 40 万条尝试停止本站，每分钟检查，次日北京时间 00:05–00:09 恢复；异常查询尝试停止。突发流量、计量与接口延迟仍可能超额，不能保证零费用。详见 scripts/analytics/rum-guard/README.md。
官方计费：https://cloud.tencent.com/document/product/248/87074

## 生产验收记录
2026-09-26 09:42:34，EdgeOne 部署 dpdln7vje6wi 成功，GitHub 提交 b444936，生产环境 VITE_RUM_ENABLED=true 且使用上述上报 ID。真实访问后 page_view、session_start、feature_view 均出现，feature_view 的 ext1 可分 calculator、types；首次数据包含验收访问，不代表全天正式流量。SDK PV 与自定义 page_view 不相加。保护函数非空分钟兼容修复后查询成功。
