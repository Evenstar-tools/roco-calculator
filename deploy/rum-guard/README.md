# RUM 云函数部署包

此目录用于通过 GitHub 同步部署包，不是 GitHub Release 安装包。

- 文件：`rum-guard-linux-py311.zip`
- 环境：Linux x86_64 / Python 3.11
- 入口：`function.main_handler`
- 源码及部署说明：`../../scripts/analytics/rum-guard/`
- 默认仅演练，不停止或恢复应用；定时触发与网站统计均需云端验收后启用。
- 下载后核对 `SHA256SUMS.txt`。包内不含云账号密钥。

同步此目录不代表云函数已部署，也不代表网站统计已开启。
