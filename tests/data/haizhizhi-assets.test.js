import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const EXPECTED_ASSET_URLS = new Map([
  [
    "海枝枝（碧蓝珊瑚）",
    "https://patchwiki.biligame.com/images/rocom/5/51/5mf590oikzkcsjf8w921d0mh18a4woq.png",
  ],
  [
    "海枝枝（杏黄百合）",
    "https://patchwiki.biligame.com/images/rocom/4/4a/mgmynoz7yceewyozls8lpo95sgc9dvj.png",
  ],
  [
    "海枝枝（洋红沙丁）",
    "https://patchwiki.biligame.com/images/rocom/a/ae/hl04yjyfbnis2rflogd0z88vlvvoxg8.png",
  ],
  [
    "海枝枝（翠绿纶布）",
    "https://patchwiki.biligame.com/images/rocom/c/ce/gu6jzlvxig77gm42gayvu4sk9u6ieec.png",
  ],
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(relativePath), "utf8"));
}

function haizhizhiEntries(snapshot) {
  return snapshot.spirits.filter((spirit) =>
    EXPECTED_ASSET_URLS.has(spirit.fullName),
  );
}

describe("海枝枝形态素材映射", () => {
  test.each([
    "data/snapshots/current.json",
    "data/snapshots/seasons/s3-2026-07-15.json",
  ])("%s 中的形态名称与图片一一对应", (snapshotPath) => {
    const entries = haizhizhiEntries(readJson(snapshotPath));

    expect(entries).toHaveLength(EXPECTED_ASSET_URLS.size);
    expect(
      new Map(entries.map((spirit) => [spirit.fullName, spirit.asset.sourceUrl])),
    ).toEqual(EXPECTED_ASSET_URLS);
  });

  test("小程序内置数据使用相同的形态图片映射", () => {
    const entries = haizhizhiEntries(
      readJson("miniapp/src/data/bundled-runtime.json"),
    );

    expect(entries).toHaveLength(EXPECTED_ASSET_URLS.size);
    expect(
      new Map(entries.map((spirit) => [spirit.fullName, spirit.imageUrl])),
    ).toEqual(EXPECTED_ASSET_URLS);
  });

  test("本地素材内容与清单哈希一致", () => {
    const manifest = readJson("public/assets/spirits/manifest.json");
    const entries = manifest.assets.filter((asset) =>
      EXPECTED_ASSET_URLS.has(asset.name),
    );

    expect(entries).toHaveLength(EXPECTED_ASSET_URLS.size);
    for (const asset of entries) {
      expect(asset.sourceUrl).toBe(EXPECTED_ASSET_URLS.get(asset.name));
      const localPath = path.resolve(
        "public",
        asset.localFile.replace(/^\/+/, ""),
      );
      const actualSha256 = createHash("sha256")
        .update(readFileSync(localPath))
        .digest("hex");
      expect(actualSha256).toBe(asset.sha256);
    }
  });
});
