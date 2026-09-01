import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { USER_RELEASE_NOTES } from "../../src/data/user-release-notes.js";

const packageVersion = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
).version;

const [currentRelease, ...previousReleases] = USER_RELEASE_NOTES;

describe("版本记录", () => {
  test("仓库更新日志逐版覆盖应用内完整记录", () => {
    const changelog = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const changelogVersions = [...changelog.matchAll(/^## (v\d+\.\d+\.\d+)$/gm)].map(
      ([, version]) => version,
    );
    const applicationVersions = USER_RELEASE_NOTES.map(({ version }) => version);

    expect(changelogVersions).toEqual(applicationVersions);
  });

  test("首条记录必须对应 package.json 的当前版本", () => {
    expect(currentRelease.version).toBe(`v${packageVersion}`);
    expect(currentRelease.date).toMatch(/^\d{4}\.\d{2}\.\d{2}$/u);
    expect(currentRelease.title.trim().length).toBeGreaterThan(0);
  });

  test("版本号唯一且按发布顺序从新到旧排列", () => {
    const versions = USER_RELEASE_NOTES.map(({ version }) => version);

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((version) => /^v\d+\.\d+\.\d+$/u.test(version))).toBe(true);
  });

  test("首屏摘要保持精简且每条都能完整显示", () => {
    expect(currentRelease.summaryHighlights.length).toBeGreaterThan(0);
    expect(currentRelease.summaryHighlights.length).toBeLessThanOrEqual(3);
    expect(currentRelease.summaryHighlights.every((item) => item.length <= 58))
      .toBe(true);
    expect(currentRelease.highlights.length).toBeGreaterThan(0);
  });

  test("首屏摘要与完整记录不复述历史版本的条目", () => {
    const historicalEntries = new Set(
      previousReleases.flatMap((release) => [
        ...(release.summaryHighlights ?? []),
        ...release.highlights,
      ]),
    );
    const currentEntries = [
      ...currentRelease.summaryHighlights,
      ...currentRelease.highlights,
    ];

    expect(currentEntries.filter((item) => historicalEntries.has(item)))
      .toEqual([]);
    expect(previousReleases.map(({ title }) => title))
      .not.toContain(currentRelease.title);
  });
});
