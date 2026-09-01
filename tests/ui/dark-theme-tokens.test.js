import { describe, expect, it } from "vitest";
import { readWebStyles } from "./helpers/web-styles.js";

const css = readWebStyles();

describe("深色主题变量", () => {
  it("在最终浅色变量之后重新声明完整的深色语义色", () => {
    const refreshRoot = css.lastIndexOf("/* Calculator-first UI refresh */");
    const darkRoot = css.lastIndexOf('html[data-theme="dark"] {');

    expect(darkRoot).toBeGreaterThan(refreshRoot);

    const block = css.slice(darkRoot, css.indexOf("}", darkRoot) + 1);
    expect(block).toContain("--attack-soft:");
    expect(block).toContain("--defense-soft:");
    expect(block).toContain("--accent-soft:");
    expect(block).toContain("--surface-subtle:");
    expect(block).toContain("--selection-bg:");
    expect(block).toContain("--selection-hover:");
    expect(block).toContain("--shadow:");
  });

  it("结果选中态和深色状态标签只使用深色语义色", () => {
    expect(css).toContain(
      'html[data-theme="dark"] .skill-result-row.is-selected',
    );
    expect(css).toContain(
      'html[data-theme="dark"] .result-rail__status-row[data-status="burn"] strong',
    );
    expect(css).toContain(
      'html[data-theme="dark"] .result-rail__status-row[data-status="poison"] strong',
    );
    expect(css).toContain(
      'html[data-theme="dark"] .result-rail__status-row[data-status="freeze"] strong',
    );
  });

  it("深色主题中的亮色交互面和火系标签使用深色文字", () => {
    expect(css).toContain(
      'html[data-theme="dark"] .mode-tabs button[aria-selected="true"]',
    );
    expect(css).toContain('html[data-theme="dark"] .type-tag--火');
    expect(css).toContain(
      'html[data-theme="dark"] .data-source-release__heading b',
    );
  });

  it("精灵与技能下拉浮层和队伍确认按钮使用深色交互面", () => {
    const darkSurfaceGroupStart = css.indexOf(
      'html[data-theme="dark"] .app-header,',
    );
    const darkSurfaceGroupEnd = css.indexOf("}", darkSurfaceGroupStart);
    const darkSurfaceGroup = css.slice(
      darkSurfaceGroupStart,
      darkSurfaceGroupEnd + 1,
    );

    expect(darkSurfaceGroup).toContain(
      'html[data-theme="dark"] .spirit-picker__options',
    );
    expect(darkSurfaceGroup).toContain(
      'html[data-theme="dark"] .skill-picker__options',
    );
    expect(darkSurfaceGroup).toContain(
      'html[data-theme="dark"] .team-drawer__confirm button',
    );
    expect(darkSurfaceGroup).toContain("color: var(--text);");
    expect(darkSurfaceGroup).toContain("background: var(--surface);");
  });
});
