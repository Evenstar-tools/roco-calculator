const POSITIVE_MARKS = [
  {
    id: "wet",
    name: "湿润",
    summary: "技能能耗降低；本次伤害不变",
  },
  {
    id: "dragon-bite",
    name: "龙噬",
    summary: "3 能耗技能提升双攻；当前由能力配置结算",
  },
  {
    id: "momentum",
    name: "蓄势",
    summary: "每层攻击技能威力 +30%",
  },
  {
    id: "tailwind",
    name: "风起",
    summary: "先手时每层技能威力 +20%",
  },
  {
    id: "charge",
    name: "蓄电",
    summary: "迸发时每层技能威力 +10",
  },
  {
    id: "photosynthesis",
    name: "光合",
    summary: "回合结束回复能量；本次伤害不变",
  },
  {
    id: "attack",
    name: "攻击",
    summary: "每层技能威力 +10%",
  },
  {
    id: "sprout",
    name: "萌芽",
    summary: "当前伤害不变",
  },
];

const NEGATIVE_MARKS = [
  {
    id: "slow",
    name: "减速",
    summary: "每层速度 -10",
  },
  {
    id: "spirit-drop",
    name: "降灵",
    summary: "入场失去能量；本次伤害不变",
  },
  {
    id: "starfall",
    name: "星陨",
    summary: "非幻系攻击触发额外幻系伤害",
  },
  {
    id: "poison",
    name: "中毒",
    summary: "回合结束结算；本次技能不追加伤害",
  },
  {
    id: "thorn",
    name: "棘刺",
    summary: "入场时结算；本次技能不追加伤害",
  },
  {
    id: "undertow",
    name: "暗涌",
    summary: "当前伤害不变",
  },
];

export const MARK_DEFINITIONS = Object.freeze({
  negative: Object.freeze(NEGATIVE_MARKS),
  positive: Object.freeze(POSITIVE_MARKS),
});

const MARKS_BY_ID = new Map(
  [...POSITIVE_MARKS, ...NEGATIVE_MARKS].map((mark) => [mark.id, mark]),
);
const MARKS_BY_NAME = new Map(
  Object.entries(MARK_DEFINITIONS).flatMap(([polarity, marks]) =>
    marks.map((mark) => [mark.name, { ...mark, polarity }]),
  ),
);

export function resolveSkillMarkApplications(skill) {
  const description = String(skill?.description ?? "").replace(/\s+/g, "");
  if (!description) return [];
  const applications = [];
  const pattern = /(自己|敌方|对方)获得(\d+)层([^，。；：]+?)印记/g;
  for (const match of description.matchAll(pattern)) {
    const clauseStart = Math.max(
      description.lastIndexOf("。", match.index - 1),
      description.lastIndexOf("；", match.index - 1),
    ) + 1;
    const clausePrefix = description.slice(clauseStart, match.index);
    if (/(选择|随机|应对|若|每次|每使用|等于|偷取|驱散)/.test(clausePrefix)) {
      continue;
    }
    const mark = MARKS_BY_NAME.get(match[3]);
    if (!mark) continue;
    applications.push({
      id: mark.id,
      polarity: mark.polarity,
      stacks: Math.min(99, Math.max(1, Math.floor(Number(match[2]) || 1))),
      target: match[1] === "自己" ? "self" : "opponent",
    });
  }
  return applications;
}

export function createEmptyMarkSlot() {
  return { id: null, stacks: 0 };
}

export function createMarksState() {
  return {
    attacker: {
      negative: createEmptyMarkSlot(),
      positive: createEmptyMarkSlot(),
    },
    defender: {
      negative: createEmptyMarkSlot(),
      positive: createEmptyMarkSlot(),
    },
  };
}

export function normalizeMarkSlot(value, polarity) {
  const allowed = new Set(MARK_DEFINITIONS[polarity].map((mark) => mark.id));
  const id =
    typeof value?.id === "string" && allowed.has(value.id) ? value.id : null;
  const stacks = id
    ? Math.min(99, Math.max(0, Math.floor(Number(value?.stacks) || 0)))
    : 0;
  return { id, stacks };
}

export function normalizeMarksState(value, legacyDirections = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const marks = createMarksState();
    const forwardStacks = Math.max(
      0,
      Math.floor(Number(legacyDirections.forward?.starfallStacks) || 0),
    );
    const reverseStacks = Math.max(
      0,
      Math.floor(Number(legacyDirections.reverse?.starfallStacks) || 0),
    );
    if (forwardStacks > 0) {
      marks.defender.negative = {
        id: "starfall",
        stacks: Math.min(99, forwardStacks),
      };
    }
    if (reverseStacks > 0) {
      marks.attacker.negative = {
        id: "starfall",
        stacks: Math.min(99, reverseStacks),
      };
    }
    return marks;
  }

  return Object.fromEntries(
    ["attacker", "defender"].map((side) => [
      side,
      {
        negative: normalizeMarkSlot(value[side]?.negative, "negative"),
        positive: normalizeMarkSlot(value[side]?.positive, "positive"),
      },
    ]),
  );
}

export function markDefinition(id) {
  return MARKS_BY_ID.get(id) ?? null;
}

function isAttackSkill(skill) {
  return ["physical", "magical", "dual"].includes(skill?.category);
}

function settlement({ mark, side, stacks, status, text }) {
  return {
    markId: mark.id,
    name: mark.name,
    side,
    stacks,
    status,
    text,
  };
}

export function resolveSourceMarkEffects({
  marks,
  skill,
  side,
  attackerSpeed,
  defenderSpeed,
  actedBeforeEnemy,
  burstTriggered,
}) {
  const positive = normalizeMarkSlot(marks?.positive, "positive");
  const negative = normalizeMarkSlot(marks?.negative, "negative");
  const effects = {
    fixedPowerAdd: 0,
    hiddenPanelPowerPercentAdd: 0,
    powerPercentAdd: 0,
    speedPenalty: negative.id === "slow" ? negative.stacks * 10 : 0,
    settlements: [],
  };
  const attacking = isAttackSkill(skill);

  if (positive.id && positive.stacks > 0) {
    const mark = markDefinition(positive.id);
    if (positive.id === "tailwind") {
      const first =
        typeof actedBeforeEnemy === "boolean"
          ? actedBeforeEnemy
          : Number(attackerSpeed) - effects.speedPenalty > Number(defenderSpeed);
      if (first && attacking) {
        const powerPercentAdd = positive.stacks * 0.2;
        effects.powerPercentAdd += powerPercentAdd;
        effects.hiddenPanelPowerPercentAdd += powerPercentAdd;
        effects.settlements.push(
          settlement({
            mark,
            side,
            stacks: positive.stacks,
            status: "applied",
            text: `风起 ×${positive.stacks} 技能威力 +${positive.stacks * 20}%`,
          }),
        );
      } else {
        effects.settlements.push(
          settlement({
            mark,
            side,
            stacks: positive.stacks,
            status: "inactive",
            text: `风起 ×${positive.stacks} 未先手`,
          }),
        );
      }
    } else if (positive.id === "momentum" && attacking) {
      effects.powerPercentAdd += positive.stacks * 0.3;
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: positive.stacks,
          status: "applied",
          text: `蓄势 ×${positive.stacks} 技能威力 +${positive.stacks * 30}%`,
        }),
      );
    } else if (positive.id === "attack" && attacking) {
      effects.powerPercentAdd += positive.stacks * 0.1;
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: positive.stacks,
          status: "applied",
          text: `攻击 ×${positive.stacks} 技能威力 +${positive.stacks * 10}%`,
        }),
      );
    } else if (positive.id === "charge" && attacking && burstTriggered) {
      effects.fixedPowerAdd += positive.stacks * 10;
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: positive.stacks,
          status: "applied",
          text: `蓄电 ×${positive.stacks} 迸发威力 +${positive.stacks * 10}`,
        }),
      );
    } else if (positive.id === "charge") {
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: positive.stacks,
          status: "inactive",
          text: `蓄电 ×${positive.stacks} 未触发迸发`,
        }),
      );
    } else {
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: positive.stacks,
          status: "recorded",
          text: `${mark.name} ×${positive.stacks} 本次不参与伤害`,
        }),
      );
    }
  }

  if (negative.id && negative.stacks > 0) {
    const mark = markDefinition(negative.id);
    if (negative.id === "slow") {
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: negative.stacks,
          status: "applied",
          text: `减速 ×${negative.stacks} 速度 -${negative.stacks * 10}`,
        }),
      );
    } else if (negative.id !== "starfall") {
      effects.settlements.push(
        settlement({
          mark,
          side,
          stacks: negative.stacks,
          status: "recorded",
          text: `${mark.name} ×${negative.stacks} 本次不参与伤害`,
        }),
      );
    }
  }

  return effects;
}

export function targetNegativeMarkSettlement({
  markSlot,
  side,
  skill,
  additionalDamage,
}) {
  const mark = normalizeMarkSlot(markSlot, "negative");
  if (!mark.id || mark.stacks === 0) return null;
  const definition = markDefinition(mark.id);

  if (mark.id === "starfall") {
    const triggered = skill?.type !== "幻";
    return {
      ...settlement({
        mark: definition,
        side,
        stacks: mark.stacks,
        status: triggered ? "applied" : "inactive",
        text: triggered
          ? `星陨 ×${mark.stacks} +${additionalDamage} 伤害`
          : `星陨 ×${mark.stacks} 幻系不触发`,
      }),
      damage: triggered ? additionalDamage : 0,
    };
  }

  return settlement({
    mark: definition,
    side,
    stacks: mark.stacks,
    status: "recorded",
    text: `${definition.name} ×${mark.stacks} 本次不参与伤害`,
  });
}
