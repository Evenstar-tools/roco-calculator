# 洛克计算器

[English](README.en.md)

《洛克王国：世界》的非官方 PVP 伤害计算与队伍工具。选择双方精灵和技能，查看伤害、HP 占比与剩余生命。界面和资料为中文，使用国服 S4 数据；国际服数值和规则尚未核实。

[在线使用](https://rococalc.top/) · [Windows 安装包](https://github.com/Evenstar-tools/roco-calculator/releases/latest) · [英文使用说明](https://rococalc.top/en/)

## 本地运行

需要 Node.js 22 或更高版本，在仓库根目录执行：

```powershell
npm ci
npm run dev
```

`npm run build` 构建网页版。可下载版本与源码版本见[版本记录](docs/releases/README.md)，改动见[更新记录](CHANGELOG.md)。

## AI 与命令行

纯 JSON CLI 复用同一计算核心和本地数据，无需启动网页。安装依赖后查看数据与输入契约：

```powershell
npm run -s cli -- meta
npm run -s cli -- schema
```

输入方式见 [CLI 交接说明](docs/maintenance/ai-cli-handoff.md)，代理使用规则见[项目 Skill](.agents/skills/rock-calculator-cli/SKILL.md)。CLI 复算不能代替对核心公式的独立验证。

## 计算与反馈

公式和取整口径见[计算规则说明](docs/damage-calculation-human-readable.md)。[反馈计算问题](https://github.com/Evenstar-tools/roco-calculator/issues/new/choose)时，请附双方精灵、技能、配置、启用条件与预期结果。

## 鸣谢与参考

- 数据与美术资料主要参考 [洛克王国：世界 BWIKI](https://wiki.biligame.com/rocom/)。
- 感谢 [lovepvp.top](https://lovepvp.top/) 和 [Roco Showdown 战斗模拟计算原理](https://rocopvp.tzrain.wiki/battle-use-guide) 对规则整理与核对方式的长期积累。

本项目已对 BWIKI 来源数据进行抓取、结构化、校验、纠错及补充。源自 BWIKI、且受其许可覆盖的数据整理和改编部分依据 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 共享。其他参考页面仅用于资料核验和规则研究，不作为本项目的运行时依赖。

## 许可证与声明

本仓库代码的许可和版权署名以 [MIT License](LICENSE) 为准，现为 `Copyright (c) 2026 zhangzeyu99-web`。MIT 只适用于该许可所覆盖的代码，不授予任何游戏素材、商标、第三方页面、第三方数据或美术资源的使用权。

《洛克王国：世界》相关的游戏名称、角色、图像、图标、数据和商标，权利归原权利人所有（包括腾讯、魔方工作室群及相应权利主体）。本项目是非官方玩家工具，与上述主体、BWIKI 及参考站不存在隶属、代理或授权关系。

如果你复制、改编或发布本仓库内容，请先区分代码和第三方内容：不得因为获得了 MIT 代码就照搬游戏素材、品牌元素、BWIKI 受许可内容，或 lovepvp.top、Roco Showdown 等参考站的原创代码、页面设计和自建资料。尤其是用于商业产品、收费服务、广告变现或再分发前，应取得相应权利人的许可，并保留必要的署名和许可证声明；否则可能产生侵权风险和相应责任。

完整的来源、归属与使用边界见 [第三方内容与权利声明](docs/legal/THIRD_PARTY_NOTICES.md)。
