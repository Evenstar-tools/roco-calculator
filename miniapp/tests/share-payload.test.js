import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import { createInitialState } from "../src/shared/state/defaults.js";
import {
  createShareMessage,
  decodeSharePayload,
  decodeSharePayloadResult,
  encodeSharePayload,
  encodeSharePayloadWithMeta,
} from "../src/share/payload.js";

const statValues = [60, 59, 58, 57, 56, 55];
const COMPLETE_RACE_STATS = {
  hp: 100,
  speed: 100,
  physicalAttack: 100,
  magicalAttack: 100,
  physicalDefense: 100,
  magicalDefense: 100,
};

function createSnapshot() {
  return {
    meta: { id: "data-v2", rulesVersion: "rules-v3" },
    spirits: [
      {
        id: "spirit-a",
        fullName: "烈焰兽",
        raceStats: COMPLETE_RACE_STATS,
        traitIds: ["trait-ignite"],
      },
      {
        id: "spirit-b",
        fullName: "潮汐兽",
        raceStats: COMPLETE_RACE_STATS,
        traitIds: ["trait-ignite"],
      },
    ],
    skills: [
      { id: "skill-a", name: "烈焰冲击" },
      { id: "skill-b", name: "连环火花" },
      { id: "skill-c", name: "潮汐冲击" },
      { id: "skill-d", name: "水盾" },
    ],
    learnsets: [
      {
        spiritId: "spirit-a",
        skillIds: ["skill-a", "skill-b"],
      },
      {
        spiritId: "spirit-b",
        skillIds: ["skill-c", "skill-d"],
      },
    ],
    traits: [
      {
        description: "每层增加双攻双防。",
        id: "trait-ignite",
        name: "点燃",
      },
      {
        description: "被铭记后生效。",
        id: "trait-old-toy",
        name: "旧日玩具",
      },
      {
        description: "被铭记后生效。",
        id: "trait-cold-light",
        name: "冷光",
      },
    ],
  };
}

function createState(snapshot) {
  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker = {
    ...state.sides.attacker,
    nature: "adamant",
    displayIvs: Object.fromEntries(
      [
        "hp",
        "speed",
        "physicalAttack",
        "magicalAttack",
        "physicalDefense",
        "magicalDefense",
      ].map((key, index) => [key, statValues[index]]),
    ),
    skills: {
      single: "skill-a",
      four: [
        "skill-a",
        {
          context: {
            authCode: "abc123",
            counterTriggered: true,
            password: "hunter2",
            secret: "shh",
          },
          hitCount: 3,
          overrides: {
            basePower: 95,
            costOverride: 4,
            powerOverride: { mode: "panel", value: 175 },
          },
          skillId: "skill-b",
        },
        null,
        null,
      ],
    },
    traitValues: {
      "trait.traitStacks.53103d7d": 3,
      "trait.unknown.deadbeef": true,
      openid: "secret-openid",
      password: "hunter2",
    },
  };
  state.sides.attacker.password = "hunter2";
  state.sides.defender = {
    ...state.sides.defender,
    openid: "secret-openid",
    skills: {
      single: "skill-c",
      four: ["skill-c", "skill-d", null, null],
    },
    traitValues: {
      "trait.traitEffect.ddee82fa": 120,
    },
  };
  state.marks.attacker.positive = { id: "sprout", stacks: 3 };
  state.directions.forward = {
    ...state.directions.forward,
    context: {
      authCode: "abc123",
      betMode: "fixed",
      currentHpPercent: 80,
      password: "hunter2",
      secret: "shh",
    },
    currentHp: 110,
    hitCount: 2,
    overrides: {
      attackLevelStage: 2,
      basePower: 90,
      costOverride: 3,
      defenseLevelStage: -1,
      powerOverride: { mode: "static", value: 110 },
    },
    reduction: 0.75,
    selectedSkillIndex: 1,
  };
  state.identity = {
    avatarUrl: "https://private.invalid/avatar.png",
    openid: "secret-openid",
  };
  state.result = { totalDamage: 999999 };
  return state;
}

function encodeFixture(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64url");
}

describe("mini program share payload", () => {
  test("round-trips status trigger count separately from skill hit count", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.sides.attacker.skills.four[1] = {
      hitCount: 3,
      skillId: "skill-b",
      statusTriggerCount: 2,
    };
    state.directions.forward.statusTriggerCount = 4;

    const decoded = decodeSharePayload(encodeSharePayload(state), snapshot);
    expect(decoded.directions.forward.statusTriggerCount).toBe(4);
    expect(decoded.sides.attacker.skills.four[1]).toEqual({
      hitCount: 3,
      skillId: "skill-b",
      statusTriggerCount: 2,
    });
  });

  test("round-trips optional negative status settlement inputs", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.calculationOptions = { includeNegativeStatusSettlement: true };
    state.negativeStatuses = {
      attacker: { burn: 3, electrified: 2, freeze: 1, parasitism: 0, poison: 4 },
      defender: { burn: 2, electrified: 0, freeze: 0, parasitism: 3, poison: 1 },
    };

    expect(decodeSharePayload(encodeSharePayload(state), snapshot)).toMatchObject({
      calculationOptions: { includeNegativeStatusSettlement: true },
      negativeStatuses: state.negativeStatuses,
    });
  });

  test("round-trips multiple acquired traits and only their scalar control values", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.sides.attacker.acquiredTraitIds = [
      "trait-old-toy",
      "trait-cold-light",
      "trait-old-toy",
      "../bad",
      "trait-unknown",
    ];
    state.sides.attacker.acquiredTraitValues = {
      "trait-old-toy": {
        "trait.traitStacks.12345678": 2,
        "trait.invalid.deadbeef": { nested: "private" },
        openid: "secret-openid",
      },
      "trait-cold-light": {
        "trait.previousTurnWingSkillUsed.87654321": true,
        "trait.contractBallType.cafebabe": "prism",
        "trait.invalid.facefeed": Number.POSITIVE_INFINITY,
      },
      "trait-unknown": {
        "trait.traitActivated.aaaaaaaa": true,
      },
      "trait-not-selected": {
        "trait.traitActivated.bbbbbbbb": true,
      },
    };

    const encoded = encodeSharePayload(state);
    const decoded = decodeSharePayload(encoded, snapshot);

    expect(encoded.length).toBeLessThan(900);
    expect(encoded).not.toMatch(/private|secret-openid/u);
    expect(decoded.sides.attacker.acquiredTraitIds).toEqual([
      "trait-old-toy",
      "trait-cold-light",
    ]);
    expect(decoded.sides.attacker.acquiredTraitValues).toEqual({
      "trait-old-toy": {
        "trait.traitStacks.12345678": 2,
      },
      "trait-cold-light": {
        "trait.previousTurnWingSkillUsed.87654321": true,
        "trait.contractBallType.cafebabe": "prism",
      },
    });
  });

  test("round-trips public calculator inputs in bounded Base64URL form", () => {
    const snapshot = createSnapshot();
    const encoded = encodeSharePayload(createState(snapshot));
    const decoded = decodeSharePayload(encoded, snapshot);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded).not.toContain("=");
    expect(encoded.length).toBeLessThan(900);
    expect(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")).v,
    ).toBe(2);
    expect(decoded).toMatchObject({
      mode: "four",
      marks: {
        attacker: {
          positive: { id: "sprout", stacks: 3 },
        },
      },
      sides: {
        attacker: {
          displayIvs: {
            hp: 60,
            speed: 59,
            physicalAttack: 58,
            magicalAttack: 57,
            physicalDefense: 56,
            magicalDefense: 55,
          },
          nature: "adamant",
          spiritId: "spirit-a",
          skills: {
            four: [
              "skill-a",
              {
                context: { counterTriggered: true },
                hitCount: 3,
                overrides: {
                  basePower: 95,
                  powerOverride: { mode: "panel", value: 175 },
                },
                skillId: "skill-b",
              },
              null,
              null,
            ],
            single: "skill-a",
          },
          traitValues: {
            "trait.traitStacks.53103d7d": 3,
          },
        },
        defender: {
          spiritId: "spirit-b",
          traitValues: {
            "trait.traitEffect.ddee82fa": 120,
          },
        },
      },
      directions: {
        forward: {
          context: { currentHpPercent: 80 },
          currentHp: 110,
          hitCount: 2,
          overrides: {
            attackLevelStage: 2,
            basePower: 90,
            defenseLevelStage: -1,
            powerOverride: { mode: "static", value: 110 },
          },
          reduction: 0.75,
          selectedSkillIndex: 1,
        },
      },
    });
    expect(decoded).not.toHaveProperty("identity");
    expect(decoded).not.toHaveProperty("result");
    expect(decoded.sides.attacker).not.toHaveProperty("password");
    expect(decoded.sides.defender).not.toHaveProperty("openid");
    expect(decoded.sides.attacker.traitValues).not.toHaveProperty(
      "trait.unknown.deadbeef",
    );
    expect(decoded.directions.forward.context).not.toHaveProperty(
      "password",
    );
    expect(decoded.directions.forward.context).not.toHaveProperty(
      "authCode",
    );
    expect(
      decoded.sides.attacker.skills.four[1].context,
    ).not.toHaveProperty("secret");
  });

  test("rejects unknown versions without throwing", () => {
    expect(
      decodeSharePayload(
        encodeFixture({
          v: 99,
          a: { s: "spirit-a" },
        }),
        createSnapshot(),
      ),
    ).toEqual({});
  });

  test("migrates version 1 payloads with default marks and traits", () => {
    const snapshot = createSnapshot();
    const decoded = decodeSharePayload(
      encodeFixture({
        a: {
          s: "spirit-a",
          t: { "traitStacks.53103d7d": 3 },
        },
        d: { s: "spirit-b" },
        m: "single",
        v: 1,
      }),
      snapshot,
    );

    expect(decoded.marks).toEqual(createInitialState(snapshot).marks);
    expect(decoded.sides.attacker.traitValues).toEqual({});
    expect(decoded.sides.defender.traitValues).toEqual({});
    expect(decoded.sides.attacker.acquiredTraitIds).toEqual([]);
    expect(decoded.sides.attacker.acquiredTraitValues).toEqual({});
  });

  test("fills empty acquired trait state for older version 2 links", () => {
    const decoded = decodeSharePayload(
      encodeFixture({
        a: { s: "spirit-a" },
        d: { s: "spirit-b" },
        m: "single",
        v: 2,
      }),
      createSnapshot(),
    );

    expect(decoded.sides.attacker.acquiredTraitIds).toEqual([]);
    expect(decoded.sides.attacker.acquiredTraitValues).toEqual({});
    expect(decoded.sides.defender.acquiredTraitIds).toEqual([]);
    expect(decoded.sides.defender.acquiredTraitValues).toEqual({});
  });

  test("repairs invalid IDs and numeric boundaries while preserving valid fields", () => {
    const decoded = decodeSharePayload(
      encodeFixture({
        v: 1,
        m: "four",
        a: {
          s: "missing-spirit",
          n: "not-a-nature",
          i: [-1, 60, 61, "58", null, 30],
          k: [
            "missing-skill",
            "skill-b",
            { s: "skill-a", h: 0, o: { p: 1000000 } },
          ],
        },
        d: {
          s: "spirit-b",
          n: "neutral",
          i: [10, 20, 30, 40, 50, 60],
          k: ["skill-c", "skill-d"],
        },
        f: {
          x: 9,
          h: 0,
          q: -1,
          p: -20,
          c: {
            authCode: "abc123",
            betMode: "invalid-choice",
            counterTriggered: true,
            openid: "secret-openid",
            password: "hunter2",
            safeFlag: true,
            secret: "shh",
          },
        },
      }),
      createSnapshot(),
    );

    expect(decoded.mode).toBe("four");
    expect(decoded.sides.attacker).toMatchObject({
      nature: "neutral",
      spiritId: "spirit-a",
    });
    expect(decoded.sides.attacker.displayIvs).toEqual({
      hp: 60,
      speed: 60,
      physicalAttack: 60,
      magicalAttack: 58,
      physicalDefense: 60,
      magicalDefense: 30,
    });
    expect(decoded.sides.attacker.skills.four).toEqual([
      null,
      "skill-b",
      {
        hitCount: 1,
        skillId: "skill-a",
      },
      null,
    ]);
    expect(decoded.sides.defender).toMatchObject({
      nature: "neutral",
      spiritId: "spirit-b",
    });
    expect(decoded.directions.forward).toMatchObject({
      currentHp: null,
      hitCount: 1,
      reduction: 1,
      selectedSkillIndex: 0,
    });
    expect(decoded.directions.forward.context).toEqual({
      counterTriggered: true,
    });
  });

  test("allows only typed public calculator context fields on encode and decode", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.directions.forward.context = {
      attackerHpPercent: 75.5,
      betMode: "lowHp",
      counterTriggered: true,
      enemyEnergy: 7,
      password: "hunter2",
      secret: "shh",
      unknownFlag: true,
    };
    state.sides.attacker.skills.four[1].context = {
      authCode: "abc123",
      counterTriggered: true,
      donationPoisonCount: 3,
      donationPowerCount: 2,
      flightMode: "hits",
      secret: "shh",
      skillUseCount: 4,
    };

    const decoded = decodeSharePayload(
      encodeSharePayload(state),
      snapshot,
    );

    expect(decoded.directions.forward.context).toEqual({
      attackerHpPercent: 75.5,
      betMode: "lowHp",
      counterTriggered: true,
      enemyEnergy: 7,
    });
    expect(
      decoded.sides.attacker.skills.four[1].context,
    ).toEqual({
      counterTriggered: true,
      donationPoisonCount: 3,
      donationPowerCount: 2,
      flightMode: "hits",
      skillUseCount: 4,
    });
  });

  test("round-trips weight tiers, pressure valve uses, donation counts, and unbounded bug chirps", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    state.directions.forward.context = {
      pressureValveUseCount: 3,
      targetWeightTier: "120+",
      teamBugChantCount: 21,
      teamDonationCount: 4,
      weightDifferenceTier: "61~100",
    };
    state.sides.attacker.skills.four[1].context = {
      pressureValveUseCount: 2,
      targetWeightTier: "4~13",
      teamBugChantCount: 34,
      teamDonationCount: 5,
      weightDifferenceTier: "101+",
    };

    const decoded = decodeSharePayload(
      encodeSharePayload(state),
      snapshot,
    );

    expect(decoded.directions.forward.context).toEqual({
      pressureValveUseCount: 3,
      targetWeightTier: "120+",
      teamBugChantCount: 21,
      teamDonationCount: 4,
      weightDifferenceTier: "61~100",
    });
    expect(decoded.sides.attacker.skills.four[1].context).toEqual({
      pressureValveUseCount: 2,
      targetWeightTier: "4~13",
      teamBugChantCount: 34,
      teamDonationCount: 5,
      weightDifferenceTier: "101+",
    });
  });

  test("keeps an oversized untrusted state below the route budget", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    const hugeContext = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [
        `contextKey${index}`,
        "x".repeat(200),
      ]),
    );
    state.directions.forward.context = hugeContext;
    state.sides.attacker.skills.four = state.sides.attacker.skills.four
      .map((entry) => ({
        context: hugeContext,
        skillId:
          typeof entry === "string" ? entry : entry?.skillId ?? "skill-a",
      }));

    expect(encodeSharePayload(state).length).toBeLessThan(900);
  });

  test("keeps at most five acquired traits even when the complete payload fits", () => {
    const snapshot = createSnapshot();
    const traitIds = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg".split("");
    snapshot.traits.push(...traitIds.map((id) => ({ id, name: id })));
    const state = createInitialState(snapshot);
    state.sides.attacker.acquiredTraitIds = traitIds;

    const shared = encodeSharePayloadWithMeta(state);
    const decoded = decodeSharePayloadResult(shared.encoded, snapshot);

    expect(shared.encoded.length).toBeLessThan(900);
    expect(decoded.state.sides.attacker.acquiredTraitIds).toEqual(
      traitIds.slice(0, 5),
    );
  });

  test("marks acquired-trait truncation as incomplete when enforcing the route budget", () => {
    const snapshot = createSnapshot();
    const traitIds = Array.from(
      { length: 80 },
      (_, index) => `trait-${String(index).padStart(2, "0")}-${"x".repeat(80)}`,
    );
    snapshot.traits.push(...traitIds.map((id) => ({ id, name: id })));
    const state = createInitialState(snapshot);
    state.sides.attacker.acquiredTraitIds = traitIds;
    state.sides.attacker.acquiredTraitValues = Object.fromEntries(
      traitIds.map((traitId, index) => [
        traitId,
        {
          [`trait.traitStacks.${index.toString(16).padStart(8, "0")}`]: index,
        },
      ]),
    );

    const shared = encodeSharePayloadWithMeta(state);
    const decoded = decodeSharePayloadResult(shared.encoded, snapshot);
    const acquiredIds = decoded.state.sides.attacker.acquiredTraitIds;
    const acquiredValues = decoded.state.sides.attacker.acquiredTraitValues;

    expect(shared.encoded.length).toBeLessThan(900);
    expect(shared.completeness).not.toBe("full");
    expect(decoded.completeness).toBe(shared.completeness);
    expect(acquiredIds.length).toBeLessThan(traitIds.length);
    expect(Object.keys(acquiredValues).every((id) =>
      acquiredIds.includes(id)
    )).toBe(true);
  });

  test("reports full and reduced share completeness", () => {
    const snapshot = createSnapshot();
    const full = encodeSharePayloadWithMeta(createState(snapshot));

    expect(full.encoded).toBe(encodeSharePayload(createState(snapshot)));
    expect(full.completeness).toBe("full");

    const oversized = createState(snapshot);
    oversized.sides.attacker.skills.four = Array.from(
      { length: 7 },
      (_, index) => ({
        context: {
          attackerHpPercent: 10 + index,
          counterTriggered: true,
          enemyEnergy: 20 + index,
          flightMode: "hits",
          skillUseCount: 10 + index,
        },
        hitCount: 90 + index,
        overrides: { basePower: 4000 + index },
        skillId: index % 2 ? "skill-b" : "skill-a",
      }),
    );
    const reduced = encodeSharePayloadWithMeta(oversized);

    expect(reduced.encoded.length).toBeLessThan(900);
    expect(["reduced", "minimal"]).toContain(reduced.completeness);
    expect(
      decodeSharePayloadResult(reduced.encoded, snapshot).completeness,
    ).toBe(reduced.completeness);
  });

  test("returns structured valid, repaired, and invalid decode results", () => {
    const snapshot = createSnapshot();
    const valid = decodeSharePayloadResult(
      encodeSharePayload(createState(snapshot)),
      snapshot,
    );
    const repaired = decodeSharePayloadResult(
      encodeFixture({
        a: { s: "spirit-a" },
        d: { s: "spirit-b" },
        m: "single",
        v: 1,
      }),
      snapshot,
    );
    const invalid = decodeSharePayloadResult("not_valid!", snapshot);

    expect(valid).toMatchObject({
      completeness: "full",
      status: "valid",
    });
    expect(valid.state.sides.attacker.spiritId).toBe("spirit-a");
    expect(repaired).toMatchObject({
      completeness: "full",
      status: "repaired",
    });
    expect(invalid).toEqual({
      completeness: "minimal",
      state: null,
      status: "invalid",
    });
  });

  test("creates a safe bounded page route and public result title", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    const message = createShareMessage(
      {
        attackerName: "烈焰兽",
        defenderName: "潮汐兽",
        selectedResult: {
          hpPercent: 44.7,
          skillName: "连环火花",
          totalDamage: 188,
        },
        status: "exact",
      },
      state,
    );

    expect(message.title).toBe(
      "烈焰兽 → 潮汐兽｜连环火花 188伤害（44.7% HP）",
    );
    expect(message.path).toMatch(
      /^\/pages\/index\/index\?share=[A-Za-z0-9_-]+$/u,
    );
    expect(message.path.length).toBeLessThan(940);
    expect(message.title + message.path).not.toContain("secret-openid");
    expect(
      decodeSharePayload(
        message.path.split("?share=")[1],
        snapshot,
      ),
    ).toMatchObject({ mode: "four" });
  });

  test("keeps the actively shared calculation direction", () => {
    const snapshot = createSnapshot();
    const message = createShareMessage(
      {
        attackerName: "潮汐兽",
        defenderName: "烈焰兽",
        selectedResult: {
          hpPercent: 20,
          skillName: "潮汐冲击",
          totalDamage: 80,
        },
        status: "exact",
      },
      createState(snapshot),
      "reverse",
    );
    const decoded = decodeSharePayloadResult(
      message.path.split("?share=")[1],
      snapshot,
    );

    expect(decoded.direction).toBe("reverse");
  });
});
