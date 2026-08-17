import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import {
  decodeShareState,
  encodeShareState,
} from "../../src/state/share.js";

async function encodeRawPayload(value) {
  const payload = JSON.stringify(value);
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
  return `#v1.${body}.${checksum}`;
}

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
  test("keeps the complete v1 share bytes stable", async () => {
    await expect(encodeShareState(shareFixture())).resolves.toBe(
      "#v1.eyJkaXJlY3Rpb25zIjp7ImZvcndhcmQiOnsiY29udGV4dCI6eyJhYm5vcm1hbFN0YWNrcyI6MiwiZW5lcmd5Ijo0fSwiY3VycmVudEhwIjoyODAsImZpbmFsRGFtYWdlTXVsdGlwbGllciI6MSwiaGl0Q291bnQiOjMsIm92ZXJyaWRlcyI6eyJiYXNlUG93ZXIiOjEyMCwiZGlzcGxheWVkUG93ZXIiOjI0MCwicG93ZXJNb2RlIjoiZGlzcGxheWVkIn0sInJlZHVjdGlvbiI6MSwic2VsZWN0ZWRTa2lsbEluZGV4IjowLCJzdGFyZmFsbFN0YWNrcyI6MH0sInJldmVyc2UiOnsiY29udGV4dCI6eyJza2lsbFBvc2l0aW9uIjozfSwiY3VycmVudEhwIjozMTAsImZpbmFsRGFtYWdlTXVsdGlwbGllciI6MS4yLCJoaXRDb3VudCI6MSwib3ZlcnJpZGVzIjp7InR5cGVFZmZlY3RpdmVuZXNzIjoxLjV9LCJyZWR1Y3Rpb24iOjAuNzUsInNlbGVjdGVkU2tpbGxJbmRleCI6Miwic3RhcmZhbGxTdGFja3MiOjV9fSwibWFya3MiOnsiYXR0YWNrZXIiOnsibmVnYXRpdmUiOnsiaWQiOiJzbG93Iiwic3RhY2tzIjoyfSwicG9zaXRpdmUiOnsiaWQiOiJ0YWlsd2luZCIsInN0YWNrcyI6M319LCJkZWZlbmRlciI6eyJuZWdhdGl2ZSI6eyJpZCI6InN0YXJmYWxsIiwic3RhY2tzIjo1fSwicG9zaXRpdmUiOnsiaWQiOiJjaGFyZ2UiLCJzdGFja3MiOjF9fX0sIm1vZGUiOiJmb3VyIiwic2NoZW1hVmVyc2lvbiI6MSwic2lkZXMiOnsiYXR0YWNrZXIiOnsiZGlzcGxheUl2cyI6eyJocCI6NjAsIm1hZ2ljYWxBdHRhY2siOjYwLCJtYWdpY2FsRGVmZW5zZSI6NjAsInBoeXNpY2FsQXR0YWNrIjoxMDAsInBoeXNpY2FsRGVmZW5zZSI6NjAsInNwZWVkIjo2MH0sIm5hdHVyZSI6ImJyYXZlIiwic2tpbGxzIjp7ImZvdXIiOlsic2tpbGxfYSIsInNraWxsX2IiLCJza2lsbF9jIiwic2tpbGxfZCJdLCJzaW5nbGUiOiJza2lsbF9jIn0sInNwaXJpdElkIjoic3Bpcml0X2F0dGFja2VyIn0sImRlZmVuZGVyIjp7ImRpc3BsYXlJdnMiOnsiaHAiOjQ4LCJtYWdpY2FsQXR0YWNrIjo2MCwibWFnaWNhbERlZmVuc2UiOjQyLCJwaHlzaWNhbEF0dGFjayI6NjAsInBoeXNpY2FsRGVmZW5zZSI6NjAsInNwZWVkIjo2MH0sIm5hdHVyZSI6ImNhbG0iLCJza2lsbHMiOnsiZm91ciI6WyJza2lsbF9kIiwic2tpbGxfYyIsInNraWxsX2IiLCJza2lsbF9hIl0sInNpbmdsZSI6InNraWxsX2IifSwic3Bpcml0SWQiOiJzcGlyaXRfZGVmZW5kZXIifX0sInZlcnNpb25zIjp7ImRhdGEiOiJzMy0yMDI2LTA3LTE1IiwicnVsZXMiOiJydWxlcy0yMDI2LjA3In19.af04de399744",
    );
  });

  test("round trips a seven-slot carried skill loadout", async () => {
    const state = shareFixture();
    state.sides.attacker.skills.four = [
      "skill_a", "skill_b", "skill_c", "skill_d", "skill_a", "skill_b", "skill_c",
    ];

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.sides.attacker.skills.four).toEqual(
      state.sides.attacker.skills.four,
    );
  });

  test("round trips every raw input with data and rule versions", async () => {
    const state = shareFixture();

    const hash = await encodeShareState(state);

    expect(hash).toMatch(/^#v1\.[A-Za-z0-9_-]+\.[a-f0-9]{12}$/);
    await expect(decodeShareState(hash)).resolves.toEqual(state);
  });

  test("round trips non-empty canonical trait values", async () => {
    const state = shareFixture();
    state.sides.attacker.traitValues = {
      "trait.traitActivated.12345678": true,
      "trait.traitStacks.deadbeef": 3,
    };
    state.sides.defender.traitValues = {
      "trait.contractBallType.cafebabe": "prism",
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.sides.attacker.traitValues).toEqual(
      state.sides.attacker.traitValues,
    );
    expect(decoded.sides.defender.traitValues).toEqual(
      state.sides.defender.traitValues,
    );
  });

  test("repairs unknown, malicious, and non-object trait values", async () => {
    const state = shareFixture();
    state.sides.attacker.traitValues = {
      "trait.traitActivated.12345678": true,
      "trait.traitStacks.deadbeef": { nested: true },
      openid: "user-secret",
    };
    state.sides.defender.traitValues = "not-an-object";

    const decoded = await decodeShareState(await encodeRawPayload(state));

    expect(decoded.sides.attacker.traitValues).toEqual({
      "trait.traitActivated.12345678": true,
    });
    expect(decoded.sides.defender.traitValues).toEqual({});
  });

  test("分享状态同时保留血脉选择和本回合触发", async () => {
    const state = shareFixture();
    state.directions.forward.context = {
      ...state.directions.forward.context,
      "attackerTrait.bloodlineType.12345678": "illusion",
      "attackerTrait.bloodlineActivated.87654321": true,
    };

    const decoded = await decodeShareState(await encodeShareState(state));
    expect(decoded.directions.forward.context).toMatchObject({
      "attackerTrait.bloodlineType.12345678": "illusion",
      "attackerTrait.bloodlineActivated.87654321": true,
    });
  });

  test("round trips a selected direct trait damage source and its hit count", async () => {
    const state = shareFixture();
    state.directions.forward.selectedDamageSource = "trait";
    state.directions.forward.traitDamageHitCount = 7;

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.directions.forward).toMatchObject({
      selectedDamageSource: "trait",
      traitDamageHitCount: 7,
    });
  });

  test("round trips bloodline magic selection and its standalone damage source", async () => {
    const state = shareFixture();
    state.directions.forward.selectedDamageSource = "bloodline";
    state.directions.forward.context = {
      ...state.directions.forward.context,
      bloodlineMagicId: "photosynthetic-healing",
      bloodlineMagicTriggered: true,
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.directions.forward).toMatchObject({
      selectedDamageSource: "bloodline",
      context: {
        bloodlineMagicId: "photosynthetic-healing",
        bloodlineMagicTriggered: true,
      },
    });
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

  test("round trips static and panel power overrides", async () => {
    const state = shareFixture();
    state.directions.forward.overrides = {
      powerOverride: { mode: "static", value: 88 },
    };
    state.sides.attacker.skills.four[0] = {
      skillId: "skill_a",
      overrides: { powerOverride: { mode: "panel", value: 281 } },
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.directions.forward.overrides.powerOverride).toEqual({
      mode: "static",
      value: 88,
    });
    expect(decoded.sides.attacker.skills.four[0].overrides.powerOverride).toEqual({
      mode: "panel",
      value: 281,
    });
  });

  test.each([
    [{ mode: "panel", value: 87.5 }, "面板威力必须为整数"],
    [{ mode: "static", value: 87.5 }, "静态威力必须为整数"],
    [{ mode: "static", value: 10000 }, "威力必须在 0–9999"],
    [{ mode: "base", value: 80 }, "威力口径无效"],
  ])("rejects invalid power overrides", async (powerOverride, message) => {
    const state = shareFixture();
    state.directions.forward.overrides = { powerOverride };

    await expect(encodeShareState(state)).rejects.toThrow(message);
  });

  test("keeps legacy actual overrides readable", async () => {
    const state = shareFixture();
    state.directions.forward.overrides = {
      powerOverride: { mode: "actual", value: 87.5 },
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.directions.forward.overrides.powerOverride).toEqual({
      mode: "actual",
      value: 87.5,
    });
  });

  test("round trips optional per-skill single memories without changing the v1 schema", async () => {
    const state = shareFixture();
    state.sides.attacker.skills.single = {
      context: { "skill.energy": 5 },
      hitCount: 2,
      memoryBySkill: {
        skill_a: {
          context: { "skill.energy": 5 },
          hitCount: 2,
          overrides: { basePower: 120, powerMode: "base" },
        },
        skill_b: {
          context: { "skill.stackCount": 3 },
          hitCount: 4,
          overrides: { displayedPower: 180, powerMode: "displayed" },
        },
      },
      overrides: { basePower: 120, powerMode: "base" },
      skillId: "skill_a",
    };

    const decoded = await decodeShareState(await encodeShareState(state));

    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.sides.attacker.skills.single.memoryBySkill).toEqual(
      state.sides.attacker.skills.single.memoryBySkill,
    );
  });

  test("migrates legacy starfallStacks into the matching side's negative mark", async () => {
    const state = shareFixture();
    delete state.marks;
    delete state.sides.attacker.traitValues;
    delete state.sides.defender.traitValues;
    state.directions.forward.starfallStacks = 4;
    state.directions.reverse.starfallStacks = 2;

    const decoded = await decodeShareState(await encodeRawPayload(state));

    expect(decoded.marks.defender.negative).toEqual({
      id: "starfall",
      stacks: 4,
    });
    expect(decoded.marks.attacker.negative).toEqual({
      id: "starfall",
      stacks: 2,
    });
    expect(decoded.sides.attacker.traitValues).toEqual({});
    expect(decoded.sides.defender.traitValues).toEqual({});
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
