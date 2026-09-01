import { describe, expect, test } from "vitest";
import { readWebStyles } from "./helpers/web-styles.js";

const styles = readWebStyles();

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
