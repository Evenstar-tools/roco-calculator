import { createNegativeStatusSide } from "./negative-status.js";

const booleanInput = (contextKey, label) => ({
  contextKey,
  defaultValue: false,
  id: contextKey,
  key: contextKey,
  label,
  type: "boolean",
});

const numberInput = (contextKey, label, max = 99) => ({
  contextKey,
  defaultValue: 0,
  id: contextKey,
  key: contextKey,
  label,
  max,
  min: 0,
  type: "number",
});

const SKILL_RULES = {
  惊雷: { classification: "weather" },
  通电: { stacks: { electrified: 1 } },
  孢子: { stacks: { parasitism: 3 } },
  易燃物质: { stacks: { burn: 4 } },
  引燃: { stacks: { burn: 10 } },
  充分燃烧: {
    resolve: (_context, { baselineStatuses }) => ({
      burn: Number(baselineStatuses?.burn) || 0,
    }),
    special: "double-burn-and-trigger",
  },
  天火: {
    inputs: [booleanInput("negativeStatusCounterDefense", "应对防御")],
    resolve: (context) => ({ burn: context.negativeStatusCounterDefense ? 30 : 10 }),
  },
  火焰护盾: {
    inputs: [booleanInput("negativeStatusCounterAttack", "应对攻击")],
    resolve: (context) => ({ burn: context.negativeStatusCounterAttack ? 6 : 0 }),
  },
  炙热波动: { resolve: (context) => ({ burn: context.counterTriggered ? 8 : 4 }) },
  烈焰风暴: { stacks: { burn: 6 } },
  焚烧烙印: {
    inputs: [numberInput("dispelledMarkStacks", "驱散印记层数")],
    resolve: (context) => ({ burn: (Number(context.dispelledMarkStacks) || 0) * 5 }),
  },
  花火: { stacks: { burn: 4 } },
  野火: { resolve: (context) => ({ burn: context.applyDefenseReduction ? 0 : 7 }) },
  暴风雪: { stacks: { freeze: 1 } },
  极寒领域: {
    inputs: [booleanInput("negativeStatusCounterState", "应对状态")],
    resolve: (context, { baselineStatuses }) => ({
      freeze: context.negativeStatusCounterState
        ? Number(baselineStatuses?.freeze) || 0
        : 0,
    }),
    special: "double-freeze-on-counter",
  },
  霜降: { stacks: { freeze: 4 } },
  霜天: { stacks: { freeze: 1 } },
  冰墙: {
    inputs: [booleanInput("negativeStatusCounterAttack", "应对攻击")],
    resolve: (context) => ({ freeze: context.negativeStatusCounterAttack ? 2 : 0 }),
  },
  滚雪球: { resolve: (context) => ({ freeze: context.counterTriggered ? 4 : 2 }) },
  冰点: {
    inputs: [booleanInput("negativeStatusCounterDefense", "应对防御")],
    resolve: (context) => ({ freeze: context.negativeStatusCounterDefense ? 10 : 5 }),
  },
  寒潮: {
    inputs: [booleanInput("negativeStatusCounterState", "应对状态")],
    resolve: (context) => ({ freeze: context.negativeStatusCounterState ? 5 : 1 }),
  },
  打喷嚏: { stacks: { freeze: 3 } },
  毒针: { stacks: { poison: 1 } },
  腐蚀酸液: { stacks: { poison: 2 } },
  连续毒针: { stacks: { poison: 2 } },
  毒囊: {
    inputs: [booleanInput("negativeStatusCounterState", "应对状态")],
    resolve: (context) => ({ poison: context.negativeStatusCounterState ? 6 : 2 }),
  },
  毒液渗透: { stacks: { poison: 1 } },
  毒孢子: { stacks: { poison: 5 } },
  毒雾: {
    inputs: [numberInput("convertedBuffStacks", "转化增益层数")],
    resolve: (context) => ({ poison: Number(context.convertedBuffStacks) || 0 }),
  },
  剧毒: {
    inputs: [booleanInput("negativeStatusCounterDefense", "应对防御")],
    resolve: (context) => ({ poison: context.negativeStatusCounterDefense ? 8 : 3 }),
  },
  重金属粉尘: { classification: "persistent-preparation" },
  捆缚: { stacks: { poison: 4 } },
};

const SKILL_READ_ONLY = [
  "冰冻光线", "碎冰冰", "冷凝", "感染病", "以毒攻毒", "鸩毒", "腐化",
  "疫病吐息", "不可接触", "过敏原",
];

const TRAIT_APPLICATIONS = {
  电子音乐: ({ context, skill }) =>
    context.weatherThunder && skill?.type === "电" ? { electrified: 1 } : {},
  生物碱: ({ skill }) => (skill?.type === "草" ? { poison: 2 } : {}),
  高浓生物碱: () => ({ poison: 2 }),
  灵魂灼伤: ({ skill }) =>
    skill?.type === "冰" ? { burn: 4 } : skill?.type === "火" ? { freeze: 2 } : {},
  毒腺: ({ skill }) => (Number(skill?.cost) <= 1 ? { poison: 4 } : {}),
  加个雪球: ({ stacks }) => (stacks.freeze > 0 ? { freeze: 2 } : {}),
  贪心算法: ({ skillIndex }) => (skillIndex === 0 ? { burn: 6 } : {}),
  爆裂玉米: ({ skill }) =>
    skill?.type === "草" ? { burn: 4 } : skill?.type === "火" ? { parasitism: 1 } : {},
  溶解扩散: ({ selectedSkills, skill }) =>
    skill?.type === "水"
      ? { poison: selectedSkills.filter((entry) => entry?.type === "毒").length }
      : {},
  溶解腐蚀: ({ selectedSkills, skill }) =>
    skill?.type === "水"
      ? { poison: selectedSkills.filter((entry) => entry?.type === "毒").length * 2 }
      : {},
  扩散侵蚀: ({ context, skill }) =>
    skill?.type === "水"
      ? { poison: (Number(context.targetPoisonMarkStacks) || 0) * 2 }
      : {},
};

const TRAIT_CLASSIFICATIONS = {
  电子音乐: "conditional-application",
  复方汤剂: "settlement-modifier",
  生物碱: "application",
  高浓生物碱: "application",
  溶解扩散: "conditional-application",
  溶解腐蚀: "conditional-application",
  下黑手: "switch-event",
  毒牙: "secondary-debuff",
  捉迷藏: "secondary-cost",
  抓到你了: "entry-and-secondary-cost",
  灵魂灼伤: "application",
  毒腺: "application",
  加个雪球: "application",
  耐活王: "healing-modifier",
  扩散侵蚀: "mark-dependent-application",
  蚀刻: "mark-conversion",
  仁心: "healing-modifier",
  侵蚀: "hit-count-modifier",
  茶多酚: "switch-immunity",
  吉利丁片: "switch-immunity",
  美拉德反应: "switch-immunity",
  月牙雪糕: "mark-application",
  煤渣草: "settlement-modifier",
  贪心算法: "application",
  大雪球: "multi-turn-application",
  焰色反应: "settlement-conversion",
  不死鸟: "lethal-event",
  爆裂玉米: "application",
};

export const NEGATIVE_STATUS_RULE_AUDIT = {
  skills: Object.fromEntries([
    ...Object.keys(SKILL_RULES).map((name) => [name, SKILL_RULES[name].classification ?? "application"]),
    ...SKILL_READ_ONLY.map((name) => [name, "read-only"]),
  ]),
  traits: TRAIT_CLASSIFICATIONS,
};

function addStacks(target, addition = {}) {
  for (const key of Object.keys(target)) {
    target[key] = Math.min(99, target[key] + Math.max(0, Math.floor(Number(addition[key]) || 0)));
  }
}

export function getNegativeStatusInputs(skill) {
  return SKILL_RULES[skill?.name]?.inputs ?? [];
}

export function hasNegativeStatusSkillApplication(skill) {
  const rule = SKILL_RULES[skill?.name];
  return Boolean(
    rule &&
      !["persistent-preparation", "weather"].includes(rule.classification),
  );
}

export function hasNegativeStatusTraitApplication(traitName) {
  return Boolean(TRAIT_APPLICATIONS[traitName]);
}

export function resolveNegativeStatusApplications({
  baselineStatuses = {},
  context = {},
  selectedSkills = [],
  skill,
  skillIndex = 0,
  traits = [],
} = {}) {
  const stacks = createNegativeStatusSide();
  const sources = [];
  const rule = SKILL_RULES[skill?.name];
  const skillStacks =
    rule?.resolve?.(context, { baselineStatuses, selectedSkills }) ??
    rule?.stacks ??
    {};
  addStacks(stacks, skillStacks);
  if (Object.values(skillStacks).some(Boolean)) {
    sources.push({ kind: "skill", name: skill.name, stacks: { ...skillStacks } });
  }
  for (const trait of traits) {
    const resolver = TRAIT_APPLICATIONS[trait?.name];
    if (!resolver) continue;
    const addition = resolver({
      baselineStatuses,
      context,
      selectedSkills,
      skill,
      skillIndex,
      stacks,
    });
    if (!Object.values(addition).some(Boolean)) continue;
    addStacks(stacks, addition);
    sources.push({ kind: "trait", name: trait.name, stacks: { ...addition } });
  }
  return { sources, special: rule?.special ?? null, stacks };
}

export function resolveNegativeStatusModifiers(traits = []) {
  const names = new Set(traits.map((trait) => trait?.name));
  return {
    burnGrows: names.has("煤渣草"),
    healFromBurn: names.has("仁心"),
    healFromPoison: names.has("耐活王"),
    poisonExtraTrigger: names.has("复方汤剂"),
  };
}
