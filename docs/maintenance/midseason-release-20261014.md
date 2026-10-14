# S4 季中同版本发布交接 · 2026-10-14

## 本轮范围与来源

- 用户授权：季中两只精灵资质、阶段标题、性格加成属性名同色完成后，更新 Web、Release、小程序并回查。
- 隔离工作树：`D:/codex/worktrees/roco-s4-midseason-20261014`。未覆盖其他工作树的在途修改。
- 产品源码：`40ec2b7215311f3adb05521b8ff58a5671b26d1f`；前序数据／标题和 Web 配色提交为 `35e139b`、`b4aa344`。
- 正式目标：`Evenstar-tools/roco-calculator` 的 `main`。源码推送后远端引用已读回一致；[对应 CI](https://github.com/Evenstar-tools/roco-calculator/actions/runs/38578867154) 的 validate、miniapp、e2e 通过。
- Web／Windows 仍为 2.2.5，小程序仍为 1.1.19；v2.2.5 标签和历史计算核心里程碑均未移动。

## 实际平台结果

| 平台 | 已完成 | 证据 |
| --- | --- | --- |
| [Web](https://rococalc.top/) | 自动部署后，独立桌面 1280×900／手机 390×844 真页面回查通过 | `output/playwright/midseason-release-20261014/web/readback.json` 和同目录截图 |
| [Windows Release](https://github.com/Evenstar-tools/roco-calculator/releases/tag/v2.2.5) | 唯一版本化 EXE 已替换，Release 文案读回一致，正式下载与已验证本地包一致 | `artifacts/midseason-release-20261014/release-readback.json`、`desktop/package-verification.json`、`desktop/offline-smoke.json` |
| 微信小程序 | 官方 CLI 同版 1.1.19 开发版上传成功，上传后原生标题／设置日期回查通过 | `artifacts/midseason-release-20261014/miniapp-upload-result.json`、`miniapp-postupload-readback.json`、`native-midseason-report.json` |

两只精灵的五项更新与保留速度、Oct14 改动详情非 NEW、双方正向属性名同色／普通恢复、弹层关闭／内容点击不误选及焦点下 Escape 均已验证。Web 入口仍直接进入计算器，未恢复已移除的 SEO 过渡页或页脚。design-craft 复核真实桌面／手机／原生截图，未扩改现有布局、图标或计算规则。

## Windows 归档与回退

- 本地最新包：`installers/v2.2.5/洛克计算器-2.2.5.exe`。
- 正式附件：`RoCo-Calculator-2.2.5.exe`，资产 ID `640615175`，138894738 bytes。
- 本地旧包：`installers/v2.2.5/previous/洛克计算器-2.2.5-0bf9bf7.exe`。
- 发布时先上传候选并下载核对，再重命名切换正式附件；正式下载核对成功后才删除旧远端资产 `639685845`。没有先删除唯一可用包，未额外生成散列清单。
- 打包图标转换工具遇到内存分配错误；核对既有成功包的图标源与当前 PNG 逐字节相同后，仅复用其 ICO 完成打包。产品源码、品牌、图标及布局不变。

## 验证边界与已定位事项

- 历史减压阀对局用例仍预期季中调整前魔攻 117 的伤害；还原该单一资质准确复现原值，因此只固定历史测试夹具，线上继续使用新魔攻 131，未修改计算公式。修复后本地发布测试、生产构建、浏览器门禁和远端 CI 通过。
- 旧 Web Service Worker 跨部署可能短暂返回旧运行数据；本次保留存储／缓存的会话后续普通刷新已正常更新，未通过清缓存冒充正常更新。
- 小程序回执返回服务器包体大小；官方 SDK 的 develop.version 为空，未将其伪称远端正式版本读回。上传命令指定 1.1.19，原生设置显示 v1.1.19／2026-10-14。仅上传开发版，未提审、未正式发布。
- Windows 已提取并隔离离线启动，未执行完整安装／卸载；包未签名。微信原生验收为开发工具模拟器，未声称真机或 iPad 验收。
