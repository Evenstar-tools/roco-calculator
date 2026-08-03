import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import { createInitialState } from "../src/shared/state/defaults.js";
import {
  createShareMessage,
  decodeSharePayload,
  encodeSharePayload,
} from "../src/share/payload.js";

const statValues = [60, 59, 58, 57, 56, 55];

function createSnapshot() {
  return {
    meta: { id: "data-v2", rulesVersion: "rules-v3" },
    spirits: [
      { id: "spirit-a", fullName: "烈焰兽" },
      { id: "spirit-b", fullName: "潮汐兽" },
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
          overrides: { basePower: 95 },
          skillId: "skill-b",
        },
        null,
        null,
      ],
    },
  };
  state.sides.defender.skills = {
    single: "skill-c",
    four: ["skill-c", "skill-d", null, null],
  };
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
    overrides: { basePower: 90 },
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
  test("round-trips public calculator inputs in bounded Base64URL form", () => {
    const snapshot = createSnapshot();
    const encoded = encodeSharePayload(createState(snapshot));
    const decoded = decodeSharePayload(encoded, snapshot);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded).not.toContain("=");
    expect(encoded.length).toBeLessThan(900);
    expect(decoded).toMatchObject({
      mode: "four",
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
                overrides: { basePower: 95 },
                skillId: "skill-b",
              },
              null,
              null,
            ],
            single: "skill-a",
          },
        },
        defender: { spiritId: "spirit-b" },
      },
      directions: {
        forward: {
          context: { currentHpPercent: 80 },
          currentHp: 110,
          hitCount: 2,
          overrides: { basePower: 90 },
          reduction: 0.75,
          selectedSkillIndex: 1,
        },
      },
    });
    expect(decoded).not.toHaveProperty("identity");
    expect(decoded).not.toHaveProperty("result");
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
      flightMode: "hits",
      skillUseCount: 4,
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

  test("creates a safe bounded page route and public result title", () => {
    const snapshot = createSnapshot();
    const state = createState(snapshot);
    const message = createShareMessage(
      {
        attackerName: "烈焰兽",
        defenderName: "潮汐兽",
        selectedResult: {
          skillName: "连环火花",
          totalDamage: 188,
        },
        status: "exact",
      },
      state,
    );

    expect(message.title).toBe("烈焰兽 → 潮汐兽｜连环火花 188 伤害");
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
});
