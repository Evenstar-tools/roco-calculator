# 洛克计算器

[![Checks](https://img.shields.io/badge/checks-1049%20passed-2da44e.svg)](#开发与验证)
[![Release](https://img.shields.io/badge/release-v1.5.5-4c55d9.svg)](https://github.com/zhangzeyu99-web/rock-calculator/releases/tag/v1.5.5)
[![License](https://img.shields.io/badge/code-MIT-4c55d9.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Windows-2563eb.svg)](#使用方式)

面向《洛克王国：世界》PVP 的确定性伤害计算器。目标是在一回合有限的决策时间内，用最少操作完成双方精灵、性格、个体和技能对比。

## 主要能力

- **即时双选**：左右选择攻防精灵，四个技能伤害同步显示。
- **确定性计算**：不显示随机区间，配置变化后立即重算。
- **双向对比**：攻击方与防御方技能均可快捷查看对方伤害。
- **完整配置**：提供精简版与具体版，支持性格、六维个体、威力、连击和触发条件。
- **技能规则**：覆盖动态威力、条件触发、层数特性和手动覆盖。
- **公式核对**：高级选项用四行中文算式展示技能威力、显示威力、单段取整与总伤害。
- **配置记忆**：精灵配置自动保存在本机，切换后按精灵恢复。
- **队伍预设**：支持多支六人队伍、四技能配置及攻防方快捷载入。
- **离线可用**：内置当前赛季快照和本地素材，可作为网页、PWA 或 Windows 桌面应用运行。

当前数据快照包含 **592 个精灵形态**与 **553 个技能**。

## 快速入口

- [下载最新 Windows 安装包](https://github.com/zhangzeyu99-web/rock-calculator/releases/latest)
- [查看完整更新记录](CHANGELOG.md)
- [反馈计算错误或功能问题](https://github.com/zhangzeyu99-web/rock-calculator/issues/new/choose)
- [核对伤害计算过程](docs/damage-calculation-human-readable.md)

## 使用方式

### Windows

前往 [Releases](https://github.com/zhangzeyu99-web/rock-calculator/releases/latest) 下载最新版“洛克计算器”安装包，直接安装或覆盖旧版本。

### 本地网页

需要 Node.js 22 或更高版本：

```bash
git clone https://github.com/zhangzeyu99-web/rock-calculator.git
cd rock-calculator
npm ci
npm run dev
```

### 静态部署

```bash
npm ci
npm run build
```

将 `dist/client/` 作为静态站点目录部署到任意服务器即可。运行时不依赖 ChatGPT 登录或外部计算服务。

### 微信小程序生产构建

完整计算数据随小程序本地打包，不需要购买或开通微信云开发。微信开发者
工具导入项目后，生产构建会优先读取 `miniapp/project.config.json` 中的真实
AppID；也可以复制 `miniapp/local.config.example.json` 为被 Git 忽略的
`miniapp/local.config.json` 并填写 AppID。不要填写 AppSecret，也不要把本地
配置加入版本控制。

```bash
npm run miniapp:build:prod
```

微信开发者工具导入目录为仓库内的 `miniapp/`；`project.config.json` 已将
`miniprogramRoot` 固定为 `dist/`。生产门禁完成本地构建、安全扫描、2 MiB
包体和版本校验，并把 AppID 注入 `dist/project.config.json` 后核对一致性。
该命令不会预览、上传、送审或发布小程序。

## 操作流程

1. 选择攻击方和防御方精灵。
2. 在精简版中选择增益方向与个体加点；需要精确配置时切换具体版。
3. 选择单技能或四技能，直接读取伤害、HP 占比与剩余生命。

所有配置默认保存在浏览器或桌面应用的本地存储中，不上传个人队伍数据。

## 开发与验证

```bash
npm run data:validate
npm test
npm run miniapp:test
npm run miniapp:build
npm run e2e
npm run build
npm audit --omit=dev
```

Windows 安装包：

```bash
npm run desktop:pack
```

常用脚本：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发环境 |
| `npm run data:runtime` | 从完整快照生成紧凑运行数据 |
| `npm run data:validate` | 校验精灵、技能和引用关系 |
| `npm test` | 运行单元与集成测试 |
| `npm run miniapp:test` | 运行微信小程序共享核心与界面测试 |
| `npm run miniapp:build` | 同步共享核心并构建微信小程序 |
| `npm run miniapp:build:prod` | 使用本地私有配置构建并校验微信小程序生产产物 |
| `npm run e2e` | 运行 Chromium 端到端测试 |
| `npm run build` | 生成静态站点并校验产物体积预算 |
| `npm run performance:verify` | 单独校验当前静态产物体积预算 |
| `npm run desktop:pack` | 生成 Windows x64 安装包 |

## 数据与规则

- 精灵、技能与美术素材主要参考[洛克王国：世界 BWIKI](https://wiki.biligame.com/rocom/)，并保留本地核验快照与修订号。
- 特殊技能和特性规则在 `src/domain/` 中显式登记并配套测试。
- 赛季更新流程参见 [docs/season-update-runbook.md](docs/season-update-runbook.md)。
- 为兼容旧版本，本地存储中仍可能保留历史键名；这不代表项目与同名网站存在隶属关系。

## 鸣谢与参考

- 感谢 [lovepvp.top](https://lovepvp.top/) 原站作者对洛克王国 PVP 伤害计算流程、技能规则整理与交互方式的长期积累。
- 感谢 [Roco Showdown 战斗模拟计算原理](https://rocopvp.tzrain.wiki/battle-use-guide) 作者与维护者提供可核对的公式分区、取整顺序和规则说明。
- 感谢[洛克王国：世界 BWIKI](https://wiki.biligame.com/rocom/) 创建者 MonicaSarina 及全体编辑者整理精灵、技能、属性与美术资料。

以上页面用于规则查证、交互研究和资料核验；本仓库未将参考站点代码作为运行时依赖。具体权利与授权边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 版本管理

- 使用语义化版本号 `主版本.次版本.修订号`。
- [CHANGELOG.md](CHANGELOG.md) 记录所有实际交付过的本地修订，不补造不存在的历史标签。
- GitHub Releases 保留完成全量验收的稳定里程碑，不要求每个历史修订都补发；最新版 Release 是公开安装包的唯一入口。
- 每个已发布的 GitHub Release 均对应 Git 标签、Windows 安装包和 SHA256 文件。

## 贡献

欢迎提交问题、技能规则证据、数据修正和交互改进。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证与声明

项目源代码采用 [MIT License](LICENSE)。

游戏名称、角色、图像、图标和相关素材的权利归其各自权利人所有，不包含在 MIT 代码授权范围内。项目为非官方玩家工具，与腾讯、魔方工作室群及 BWIKI 无隶属或授权关系。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
