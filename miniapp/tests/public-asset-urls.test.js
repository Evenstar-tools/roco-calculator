import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { BUNDLED_PET_IMAGE_OVERRIDES } from "../src/data/bundled-pet-image-overrides.js";
import { publicSpiritImageUrl } from "../src/data/public-asset-urls.js";
import { PREVIEW_PET_IMAGES } from "../src/data/preview-pet-images.js";
import { S4_PREVIEW_PET_IMAGE_OVERRIDES } from "../src/data/s4-preview-pet-image-overrides.js";

const REMOTE_SPIRIT_URL = /^https:\/\/rococalc\.top\/assets\/spirits\/(spirit_[a-f0-9]+)\.png\?v=\d{8}$/u;
const REMOTE_PET_IMAGES = {
  ...BUNDLED_PET_IMAGE_OVERRIDES,
  ...PREVIEW_PET_IMAGES,
  ...S4_PREVIEW_PET_IMAGE_OVERRIDES,
};
const ROLLBACK_SPIRIT_IMAGES = {
  ...BUNDLED_PET_IMAGE_OVERRIDES,
  ...S4_PREVIEW_PET_IMAGE_OVERRIDES,
};

describe("mini-program public spirit assets", () => {
  test("loads package-heavy portraits from the configured HTTPS deployment", () => {
    const entries = Object.entries(REMOTE_PET_IMAGES);

    expect(entries).toHaveLength(31);
    for (const [spiritId, url] of entries) {
      expect(url).toBe(publicSpiritImageUrl(spiritId));
      expect(url).toMatch(REMOTE_SPIRIT_URL);
    }
  });

  test("keeps source portraits available for a one-file rollback", () => {
    for (const spiritId of Object.keys(ROLLBACK_SPIRIT_IMAGES)) {
      expect(
        existsSync(resolve(process.cwd(), `src/assets/spirits/${spiritId}.png`)),
      ).toBe(true);
    }
  });

  test("does not import the portrait files into the mini-program bundle", () => {
    for (const file of [
      "src/data/bundled-pet-image-overrides.js",
      "src/data/preview-pet-images.js",
      "src/data/s4-preview-pet-image-overrides.js",
    ]) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8"))
        .not.toMatch(/\.\.\/assets\/(?:preview|spirits)\//u);
    }
  });
});
