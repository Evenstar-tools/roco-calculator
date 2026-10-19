import { createGlobalPlaceholderCatalog } from "../../src/runtime/global-placeholder-catalog.js";

export function globalPlaceholderCatalog() {
  return createGlobalPlaceholderCatalog({
    meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" },
    spirits: [
      { id: "first", fullName: "中文占位一", types: [] },
      { id: "second", fullName: "中文占位二", types: [] },
    ],
    skills: [
      { id: "first-skill", name: "中文技能一", category: "physical", basePower: 75 },
      { id: "second-skill", name: "中文技能二", category: "magical", basePower: 100 },
    ],
    learnsets: [
      { spiritId: "first", skillIds: ["first-skill", "second-skill"], defaultSkillIds: ["first-skill"] },
      { spiritId: "second", skillIds: ["second-skill"] },
    ],
    traits: [], rules: [], typeChart: { types: [], matrix: [] },
  });
}
