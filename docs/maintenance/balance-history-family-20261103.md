# 平衡回顾按家族合并 · 2026-11-03

已按“同家族合并，单独修改单独显示”实现，并更新本机桌面安装版2.3.0。国服源码为 `40727e36cd7aada359aebf4462b31ccb74923e95`；国际服继续使用 `6f3d11bec6ffa9b9bd267ed6a896e24755f16262`。这是本地构建与安装记录。

## 当前行为

- 精灵列表与按更新浏览均按明确的家族关系合并；不会仅凭相同图鉴号或相似名称归组。成员名称、别名和图鉴号仍可检索，成员搜索显示实际匹配对象。
- 同一次更新中内容相同的改动只展示一次，并标出实际受影响成员；全部成员、部分成员及单个成员的范围分别显示。独有改动仍单独列出，未记录的成员不会被算入改动范围。
- 更新日期、来源及回查入口保留；返回与重开保留筛选和位置。种族值、技能、学习面、特性分类继续分开。

## 实际验收

迪莫家族在S4共用的超导威力与效果合并为一组，S3放晴能耗及新增恐吓标为“仅迪莫”。喵家S2五月二十一日的技能调整明确列出四位成员，不包含武斗酷猫；叶冕魔力猫的独有种族值单列。花衣蝶“四维降解·威力100→110”仍位于技能调整，未混入种族值。

索引、组件交互、CLI定向回归及静态检查通过。最终来源完成国服与预览构建，复用未改动的国际服已验产物，通过原有资源与性能预算检查并完成NSIS打包。生产Web与实际安装版均完成成员搜索、分组及更新回查；Web390px及原生最小900×640窗口无横向溢出。安装版操作前后localStorage一致，无页面错误。

本机已从新版安装包更新，程序路径为 `C:/Users/Administrator/AppData/Local/Programs/rock-calculator/洛克计算器.exe`，保留默认用户数据。更新前备份在 `output/balance-family-20261103/user-data-before-update/`。此前旧安装包清理结果见[初次整装记录](desktop-install-20261103.md)。

## 产物与证据

- [当前完整安装包](../../release/洛克计算器-2.3.0.exe)
- [构建来源](../../output/balance-family-20261103/build-provenance.json)与[构建打包日志](../../output/balance-family-20261103/build-and-pack.log)
- [生产Web验收](../../output/balance-family-20261103/web-acceptance.json)、[安装结果](../../output/balance-family-20261103/install-result.json)、[实际安装版验收](../../output/balance-family-20261103/installed-native.json)
- [安装版迪莫家族](../../output/balance-family-20261103/installed-dimo-1100.png)、[喵家共有与独有项](../../output/balance-family-20261103/installed-cat-s2-1100.png)、[原生最小窗口](../../output/balance-family-20261103/installed-cat-s2-minimum.png)
