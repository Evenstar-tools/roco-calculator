# 微信小程序 v1.1.0 验收记录

日期：2026-08-22

## 版本范围

- 小程序版本：`1.1.0`
- 网页/桌面计算核心：`1.6.2`
- 数据版本：`S3季中`
- AppID：`wx82f11dfdd3d28bc8`

## 本次同步

- 小程序共享计算核心与桌面 `v1.6.2` 完全一致，漂移检查为零。
- 负面状态结算、雷暴天气和结算明细进入小程序；设置开关默认关闭。
- 新增快捷撤回，最多保留 50 步；设置开关默认关闭。
- 换精灵、交换攻守和重置本页会清理能力等级、印记与负面状态，避免沿用上一只精灵状态。
- 分享载荷兼容旧版本，并可恢复负面状态结算开关与层数。
- 594 个精灵的名称、种族值、头像 URL、形态 ID 和本地头像哈希通过统一绑定校验。

## 自动化验收

- 根项目：`82` 个测试文件、`1245` 项测试全部通过。
- 小程序：`34` 个测试文件、`324` 项测试全部通过。
- 共享核心：工作树、暂存区、HEAD 与桌面 `v1.6.2` 均无漂移。
- 生产门禁：主包 `1270401` 字节，产物清单 SHA256 `5aa109b10922a59b83be13a22f092cfcda9c4bba2dc27d8296eca7f31099f41d`。
- 原生微信运行：iPhone 12/13 Pro、基础库 `3.17.1`，运行异常 `0`。

## 视觉与交互证据

- H5 手机主页：`output/playwright/phone-home.png`
- H5 手机设置：`output/playwright/phone-settings.png`
- H5 手机战斗条件：`output/playwright/phone-battle-conditions.png`
- H5 手机结果页：`output/playwright/phone-result-negative-status.png`
- H5 iPad 双栏：`output/playwright/ipad-home.png`
- 微信原生手机：`output/wechat-native-v1.1.0/native-runtime.png`
- 微信原生报告：`output/wechat-native-v1.1.0/native-capture-report.json`

## 发布说明

建议版本描述：

> 同步桌面 v1.6.2 计算核心与 S3季中数据；新增可选负面状态结算和快捷撤回；统一精灵头像、名称、形态与种族值绑定；修复换精灵后战斗状态残留。

代码上传、审核和正式发布分别记录，不能用本地构建结果代替微信后台状态。
