import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import {
  applyNamedPortraitAssets,
  avatarFileTitle,
  fetchNamedPortraitAssets,
} from "../../scripts/bwiki/portrait-bindings.mjs";

const snapshot = JSON.parse(readFileSync("public/data/current.json", "utf8"));
const manifest = JSON.parse(
  readFileSync("public/assets/spirits/manifest.json", "utf8"),
);

describe("BWIKI 精灵头像身份绑定", () => {
  test("用完整形态名解析头像，不依赖接口返回顺序", async () => {
    const spirits = [
      {
        id: "spirit_blue",
        fullName: "海枝枝（碧蓝珊瑚）",
        asset: { sourceUrl: "https://example.test/filter-blue.png" },
      },
      {
        id: "spirit_yellow",
        fullName: "海枝枝（杏黄百合）",
        asset: { sourceUrl: "https://example.test/filter-yellow.png" },
      },
    ];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        query: {
          pages: [
            {
              title: avatarFileTitle("海枝枝（杏黄百合）"),
              imageinfo: [
                {
                  url: "https://example.test/avatar-yellow.png",
                  width: 109,
                  height: 109,
                  sha1: "yellow",
                },
              ],
            },
            {
              title: avatarFileTitle("海枝枝（碧蓝珊瑚）"),
              imageinfo: [
                {
                  url: "https://example.test/avatar-blue.png",
                  width: 109,
                  height: 109,
                  sha1: "blue",
                },
              ],
            },
          ],
        },
      }),
    }));

    const resolved = await fetchNamedPortraitAssets(spirits, { fetchImpl });
    const result = applyNamedPortraitAssets(spirits, resolved);

    expect(result.resolved).toBe(2);
    expect(result.fallback).toBe(0);
    expect(result.spirits).toMatchObject([
      {
        fullName: "海枝枝（碧蓝珊瑚）",
        asset: {
          sourceUrl: "https://example.test/avatar-blue.png",
          sourceTitle: avatarFileTitle("海枝枝（碧蓝珊瑚）"),
        },
      },
      {
        fullName: "海枝枝（杏黄百合）",
        asset: {
          sourceUrl: "https://example.test/avatar-yellow.png",
          sourceTitle: avatarFileTitle("海枝枝（杏黄百合）"),
        },
      },
    ]);
  });

  test("没有精确命名头像时保留同一筛选行的头像", () => {
    const spirit = {
      id: "spirit_fallback",
      fullName: "没有独立头像的精灵",
      asset: { sourceUrl: "https://example.test/filter-row.png" },
    };

    const result = applyNamedPortraitAssets([spirit], new Map());

    expect(result).toMatchObject({ resolved: 0, fallback: 1 });
    expect(result.spirits[0]).toEqual(spirit);
  });

  test.each([
    [
      "海枝枝（碧蓝珊瑚）",
      "https://patchwiki.biligame.com/images/rocom/b/bc/6q8ni2pwfbr37ip0gzw3cpdaf2t91be.png",
    ],
    [
      "海枝枝（杏黄百合）",
      "https://patchwiki.biligame.com/images/rocom/6/69/0wosddte1bpfw4523ibg3nq1896n0lx.png",
    ],
    [
      "海枝枝（洋红沙丁）",
      "https://patchwiki.biligame.com/images/rocom/7/7c/mopanlk0uluof46et5xm4b9yxcyoqtq.png",
    ],
    [
      "海枝枝（翠绿纶布）",
      "https://patchwiki.biligame.com/images/rocom/0/00/4g0f2sxnvfzds3tgjr0pxxwm2vvyvl0.png",
    ],
  ])("%s 使用按完整形态名绑定的头像", (name, sourceUrl) => {
    const entry = manifest.assets.find((asset) => asset.name === name);
    expect(entry).toMatchObject({
      name,
      sourceUrl,
      sourceTitle: avatarFileTitle(name),
    });
  });

  test("594 条头像、名称与种族值使用同一个精灵 ID 关联", () => {
    const spiritById = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
    expect(manifest.assets).toHaveLength(snapshot.spirits.length);

    for (const asset of manifest.assets) {
      const spirit = spiritById.get(asset.id);
      expect(spirit?.fullName).toBe(asset.name);
      expect(spirit?.raceStats.total).toBe(
        spirit.raceStats.hp +
          spirit.raceStats.speed +
          spirit.raceStats.physicalAttack +
          spirit.raceStats.magicalAttack +
          spirit.raceStats.physicalDefense +
          spirit.raceStats.magicalDefense,
      );
    }
  });
});
