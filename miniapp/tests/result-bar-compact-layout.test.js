import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const styles = (name) => readFileSync(path.resolve("src/pages/index/styles", `${name}.css`), "utf8");
const rule = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};

describe("手机结果栏与小字", () => {
  it("操作保持在右上角，不单独占一行", () => {
    const css = styles("responsive");
    expect(css).toContain('"matchup action"');
    const actions = rule(css, ".result-bar .dc-result-actions");
    expect(actions).toContain("grid-area: action");
    expect(actions).toContain("grid-column: auto");
    expect(rule(css, ".result-bar .dc-result-actions .result-bar__action")).toContain("flex: 0 0 auto");
  });

  it("手机计算区不再使用 10px 以下的文字", () => {
    expect(styles("compact-demo")).not.toMatch(/font-size: (?:8|9)px/);
    expect(rule(styles("responsive"), ".skill-slots--matrix .skill-picker__meta")).toContain("font-size: 10px");
  });
});

describe("窄屏名字与小按钮", () => {
  it("窄屏把 NEW 与改动标记移出名字行", () => {
    const css = styles("responsive");
    const narrow = css.slice(css.indexOf("@media (max-width: 359px) {"));
    expect(narrow).toMatch(/\.combatant-card__name-row > \.entity-new-badge,\s*\.combatant-card__name-row > \.entity-change-hint \{\s*position: absolute;/);
    expect(styles("entity-change-hints")).toMatch(/\.entity-new-badge \{[^}]*font-size: 10px;/);
  });

  it("排行“重置”保持 44px 点击区域", () => {
    expect(styles("rankings")).toMatch(/\.ranking-summary \.ranking-action \{ min-width: 44px; min-height: 44px;/);
  });
});
