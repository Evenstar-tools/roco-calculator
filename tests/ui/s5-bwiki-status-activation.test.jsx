import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

const read = path => JSON.parse(readFileSync(path, "utf8"));
const snapshot = applyS5Bwiki(withWebPreview(read("data/snapshots/current.json")), read("data/reviewed/nrc-s5-20261101.json"));
beforeEach(() => { localStorage.clear(); localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1"); });

function setup(name, mode) {
  const skill = snapshot.skills.find(skill => skill.name === name);
  const hit = snapshot.skills.find(skill => skill.name === "撕咬");
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.sides.attacker.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "地绡银龙").id;
  state.sides.defender.spiritId = snapshot.spirits.find(spirit => spirit.fullName === "迪莫").id;
  state.sides.attacker.skills = { single: skill.id, four: [skill.id, null, null, null] };
  state.sides.defender.skills = { single: hit.id, four: [hit.id, null, null, null] };
  return render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "detailed" }} />);
}

function attackPanel(stat) {
  const group = screen.getByRole("group", { name: "攻击方能力" });
  const tile = [...group.querySelectorAll(".stat-tile")].find(tile => tile.querySelector(".stat-tile__label-text")?.textContent === stat);
  return Number(tile.querySelector("output").textContent);
}

test.each(["single", "four"])("%s矿物置换真实技能按钮开放且仅魔攻改变", mode => {
  setup("矿物置换", mode);
  const physical = attackPanel("物攻"), magical = attackPanel("魔攻");
  const button = screen.getByRole("button", { name: mode === "single" ? "使用技能" : "攻击方技能1使用技能", exact: true });
  fireEvent.click(button);
  expect(attackPanel("魔攻")).toBe(Math.floor(magical * 2.2));
  expect(attackPanel("物攻")).toBe(physical);
  expect(screen.getByRole("group", { name: "攻击方能力" })).toHaveTextContent("魔攻 12层 · +120%");
  expect(screen.queryByText("暂不支持仅魔攻增益与禁足的组合结算。")).not.toBeInTheDocument();
});

test("咒火的真实技能按钮等待蓄力确认，画龙点睛的运行数据无85威力", () => {
  setup("咒火", "four");
  const button = screen.getByRole("button", { name: "攻击方技能1使用技能", exact: true });
  fireEvent.click(button);
  expect(screen.queryByText(/龙噬2层/u)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "攻击方技能1已完成蓄力", exact: true }));
  fireEvent.click(button);
  expect(screen.getAllByText(/龙噬2层/u).length).toBeGreaterThan(0);
  expect(snapshot.skills.find(skill => skill.name === "画龙点睛")).toMatchObject({ category: "status", basePower: null });
});
