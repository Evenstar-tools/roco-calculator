# 精简版血条与提示修复发布 · 2026-10-09

## 范围和源码

用户授权推送线上、回查 Web、更新同版本 Release。仅发布网页／Windows 2.2.5，不移动历史标签，不上传小程序。

源码 `b421c5a452ad3b35c3a2d467c1853b226e68a75b` 已推送 `Evenstar-tools/roco-calculator` 的 main。发布前合并远端已有说明页更新，保留工作区原有 AGENTS.md 和小程序在途改动。本记录只补充交接，不更改构建输入。

修复旧 CSS 将精简伤害条的整段父容器着色问题，恢复按占比填充和灰色剩余；普通非伤害技能不再误报，空结果使用中性色，真实缺条件与未验证规则仍提示原因。计算核心未改变。

## 发布验证

发布关键单测、lint、生产构建、数据／核心／体积门禁和关键浏览器链路通过。链接依赖的 WASM 读取限制复用现有本机验证配置；生成的 `.tmp` 依赖缓存排除出 lint，不降低产品门禁。[源码 CI](https://github.com/Evenstar-tools/roco-calculator/actions/runs/37882955688) 的 validate、miniapp 和 e2e 全部成功；CI 构建小程序不代表本轮上传。

[线上 Web](https://rococalc.top/) 自动部署后，由独立浏览器验证资源 `main-DnqWPAdb.js`、`main-D0Ht6wwm.css`；不含旧 `.compact-skill__bar > span` 整条染色规则。1430 桌面与 390 手机实测感电 154／34.5%、广播 67／16.3%、水光冲击 450／100.9% 的条长正确，灰色剩余可见，超过 100% 保留数值而条长封顶。

打湿、加大功率、无风的空结果为中性色且没有误警告。真实锥尾羊坟场搏击缺敌方能量时保留警告及“需要敌方能量”原因。手机无横向溢出，页面无错误；只出现既有统计请求受阻告警。主代理已读回桌面、手机及缺条件实图，未追加布局改动。

实图：`output/playwright/online-skill-bars-desktop-light-20261009.png`、`online-skill-bars-desktop-dark-20261009.png`、`online-skill-bars-390-dark-detail-20261009.png`、`online-skill-bars-missing-condition-20261009.png`。

## Windows 与 Release

使用发布浏览器门禁生成的同一份生产资源直接打包，不重复构建。安装包解包资源与本次桌面生产资源逐文件内容一致，内置版本 2.2.5，血条和中性色修复均存在。隔离离线启动报告 `artifacts/compact-skill-bars-20261009/desktop/offline-smoke.json` 为通过，内置数据与技能图标加载正常。

最终本地包：`installers/v2.2.5/洛克计算器-2.2.5.exe`。旧同版本包：`installers/v2.2.5/previous/洛克计算器-2.2.5-9babaaf.exe`，可用于回退。

[v2.2.5 Release](https://github.com/Evenstar-tools/roco-calculator/releases/tag/v2.2.5) 只保留本轮 Windows 附件 `RoCo-Calculator-2.2.5.exe`，asset ID `623864194`，138981942 字节；正文明确本轮源码和平台边界。候选和正式附件均重新下载，与已验证本地包逐字节一致后才移除旧线上附件 `622125886`。历史 v2.2.5 标签保持不变。

安装包未签名，仅完成解包和离线运行检查，未执行完整安装／卸载。本轮未上传微信小程序，用户在途改动保持不动；不生成额外交付校验清单。
