import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CURRENT_USER_RELEASE,
  S4_PREVIEW_USER_RELEASE,
  USER_RELEASE_NOTES,
} from "../../src/data/user-release-notes.js";

const packageVersion = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
).version;

const versionedReleases = USER_RELEASE_NOTES.filter(
  ({ version }) => /^v\d+\.\d+\.\d+$/u.test(version),
);
const [currentRelease] = versionedReleases;
const [featuredRelease, ...previousReleases] = USER_RELEASE_NOTES;

describe("版本记录", () => {
  test("仓库更新日志逐版覆盖应用内完整记录", () => {
    const changelog = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
    const changelogVersions = [...changelog.matchAll(/^## (v\d+\.\d+\.\d+)$/gm)].map(
      ([, version]) => version,
    );
    const applicationVersions = versionedReleases.map(({ version }) => version);

    expect(changelogVersions).toEqual(applicationVersions);
  });

  test("首条记录必须对应 package.json 的当前版本", () => {
    expect(currentRelease.version).toBe(`v${packageVersion}`);
    expect(CURRENT_USER_RELEASE).toBe(currentRelease);
    expect(currentRelease.date).toMatch(/^\d{4}\.\d{2}\.\d{2}$/u);
    expect(currentRelease.title.trim().length).toBeGreaterThan(0);
  });

  test("正式版本号唯一且按发布顺序从新到旧排列", () => {
    const versions = versionedReleases.map(({ version }) => version);

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((version) => /^v\d+\.\d+\.\d+$/u.test(version))).toBe(true);
  });

  test("S4 前瞻作为当前桌面版本置顶", () => {
    expect(featuredRelease).toBe(S4_PREVIEW_USER_RELEASE);
    expect(featuredRelease).toMatchObject({
      date: "2026.09.02",
      status: "preview",
      title: "月涌狂想前瞻",
    });
    expect(featuredRelease.version).toBe(`v${packageVersion}`);
    expect(featuredRelease.highlights.join("\n")).toContain("23个形态");
    expect(featuredRelease.highlights.join("\n")).not.toContain("9月10日");
  });

  test("首屏摘要保持精简且每条都能完整显示", () => {
    expect(featuredRelease.summaryHighlights.length).toBeGreaterThan(0);
    expect(featuredRelease.summaryHighlights.length).toBeLessThanOrEqual(3);
    expect(featuredRelease.summaryHighlights.every((item) => item.length <= 58))
      .toBe(true);
    expect(featuredRelease.highlights.length).toBeGreaterThan(0);
  });

  test("首屏摘要与完整记录不复述历史版本的条目", () => {
    const historicalEntries = new Set(
      previousReleases.flatMap((release) => [
        ...(release.summaryHighlights ?? []),
        ...release.highlights,
      ]),
    );
    const currentEntries = [
      ...featuredRelease.summaryHighlights,
      ...featuredRelease.highlights,
    ];

    expect(currentEntries.filter((item) => historicalEntries.has(item)))
      .toEqual([]);
    expect(previousReleases.map(({ title }) => title))
      .not.toContain(featuredRelease.title);
  });
});
