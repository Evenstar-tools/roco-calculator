import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { CompactSingleSkillEditor } from "../../src/components/CompactSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { SingleSkillEditor } from "../../src/components/SingleSkillEditor.jsx";
import { ResultRail } from "../../src/components/ResultRail.jsx";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { selectSpirit } from "../../src/state/calculator-session.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const pending = snapshot.skills.filter(skill => skill.id.startsWith("skill_preview_s5_") && skill.calculationStatus === "pending-skill-data");

beforeEach(() => { localStorage.clear(); localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1"); });

test.each(pending.map(skill => [skill.name, skill]))("真实目录%s未知参数在单/四技能和列表均保留空值，结果不误算零", (_name, skill) => {
  const state = createInitialState(snapshot);
  state.sides.attacker.skills.single = skill.id;
  const result = calculateMatchup(snapshot, state).forward.selectedResult;
  expect(skill).toMatchObject({ type: null, cost: null, basePower: null });
  expect(result).toMatchObject({ status: "unsupported", totalDamage: null });
  expect(result.skillCost).toBeUndefined();
  const { container } = render(<>
    <section aria-label="具体单技能"><SingleSkillEditor selectedSkill={skill} skills={[skill]} result={result} hitCount={1} /></section>
    <section aria-label="具体四技能"><FourSkillEditor attackerName="攻方" defenderName="守方" attackerSkills={[skill]}
      defenderSkills={[]} skills={[skill]} attackerResults={[result]} /></section>
    <section aria-label="精简单技能"><CompactSingleSkillEditor selectedSkill={skill} skills={[skill]} result={result} /></section>
    <ResultRail result={{ selectedResult: result, selectedSkillName: skill.name, attackerName: "攻方", defenderName: "守方", mode: "single" }} />
  </>);
  const single = screen.getByRole("region", { name: "具体单技能" });
  const four = screen.getByRole("region", { name: "具体四技能" });
  const compact = screen.getByRole("region", { name: "精简单技能" });
  expect(within(single).getByRole("spinbutton", { name: "静态威力", exact: true })).toHaveValue(null);
  expect(within(four).getByRole("spinbutton", { name: "攻击方技能1静态威力", exact: true })).toHaveValue(null);
  expect(single.querySelector(".type-chip")).toHaveTextContent(/^—$/u);
  expect(single.querySelector(".skill-facts")).toHaveTextContent("能耗 —");
  expect(four.querySelector(".skill-slot__cost")).toHaveTextContent(/^—$/u);
  expect(four.querySelector(".skill-slot__kind")).toHaveTextContent(skill.category === "physical" ? "—·物" : skill.category === "magical" ? "—·魔" : "—·—");
  expect(compact.querySelector('[title="能耗 —"]')).toHaveTextContent(/^—$/u);
  if (skill.category === null) {
    expect(compact.querySelector('[title="技能类型"]')).toHaveTextContent(/^—$/u);
    expect(compact.querySelector('[title="技能类型"] svg')).toBeNull();
    expect(single.querySelector(".skill-fact")).toHaveTextContent(/^—$/u);
    expect(single.querySelector(".skill-fact").querySelector("svg")).toBeNull();
  }
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(/^—$/u);
  expect(container).not.toHaveTextContent(/null|undefined|NaN/u);
  fireEvent.focus(within(single).getByRole("combobox", { name: "选择技能" }));
  const option = screen.getByRole("option", { name: new RegExp(skill.name) });
  expect(option).toHaveTextContent("威力/能耗待确认");
  expect(option).not.toHaveTextContent(/耗\s*0|威\s*0|1\s*能量/u);
});

test("未解算结果中的显式null威力也不转成0，合法零威力仍显示0", () => {
  const skill = pending[0];
  const result = { status: "unsupported", totalDamage: null, staticPower: null, actualPower: null, resolvedPower: null };
  const { rerender } = render(<SingleSkillEditor selectedSkill={skill} skills={[skill]} result={result} hitCount={1} onSkillSelect={vi.fn()} />);
  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(null);
  rerender(<SingleSkillEditor selectedSkill={{ ...skill, basePower: 0 }} skills={[skill]} result={{ ...result, staticPower: 0 }} hitCount={1} />);
  expect(screen.getByRole("spinbutton", { name: "静态威力" })).toHaveValue(0);
});

test("真实阿瓦鲨两个变种保留variantName并共享一阶、二阶分支关系", () => {
  for (const [key, variantName] of [["awa-shark-lemon", "柠檬鲨的样子"], ["awa-shark-tiger", "虎纹鲨的样子"]]) {
    expect(snapshot.spirits.find(spirit => spirit.previewIdentity?.key === key)).toMatchObject({ variantName, stage: "二阶" });
  }
});

test.each([
  ["shadow-papercut", "灵扰", 3, "four"], ["watermelon-bug", "果粒", 2, "four"],
  ["shadow-papercut", "灵扰", 3, "single"], ["watermelon-bug", "果粒", 2, "single"],
])("真实App %s默认%s已知连击%d在%s显示，手填1与切换精简保留，伤害仍阻断", (key, name, count, mode) => {
  const initialState = createInitialState(snapshot);
  initialState.mode = mode;
  const state = selectSpirit(initialState, { initialState, snapshot, side: "attacker", spiritId: `spirit_preview_s5_${key}` }).state;
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "detailed" }} />);
  const hits = () => screen.getByLabelText(mode === "four" ? "攻击方技能1连击次数" : "连击次数", { exact: true });
  const power = () => screen.getByLabelText(mode === "four" ? "攻击方技能1静态威力" : "静态威力", { exact: true });
  expect(hits()).toHaveValue(count);
  expect(power()).toHaveValue(null);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(/^—$/u);
  fireEvent.change(hits(), { target: { value: "1" } });
  expect(hits()).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "精简版", exact: true }));
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(/^—$/u);
  fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  expect(hits()).toHaveValue(1);
  expect(power()).toHaveValue(null);
});

test("已有个人预设把灵扰手调为1连击时，默认3连击不覆盖它", () => {
  const initialState = createInitialState(snapshot);
  const spiritId = "spirit_preview_s5_shadow-papercut";
  const selected = selectSpirit(initialState, { initialState, snapshot, side: "attacker", spiritId }).state;
  const skillId = pending.find(skill => skill.name === "灵扰").id;
  const personalConfiguration = { ...selected.sides.attacker, skills: {
    single: { skillId, hitCount: 1 }, four: [{ skillId, hitCount: 1 }, null, null, null],
  } };
  const restored = selectSpirit(initialState, { initialState, snapshot, side: "attacker", spiritId, personalConfiguration }).state;
  expect(restored.directions.forward.hitCount).toBe(1);
  expect(restored.sides.attacker.skills.four[0].hitCount).toBe(1);
});
