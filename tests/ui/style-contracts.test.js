import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { readWebStyles } from "./helpers/web-styles.js";

const css = readWebStyles();
const teamAnalysisPanel = readFileSync(
  path.join(process.cwd(), "src", "components", "TeamAnalysisPanel.jsx"),
  "utf8",
);

function ruleBody(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function readRule(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start) + 1);
}

describe("responsive layout contracts", () => {
  test("hides the team label with the other header labels at narrow widths", () => {
    expect(css).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]{0,700}\.view-mode-switch button span \{[\s\S]*?display: none;[\s\S]{0,500}\.team-action span \{[\s\S]*?display: none;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\) \{[\s\S]{0,900}\.team-action \{[\s\S]*?width: 38px;[\s\S]*?padding: 0;/,
    );
  });

  test("keeps the undo count badge inside the draggable button safe area", () => {
    const badge = ruleBody(".floating-undo > span");

    expect(badge).toMatch(/(?:^|;)\s*top:\s*[0-9.]+px\s*;/);
    expect(badge).toMatch(/(?:^|;)\s*right:\s*[0-9.]+px\s*;/);
    expect(badge).toMatch(/color:\s*var\(--accent/);
    expect(badge).toMatch(/background:\s*transparent/);
    expect(badge).toMatch(/border:\s*0/);
  });
});

describe("burst source layout contracts", () => {
  test("keeps trigger width stable and opens both menus toward the page", () => {
    expect(ruleBody(".burst-source-controls summary")).toMatch(
      /(?:^|;)\s*width:\s*126px\s*;/,
    );

    const attackerMenu = ruleBody(
      ".four-skill-side--attacker .burst-source-controls__menu",
    );
    expect(attackerMenu).toMatch(/(?:^|;)\s*left:\s*0\s*;/);
    expect(attackerMenu).toMatch(/(?:^|;)\s*right:\s*auto\s*;/);

    const defenderMenu = ruleBody(
      ".four-skill-side--defender .burst-source-controls__menu",
    );
    expect(defenderMenu).toMatch(/(?:^|;)\s*right:\s*0\s*;/);
    expect(defenderMenu).toMatch(/(?:^|;)\s*left:\s*auto\s*;/);
  });

  test("keeps source and trait controls on a fixed row", () => {
    const controlRow = ruleBody(
      ".skill-slot__control-row.has-burst-sources",
    );
    expect(controlRow).toMatch(/(?:^|;)\s*width:\s*100%\s*;/);
    expect(controlRow).toMatch(/grid-template-columns:\s*126px\s+minmax\(0,\s*1fr\)/);

    expect(ruleBody(".skill-slot__control--trait"))
      .toMatch(/(?:^|;)\s*margin-left:\s*auto\s*;/);
  });
});

describe("dark theme contracts", () => {
  test("redeclares semantic colors after the final light theme variables", () => {
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

  test("uses semantic colors for result rows and status labels", () => {
    expect(css).toContain('html[data-theme="dark"] .skill-result-list');
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

  test("uses dark text on light interactive surfaces", () => {
    expect(css).toContain(
      'html[data-theme="dark"] .mode-tabs button[aria-selected="true"]',
    );
    expect(css).toContain('html[data-theme="dark"] .type-tag--火');
    expect(css).toContain(
      'html[data-theme="dark"] .data-source-release__heading b',
    );
  });

  test("themes picker surfaces and the team confirmation action", () => {
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

describe("team analysis density contracts", () => {
  test("renders multipliers as compact solid text blocks", () => {
    const matrixCells = readRule(".team-analysis__matrix th,\n.team-analysis__matrix td");
    const multiplier = readRule(".team-analysis button.team-analysis__cell");

    expect(matrixCells).toContain("height: 30px");
    expect(matrixCells).toContain("padding: 1px");
    expect(multiplier).toContain("height: 24px");
    expect(multiplier).toContain("border-radius: 4px");
    expect(multiplier).toContain("font-size: 9px");
    expect(multiplier).toContain("font-weight: 800");
  });

  test("keeps state colors filled and matchups compact", () => {
    const layout = readRule(".team-analysis__matrix-layout");
    const matrix = readRule(".team-analysis__matrix");
    const matchup = readRule(".team-analysis__matchup-table");
    const scrollers = readRule(
      ".team-analysis__matrix-scroll,\n.team-analysis__matchup-scroll",
    );
    const safe = readRule(".team-analysis button.team-analysis__cell.is-safe");
    const danger = readRule(".team-analysis button.team-analysis__cell.is-danger");
    const matchupCells = readRule(
      ".team-analysis__matchup-table th,\n.team-analysis__matchup-table td",
    );

    expect(layout).toContain("width: 100%");
    expect(matrix).toContain("min-width: 0");
    expect(matchup).toContain("min-width: 0");
    expect(scrollers).toContain("overflow-x: hidden");
    expect(safe).toContain("#20a35b 22%");
    expect(danger).toContain("var(--attack) 18%");
    expect(matchupCells).toContain("height: 40px");
    expect(matchupCells).toContain("padding: 1px");
  });

  test("keeps the compact matchup direction label on one line", () => {
    const firstColumn = readRule(
      ".team-analysis__matchup-table thead th:first-child,\n.team-analysis__matchup-table tbody th",
    );
    const directionLabel = readRule(
      ".team-analysis__matchup-table thead th:first-child",
    );

    expect(firstColumn).toContain("width: clamp(80px, 15%, 108px)");
    expect(directionLabel).toContain("white-space: nowrap");
  });

  test("adapts multiplier summaries to the panel width", () => {
    const multiplier = readRule(".team-analysis button.team-analysis__cell");

    expect(multiplier).toContain("max-width: 32px");
    expect(multiplier).toContain("margin: 0 auto");
    expect(teamAnalysisPanel).toContain('className="team-analysis__cell-symbol"');
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (max-width: 560px)");
    expect(css).toContain(".team-analysis__cell-symbol {\n    display: none;");
    expect(css).toContain("grid-template-columns: 1fr");
  });

  test("keeps selected-cell details compact with a taller roster", () => {
    const editor = readRule(
      ".team-drawer.is-analysis .team-drawer__editor-pane",
    );
    const analysis = readRule(".team-analysis.is-analysis");

    expect(teamAnalysisPanel).toContain('className={`team-analysis is-${view}`}');
    expect(editor).toContain("display: flex");
    expect(editor).toContain("flex-direction: column");
    expect(analysis).toContain("flex: 1");
    expect(analysis).toContain("min-height: 0");
    expect(analysis).toContain("grid-template-rows: auto auto auto");
    expect(css).toContain("max-height: 70px");
    expect(css).toContain("align-self: start");
  });
});
