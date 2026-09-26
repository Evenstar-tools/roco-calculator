# RUM 每日保护任务

GitHub 部署包：`deploy/rum-guard/rum-guard-linux-py311.zip`，下载后核对 SHA256SUMS.txt。

- 云函数 rococalc-rum-daily-guard，广州/default，Python 3.11，128 MB，45 秒超时，并发 1，无 HTTP 入口，无 CLS 日志投递。
- 入口 function.main_handler。默认演练；RUM_GUARD_APPLY=true 才执行启停，RUM_GUARD_AUTO_RESUME=true 才允许北京时间次日 00:05–00:09 恢复。
- 目标应用固定 159589。按分钟查询账号全部业务系统，广州所有实例合计达到 400000 条后停止本站；每日重置采用 UTC+8。
- 实测 DescribeTawInstances 跨三个地域返回相同的全局列表；当前账号只有广州 rococalc-web。DescribeDataReportCountV2 必须带 InstanceID，不传会返回 AuthFailure。
- 遇到非广州实例、实例列表不完整、格式未知、超时或查询失败，均尝试停止本站，不把未知用量当零。停止失败向外抛错。云端故障不能保证实际停止。
- 当前无数据时实测返回 results 中 total=0、offset=""、无 series；已加入严格兼容。11 项本地测试通过。
- 权限仅四项：DescribeTawInstances、DescribeDataReportCountV2、StopProject、ResumeProject。运行角色临时凭据，不创建长期密钥。IAM 资源范围 *，代码只启停本站。
- maintenance_handler 仅用于显式、固定应用的启停验收，仍需 SCF 调用权限，没有公网入口。
- 这是延迟保护，不是计费硬封顶；接口统计和定时调用延迟、突发流量可能超额。停报后的访客统计会缺失。

当前进度：SCF 服务授权和运行角色已创建；用户完成了免费试用购买。云端代码已部署，定时保护与网站统计尚未启用，仍须真实启停回读验收。试用不是永久免费。
