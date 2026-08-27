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

  test("v1.6.4 首屏展示桌面外链修复", () => {
    const currentRelease = USER_RELEASE_NOTES[0];
    const visibleSummary = currentRelease.summaryHighlights.join("\n");
    const completeNotes = currentRelease.highlights.join("\n");

    expect(currentRelease).toMatchObject({
      date: "2026.08.26",
      title: "外链修复",
      version: "v1.6.4",
    });
    expect(currentRelease.summaryHighlights).toHaveLength(3);
    expect(currentRelease.summaryHighlights.every((item) => item.length <= 58)).toBe(true);
    expect(visibleSummary).toMatch(/Windows桌面版.*外链.*无响应/);
    expect(visibleSummary).toMatch(/GitHub.*BWIKI.*B站.*跳转正常/);
    expect(visibleSummary).toMatch(/邮件反馈.*跳转正常/);
    expect(completeNotes).toMatch(/安全桥.*危险协议.*v1\.6\.4/);
  });
});
