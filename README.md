<p align="center">
  <img src="https://github.com/zhangzeyu99-web/rock-calculator/raw/refs/heads/main/docs/images/project-cover.png" alt="洛克计算器项目封面" width="100%">
</p>

# 洛克计算器

[![Checks](https://img.shields.io/badge/checks-315%20passed-2da44e.svg)](#开发与验证)
[![Release](https://img.shields.io/badge/release-v1.2.4-4c55d9.svg)](https://github.com/zhangzeyu99-web/rock-calculator/releases/tag/v1.2.4)
[![License](https://img.shields.io/badge/code-MIT-4c55d9.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Windows-2563eb.svg)](#使用方式)

面向《洛克王国：世界》PVP 的确定性伤害计算器。目标是在一回合有限的决策时间内，用最少操作完成双方精灵、性格、个体和技能对比。

![洛克计算器精简版界面](https://github.com/zhangzeyu99-web/rock-calculator/raw/refs/heads/main/docs/images/app-overview.png)

## 主要能力

- **即时双选**：左右选择攻防精灵，四个技能伤害同步显示。
- **确定性计算**：不显示随机区间，配置变化后立即重算。
- **双向对比**：攻击方与防御方技能均可快捷查看对方伤害。
- **完整配置**：提供精简版与具体版，支持性格、六维个体、威力、连击和触发条件。
- **技能规则**：覆盖动态威力、条件触发、层数特性和手动覆盖。
- **配置记忆**：精灵配置自动保存在本机，切换后按精灵恢复。
- **队伍预设**：支持多支六人队伍、四技能配置及攻防方快捷载入。
- **离线可用**：内置当前赛季快照和本地素材，可作为网页、PWA 或 Windows 桌面应用运行。

当前数据快照包含 **592 个精灵形态**与 **553 个技能**。

## 使用方式

### Windows

前往 [Releases](https://github.com/zhangzeyu99-web/rock-calculator/releases/latest) 下载最新版 `Rock-Calculator-v*.exe`，直接安装或覆盖旧版本。应用安装后仍显示为“洛克计算器”。

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

## 操作流程

1. 选择攻击方和防御方精灵。
2. 在精简版中选择增益方向与个体加点；需要精确配置时切换具体版。
3. 选择单技能或四技能，直接读取伤害、HP 占比与剩余生命。

所有配置默认保存在浏览器或桌面应用的本地存储中，不上传个人队伍数据。

## 开发与验证

```bash
npm run data:validate
npm test
npm run e2e
npm run build
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
| `npm run e2e` | 运行 Chromium 端到端测试 |
| `npm run build` | 生成静态站点 |
| `npm run desktop:pack` | 生成 Windows x64 安装包 |

## 数据与规则

- 主要数据与素材参考 BWIKI 的公开页面及本地核验快照。
- 特殊技能和特性规则在 `src/domain/` 中显式登记并配套测试。
- 赛季更新流程参见 [docs/season-update-runbook.md](docs/season-update-runbook.md)。
- 为兼容旧版本，本地存储中仍可能保留历史键名；这不代表项目与同名网站存在隶属关系。

## 贡献

欢迎提交问题、技能规则证据、数据修正和交互改进。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证与声明

项目源代码采用 [MIT License](LICENSE)。

游戏名称、角色、图像、图标和相关素材的权利归其各自权利人所有，不包含在 MIT 代码授权范围内。项目为非官方玩家工具，与腾讯、魔方工作室群及 BWIKI 无隶属或授权关系。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
