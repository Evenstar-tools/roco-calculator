# 恶念交换与 S5 新 UI 发布 · 2026-11-11

用户授权「完成后推送，更release」。国服源码固定到 a376e653f741eefc5395bc30312e7980d8972e75，包含 Claude b67c19f9 / 44482326 新设置区、异色栏、修复及后续无行为样式清理。保留当前国际服和小程序固定源码。

恶念交换为独立第五行，龙息帕尔自动显示，可开关常驻；默认「破盾10%」，可编辑精确剩余比例。按破盾后本体生命计算绿色回血，只约束生命性格，无读数或关闭时不影响其他判断。

先完成受影响单元、构建、实际页面和正式产物验收，再推 origin/main 自动部署；Windows 使用 2.3.21，继承 2.3.20 桌面离线与 MIME/CSP 修复。最终结果在此追加，不以本地构建代替上线。

## 本地发布验收

- 受影响单元与发布关键回归通过；数据、共享核心漂移及小程序预检通过；两服 CLI 固定源码回归通过。
- 正式多地区 Web 构建、体积门禁和最终资源路径/MIME 检查通过。CSS 复用已有控件，不缩小正文，gzip 总量 95.97 KiB，低于 96 KiB 硬上限。
- 浏览器发布验收全部通过，覆盖原四招、骰子、档案、野怪筛选、离线缓存，以及恶念交换开关、精确余血比例、刷新恢复和普通/异色回血一致性。10 worker 首次运行加载超时，改为 2 worker 原断言复测通过，未放宽断言。
- 最终桌面与 320px 手机截图已读回，比例弹层和第五行无横向溢出。日志位于 output/s5-release，截图位于 artifacts/s5-player-flow/screenshots。
- 新功能已纳入正式发布 E2E 选择集。远端发布与生产回查结果另行追加。
## 正式发布回查

- 功能主线 80092be5e4d1c7af87f9d42e29775806b87153be 已推送 origin/main；EdgeOne 自动部署后，正常 URL 的 sw.js 已返回 evil-exchange-r1 标记。
- https://rococalc.top/tools/s5-nature/index.html 真实生产页面两项恶念交换 E2E 通过；桌面/900/390/320 布局及条件弹层通过并读回截图。部署资源回查 81 项全部通过。
- GitHub CI 42872438130 的 validate、miniapp、e2e 均成功。未发布小程序。
- Windows Release v2.3.21 已公开并设为 Latest，桌面 tag/分支指向 5fe45f167aa6f62bfe06d7ca5fde203cf0a34868；CN 固定源码 1e719cbe8020858b7369fff22a7dcf9e94074bbc。
- Release 只含 RocoCalc-2.3.21-Windows-x64.exe 一个手工上传资产，沿用既有版本化命名，中文显示标签为洛克计算器 2.3.21 · Windows x64 安装包。自动源码归档由 GitHub 保留。
- 不带账号凭据重新 GET 公开下载地址，HTTP 200，211750000 字节，ProductVersion 2.3.21。回执：D:/codex/worktrees/roco-desktop-2.3.21-20261111/output/release-readback/receipt.json。
- 本地安装包：D:/codex/rock-calculator-public/installers/v2.3.21/洛克计算器-2.3.21.exe。公开页：https://github.com/Evenstar-tools/roco-calculator/releases/tag/v2.3.21。
- 此记录提交仅更新发布分支交接，功能主线与已验产物不变；本轮无剩余发布动作。