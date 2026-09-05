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
      date: "2026.09.05",
      status: "preview",
    });
    expect(featuredRelease.version).toBe(`v${packageVersion}`);
    expect(featuredRelease.title.trim().length).toBeGreaterThan(0);
    expect(featuredRelease.title).toContain("S4");
    expect(featuredRelease.highlights.join("\n")).not.toContain("9月10日");
  });

  test("新功能弹窗只展示用户可直接使用的功能", () => {
    expect(featuredRelease.whatsNew.items.map(({ title }) => title)).toEqual([
      "S4新精灵前瞻",
      "综合耐久显示",
      "精灵能力分析功能",
    ]);
    expect(featuredRelease.whatsNew.items.every(({ description }) =>
      description?.trim().length > 0
    )).toBe(true);
    expect(featuredRelease.whatsNew.items.map(({ title }) => title).join("\n"))
      .not.toMatch(/修复|校正|临时图标/u);
  });

  test("补丁只进入版本记录，不冒充新的功能介绍", () => {
    expect(featuredRelease.summaryHighlights).toEqual(expect.arrayContaining([
      expect.stringContaining("找不到对应首领"),
      expect.stringContaining("正式包体积"),
    ]));
    expect(featuredRelease.sections.find(({ kind }) => kind === "fix")?.items)
      .toEqual(expect.arrayContaining([
        expect.stringContaining("进化链现在可以双向查找"),
        expect.stringContaining("不删减内容"),
      ]));
    expect(featuredRelease.whatsNew.items.map(({ title }) => title).join("\n"))
      .not.toMatch(/进化链|包体积/u);
  });

  test("全部版本按新增功能、修复与优化分类", () => {
    const allowedKinds = new Set(["feature", "fix"]);

    for (const release of versionedReleases) {
      expect(release.sections?.length).toBeGreaterThan(0);
      expect(release.sections.every(({ kind }) => allowedKinds.has(kind))).toBe(true);
      expect(release.sections.map(({ label }) => label)).toEqual(
        release.sections.map(({ kind }) =>
          kind === "feature" ? "新增功能" : "修复与优化",
        ),
      );
      expect(release.highlights).toEqual(
        release.sections.flatMap(({ items }) => items),
      );
    }
    expect(featuredRelease.sections.map(({ label }) => label)).toEqual([
      "新增功能",
      "修复与优化",
    ]);
    const allFeatureItems = versionedReleases.flatMap((release) =>
      release.sections.find(({ kind }) => kind === "feature")?.items ?? []
    );
    expect(allFeatureItems).toEqual(expect.arrayContaining([
      expect.stringContaining("标准耐久榜"),
      expect.stringContaining("速度线"),
    ]));
  });

  test("首屏摘要保持精简且每条都能完整显示", () => {
    const summary = featuredRelease.summaryHighlights ??
      featuredRelease.highlights.slice(0, 3);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(3);
    expect(summary.every((item) => item.length <= 58))
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
      ...(featuredRelease.summaryHighlights ?? []),
      ...featuredRelease.highlights,
    ];

    expect(currentEntries.filter((item) => historicalEntries.has(item)))
      .toEqual([]);
    expect(previousReleases.map(({ title }) => title))
      .not.toContain(featuredRelease.title);
  });
});
