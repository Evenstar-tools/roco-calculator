import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import {
  applyNamedPortraitAssets,
  avatarFileTitle,
  fetchNamedPortraitAssets,
} from "../../scripts/bwiki/portrait-bindings.mjs";

const snapshot = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
const manifest = JSON.parse(
  readFileSync("public/assets/spirits/manifest.json", "utf8"),
);

describe("BWIKI 精灵头像身份绑定", () => {
  test("Web-only validates real Web files without miniapp dependencies and still rejects mismatches", async () => {
    const { verifySpiritBindings } = await import("../../scripts/bwiki/verify-spirit-bindings.mjs");
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const temporaryRoot = path.resolve(os.tmpdir());
    const root = mkdtempSync(path.join(temporaryRoot, "rock-web-bindings-"));
    try {
      for (const relative of ["data/snapshots/current.json", "data/candidates/s4-preview-new-spirits.json", "public/assets/spirits", "public/data/runtime.json"]) {
        const target = path.join(root, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(path.join(projectRoot, relative), target, { recursive: true });
      }
      expect(existsSync(path.join(root, "miniapp"))).toBe(false);
      await expect(verifySpiritBindings({ root, includeMiniapp: false })).resolves.toMatchObject({
        spirits: snapshot.spirits.length,
        localFiles: manifest.assets.length,
      });

      const runtimePath = path.join(root, "public/data/runtime.json");
      const runtimeSource = readFileSync(runtimePath, "utf8");
      const changedRuntime = JSON.parse(runtimeSource);
      changedRuntime.spirits[0].fullName = "fixture-runtime-name-mismatch";
      writeFileSync(runtimePath, JSON.stringify(changedRuntime), "utf8");
      await expect(verifySpiritBindings({ root, includeMiniapp: false })).rejects.toThrow("网页运行时名称或种族值错配");
      writeFileSync(runtimePath, runtimeSource, "utf8");

      const imagePath = path.join(root, "public", manifest.assets[0].localFile.replace(/^[/\\]+/u, ""));
      const image = readFileSync(imagePath);
      writeFileSync(imagePath, Buffer.concat([image, Buffer.from([0])]));
      await expect(verifySpiritBindings({ root, includeMiniapp: false })).rejects.toThrow("本地头像哈希与清单不一致");
      writeFileSync(imagePath, image);

      await expect(verifySpiritBindings({ root })).rejects.toMatchObject({
        code: "ENOENT",
        path: expect.stringContaining("miniapp"),
      });
    } finally {
      expect(path.dirname(root)).toBe(temporaryRoot);
      expect(path.basename(root)).toMatch(/^rock-web-bindings-/u);
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  test("圣代甜甜九种口味按正式图鉴文件绑定，不混淆水果饰品与冰淇淋口味", () => {
    const evidence = JSON.parse(readFileSync("data/reviewed/nrc-2026-09-10.json", "utf8"));
    const bundled = JSON.parse(readFileSync("miniapp/src/data/bundled-runtime.json", "utf8"));
    const forms = evidence.spirits.filter(({ title }) => title.startsWith("圣代甜甜（"));
    expect(forms).toHaveLength(9);
    for (const form of forms) {
      const spirit = snapshot.spirits.find(({ fullName }) => fullName === form.title);
      const asset = manifest.assets.find(({ id }) => id === spirit.id);
      expect(asset, form.title).toMatchObject({
        name: form.title,
        sourceKind: "nrc-catalog",
        nrcFile: form.image.head,
      });
      expect(spirit.provenance.asset.file, form.title).toBe(form.image.head);
      expect(spirit.asset.sourceUrl, form.title).toBe(asset.sourceUrl);
      expect(bundled.spirits.find(({ id }) => id === spirit.id).imageUrl, form.title)
        .toBe(`https://rococalc.top${asset.localFile}`);
      const image = readFileSync(`public${asset.localFile}`);
      expect(createHash("sha256").update(image).digest("hex"), form.title).toBe(asset.sha256);
    }
  });

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
  ])("%s 使用按完整形态名绑定的头像", (name, sourceUrl) => {
    const entry = manifest.assets.find((asset) => asset.name === name);
    expect(entry).toMatchObject({
      name,
      sourceUrl,
    });
  });

  test("每条头像、名称与种族值使用同一个精灵 ID 关联", () => {
    const spiritById = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
    expect(manifest.assets).toHaveLength(snapshot.spirits.length);

    for (const asset of manifest.assets) {
      const spirit = spiritById.get(asset.id);
      expect(spirit?.fullName).toBe(asset.name);
      if (spirit?.calculationStatus === "pending-race-stats") {
        expect(spirit.raceStats).toBeNull();
        continue;
      }
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
