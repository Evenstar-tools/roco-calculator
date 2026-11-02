import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { stampImageCache } from "../../scripts/stamp-image-cache.mjs";

const IMAGE = "spirit_0123456789abcdef.png";
const roots = [];

function client({ image = "a", worker = 'const IMAGE_CACHE = "rock-calculator-images-__IMAGE_DIGEST__";' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "stamp-image-cache-"));
  roots.push(root);
  mkdirSync(path.join(root, "assets/spirits"), { recursive: true });
  if (image !== null) writeFileSync(path.join(root, "assets/spirits", IMAGE), image);
  writeFileSync(path.join(root, "sw.js"), worker);
  return root;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("stampImageCache", () => {
  test("writes the digest into the service worker", () => {
    const root = client();
    const { count, digest } = stampImageCache(root);
    expect(count).toBe(1);
    expect(readFileSync(path.join(root, "sw.js"), "utf8")).toBe(`const IMAGE_CACHE = "rock-calculator-images-${digest}";`);
  });

  test("changes only when image content changes", () => {
    const first = stampImageCache(client({ image: "a" })).digest;
    expect(stampImageCache(client({ image: "a" })).digest).toBe(first);
    expect(stampImageCache(client({ image: "b" })).digest).not.toBe(first);
  });

  test.each([
    "assets/skills/skill_preview_s5_dream-building.png",
    "global-assets/assets/skills/skill_preview_s5_dream-building.png",
    "assets/skills/wish-power/7700003.png",
    "global-assets/assets/skills/wish-power/7700018.png",
  ])("tracks %s content when choosing the image cache generation", (relative) => {
    const withSkill = (content) => {
      const root = client();
      const image = path.join(root, relative);
      mkdirSync(path.dirname(image), { recursive: true });
      writeFileSync(image, content);
      return root;
    };
    const first = stampImageCache(withSkill("first"));
    expect(first.count).toBe(2);
    expect(stampImageCache(withSkill("first")).digest).toBe(first.digest);
    expect(stampImageCache(withSkill("updated")).digest).not.toBe(first.digest);
  });

  test("does not include arbitrary skill images or unassigned wish-power numbers", () => {
    const root = client();
    for (const relative of [
      "assets/skills/example.png",
      "assets/skills/skill_preview_s4_example.png",
      "assets/skills/wish-power/7700006.png",
    ]) {
      const image = path.join(root, relative);
      mkdirSync(path.dirname(image), { recursive: true });
      writeFileSync(image, "unrelated");
    }
    expect(stampImageCache(root).count).toBe(1);
  });

  test("refuses to build without images or a placeholder", () => {
    expect(() => stampImageCache(client({ image: null }))).toThrow("no stable images");
    expect(() => stampImageCache(client({ worker: "const unrelated = 1;" }))).toThrow("no image cache placeholder");
  });
});
