import { describe, expect, test } from "vitest";
import {
  BLOODLINE_MAGIC_OPTIONS,
  normalizeBloodlineMagicContext,
  resolveBloodlineMagicHealing,
} from "../../src/domain/bloodline-magic.js";

describe("bloodline magic", () => {
  test("光合治愈立即回复15%，并记录后续3回合各15%", () => {
    expect(resolveBloodlineMagicHealing({
      context: {
        bloodlineMagicId: "photosynthetic-healing",
        bloodlineMagicTriggered: true,
      },
      maximumHp: 401,
    })).toMatchObject({
      active: true,
      endTurnHealing: 60,
      endTurnTicks: 3,
      energy: 0,
      healing: 60,
      sourceLabel: "光合治愈",
      totalPotentialHealing: 240,
    });
  });

  test("未触发和占位血脉魔法不产生回复", () => {
    expect(resolveBloodlineMagicHealing({
      context: {
        bloodlineMagicId: "photosynthetic-healing",
        bloodlineMagicTriggered: false,
      },
      maximumHp: 400,
    }).healing).toBe(0);
    expect(resolveBloodlineMagicHealing({
      context: {
        bloodlineMagicId: "throttling",
        bloodlineMagicTriggered: true,
      },
      maximumHp: 400,
    }).healing).toBe(0);
  });

  test("未知配置归一化为无且保留六个固定选项", () => {
    expect(normalizeBloodlineMagicContext({
      bloodlineMagicId: "unknown",
      bloodlineMagicTriggered: true,
    })).toEqual({
      bloodlineMagicId: "none",
      bloodlineMagicTriggered: false,
    });
    expect(BLOODLINE_MAGIC_OPTIONS.map((option) => option.name)).toEqual([
      "无",
      "光合治愈",
      "节流术",
      "进化之力",
      "强化术",
      "闪焰爆发",
    ]);
  });
});
