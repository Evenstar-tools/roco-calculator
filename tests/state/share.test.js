import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import {
  decodeShareState,
  encodeShareState,
} from "../../src/state/share.js";

function shareFixture() {
  const state = createInitialState({
    meta: {
      id: "s3-2026-07-15",
      rulesVersion: "rules-2026.07",
    },
    spirits: [
      { id: "spirit_attacker" },
      { id: "spirit_defender" },
    ],
    skills: [
      { id: "skill_a" },
      { id: "skill_b" },
      { id: "skill_c" },
      { id: "skill_d" },
    ],
  });

  return {
    ...state,
    mode: "four",
    marks: {
      attacker: {
        negative: { id: "slow", stacks: 2 },
        positive: { id: "tailwind", stacks: 3 },
      },
      defender: {
        negative: { id: "starfall", stacks: 5 },
        positive: { id: "charge", stacks: 1 },
      },
    },
    sides: {
      attacker: {
        ...state.sides.attacker,
        nature: "brave",
        displayIvs: {
          ...state.sides.attacker.displayIvs,
          physicalAttack: 100,
        },
        skills: {
          single: "skill_c",
          four: ["skill_a", "skill_b", "skill_c", "skill_d"],
        },
      },
      defender: {
        ...state.sides.defender,
        nature: "calm",
        displayIvs: {
          ...state.sides.defender.displayIvs,
          hp: 48,
          magicalDefense: 42,
        },
        skills: {
          single: "skill_b",
          four: ["skill_d", "skill_c", "skill_b", "skill_a"],
        },
      },
    },
    directions: {
      forward: {
        ...state.directions.forward,
        hitCount: 3,
        currentHp: 280,
        context: { energy: 4, abnormalStacks: 2 },
        overrides: {
          basePower: 120,
          displayedPower: 240,
          powerMode: "displayed",
        },
      },
      reverse: {
        ...state.directions.reverse,
        selectedSkillIndex: 2,
        reduction: 0.75,
        starfallStacks: 5,
        finalDamageMultiplier: 1.2,
        currentHp: 310,
        context: { skillPosition: 3 },
        overrides: { typeEffectiveness: 1.5 },
      },
    },
  };
}

describe("versioned share state", () => {
  test("round trips every raw input with data and rule versions", async () => {
    const state = shareFixture();

    const hash = await encodeShareState(state);

    expect(hash).toMatch(/^#v1\.[A-Za-z0-9_-]+\.[a-f0-9]{12}$/);
    await expect(decodeShareState(hash)).resolves.toEqual(state);
  });

  test("rejects a modified checksum", async () => {
    const hash = await encodeShareState(shareFixture());
    const replacement = hash.endsWith("a") ? "b" : "a";
    const modified = `${hash.slice(0, -1)}${replacement}`;

    await expect(decodeShareState(modified)).rejects.toThrow(
      "分享配置校验失败",
    );
  });

  test("serializes raw inputs only and is stable across object key order", async () => {
    const state = shareFixture();
    const withComputedResults = {
      ...state,
      results: {
        forward: { totalDamage: 999_999 },
        reverse: { totalDamage: 888_888 },
      },
    };
    const withReorderedContext = {
      ...state,
      directions: {
        ...state.directions,
        forward: {
          ...state.directions.forward,
          context: { abnormalStacks: 2, energy: 4 },
        },
      },
    };

    const baseHash = await encodeShareState(state);
    const resultHash = await encodeShareState(withComputedResults);
    const reorderedHash = await encodeShareState(withReorderedContext);

    expect(resultHash).toBe(baseHash);
    expect(reorderedHash).toBe(baseHash);
    const decoded = await decodeShareState(resultHash);
    expect(decoded).not.toHaveProperty("results");
  });

  test("validates schema, data version, and rule version", async () => {
    const state = shareFixture();

    await expect(
      encodeShareState({ ...state, schemaVersion: 2 }),
    ).rejects.toThrow("分享配置 schema 版本不受支持");
    await expect(
      encodeShareState({
        ...state,
        versions: { ...state.versions, data: "" },
      }),
    ).rejects.toThrow("分享配置数据版本无效");
    await expect(
      encodeShareState({
        ...state,
        versions: { ...state.versions, rules: "" },
      }),
    ).rejects.toThrow("分享配置规则版本无效");

    const hash = await encodeShareState(state);
    await expect(
      decodeShareState(hash, { data: "another-season" }),
    ).rejects.toThrow("分享配置数据版本不匹配");
    await expect(
      decodeShareState(hash, { rules: "another-ruleset" }),
    ).rejects.toThrow("分享配置规则版本不匹配");
  });

  test("round trips raw skill-slot inputs without computed slot results", async () => {
    const state = shareFixture();
    state.sides.attacker.skills.four[1] = {
      skillId: "skill_b",
      hitCount: 2,
      context: { energy: 5 },
      overrides: { basePower: 145, finalDamageMultiplier: 1.1 },
      skillPowerPercentAdds: [0.2],
      totalDamage: 999_999,
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.sides.attacker.skills.four[1]).toEqual({
      skillId: "skill_b",
      hitCount: 2,
      context: { energy: 5 },
      overrides: { basePower: 145, finalDamageMultiplier: 1.1 },
      skillPowerPercentAdds: [0.2],
    });
    expect(decoded.sides.attacker.skills.four[1]).not.toHaveProperty(
      "totalDamage",
    );
  });

  test("migrates legacy starfallStacks into the matching side's negative mark", async () => {
    const state = shareFixture();
    delete state.marks;
    state.directions.forward.starfallStacks = 4;
    state.directions.reverse.starfallStacks = 2;

    const payload = JSON.stringify(state);
    const bytes = new TextEncoder().encode(payload);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const body = btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload),
    );
    const checksum = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);

    const decoded = await decodeShareState(`#v1.${body}.${checksum}`);

    expect(decoded.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 4,
    });
    expect(decoded.marks.attacker.negative).toEqual({
      id: "starfall",
      stacks: 2,
    });
  });

  test("normalizes legacy nature labels when decoding old links", async () => {
    const state = shareFixture();
    state.sides.attacker.nature = "固执（+物攻，-魔攻）";
    state.sides.defender.nature = "普通（无修正）";

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.sides.attacker.nature).toBe("adamant");
    expect(decoded.sides.defender.nature).toBe("neutral");
  });
});
