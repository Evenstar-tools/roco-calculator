import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const styles = readFileSync(
  path.join(process.cwd(), "src", "styles.css"),
  "utf8",
);

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("undo count badge stays inside the draggable button safe area", () => {
  const badge = ruleBody(".floating-undo > span");

  expect(badge).toMatch(/(?:^|;)\s*top:\s*[0-9.]+px\s*;/);
  expect(badge).toMatch(/(?:^|;)\s*right:\s*[0-9.]+px\s*;/);
  expect(badge).toMatch(/color:\s*var\(--accent/);
  expect(badge).toMatch(/background:\s*transparent/);
  expect(badge).toMatch(/border:\s*0/);
});
