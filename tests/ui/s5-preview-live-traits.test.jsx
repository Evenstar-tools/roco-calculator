import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

beforeEach(() => { localStorage.clear(); localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1"); });
const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
function setup(key, mode = "four", skillName = "撕咬", negative = false) {
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.calculationOptions.includeNegativeStatusSettlement = negative;
  state.sides.attacker.spiritId = `spirit_preview_s5_${key}`;
  state.sides.defender.spiritId = snapshot.spirits.find(s => s.fullName === "迪莫").id;
  const bite = snapshot.skills.find(s => s.name === skillName);
  for (const side of Object.values(state.sides)) side.skills = { single: bite.id, four: [bite.id, null, null, null] };
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
}
const primary = () => Number(screen.getByTestId("primary-damage").textContent);

test.each(["single", "four"])("精简%s主界面特性控件直接影响实际结果并可关闭", mode => {
  setup("gold-vein-dragon", mode);
  const before = primary();
  expect(before).toBeGreaterThan(0);
  const toggle = screen.getByRole("checkbox", { name: "聚能后双攻增益当前生效" });
  fireEvent.click(toggle);
  expect(primary()).toBeGreaterThan(before);
  expect(screen.getAllByText("当前已生效双攻 +50%").length).toBeGreaterThan(0);
  fireEvent.change(screen.getByRole("spinbutton", { name: "当前已生效双攻增益" }), { target: { value: "70" } });
  expect(screen.getAllByText("当前已生效双攻 +70%").length).toBeGreaterThan(0);
  fireEvent.click(toggle);
  expect(primary()).toBe(before);
});

test("精简主界面超能阿布沿用家族特性，次数真的进入等级结果", () => {
  setup("super-abu");
  const count = screen.getByRole("spinbutton", { name: /已确认.*3能耗.*次数/ });
  expect(primary()).toBeGreaterThan(0);
  fireEvent.change(count, { target: { value: "1" } });
  expect(screen.getAllByText(/62/u).length).toBeGreaterThan(0);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent("—");
  expect(screen.getAllByText(/等级62.*尚未核验/u).length).toBeGreaterThan(0);
  fireEvent.change(count, { target: { value: "0" } });
  expect(primary()).toBeGreaterThan(0);
});


test("精简四技能本次确认与原生取消/重用共用状态，摘要和结算同时回填", () => {
  setup("watermelon-bug", "four", "捆缚", true);
  const type = screen.getByRole("combobox", { name: "本次已使用技能系别" });
  fireEvent.change(type, { target: { value: "bug" } });
  expect(type).toHaveValue("bug");
  expect(screen.getAllByText("本次虫系技能使用后：对手寄生 +1层").length).toBeGreaterThan(0);
  const applied = primary();
  expect(applied).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "攻击方技能1取消使用" }));
  expect(type).toHaveValue("none");
  expect(screen.getAllByText("未确认本次使用系别，无额外施加").length).toBeGreaterThan(0);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent("—");
  fireEvent.click(screen.getByRole("button", { name: "攻击方技能1使用状态" }));
  expect(type).toHaveValue("bug");
  expect(primary()).toBe(applied);
});
