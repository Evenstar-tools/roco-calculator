import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function readSource(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("portrait workspace CSS", () => {
  test("keeps touch targets at least 44px wide on a 320px screen", () => {
    const tokens = readSource("src/styles/tokens.css");
    const match = tokens.match(/--touch-target:\s*([\d.]+)PX/);

    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(44);
  });

  test("retains the minimum width and both safe-area insets", () => {
    const pageCss = readSource("src/pages/index/index.css");

    expect(pageCss).toContain("min-width: 320px");
    expect(pageCss).toContain("env(safe-area-inset-top)");
    expect(pageCss).toContain("env(safe-area-inset-bottom)");
  });
});
