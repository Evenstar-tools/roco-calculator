import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { withS5PreviewCatalog } from "../../src/features/s5-preview/catalog.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import runtimeSnapshot from "../../public/data/runtime.json";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { selectSpirit } from "../../src/state/calculator-session.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";

beforeEach(() => { localStorage.clear(); localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1"); });

test("真实App选中官方新精灵带出明确默认技能和空槽，再选保留用户手调", async () => {
  const evidence = { kind: "official-image", url: "https://example.com/official-card", frame: "card.jpg" };
  const stats = { hp: 100, physicalAttack: 90, magicalAttack: 110, physicalDefense: 80, magicalDefense: 90, speed: 70 };
  const skillId = "skill_preview_s5_official-ui";
  const snapshot = withS5PreviewCatalog({ meta: { id: "ui-fixture", rulesVersion: "fixture" },
    spirits: [{ id: "existing", fullName: "已有精灵", types: ["水"], raceStats: stats, traitIds: [] }], traits: [],
    skills: [{ id: "known", name: "已有技能", type: "水", category: "physical", basePower: 60, cost: 3, description: "造成物伤。" }],
    learnsets: [{ spiritId: "existing", skillIds: ["known"] }], typeChart: null,
  }, { catalogId: "s5-official-ui-fixture", source: { url: evidence.url }, entries: [{ key: "new", name: "官方新精灵",
    kind: "family", traitSummary: "官方公布的特性说明。", mechanicKey: "fixture", types: ["水"], raceStats: stats, evidence, unknowns: [],
    skills: [{ id: skillId, name: "官方新技能", type: "水", category: "magical", cost: null, basePower: null,
      description: "官方公布的新技能效果。", evidence }],
    officialSkillRefs: [{ id: "known", name: "已有技能", evidence }], defaultSkillIds: [skillId, null, "known", null],
  }] });
  const state = createInitialState(snapshot);
  state.mode = "four";
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
  const select = name => {
    fireEvent.change(screen.getByRole("combobox", { name: "攻击方精灵", exact: true }), { target: { value: name } });
    fireEvent.click(screen.getByRole("option", { name: new RegExp(name) }));
  };
  const slot = index => screen.getByRole("combobox", { name: `攻击方技能${index}`, exact: true });
  select("官方新精灵");
  expect([1, 2, 3, 4].map(index => slot(index).value)).toEqual(["官方新技能", "", "已有技能", ""]);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent("—");
  fireEvent.click(screen.getByRole("button", { name: "清空攻击方技能1", exact: true }));
  await Promise.resolve();
  select("已有精灵");
  select("官方新精灵");
  expect([1, 2, 3, 4].map(index => slot(index).value)).toEqual(["", "", "已有技能", ""]);
});

test.each(["compact", "detailed"])("真实银龙%s旧空存档不自动覆盖，显式载入默认配招保存、可撤回并刷新保留", (viewMode) => {
  const snapshot = withWebPreview(runtimeSnapshot);
  const spiritId = snapshot.spirits.find(spirit => spirit.fullName === "地绡银龙").id;
  const initialState = createInitialState(snapshot);
  initialState.mode = "four";
  const state = selectSpirit(initialState, { initialState, snapshot, side: "attacker", spiritId }).state;
  state.sides.attacker.skills = { single: null, four: [null, null, null, null] };
  state.sides.attacker.nature = "smart";
  state.sides.attacker.displayIvs.magicalAttack = 54;
  const configs = spiritConfigsRepository();
  configs.save(configs.load(snapshot), state.sides.attacker, snapshot);
  createCalculatorSessionStore().saveSession({ present: state, past: [], future: [] });
  const first = render(<App initialSnapshot={snapshot} initialWorkspace={{ viewMode }} />);
  const slotNames = () => [1, 2, 3, 4].map(index => screen.getByRole("combobox", { name: `攻击方技能${index}`, exact: true }).value);
  const restore = () => fireEvent.click(screen.getByRole("button", { name: "攻击方载入默认配招", exact: true }));
  const expected = chooseDefaultSkillIds(snapshot, spiritId).map(id => snapshot.skills.find(skill => skill.id === id)?.name ?? "");
  expect(slotNames()).toEqual(["", "", "", ""]);
  restore();
  expect(slotNames()).toEqual(expected);
  expect(screen.queryByRole("button", { name: "攻击方载入默认配招", exact: true })).toBeNull();
  const remembered = () => spiritConfigsRepository().load(snapshot).configs[spiritId];
  expect(remembered()).toMatchObject({ natureId: "smart", displayIvs: { magicalAttack: 54 } });
  expect(remembered().skills.four.map(entry => entry?.skillId ?? entry)).toEqual(chooseDefaultSkillIds(snapshot, spiritId));
  fireEvent.click(screen.getByRole("button", { name: /撤回上一步/u }));
  expect(slotNames()).toEqual(["", "", "", ""]);
  expect(remembered().skills.four).toEqual([null, null, null, null]);
  restore();
  first.unmount();
  render(<App initialSnapshot={snapshot} initialWorkspace={{ viewMode }} />);
  expect(slotNames()).toEqual(expected);
  expect(createCalculatorSessionStore().loadSession().present.sides.attacker).toMatchObject({
    nature: "smart", displayIvs: { magicalAttack: 54 }, skills: { single: null },
  });
});
