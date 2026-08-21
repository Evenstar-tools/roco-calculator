import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const styles = readFileSync(
  path.join(process.cwd(), "src", "styles.css"),
  "utf8",
);

describe("结果栏深色主题", () => {
  test("技能结果列表和选中行使用主题色而不是固定浅色背景", () => {
    expect(styles).toContain(
      'html[data-theme="dark"] .skill-result-list',
    );
    expect(styles).toContain(
      'html[data-theme="dark"] .skill-result-row.is-selected',
    );
  });
});
