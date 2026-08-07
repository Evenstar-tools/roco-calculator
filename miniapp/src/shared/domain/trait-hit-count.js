import { hasDeclaredHitCount } from "./skill-effects.js";
import {
  normalizeTriggerControls,
  projectTriggerContext,
} from "./trigger-controls.js";

const RULES = Object.freeze({
  乘风连击: {
    inputs: [
      {
        contextKey: "windSkillUseCount",
        defaultValue: 0,
        label: "翼系技能使用次数",
        max: 99,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发乘风连击",
        scope: "battle",
        type: "boolean",
      },
    ],
    resolve(context) {
      return context.traitHitCountActivated === true
        ? Math.max(0, Math.floor(Number(context.windSkillUseCount) || 0))
        : 0;
    },
    stepInput(context) {
      return { useCount: context.windSkillUseCount };
    },
    stepLabel: "乘风连击",
  },
  咔咔冲刺: {
    inputs: [
      {
        contextKey: "actedFirstCount",
        defaultValue: 0,
        label: "此前先手次数",
        max: 99,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发咔咔冲刺",
        scope: "battle",
        type: "boolean",
      },
    ],
    resolve(context) {
      return context.traitHitCountActivated === true
        ? Math.max(0, Math.floor(Number(context.actedFirstCount) || 0))
        : 0;
    },
    stepInput(context) {
      return { actedFirstCount: context.actedFirstCount };
    },
  },
  侵蚀: {
    inputs: [
      {
        contextKey: "enemyPoisonStacks",
        defaultValue: 0,
        label: "敌方中毒层数",
        max: 99,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发侵蚀",
        scope: "battle",
        type: "boolean",
      },
    ],
    resolve(context) {
      return context.traitHitCountActivated === true
        ? Math.max(0, Math.floor(Number(context.enemyPoisonStacks) || 0))
        : 0;
    },
    stepInput(context) {
      return { poisonStacks: context.enemyPoisonStacks };
    },
  },
  嫁祸: {
    inputs: [
      {
        contextKey: "attackerHpPercent",
        defaultValue: 100,
        label: "自身生命百分比",
        max: 100,
        min: 0,
        scope: "battle",
        type: "number",
      },
      {
        contextKey: "traitHitCountActivated",
        defaultValue: false,
        label: "触发嫁祸",
        scope: "battle",
        type: "boolean",
      },
    ],
    resolve(context) {
      if (context.traitHitCountActivated !== true) return 0;
      const currentHpPercent = Math.min(
        100,
        Math.max(0, Number(context.attackerHpPercent) || 0),
      );
      return Math.floor((100 - currentHpPercent) / 25) * 2;
    },
    stepInput(context) {
      return { currentHpPercent: context.attackerHpPercent };
    },
  },
});

const GLOBAL_FIXED_RULES = Object.freeze({
  无差别过滤: {
    hitCount: 2,
    input: {
      contextKey: "indiscriminateFilterActivated",
      defaultValue: false,
      label: "触发无差别过滤",
      scope: "battle",
      type: "boolean",
    },
  },
});

function sourceFor(trait) {
  return trait?.provenance ?? `reviewed-trait:${trait?.name ?? "hit-count"}-v1`;
}

export function getTraitHitCountInputs(trait, role = "attacker") {
  const fixedRule = GLOBAL_FIXED_RULES[trait?.name];
  if (fixedRule) {
    return normalizeTriggerControls([fixedRule.input], {
      source: role === "defender" ? "defenderTrait" : "attackerTrait",
    });
  }
  if (role !== "attacker") return [];
  const rule = RULES[trait?.name];
  if (!rule) return [];
  return normalizeTriggerControls(rule.inputs, { source: "attackerTrait" });
}

export function resolveGlobalFixedHitCount({
  attackerTraits = [],
  defenderTraits = [],
  context = {},
  skill = null,
} = {}) {
  if (!hasDeclaredHitCount(skill)) return null;
  for (const [traits, role] of [
    [attackerTraits, "attacker"],
    [defenderTraits, "defender"],
  ]) {
    for (const trait of traits) {
      const rule = GLOBAL_FIXED_RULES[trait?.name];
      if (!rule) continue;
      const controls = getTraitHitCountInputs(trait, role);
      const projected = projectTriggerContext(context, controls);
      if (projected[rule.input.contextKey] !== true) continue;
      const source = sourceFor(trait);
      return {
        hitCount: rule.hitCount,
        sources: [source],
        traitName: trait.name,
      };
    }
  }
  return null;
}

export function resolveTraitHitCountBonus({
  traits = [],
  context = {},
  skill = null,
} = {}) {
  if (
    !skill ||
    skill.category === "defense" ||
    !hasDeclaredHitCount(skill)
  ) {
    return { hitCountAdd: 0, sources: [], steps: [] };
  }

  return traits.reduce(
    (combined, trait) => {
      const rule = RULES[trait?.name];
      if (!rule) return combined;
      const projected = projectTriggerContext(
        context,
        getTraitHitCountInputs(trait, "attacker"),
      );
      if (
        trait.name === "嫁祸" &&
        Number.isFinite(Number(context.attackerHpPercent))
      ) {
        projected.attackerHpPercent = Number(context.attackerHpPercent);
      }
      const hitCountAdd = Math.max(
        0,
        Math.floor(Number(rule.resolve(projected)) || 0),
      );
      if (hitCountAdd === 0) return combined;
      const source = sourceFor(trait);
      return {
        hitCountAdd: combined.hitCountAdd + hitCountAdd,
        sources: [...combined.sources, source],
        steps: [
          ...combined.steps,
          {
            after: hitCountAdd,
            before: 0,
            input: rule.stepInput(projected),
            label: rule.stepLabel ?? `${trait.name}连击`,
            source,
          },
        ],
      };
    },
    { hitCountAdd: 0, sources: [], steps: [] },
  );
}
