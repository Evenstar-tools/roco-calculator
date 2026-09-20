# UX23 性格阶梯选择本地验收

确认依据：用户要求“按照示意图修改，选择界面”，对应 `artifacts/web-ux23/proposal/preview.html` 的 W23-01。该轮未把六维卡片绿图标 W23-03 合并实施；用户随后独立确认，结果见文末追加验收。小程序、发布与安装包不在本次范围。

## 实现

- 共用 NatureSelect：首开普通无修正及六个分组共 7 行，悬停 150ms 或点击只展开一组 5 个性格，最多 12 行。保留 14px 分组标题、百分比左侧 18px 属性图标，不加展开箭头。
- 继续读取原性格数据及调用原 onChange；主界面、队伍成员、能力分析和其他复用入口同步使用。不改倍率和保存模型。
- 使用原生顶层浮层避免被抽屉裁切，DOM 留在原弹层中兼容焦点约束；支持方向键、Enter、Escape、外部点击及焦点返回。菜单 Tab 不穿透触发全局模式切换；已按住的 Tab 松开仍返回原模式。
- 队伍窄选择栏保持原宽度，展开菜单最小 260px 并限制在视口内，子项不换行。短于完整菜单高度的窗口允许限高滚动，不裁掉选项。

## 验证

- npm test：109 个文件、1860 项通过；最后菜单 Tab 事件隔离调整后专项 5 项再次通过。
- npm run e2e：最终生产构建下 13 项通过，构建包含数据、核心一致性和体积预算校验。首轮模式按钮尺寸用例瞬态读到 0 后失败，原样复跑与最后重新构建均通过，未修改该测试或产品头部。
- npm run lint、git diff --check 通过。JS gzip 约 350.45 KiB，CSS gzip 56.50 KiB，未修改性能预算。
- 网页和 Electron 生产构建：亮暗主题 1920×1080，菜单 394px、12 行、5 个子项、6 个图标、0 个分组箭头，分组 14px，无内部滚动；320/390×844 无水平或垂直溢出。
- 按住 Tab 编辑开朗后松开返回，Ctrl+Z 能撤回性格；真实菜单选择而非 selectOption。队伍成员选择开朗后关闭重开保留；能力分析选择沉默仅修改草稿，放弃后成员仍为开朗。Escape 仅关闭性格菜单，不关闭队伍。
- 扩展专项：队伍、能力工作台、应用集成合计 153/155 通过；另跑鹿页面、能力性能、新菜单共 35 项通过。两项应用集成失败并非本次引入，详见下节；不宣称全部扩展测试通过。

## 已知非本轮回归

应用集成“loads one team member into the attack side without linking later edits”因水灵设为攻击方匹配两个按钮失败；“切换四技能行到可编辑的显示威力并记住设置”因目标设置文字折叠不可见失败。

用 `output/playwright/shortcuts/baseline-vite.config.mjs` 在转换阶段只读载入 HEAD 原 NatureSelect 和原应用测试文件，未替换工作树文件；两项同样失败。已列 W23-QA，不扩大本轮产品改动范围。

## 证据与状态

- 方案与实际对照：`artifacts/web-ux23/acceptance/preview.html`、`mockups-combined.png`。
- 实际主界面：`web-nature-actual-light/dark.png`、`desktop-nature-actual-light/dark.png`；窄屏：`web/desktop-nature-320/390.png`。
- 队伍、能力分析截图：`web-nature-team.png`、`web-nature-ability.png`。
- 可重跑验证：`artifacts/web-ux23/verify-nature-menu.js`、`output/playwright/shortcuts/verify-nature-desktop.mjs`，桌面结果 `desktop-nature-result.json`。
- 当前仅本地实施，未提交、未推送、未线上回查、未打安装包。

## 追加 W23-03：性格增益图标变绿

用户确认“增益性格加颜色这个也做”，按 gain-proposal 示意实施。复用原 PNG 的透明轮廓作颜色遮罩，不重新绘制图标；亮色 #16a34a，暗色 #6ee7a0，尺寸不变。只由当前性格的 upStat 决定标记，不受个体值满点或战斗面板加成影响。文字、数值及减益／其他属性图标保持原样。增益图标提供可访问名称与悬停说明。

传入真实性格状态：双方六维、队伍成员、能力分析草稿、鹿页面手动六维。通用 StatIcon 默认仍灰色，性格选择菜单和快捷性格按钮不在本项改色范围。

验证：npm test 110 文件／1869 项通过（含六种增益及无修正回归），13 项 E2E、lint、生产构建与预算门禁通过；网页亮暗和 390px 读回对应颜色、18px 原素材、仅一枚增益图标、其余五枚灰色。改为生命增益后速度标记消失，选无修正后全部恢复灰色；队伍成员及能力分析读取正确的性格标记。桌面独立用户目录生产构建复核同一路径。

实际对照：`artifacts/web-ux23/gain-acceptance/preview.html`；截图 `web/desktop-gain-actual-light/dark.png`，验证脚本 `verify-gain-icon.js`，桌面结果 `desktop-gain-result.json`。仍未提交、未推送或发布。

## 同版本发布授权

用户随后确认“俩都做完收尾推送同版本，回查web”。本次收尾合并 W23-01、W23-03 与已完成的快捷键改动，版本保持 2.2.2；上文未发布状态为各阶段的历史记录。更新 CHANGELOG 与应用内说明后执行发布记录测试、生产构建及预算检查，再逐文件提交至 origin/main。只触发 Web 自动部署，不重打桌面安装包、不上传小程序。

线上验收须比对真实站点首页、Service Worker、运行数据及构建 JS/CSS；随后在独立浏览器配置实测性格菜单、增益绿色及 Tab 按住编辑保留。发布与回查结果另存本地 `artifacts/web-ux23/`，不以提交成功代替线上验收。
