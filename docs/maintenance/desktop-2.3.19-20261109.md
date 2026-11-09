# Windows 桌面 2.3.19 · 2026-11-09

用户授权：更新 GitHub Release，将本轮已上线的 S5 修复带入桌面包。

## 源码与范围

- 正式网页基线：0c652632720c34364313a288f0d8daf941423949。
- 桌面国服源码：ec45434449cd2da4b3033454ed987e3fd098e690，继承已验收的23e4c9e9公式与UI，只添加桌面入口/彩蛋兼容及2.3.19日志。
- 国际服保持511b2970d2344fef25b01858e08e31766f672828。
- 桌面发布走独立 release/desktop-2.3.19-20261109 分支与v2.3.19标签，不改变线上main或小程序发布。

## 桌面适配

- 接续v2.3.18的 .mjs JavaScript MIME、S5工具入口、彩蛋同窗30秒一次性session授权和介绍页外部脚本。
- 桌面暂存保留插件介绍页，将S5内联启动原样写到同目录外部模块，保留严格脚本CSP、no-store头和Web产物。
- 插件当前下载地址为https://github.com/Evenstar-tools/roco-pve-viewer/releases；旧roco-pve-viewer-releases仓库已重定向到该地址，公开版本v0.1.15。
- 公式与样本边界见s5-native-defense-release-20261109.md；本版未改待逐星测量的极化/钝化曲线。

## 验收与产物

- 国服入口/插件交互及日志检查通过；桌面离线资源、MIME、一次性授权、暂存脚本检查通过；两服CLI回归通过。
- 完整构建与最终资源校验通过。实际桌面离线验收结果写入output/desktop-2.3.19-acceptance/result.json；签名打包日志位于output/desktop-package.log。
- GitHub仅上传版本化Windows x64安装包。保留本地installers/v2.3.19/洛克计算器-2.3.19.exe，不额外生成交付校验和文件。

实际打包程序离线验收通过：版本2.3.19、主站与S5入口、坦率沉金兽42级273/193、旧分支JSON导入和刷新保留、彩蛋解锁及一次性授权全部通过；无成功HTTP响应、渲染异常或CSP失败。最终安装包208228688字节，已读回产品版本及项目签名；系统提示证书链根不受信任，与项目自签名方式一致。本地正式归档：D:/codex/rock-calculator-public/installers/v2.3.19/洛克计算器-2.3.19.exe。
