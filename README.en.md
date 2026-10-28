# Roco Calculator

[简体中文](README.md)

An unofficial PvP damage calculator and team tool for **Roco Kingdom**. Select both Jinies and their skills to compare damage and remaining HP. The China-server calculator uses S4 data. The Global web app supports English, Japanese and Chinese, uses S3 midseason stats and rules, and includes S1–S5 season themes.

[Global · English](https://rococalc.top/en/) · [Global · 日本語](https://rococalc.top/jp/) · [Global · 简体中文](https://rococalc.top/global/zh-CN/) · [China server](https://rococalc.top/) · [Windows installer](https://github.com/Evenstar-tools/roco-calculator/releases/latest)

## Local use

With Node.js 22 or later, run from the repository root:

```powershell
npm ci
npm run dev
```

`npm run build` builds the web app. Check [version records (Chinese)](docs/releases/README.md) for available installers and source versions.

## Command-line use

The JSON-only CLI reuses the same core and local data without starting the web app. After installing dependencies:

```powershell
npm run -s cli -- meta
npm run -s cli -- schema
```

See the [CLI handoff (Chinese)](docs/maintenance/ai-cli-handoff.md) and [project Skill (Chinese)](.agents/skills/rock-calculator-cli/SKILL.md). Reproducing the core's output is not an independent validation of its formulas.

## Issues, sources and license

For calculation issues, include both Jinies, skills, configurations, enabled conditions and the expected result in a [GitHub issue](https://github.com/Evenstar-tools/roco-calculator/issues/new/choose). See the [calculation rules (Chinese)](docs/damage-calculation-human-readable.md) for assumptions and rounding.

Data and artwork primarily reference the [洛克王国：世界 BWIKI](https://wiki.biligame.com/rocom/). The project acknowledges [lovepvp.top](https://lovepvp.top/) and [Roco Showdown's calculation reference](https://rocopvp.tzrain.wiki/battle-use-guide) for rule research; these references are not runtime dependencies.

Code is covered by the [MIT License](LICENSE). BWIKI-derived material covered by its license is shared under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The code license grants no rights to game assets, trademarks or other third-party content. See the [third-party notices (Chinese)](docs/legal/THIRD_PARTY_NOTICES.md) and [full Chinese statement](README.md#许可证与声明) for attribution, permissions and reuse boundaries.

This unofficial player tool is not affiliated with or endorsed by the game developers, BWIKI or the reference sites.
