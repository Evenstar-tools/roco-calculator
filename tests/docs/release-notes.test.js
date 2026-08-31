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

  test("v1.6.5 首屏展示小程序交互与取整修复", () => {
    const currentRelease = USER_RELEASE_NOTES[0];
    const visibleSummary = currentRelease.summaryHighlights.join("\n");
    const completeNotes = currentRelease.highlights.join("\n");

    expect(currentRelease).toMatchObject({
      date: "2026.09.01",
      title: "小程序交互与取整修复",
      version: "v1.6.5",
    });
    expect(currentRelease.summaryHighlights).toHaveLength(3);
    expect(currentRelease.summaryHighlights.every((item) => item.length <= 58)).toBe(true);
    expect(visibleSummary).toMatch(/技能栏.*选择器.*技能图标/);
    expect(visibleSummary).toMatch(/取整.*双端伤害一致/);
    expect(visibleSummary).toMatch(/重复入口.*对齐.*溢出/);
    expect(completeNotes).toMatch(/先向下取整.*显示威力.*四舍五入/);
  });
});
