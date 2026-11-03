# 平衡回顾按更新精简 · 2026-11-03

已根据用户截图和“按更新别一个家族一个家族显示，只有搜索才显示对应精灵”的明确要求完成优化，并更新本机桌面安装版2.3.0。本记录为当前本地构建与安装阶段，替代上一阶段“按更新也按家族展开”的默认界面。

## 当前行为

- 按更新浏览默认按调整内容合并，精简为数值行和效果条目，仅显示涉及数量；长效果默认折叠，展开后可看完整前后内容。默认不列精灵或家族卡片。
- 搜索后才显示匹配精灵自身在该批次的记录；不会带出家族兄弟的独有改动。清空回到概览，切换批次或对象清理旧展开状态。独立技能概览仍具名，防止同数值的不同技能混合。
- 按精灵回查保留家族合并及独有改动范围；更新与精灵往返保留查询、筛选及滚动。概览仅在按更新模式计算，沿用索引缓存与分批渲染。

## 来源与实际验收

国服来源 `07adf2b8e5c414c72a1e9d473ede965e31e22f30`，国际服继续使用 `6f3d11bec6ffa9b9bd267ed6a896e24755f16262`。国服及预览按固定源码构建，复用国际服未改动的已验产物，通过原有性能预算、最终资源校验和NSIS打包。定向索引、组件、入口、工具箱及最终两服pin的CLI回归通过。

正式国服数据的实际界面已检查1100宽亮暗、390窄屏。当前安装版使用默认用户数据目录，确认默认无精灵卡片、长效果可展开；S2五月二十一日搜喵呜仅显示自身两项技能，不出现叶冕独有种族值，回查后返回恢复查询，清空恢复概览。原生最小900×640窗口无横向溢出，关键控件及数值可读。安装版只读操作前后localStorage一致，无页面错误；独立读图复核通过。

程序位于 `C:/Users/Administrator/AppData/Local/Programs/rock-calculator/洛克计算器.exe`，更新前用户数据备份位于 `output/balance-overview-20261103/user-data-before-update/`。本轮未推送、公开发布或对外发送。

## 产物与证据

- [当前完整安装包](../../release/洛克计算器-2.3.0.exe)
- [构建来源](../../output/balance-overview-20261103/build-provenance.json)、[打包日志](../../output/balance-overview-20261103/build-and-pack.log)、[最终pin的CLI回归](../../output/balance-overview-20261103/cli-tests.log)
- [Web验收](../../output/balance-overview-20261103/web-acceptance.json)、[安装结果](../../output/balance-overview-20261103/install-result.json)、[安装版验收](../../output/balance-overview-20261103/installed-native.json)
- [真实安装版前后对照](../../output/balance-overview-20261103/before-after-native.png)、[当前总览](../../output/balance-overview-20261103/installed-overview-1100.png)、[成员搜索](../../output/balance-overview-20261103/installed-search-cat.png)、[原生最小窗口](../../output/balance-overview-20261103/installed-overview-minimum.png)

此前的家族合并与原生验收保留在[上一阶段记录](balance-history-family-20261103.md)；旧安装包清理保留在[初次整装记录](desktop-install-20261103.md)。
