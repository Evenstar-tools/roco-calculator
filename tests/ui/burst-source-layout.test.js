import { describe, expect, test } from "vitest";
import { readWebStyles } from "./helpers/web-styles.js";

const styles = readWebStyles();

function ruleBody(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("迸发来源弹层布局", () => {
  test("勾选前后触发按钮宽度固定，攻防弹层分别朝页面内部展开", () => {
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

  test("来源选择与技能特性开关使用固定控制行，避免勾选后换行漂移", () => {
    const controlRow = ruleBody(
      ".skill-slot__control-row.has-burst-sources",
    );
    expect(controlRow).toMatch(/(?:^|;)\s*width:\s*100%\s*;/);
    expect(controlRow).toMatch(/grid-template-columns:\s*126px\s+minmax\(0,\s*1fr\)/);

    const traitControl = ruleBody(".skill-slot__control--trait");
    expect(traitControl).toMatch(/(?:^|;)\s*margin-left:\s*auto\s*;/);
  });
});
