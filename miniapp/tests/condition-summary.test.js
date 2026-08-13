import { describe, expect, test } from "vitest";
import { createConditionSummary } from "../src/view-models/condition-summary.js";

describe("createConditionSummary", () => {
  test("counts only active skill, trait, mark and battle values", () => {
    const state = {
      directions: {
        forward: {
          context: {
            counterTriggered: true,
            weatherRainTurns: 2,
          },
          currentHp: 300,
          finalDamageMultiplier: 1.2,
          hitCount: 1,
          overrides: {},
          reduction: 0.8,
        },
      },
      marks: {
        attacker: { negative: null, positive: null },
        defender: {
          negative: { id: "starfall", stacks: 2 },
          positive: null,
        },
      },
      sides: {
        attacker: { traitValues: { "trait.a.activation": true } },
        defender: { traitValues: {} },
      },
    };
    const skill = {
      inputs: [
        {
          contextKey: "counterTriggered",
          defaultValue: false,
          label: "触发应对",
          type: "boolean",
        },
      ],
    };

    const summary = createConditionSummary({
      direction: "forward",
      skill,
      state,
      traitViews: {
        attacker: {
          controls: [
            {
              canonicalKey: "trait.a.activation",
              defaultValue: false,
            },
          ],
          ownerSide: "attacker",
        },
        defender: null,
      },
    });

    expect(summary.count).toBe(7);
    expect(summary.labels).toEqual(expect.arrayContaining([
      "触发应对",
      "雨天 2 回合",
      "目标 HP 300",
      "减伤 20%",
      "终伤 ×1.2",
      "特性 1",
      "印记 1",
    ]));
  });

  test("reports the empty default state without a fake three-item count", () => {
    const summary = createConditionSummary({
      direction: "forward",
      skill: null,
      state: {
        directions: {
          forward: {
            context: {},
            currentHp: null,
            finalDamageMultiplier: 1,
            hitCount: 1,
            overrides: {},
            reduction: 1,
          },
        },
        marks: {
          attacker: { negative: null, positive: null },
          defender: { negative: null, positive: null },
        },
        sides: {
          attacker: { traitValues: {} },
          defender: { traitValues: {} },
        },
      },
      traitViews: { attacker: null, defender: null },
    });

    expect(summary).toMatchObject({ count: 0, labels: [] });
  });
});
