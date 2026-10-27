import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { applyS5SeasonAnnouncement } from "../../src/features/s5-preview/season-announcement.js";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
});

test.each([["破防", "four"], ["焚毁", "single"]])("S5 %s在%s模式保留检索说明并阻止应用旧版状态", (name, mode) => {
  const snapshot = applyS5SeasonAnnouncement(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
  const skill = snapshot.skills.find(skill => skill.name === name);
  const hit = snapshot.skills.find(skill => skill.name === "撕咬");
  const owner = snapshot.learnsets.find(learnset => learnset.skillIds.includes(skill.id));
  const defender = snapshot.spirits.find(spirit => spirit.fullName === "烈火守护");
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.sides.attacker.spiritId = owner.spiritId;
  state.sides.defender.spiritId = defender.id;
  state.sides.attacker.skills = { single: skill.id, four: [skill.id, null, null, null] };
  state.sides.defender.skills = { single: hit.id, four: [hit.id, null, null, null] };
  const { container } = render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "detailed" }} />);
  expect(screen.getAllByText(skill.s5StatusEffectPending).length).toBeGreaterThan(0);
  expect(container.querySelectorAll(".skill-follow-up")).toHaveLength(0);
  expect(screen.queryByTestId("primary-damage")?.textContent ?? "—").not.toMatch(/^\d+$/u);
});
