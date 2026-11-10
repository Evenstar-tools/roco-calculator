# Windows 桌面 2.3.21 · 2026-11-11

用户授权本批推送及更新 Release。继承 v2.3.20 的离线资源、MIME、严格 CSP 与彩蛋同窗一次性授权；国服固定源码更新为当前新 UI、加载优化、冥古龙等级恢复和恶念交换第五行，国际服固定源码保持原值。

默认「破盾10%」，可编辑精确余血比例；读取野怪绿色回血，只判生命，可随龙息帕尔显示或开关常驻。保留档案与已有实测。

正式归档目标：D:/codex/rock-calculator-public/installers/v2.3.21/洛克计算器-2.3.21.exe。GitHub Release 只上传版本化 Windows 安装包。构建、实际打包程序及公开下载回查结果在完成后追加。

## 完成验收

- CN 固定源码 1e719cbe8020858b7369fff22a7dcf9e94074bbc：保留 v2.3.20 桌面入口兼容，纳入新 UI、恶念交换以及控件样式复用；国际服固定源未改变。
- 桌面入口/发布日志、离线入口与桌面运行相关单元通过。正式签名构建和最终资源检查通过；安装包 FileVersion 与 ProductVersion 均为 2.3.21，归档 211750000 字节。
- 实际 win-unpacked 程序使用全新档案并屏蔽 HTTP：启动、工具箱入口、龙息帕尔自动第五行、10% 回血、25% 编辑与真实 reload、开关暂停/恢复、普通与异色同一本体回血全部通过；零 HTTP 响应、渲染异常和 CSP 错误。
- 真实 app:// 请求确认单一 ui-DdTmieO-.js；验收脚本原 performance timing 读取不适用于该协议，已改用 Playwright 实际请求复验，产品未因此修改或重打包。三张实际桌面截图已读回。
- 签名沿用 CN=洛克计算器自签证书及 DigiCert 时间戳。Windows 报告根证书不受信任；未修改系统信任。未额外生成文件校验和。
- 证据：output/desktop-build.log、output/desktop-2.3.21-acceptance-request/result.json、output/desktop-archive-receipt.json。
- 对应国服 Web 主线 80092be5 已部署；生产页面恶念交换两项交互验收、320px/桌面截图与 81 项资源路径/MIME 回查通过，缓存标记为 evil-exchange-r1。