import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { resolveSkillPower } from "../../src/domain/skill-rules.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";

const sensor = snapshot.skills.find(({ name }) => name === "传感器");
const tita = snapshot.spirits.find(({ fullName }) => fullName === "声波缇塔");
const side = (context = {}) => ({
  spiritId: tita.id,
  displayIvs: Object.fromEntries(Object.keys(tita.raceStats).map((key) => [key, 60])),
  natureMultipliers: {},
  skills: {
    single: sensor.id,
    four: Array.from({ length: 4 }, () => ({ skillId: sensor.id, hitCount: 2, context })),
  },
});

function matchup({ mode = "four", context = {}, overrides = {}, selectedSkill = sensor } = {}) {
  const configuredSide = side();
  configuredSide.skills.single = selectedSkill.id;
  configuredSide.skills.four = configuredSide.skills.four.map((entry) => ({ ...entry, overrides }));
  return calculateMatchup(snapshot, {
    mode,
    level: 60,
    sides: { attacker: configuredSide, defender: side() },
    directions: {
      forward: { context, overrides },
      reverse: { context },
    },
  });
}

describe("声波缇塔与传感器槽位联动", () => {
  test("向心力不会要求不造成伤害的技能填写位置", () => {
    const selectedSkill = snapshot.skills.find(({ name }) => name === "啮合传递");
    expect(matchup({ mode: "single", selectedSkill }).forward.selectedResult.status).not.toBe("needs_input");
  });
  test("单技能界面的位置控件稳定 ID 同时作用于技能和特性", () => {
    const input = getSkillEffectInputs(sensor).find(({ contextKey }) => contextKey === "skillPosition");
    expect(matchup({ mode: "single", context: { [input.id]: 1 } }).forward.selectedResult)
      .toMatchObject({ status: "exact", hitCount: 3, skillPower: 50 });
  });

  test("单技能位置不污染切换后的四技能实际槽位", () => {
    const input = getSkillEffectInputs(sensor).find(({ contextKey }) => contextKey === "skillPosition");
    const results = matchup({ context: { skillPosition: 3, [input.id]: 3 } }).forward.results;
    expect(results.map(({ skillPower }) => skillPower)).toEqual([50, 50, 20, 20]);
    expect(results.map(({ hitCount }) => hitCount)).toEqual([3, 2, 3, 2]);
  });
  test.each(["single", "four"])("%s 显式手调优先，清除后恢复槽位自动连击", (mode) => {
    const input = { mode, context: { skillPosition: 1 } };
    expect(matchup({ ...input, overrides: { hitCount: 6 } }).forward.selectedResult.hitCount).toBe(6);
    expect(matchup({ ...input, overrides: { hitCount: 6 } }).forward.selectedResult.automaticHitCount).toBe(3);
    expect(matchup({ ...input, overrides: { hitCount: 2 } }).forward.selectedResult.hitCount).toBe(2);
    expect(matchup({ ...input, overrides: { hitCount: null } }).forward.selectedResult.hitCount).toBe(3);
  });

  test("向心力单技能使用普通技能也要求位置，并持续提供位置控件", () => {
    const selectedSkill = snapshot.skills.find(({ name }) => name === "拆卸");
    const input = { mode: "single", selectedSkill };
    expect(matchup(input).forward.selectedResult).toMatchObject({
      status: "needs_input", inputs: [expect.objectContaining({ key: "skillPosition" })],
    });
    [1, 2, 3, 4].forEach((skillPosition) => {
      expect(matchup({ ...input, context: { skillPosition } }).forward.selectedResult)
        .toMatchObject({
          skillPower: skillPosition <= 2 ? 70 : 40,
          inputs: [expect.objectContaining({ key: "skillPosition" })],
        });
    });
  });
  test.each([[1, 3], [2, 2], [3, 3], [4, 2]])(
    "传感器在 %i 号位为 %i 连击，静态威力不变",
    (skillPosition, hitCount) => {
      expect(resolveSkillPower(sensor, { skillPosition })).toMatchObject({
        status: "exact", value: 20, hitCount,
      });
    },
  );

  test.each(["forward", "reverse"])("%s 按真实槽位计算，旧预设的 2 连击不盖掉自动连击", (direction) => {
    const { results } = matchup()[direction];
    expect(results.map(({ hitCount }) => hitCount)).toEqual([3, 2, 3, 2]);
    expect(results.map(({ skillPower }) => skillPower)).toEqual([50, 50, 20, 20]);
    expect(results.map(({ staticPower }) => staticPower)).toEqual([20, 20, 20, 20]);
    expect(results[0].totalDamage).toBeGreaterThan(results[1].totalDamage);
  });

  test.each([[1, 50, 3], [2, 50, 2], [3, 20, 3], [4, 20, 2]])(
    "单技能手选 %i 号位同时驱动向心力和传感器",
    (skillPosition, skillPower, hitCount) => {
      expect(matchup({ mode: "single", context: { skillPosition } }).forward.selectedResult)
        .toMatchObject({ skillPower, hitCount });
    },
  );

  test("单技能缺少位置时明确要求输入，不默认为 2 连击", () => {
    expect(resolveSkillPower(sensor, {})).toMatchObject({ status: "needs_input" });
  });
});
