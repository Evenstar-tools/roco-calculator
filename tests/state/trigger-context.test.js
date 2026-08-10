import { describe, expect, test } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../../src/domain/skill-status-effects.js";
import { getTraitEffectInputs } from "../../src/domain/trait-effects.js";
import {
  normalizeTriggerControls,
  projectTriggerContext,
} from "../../src/domain/trigger-controls.js";
import {
  sanitizeTriggerContext,
  transitionTriggerContext,
} from "../../src/state/trigger-context.js";

function controls(inputs, source = "skill") {
  return normalizeTriggerControls(inputs, { source });
}

function controlId(schema, contextKey) {
  return schema.find((control) => control.contextKey === contextKey).id;
}

function semanticFixture(control) {
  return JSON.stringify({
    contextKey: control.contextKey,
    defaultValue: control.defaultValue,
    max: control.max ?? null,
    min: control.min ?? null,
    options: control.type === "choice"
      ? control.options.map((option) => option?.value ?? option)
      : null,
    scope: control.scope,
    source: control.source,
    type: control.type,
    visibleWhen: control.visibleWhen
      ? {
          contextKey: control.visibleWhen.contextKey,
          defaultValue: control.visibleWhen.defaultValue,
          equals: control.visibleWhen.equals,
        }
      : null,
  });
}

describe("trigger controls", () => {
  test("assigns deterministic semantic ids and resolves visibility to the controlling id", () => {
    const normalized = controls([
        {
          defaultValue: false,
          key: "counterTriggered",
          label: "触发应对",
          type: "boolean",
        },
        {
          defaultValue: 0,
          key: "stackCount",
          label: "当前层数",
          max: 5,
          min: 0,
          type: "number",
          when: {
            defaultValue: false,
            equals: true,
            key: "counterTriggered",
          },
        },
      ]);
    expect(normalized).toMatchObject([
      {
        contextKey: "counterTriggered",
        defaultValue: false,
        id: expect.stringMatching(/^skill\.counterTriggered\.[a-f0-9]{8}$/),
        scope: "slot",
        source: "skill",
        type: "boolean",
      },
      {
        contextKey: "stackCount",
        defaultValue: 0,
        id: expect.stringMatching(/^skill\.stackCount\.[a-f0-9]{8}$/),
        max: 5,
        min: 0,
        scope: "slot",
        source: "skill",
        type: "number",
        visibleWhen: {
          defaultValue: false,
          equals: true,
          id: normalized[0].id,
        },
      },
    ]);
    expect(controls([
      {
        defaultValue: false,
        key: "counterTriggered",
        label: "另一处相同语义",
        type: "boolean",
      },
    ])[0].id).toBe(normalized[0].id);
  });

  test("rejects malformed types, ranges, choices, and conflicting duplicate ids", () => {
    expect(() =>
      controls([{ key: "bad", label: "坏输入", type: "text" }]),
    ).toThrow("type");
    expect(() =>
      controls([
        {
          defaultValue: 0,
          key: "badRange",
          label: "坏范围",
          max: 0,
          min: 2,
          type: "number",
        },
      ]),
    ).toThrow("范围");
    expect(() =>
      controls([
        {
          defaultValue: "missing",
          key: "mode",
          label: "模式",
          options: [{ label: "甲", value: "a" }],
          type: "choice",
        },
      ]),
    ).toThrow("默认值");
    const semanticallyDistinct = normalizeTriggerControls([
      { key: "same", label: "开关", type: "boolean" },
      { key: "same", label: "层数", min: 0, type: "number" },
    ], { source: "attackerTrait" });
    expect(semanticallyDistinct[0].id).not.toBe(semanticallyDistinct[1].id);
  });

  test("gives every runtime semantic collision group a distinct deterministic id", () => {
    const sources = [
      [
        "skill",
        snapshot.skills.flatMap((skill) => [
          ...getSkillEffectInputs(skill),
          ...getSkillStatusEffectInputs(skill),
        ]),
      ],
      [
        "attackerTrait",
        snapshot.traits.flatMap((trait) =>
          getTraitEffectInputs(trait, "attacker"),
        ),
      ],
      [
        "defenderTrait",
        snapshot.traits.flatMap((trait) =>
          getTraitEffectInputs(trait, "defender"),
        ),
      ],
    ];
    const audited = [];

    for (const [source, entries] of sources) {
      const byContextKey = Map.groupBy(entries, (control) => control.contextKey);
      for (const [contextKey, group] of byContextKey) {
        const semanticCount = new Set(group.map(semanticFixture)).size;
        if (semanticCount < 2) continue;
        audited.push(`${source}.${contextKey}`);
        expect(
          new Set(group.map((control) => control.id)).size,
          `${source}.${contextKey}`,
        ).toBe(semanticCount);
      }
    }

    expect(audited.sort()).toEqual([
      "attackerTrait.attackerTraitEffect",
      "attackerTrait.attackerTraitSpeedEffect",
      "attackerTrait.attackerTraitStacks",
      "attackerTrait.traitActivated",
      "defenderTrait.defenderTraitEffect",
      "defenderTrait.defenderTraitSpeedEffect",
      "defenderTrait.defenderTraitStacks",
      "skill.actualSkillCost",
      "skill.attackerHpPercent",
      "skill.counterTriggered",
      "skill.energy",
      "skill.skillPosition",
    ]);
  });

  test("projects namespaced skill and trait values without cross-source collisions", () => {
    const skillControls = controls([
      { key: "counterTriggered", label: "技能应对", type: "boolean" },
    ]);
    const traitControls = controls(
      [{ key: "counterTriggered", label: "特性应对", type: "boolean" }],
      "attackerTrait",
    );
    const context = {
      "attackerTrait.counterTriggered": false,
      "skill.counterTriggered": true,
    };

    expect(projectTriggerContext(context, skillControls).counterTriggered).toBe(
      true,
    );
    expect(projectTriggerContext(context, traitControls).counterTriggered).toBe(
      false,
    );
  });
});

describe("trigger context", () => {
  const schema = controls([
    {
      defaultValue: false,
      key: "enabled",
      label: "启用",
      type: "boolean",
    },
    {
      defaultValue: 0,
      key: "stacks",
      label: "层数",
      max: 5,
      min: 0,
      type: "number",
    },
    {
      defaultValue: "fixed",
      key: "mode",
      label: "模式",
      options: [
        { label: "固定", value: "fixed" },
        { label: "应对", value: "counter" },
      ],
      type: "choice",
    },
    {
      defaultValue: 1,
      key: "conditionalStacks",
      label: "条件层数",
      max: 3,
      min: 1,
      type: "number",
      when: { defaultValue: false, equals: true, key: "enabled" },
    },
  ]);
  const enabledId = controlId(schema, "enabled");
  const stacksId = controlId(schema, "stacks");
  const modeId = controlId(schema, "mode");
  const conditionalStacksId = controlId(schema, "conditionalStacks");

  test.each([
    [0, 0],
    [1, 1],
    [5, 5],
    [-3, 0],
    [2.9, 2],
    [99, 5],
    ["bad", 0],
  ])("normalizes number input %p to %p", (input, expected) => {
    expect(
      sanitizeTriggerContext({ [stacksId]: input }, schema),
    ).toMatchObject({ [stacksId]: expected });
  });

  test.each([undefined, null, "", "bad", Number.POSITIVE_INFINITY])(
    "drops invalid number input %p when the schema has no default",
    (input) => {
      const withoutDefault = controls([
        { key: "optional", label: "可选数值", max: 10, min: 0, type: "number" },
      ]);
      expect(
        sanitizeTriggerContext(
          { [withoutDefault[0].id]: input },
          withoutDefault,
        ),
      ).toEqual({});
    },
  );

  test.each([undefined, null, "", "bad", Number.POSITIVE_INFINITY])(
    "uses the default for invalid number input %p",
    (input) => {
      expect(
        sanitizeTriggerContext({ [stacksId]: input }, schema),
      ).toMatchObject({ [stacksId]: 0 });
    },
  );

  test("migrates legacy keys, validates boolean and choice values, and removes unknown keys", () => {
    expect(
      sanitizeTriggerContext(
        {
          enabled: true,
          mode: "counter",
          stacks: 3,
          unknown: "drop",
        },
        schema,
      ),
    ).toEqual({
      [conditionalStacksId]: 1,
      [enabledId]: true,
      [modeId]: "counter",
      [stacksId]: 3,
    });

    expect(
      sanitizeTriggerContext(
        {
          "skill.enabled": "true",
          "skill.mode": "illegal",
        },
        schema,
      ),
    ).toEqual({
      [enabledId]: false,
      [modeId]: "fixed",
      [stacksId]: 0,
    });
  });

  test("removes hidden values so they cannot be projected into a calculation", () => {
    const sanitized = sanitizeTriggerContext(
      {
        [conditionalStacksId]: 3,
        [enabledId]: false,
      },
      schema,
    );

    expect(sanitized).not.toHaveProperty(conditionalStacksId);
    expect(projectTriggerContext(sanitized, schema)).not.toHaveProperty(
      "conditionalStacks",
    );
  });

  test("uses an upstream hidden control default for multi-level visibility", () => {
    const cascade = controls([
      { defaultValue: false, key: "gate", label: "总开关", type: "boolean" },
      {
        defaultValue: false,
        key: "hiddenSwitch",
        label: "隐藏开关",
        type: "boolean",
        when: { defaultValue: false, equals: true, key: "gate" },
      },
      {
        key: "payload",
        label: "载荷",
        min: 0,
        type: "number",
        when: { defaultValue: false, equals: true, key: "hiddenSwitch" },
      },
    ]);
    const gateId = controlId(cascade, "gate");
    const switchId = controlId(cascade, "hiddenSwitch");
    const payloadId = controlId(cascade, "payload");
    const raw = { [gateId]: false, [switchId]: true, [payloadId]: 7 };

    expect(sanitizeTriggerContext(raw, cascade)).toEqual({ [gateId]: false });
    expect(projectTriggerContext(raw, cascade)).not.toHaveProperty("payload");
  });

  test("keeps only controls whose ids and semantics match across a skill switch", () => {
    const previous = controls([
      {
        defaultValue: false,
        key: "counterTriggered",
        label: "触发应对",
        type: "boolean",
      },
      {
        defaultValue: 0,
        key: "stacks",
        label: "层数",
        max: 10,
        min: 0,
        type: "number",
      },
    ]);
    const next = controls([
      {
        defaultValue: false,
        key: "counterTriggered",
        label: "触发应对",
        type: "boolean",
      },
      {
        defaultValue: 2,
        key: "stacks",
        label: "层数",
        max: 20,
        min: 0,
        type: "number",
      },
      {
        defaultValue: "a",
        key: "mode",
        label: "模式",
        options: [
          { label: "甲", value: "a" },
          { label: "乙", value: "b" },
        ],
        type: "choice",
      },
    ]);

    const result =
      transitionTriggerContext(
        {
          [controlId(previous, "counterTriggered")]: true,
          [controlId(previous, "stacks")]: 7,
          stale: true,
        },
        previous,
        next,
      );
    expect(result).toEqual({
      [controlId(next, "counterTriggered")]: true,
      [controlId(next, "mode")]: "a",
      [controlId(next, "stacks")]: 2,
    });
  });
});
