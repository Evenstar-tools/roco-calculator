import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

describe("版本记录", () => {
  test("仓库更新日志逐版覆盖应用内完整记录", () => {
    const changelog = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const changelogVersions = [...changelog.matchAll(/^## (v\d+\.\d+\.\d+)$/gm)].map(
      ([, version]) => version,
    );
    const applicationVersions = USER_RELEASE_NOTES.map(({ version }) => version);

    expect(changelogVersions).toEqual(applicationVersions);
  });

  test("v1.6.3 首屏展示队伍分析、技能适配和配置库更新", () => {
    const currentRelease = USER_RELEASE_NOTES[0];
    const visibleSummary = currentRelease.summaryHighlights.join("\n");
    const completeNotes = currentRelease.highlights.join("\n");

    expect(currentRelease).toMatchObject({
      date: "2026.08.26",
      title: "队伍分析与技能适配",
      version: "v1.6.3",
    });
    expect(currentRelease.summaryHighlights).toHaveLength(3);
    expect(currentRelease.summaryHighlights.every((item) => item.length <= 58)).toBe(true);
    expect(visibleSummary).toMatch(/队伍.*分析.*对位.*六人矩阵/);
    expect(visibleSummary).toMatch(/体重挡位.*奉献.*相邻技能威力/);
    expect(visibleSummary).toMatch(/213.*PVP.*14种咕噜球.*获取应用.*二级说明/);
    expect(completeNotes).toMatch(/陨星虫.*旧空字段/);
    expect(completeNotes).toMatch(/吨位压制.*飞断/);
  });
});
