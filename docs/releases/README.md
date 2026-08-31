# 版本与发布

本页区分源码修订、Git 标签和可下载安装包，避免把本地完成或已有标签误写成公开发布成功。

## 当前状态

| 项目 | 版本 | 状态 | 入口 |
| --- | --- | --- | --- |
| 当前源码 | `v1.6.4` | 已进入 `main`，尚未发布对应安装包 | [更新内容](../../CHANGELOG.md#v164) |
| 最新稳定版 | `v1.6.3` | GitHub Release，提供 Windows 安装包与 SHA-256 | [下载与说明](https://github.com/Evenstar-tools/roco-calculator/releases/tag/v1.6.3) |

## 记录口径

- [CHANGELOG.md](../../CHANGELOG.md) 记录所有实际完成的版本修订，包括未单独创建 Git 标签或 Release 的版本。
- [Git 标签](https://github.com/Evenstar-tools/roco-calculator/tags) 固定已标记的源码里程碑。
- [GitHub Releases](https://github.com/Evenstar-tools/roco-calculator/releases) 只保存完成发布验收、可公开下载的稳定版本。
- Windows 安装包以 Release 资产为准；提交、构建成功和 Git 标签本身都不等于公开安装包已发布。

## 已保留的源码里程碑

新仓库保留以下 16 个正式版本标签：

`v1.6.3`、`v1.6.2`、`v1.6.1`、`v1.5.7`、`v1.5.6`、`v1.5.5`、`v1.5.4`、`v1.4.6`、`v1.4.5`、`v1.4.4`、`v1.4.3`、`v1.4.1`、`v1.3.6`、`v1.3.0`、`v1.2.4`、`v1.2.3`。

完整功能变化见 [CHANGELOG.md](../../CHANGELOG.md)。历史标签只证明对应源码已标记；没有 Release 资产的标签不提供安装包下载承诺。

## 下载校验

下载 Windows 安装包后，在 PowerShell 中执行：

```powershell
Get-FileHash -Algorithm SHA256 .\rock-calculator-1.6.3.exe
```

`v1.6.3` 安装包的 SHA-256 应为：

```text
FA966731C8F0E0EE3383835A1C156311C675BE92344FBFA9D97AE33A1754D7A4
```

同时可下载 Release 中的 `SHA256SUMS.txt` 交叉核对。若哈希不一致，请勿运行文件，并通过 [安全漏洞私密报告](https://github.com/Evenstar-tools/roco-calculator/security/advisories/new) 联系维护者。
