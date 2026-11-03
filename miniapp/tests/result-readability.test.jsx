import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SingleSkillResultRow from "../src/components/SingleSkillResultRow.jsx";
import SkillResultRows from "../src/components/SkillResultRows.jsx";

const styles = (name) => readFileSync(path.resolve("src/pages/index/styles", `${name}.css`), "utf8");
const skill = { id: "skill-curse", name: "冥暗诅咒", category: "status", type: "幽", cost: 2 };
const nonDamageRow = { skillName: "冥暗诅咒", status: "unresolved", message: "非伤害技能不计算伤害" };

describe("结果可读性", () => {
  test("辅助技能卡片显示“不计伤害”而不是缺数据的占位", () => {
    render(<SingleSkillResultRow choices={[skill]} fallbackSkill={skill} label="攻击方技能 2" onChange={vi.fn()} onOpenResult={vi.fn()} row={nonDamageRow} value="skill-curse" />);
    expect(screen.getByRole("button", { name: "查看冥暗诅咒伤害 — 不计伤害" })).toBeInTheDocument();
    expect(screen.queryByText("--% HP")).toBeNull();
    expect(screen.getByText("不计伤害")).toHaveClass("skill-result-row__percent--muted");
  });

  test("说明文字的结果行不再与进度条重叠", () => {
    const { container } = render(<SkillResultRows onSelect={vi.fn()} selectedIndex={0} rows={[
      { skillName: "圣龙狂斩", status: "exact", hpPercent: 50, totalDamage: 300 },
      nonDamageRow,
    ]} />);
    const rows = container.querySelectorAll(".result-row");
    expect(rows[0]).not.toHaveClass("result-row--message");
    expect(rows[1]).toHaveClass("result-row--message");
    expect(styles("overlays")).toMatch(/\.result-row--message \.result-row__track \{\s*display: none;/);
  });

  test("公式胶囊跟随主题底色，深色下结果胶囊另配色", () => {
    expect(styles("overlays")).toMatch(/\.result-formula__chip \{[^}]*background: var\(--surface-card\);/);
    expect(styles("season")).toMatch(/@media \(prefers-color-scheme: dark\) \{[\s\S]*\.result-formula__chip--result \{[^}]*color: #c3cdff;/);
  });
});
