import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(
  path.join(process.cwd(), "src", "styles.css"),
  "utf8",
);
const component = readFileSync(
  path.join(process.cwd(), "src", "components", "TeamAnalysisPanel.jsx"),
  "utf8",
);

function readRule(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start) + 1);
}

test("renders analysis multipliers as compact solid text blocks", () => {
  const matrixCells = readRule(".team-analysis__matrix th,\n.team-analysis__matrix td");
  const multiplier = readRule(".team-analysis button.team-analysis__cell");

  expect(matrixCells).toContain("height: 30px");
  expect(matrixCells).toContain("padding: 1px");
  expect(multiplier).toContain("height: 24px");
  expect(multiplier).toContain("border-radius: 4px");
  expect(multiplier).toContain("font-size: 9px");
  expect(multiplier).toContain("font-weight: 800");
});

test("keeps state colors filled and applies the same compact rhythm to matchups", () => {
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

test("adapts multiplier text and summaries to the available panel width", () => {
  const multiplier = readRule(".team-analysis button.team-analysis__cell");

  expect(multiplier).toContain("max-width: 32px");
  expect(multiplier).toContain("margin: 0 auto");
  expect(component).toContain('className="team-analysis__cell-symbol"');
  expect(css).toContain("container-type: inline-size");
  expect(css).toContain("@container (max-width: 560px)");
  expect(css).toContain(".team-analysis__cell-symbol {\n    display: none;");
  expect(css).toContain("grid-template-columns: 1fr");
});

test("keeps the selected cell detail compact when the roster is taller", () => {
  const editor = readRule(
    ".team-drawer.is-analysis .team-drawer__editor-pane",
  );
  const analysis = readRule(".team-analysis.is-analysis");

  expect(component).toContain('className={`team-analysis is-${view}`}');
  expect(editor).toContain("display: flex");
  expect(editor).toContain("flex-direction: column");
  expect(analysis).toContain("flex: 1");
  expect(analysis).toContain("min-height: 0");
  expect(analysis).toContain("grid-template-rows: auto auto auto");
  expect(css).toContain("max-height: 70px");
  expect(css).toContain("align-self: start");
});
