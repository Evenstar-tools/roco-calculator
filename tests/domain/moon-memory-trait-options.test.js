import { describe, expect, test } from "vitest";
import {
  hasMoonMemoryTrait,
  MOON_MEMORY_TRAIT_LIMIT,
} from "../../src/domain/moon-memory.js";
import {
  createMoonMemoryTraitSearchIndex,
  getMoonMemorySelectedTraits,
  getMoonMemoryTraitControls,
  getMoonMemoryTraitSupport,
  hasNativeMoonMemoryTrait,
  searchMoonMemoryTraitOptions,
} from "../../src/domain/moon-memory-trait-options.js";

const snapshot = {
  spirits: [
    {
      dexNo: "077",
      fullName: "机械方方",
      id: "gear-square",
      initials: "jxff",
      pinyin: "jixiefangfang",
      traitIds: ["old-toy", "cold-light"],
    },
    {
      dexNo: "201",
      fullName: "纸袋怪",
      id: "paper-bag",
      initials: "zdg",
      pinyin: "zhidaiguai",
      traitIds: ["display-only"],
    },
    {
      dexNo: "078",
      fullName: "机械圆圆",
      id: "gear-round",
      traitIds: ["old-toy"],
    },
  ],
  traits: [
    { id: "old-toy", name: "旧玩具" },
    { id: "cold-light", name: "冷光源" },
    { id: "display-only", name: "待验证特性" },
  ],
};

const searchIndex = createMoonMemoryTraitSearchIndex(snapshot);

describe("searchMoonMemoryTraitOptions", () => {
  test("searches spirit identity and trait names while returning one option per trait", () => {
    expect(
      searchMoonMemoryTraitOptions(searchIndex, "jxff").map(
        ({ label }) => label,
      ),
    ).toEqual(["机械方方 · 旧玩具", "机械方方 · 冷光源"]);
    expect(
      searchMoonMemoryTraitOptions(searchIndex, "077").map(
        ({ traitId }) => traitId,
      ),
    ).toEqual(["old-toy", "cold-light"]);
    expect(searchMoonMemoryTraitOptions(searchIndex, "jixiefangfang"))
      .toHaveLength(2);
    expect(searchMoonMemoryTraitOptions(searchIndex, "机械方方"))
      .toHaveLength(2);
    expect(searchMoonMemoryTraitOptions(searchIndex, "ＪＸＦＦ"))
      .toHaveLength(2);
    expect(searchMoonMemoryTraitOptions(searchIndex, "机 械-方·方"))
      .toHaveLength(2);
    expect(
      searchMoonMemoryTraitOptions(searchIndex, "旧玩具").map(
        ({ label }) => label,
      ),
    ).toEqual(["机械方方 · 旧玩具"]);
  });

  test("labels implemented traits without treating unknown descriptions as rules", () => {
    expect(getMoonMemoryTraitSupport({ id: "old-toy", name: "旧玩具" }))
      .toEqual({ id: "supported", label: "已适配" });
    expect(
      getMoonMemoryTraitSupport({
        description: "攻击后威力翻倍。",
        id: "display-only",
        name: "待验证特性",
      }),
    ).toEqual({ id: "display-only", label: "仅展示" });
    expect(
      getMoonMemoryTraitSupport({
        id: "generic-rule",
        name: "声明式规则",
        ruleId: "power_multiplier",
      }),
    ).toEqual({ id: "supported", label: "已适配" });
    expect(getMoonMemoryTraitSupport({ id: "skin", name: "刺肤" }))
      .toEqual({ id: "supported", label: "已适配" });
    expect(getMoonMemoryTraitSupport({ id: "combo", name: "乘风连击" }))
      .toEqual({ id: "supported", label: "已适配" });
    expect(getMoonMemoryTraitSupport({ id: "healer", name: "仁心" }))
      .toEqual({ id: "supported", label: "已适配" });
    expect(getMoonMemoryTraitSupport({ id: "choice", name: "有求必应" }))
      .toEqual({ id: "supported", label: "已适配" });
    expect(getMoonMemoryTraitSupport({ id: "balance", name: "衡量" }))
      .toEqual({ id: "display-only", label: "仅展示" });
  });

  test("deduplicates selected trait ids and ignores stale ids", () => {
    expect(
      getMoonMemorySelectedTraits(snapshot, {
        acquiredTraitIds: ["old-toy", "old-toy", "missing"],
      }).map(({ trait }) => trait.id),
    ).toEqual(["old-toy"]);
  });

  test("returns at most five selected traits from an untrusted side state", () => {
    const traitIds = Array.from({ length: 6 }, (_, index) => `trait-${index}`);
    const expandedSnapshot = {
      spirits: [],
      traits: traitIds.map((id) => ({ id, name: id })),
    };

    expect(
      getMoonMemorySelectedTraits(expandedSnapshot, {
        acquiredTraitIds: traitIds,
      }).map(({ trait }) => trait.id),
    ).toEqual(traitIds.slice(0, 5));
  });

  test("maps interactive controls to stable canonical keys", () => {
    const controls = getMoonMemoryTraitControls(
      { id: "intimidation", name: "威慑" },
    );

    expect(controls).toMatchObject([
      {
        canonicalKey: "trait.traitActivated.8c9e2197",
        label: "已打断敌方技能",
        type: "boolean",
      },
      {
        canonicalKey: "trait.traitEffect.d50295e3",
        label: "双攻加成",
        type: "number",
      },
    ]);
    expect(getMoonMemoryTraitControls(
      { id: "display-only", name: "待验证特性" },
    )).toEqual([]);
    expect(getMoonMemoryTraitControls(
      { id: "wing-extension", name: "展翅" },
    )).toMatchObject([
      { label: "后于对手行动", type: "boolean" },
    ]);
    expect(getMoonMemoryTraitControls(
      { id: "baron-greed", name: "贪得无厌" },
    )).toEqual([]);
  });

  test("recognizes Moon Memory only from the spirit's native trait ids", () => {
    const moonSnapshot = {
      traits: [{ id: "moon-memory", name: "铭记于月亮" }],
    };
    expect(
      hasNativeMoonMemoryTrait(moonSnapshot, {
        id: "silver-moon-wolf",
        traitIds: ["moon-memory"],
      }),
    ).toBe(true);
    expect(
      hasNativeMoonMemoryTrait(moonSnapshot, {
        id: "ordinary-spirit",
        traitIds: [],
        traitName: "铭记于月亮",
      }),
    ).toBe(false);
  });
});

describe("Moon Memory preview scope", () => {
  test("recognizes Moon Memory from either snapshot name field", () => {
    expect(hasMoonMemoryTrait([{ name: "铭记于月亮" }])).toBe(true);
    expect(hasMoonMemoryTrait([{ displayName: "铭记于月亮" }])).toBe(true);
    expect(hasMoonMemoryTrait([{ name: "旧玩具" }])).toBe(false);
  });

  test("limits swallowed traits to five", () => {
    expect(MOON_MEMORY_TRAIT_LIMIT).toBe(5);
  });
});
