# Windows 桌面 2.3.22 · 2026-11-11

用户要求核对最新 Release 与国服线上 UI，并生成新桌面包发布。最新已发布桌面为2.3.21；网页随后上线文字说明书与判读、清空细化。

- 从桌面2.3.21继承离线资源、MIME、严格CSP与桌面入口兼容，接入国服c9b4390b、6bb899b8。国服桌面固定源码349112d05a818f3eb98f394a7fd505fa204b26a7；工具目录与当前国服6bb899b8无差异。
- 正式构建的工具UI资源为ui-CIte8782.js与ui-CTUWWD8q.css，与当前线上实际请求一致。国际服固定源码511b2970未改，网页主线不在本批推送范围。
- 桌面兼容、发布日志、CLI及本次六项界面操作验收通过。CLI首次并行启动一个worker超时，已在构建结束后单worker补跑该文件通过；已通过用例未重复执行。
- 实际win-unpacked程序使用新档案并阻断HTTP：启动、工具箱入口、恶念交换第五行、条件修改、刷新恢复、普通与异色回血、说明书离线往返、清空保留我方骰子均通过。零HTTP响应、渲染异常或CSP错误。
- 两张实际桌面截图已读回。证据位于output/desktop-2.3.22-acceptance/result.json及同目录PNG，构建与操作日志在output/desktop-*.log。
- 安装包211760400字节，FileVersion及ProductVersion均2.3.22。沿用CN=洛克计算器自签证书与DigiCert时间戳；Windows报告根证书不受信任，未修改系统信任。
- 正式本地归档：D:/codex/rock-calculator-public/installers/v2.3.22/洛克计算器-2.3.22.exe。GitHub只上传RocoCalc-2.3.22-Windows-x64.exe，公开Release读回记录留在本批output目录。
