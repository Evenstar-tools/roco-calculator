import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { applyS4NameCorrections } from "../../scripts/bwiki/apply-s4-name-corrections.mjs";
import { readS4PreviewSnapshot } from "../fixtures/s4-preview-snapshot.js";

const current = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
test("截图名称更正保持身份、学习面和预设一致，不冒充 BWIKI 正式确认", () => {
  expect(current.skills.find(({ id }) => id === "skill_f7eea4de117d30ed")?.name).toBe("引力偏转");
  expect(current.skills.some(({ name }) => name === "引力旋转")).toBe(false);
  const learned = current.learnsets.find(({ spiritId }) => spiritId === "spirit_d8e175477972f74d");
  expect(learned.skillIds).toContain("skill_15fb272dc50faf16");
  expect(learned.skillIds).not.toContain("skill_1652bda550a6b2dc");
  expect(learned.provenance.skillIds.revision).toBe(7271);
  const presets = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
  expect(presets.entries.find(({ spiritId }) => spiritId === learned.spiritId).skills).toContain("skill_15fb272dc50faf16");
});

test("两处修正可重复执行，不改变其他技能、精灵和特性", () => {
  const baseline = readS4PreviewSnapshot();
  baseline.skills.find(({ id }) => id === "skill_f7eea4de117d30ed").name = "引力旋转";
  const learned = baseline.learnsets.find(({ spiritId }) => spiritId === "spirit_d8e175477972f74d");
  learned.skillIds = learned.skillIds.map((id) => id === "skill_15fb272dc50faf16" ? "skill_1652bda550a6b2dc" : id);
  const patched = applyS4NameCorrections(baseline);
  expect(applyS4NameCorrections(patched)).toEqual(patched);
  expect(patched.spirits).toEqual(baseline.spirits);
  expect(patched.traits).toEqual(baseline.traits);
  expect(patched.skills.filter(({ id }) => id !== "skill_f7eea4de117d30ed")).toEqual(baseline.skills.filter(({ id }) => id !== "skill_f7eea4de117d30ed"));
});
