# 本机桌面完整版安装 · 2026-11-03

当前本机已更新为按更新精简的同版本构建，源码、安装与验收见[当前总览记录](balance-history-overview-20261103.md)。以下保留初次整装及旧安装包清理证据。

已卸载原桌面程序并安装本地完整版2.3.0，实际程序位于 `C:/Users/Administrator/AppData/Local/Programs/rock-calculator/洛克计算器.exe`。安装登记为2.3.0、EXE为2.3.0.0；桌面和开始菜单的“洛克计算器”快捷方式均指向该程序。已启动安装版，窗口为S5「圣龙宝藏」。本轮未推送、公开发布或发送安装文件。

## 完整改动来源

- 装配基线：`04c06633354331dd49e74e1c713cf6c26dfe6d01`，保留最新构建、资源引用校验及频道配置。
- 国服组合源码：`f9e4b4dac9206b9239ce3730651c00776867ea85`。包含最新性能与下注HP自动同步、国服平衡调整回顾、技能与种族值分组、HP历史别名去重、独立图标速度榜屏外布局优化。
- 国际服组合源码：`6f3d11bec6ffa9b9bd267ed6a896e24755f16262`。包含最新HP自动同步、说明与译文，并保留原有HP历史规范化及地区数据隔离。
- 桌面专用图标助手及回归沿用已验候选，保留国际服离线技能图标处理和最终runtime数量修正。

两服组合源码在独立工作树内提交并通过定向回归、ESLint；原维护目录及已有改动未覆盖。与最新地区源码比较后确认运行行为均已保留，未把无关分支或小程序专属改动混入桌面运行时。

## 验证

最终两服pin的CLI回归通过；桌面图标与契约回归通过。国服编译成功后，因先前中止留下的不完整dist触发保护，已将该本轮临时输出移入诊断目录，使用现有校验复制入口恢复完整产物；随后预览、国际服、资源引用检查和NSIS打包完成。离线自检通过，628个国服技能图标decode成功。

安装后在默认用户数据目录实际打开七项工具。花衣蝶“四维降解·威力100→110”属于技能调整，生命122→132只出现一次；速度榜完整65档、1348卡片，速度轴末端99。无页面错误；七项操作前后localStorage完全一致。安装前已备份旧桌面数据的Local Storage、Session Storage和偏好，卸载保留用户数据。

- [安装结果](../../output/desktop-install-20261103/install-result.json)、[快捷方式](../../output/desktop-install-20261103/shortcuts.json)、[安装版原生验收](../../output/desktop-install-20261103/installed-native.json)。
- [国服构建来源](../../output/desktop-install-20261103/cn-build-provenance.json)、[最终组装与打包](../../output/desktop-install-20261103/global-and-pack.log)、[最终pin的CLI回归](../../output/desktop-install-20261103/cli-final-pins.log)、[桌面契约回归](../../output/desktop-install-20261103/package-tests-final.log)、[离线自检](../../output/desktop-install-20261103/offline-smoke.json)。
- [安装版平衡回顾](../../output/desktop-install-20261103/installed-balance-history.png)、[速度榜](../../output/desktop-install-20261103/installed-speed.png)、[主界面](../../output/desktop-install-20261103/installed-main.png)。

## 清理与保留

安装及原生验收成功后，按只读盘点的明确文件清单删除37个旧安装包及13个对应blockmap，释放5,316,797,401字节，约4.95GiB。执行前逐项确认路径、大小与修改时间未变化，执行后确认文件消失且两个保留包仍在。仅删除普通文件，没有递归清理源码、工作树、运行目录或存档；浏览器PWA及其数据未操作。

- 最新完整安装包：[release/洛克计算器-2.3.0.exe](../../release/洛克计算器-2.3.0.exe)。
- 回退包：`D:/codex/worktrees/rock-desktop-performance-20261103/release/洛克计算器-2.3.0.exe`，为此前已验的性能候选。
- [实际清理结果](../../output/desktop-install-20261103/cleanup-result.json)。安装前用户数据备份位于 `output/desktop-install-20261103/installed-user-data-before/`。
