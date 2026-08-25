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

  test("v1.6.2 首屏优先展示后续重打包的累计更新", () => {
    const currentRelease = USER_RELEASE_NOTES[0];
    const visibleSummary = currentRelease.highlights.slice(0, 3).join("\n");
    const completeNotes = currentRelease.highlights.join("\n");

    expect(currentRelease).toMatchObject({
      date: "2026.08.25",
      title: "计算核心与桌面体验收口",
      version: "v1.6.2",
    });
    expect(visibleSummary).toMatch(/实际攻防面板.*听桥.*543/);
    expect(visibleSummary).toMatch(/虫群.*悼亡.*\+115/);
    expect(visibleSummary).toMatch(/纯 JSON CLI/);
    expect(completeNotes).toMatch(/队伍.*防守面分析/);
    expect(completeNotes).toMatch(/全局撤回/);
  });
});
