import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const miniappRoot = process.cwd();
const bundledRuntimePath = path.join(
  miniappRoot,
  "src/data/bundled-runtime.json",
);
const publicRuntimePath = path.join(
  miniappRoot,
  "../public/data/runtime.json",
);

describe("bundled miniapp runtime", () => {
  test("keeps every public spirit and gives each one a remote portrait", () => {
    expect(existsSync(bundledRuntimePath)).toBe(true);
    if (!existsSync(bundledRuntimePath)) return;

    const bundled = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));
    const publicRuntime = JSON.parse(readFileSync(publicRuntimePath, "utf8"));

    expect(bundled.spirits).toHaveLength(publicRuntime.spirits.length);
    expect(bundled.spirits.every((spirit) =>
      /^https:\/\//u.test(spirit.imageUrl)
    )).toBe(true);
    expect(
      bundled.spirits.find(
        (spirit) => spirit.id === "spirit_db5a2cb398dc0385",
      )?.imageUrl,
    ).toBe(
      "https://patchwiki.biligame.com/images/rocom/3/3c/jksy80nru0voaobly2uguh0rtydx2wa.png",
    );
  });

  test("bundles all searchable Wish Power variants used by the calculator", () => {
    const bundled = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));
    const wishPowerSkills = bundled.skills.filter(
      (skill) => skill.name === "愿力冲击",
    );

    expect(wishPowerSkills).toHaveLength(18);
    expect(wishPowerSkills.every(
      (skill) => skill.pickerVisibility === "search-only",
    )).toBe(true);
    expect(new Set(wishPowerSkills.map((skill) => skill.type)).size).toBe(18);
  });

  test("keeps only pinyin search aliases in the bundled skill payload", () => {
    const bundled = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));

    expect(bundled.skills.every((skill) => {
      const aliases = String(skill.searchText ?? "").split("|");
      return aliases.length <= 2 && aliases.every((alias) => /^[a-zü]+$/u.test(alias));
    })).toBe(true);
  });
});
