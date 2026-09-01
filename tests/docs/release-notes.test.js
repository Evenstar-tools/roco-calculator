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

  test("v1.6.5 首屏只展示计算取整修复", () => {
    const currentRelease = USER_RELEASE_NOTES[0];
    const visibleSummary = currentRelease.summaryHighlights.join("\n");
    const completeNotes = currentRelease.highlights.join("\n");

    expect(currentRelease).toMatchObject({
      date: "2026.09.01",
      title: "计算取整修复",
      version: "v1.6.5",
    });
    expect(currentRelease.summaryHighlights).toHaveLength(3);
    expect(currentRelease.summaryHighlights.every((item) => item.length <= 58)).toBe(true);
    expect(visibleSummary).toMatch(/技能威力.*先向下取整/);
    expect(visibleSummary).toMatch(/显示威力.*伤害分子.*单段伤害/);
    expect(visibleSummary).toMatch(/55×1\.5=82\.5.*向下取整82/);
    expect(visibleSummary).toMatch(/20054÷170=117\.96.*向下取整117/);
    expect(`${visibleSummary}\n${completeNotes}`).not.toMatch(/小程序|技能图标|窄屏|分享/);
    expect(completeNotes).toMatch(/先向下取整[\s\S]*显示威力.*四舍五入/);
    expect(completeNotes).toMatch(/固执.*岚鸟.*先发制人.*龙鱼.*271.*170.*50%/);
    expect(completeNotes).toMatch(/271.*82.*37\/41.*20054/);
    expect(completeNotes).toMatch(/20054.*170.*117\.96.*117/);
  });
});
