import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { validateS4PreviewPortraitBuffer } from "../../scripts/bwiki/import-s4-preview-portraits.mjs";
import { readImageDimensions } from "../../scripts/bwiki/sync-assets.mjs";
import { S4_PREVIEW_PET_IMAGE_OVERRIDES } from "../../miniapp/src/data/s4-preview-pet-image-overrides.js";

const candidate = JSON.parse(
  readFileSync("data/candidates/s4-preview-new-spirits.json", "utf8"),
);
const snapshot = JSON.parse(
  readFileSync("data/snapshots/current.json", "utf8"),
);
const manifest = JSON.parse(
  readFileSync("public/assets/spirits/manifest.json", "utf8"),
);
const formNames = candidate.families.flatMap((family) =>
  family.forms.map(({ name }) => name)
);
const EXPECTED_FORM_COUNT = 23;

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngHeader({ colorType = 6, height = 64, width = 128 } = {}) {
  const buffer = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  return buffer;
}

describe("S4 前瞻本地原色头像", () => {
  test("23 个形态都有一致的 Web、小程序与清单绑定", () => {
    expect(formNames).toHaveLength(EXPECTED_FORM_COUNT);
    expect(new Set(formNames).size).toBe(EXPECTED_FORM_COUNT);
    const spirits = snapshot.spirits.filter(({ fullName }) =>
      formNames.includes(fullName)
    );
    expect(spirits).toHaveLength(EXPECTED_FORM_COUNT);
    const expectedIds = spirits.map(({ id }) => id).sort();
    const previewAssets = manifest.assets.filter(
      ({ sourceKind }) => sourceKind === "s4-preview-local",
    );
    expect(previewAssets.map(({ id }) => id).sort()).toEqual(expectedIds);
    expect(Object.keys(S4_PREVIEW_PET_IMAGE_OVERRIDES).sort()).toEqual(
      expectedIds,
    );

    for (const spirit of spirits) {
      const asset = manifest.assets.find(({ id }) => id === spirit.id);
      expect(asset).toMatchObject({
        name: spirit.fullName,
        sourceKind: "s4-preview-local",
      });
      expect(asset.sourceUrl).toBeUndefined();
      const publicPath = path.resolve(
        "public",
        asset.localFile.replace(/^[/\\]+/u, ""),
      );
      const miniPath = path.resolve(
        "miniapp/src/assets/spirits",
        `${spirit.id}.png`,
      );
      expect(existsSync(publicPath)).toBe(true);
      expect(existsSync(miniPath)).toBe(true);
      const publicImage = readFileSync(publicPath);
      const miniImage = readFileSync(miniPath);
      expect(digest(publicImage)).toBe(asset.sha256);
      expect(digest(miniImage)).toBe(asset.sha256);
      expect(digest(publicImage)).toBe(digest(miniImage));
      expect(publicImage[25]).toBe(6);
      expect(miniImage[25]).toBe(6);
      expect(readImageDimensions(publicImage)).toEqual({
        width: asset.width,
        height: asset.height,
      });
      expect(readImageDimensions(miniImage)).toEqual({
        width: asset.width,
        height: asset.height,
      });
      expect(Math.max(asset.width, asset.height)).toBe(128);
      expect(asset.bytes).toBe(publicImage.length);
      expect(asset.bytes).toBeLessThanOrEqual(200 * 1024);
      expect(S4_PREVIEW_PET_IMAGE_OVERRIDES[spirit.id]).toBeTruthy();
    }
  });

  test("导入器拒绝非 RGBA 或长边不是恰好 128px 的图片", () => {
    expect(() =>
      validateS4PreviewPortraitBuffer(pngHeader(), "valid.png"),
    ).not.toThrow();
    expect(() =>
      validateS4PreviewPortraitBuffer(
        pngHeader({ height: 127, width: 127 }),
        "short.png",
      ),
    ).toThrow("长边必须恰好为 128px");
    expect(() =>
      validateS4PreviewPortraitBuffer(
        pngHeader({ colorType: 2 }),
        "rgb.png",
      ),
    ).toThrow("必须是 RGBA PNG");
  });
});
