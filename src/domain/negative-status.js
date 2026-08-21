import { getTypeMultiplier } from "./type-chart.js";

export const NEGATIVE_STATUS_KEYS = [
  "burn",
  "freeze",
  "parasitism",
  "poison",
  "electrified",
];

export const NEGATIVE_STATUS_DEFINITIONS = {
  burn: { label: "灼烧", type: "火" },
  freeze: { label: "冻结", type: "冰" },
  parasitism: { label: "寄生", type: "草" },
  poison: { label: "中毒", type: "毒" },
  electrified: { label: "引电", type: "电" },
};

export function createNegativeStatusSide() {
  return { burn: 0, electrified: 0, freeze: 0, parasitism: 0, poison: 0 };
}

export function createNegativeStatusState() {
  return {
    attacker: createNegativeStatusSide(),
    defender: createNegativeStatusSide(),
  };
}

export function normalizeNegativeStatusSide(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    NEGATIVE_STATUS_KEYS.map((key) => [
      key,
      Math.min(
        key === "electrified" ? 2 : 99,
        Math.max(0, Math.floor(Number(source[key]) || 0)),
      ),
    ]),
  );
}

export function normalizeNegativeStatusState(value) {
  return {
    attacker: normalizeNegativeStatusSide(value?.attacker),
    defender: normalizeNegativeStatusSide(value?.defender),
  };
}

function hasType(types, type) {
  return Array.isArray(types) && types.includes(type);
}

function statusMultiplier(type, defenderTypes, chart) {
  if (!chart) return 1;
  const value = getTypeMultiplier(type, defenderTypes, chart);
  return Number.isFinite(value) ? value : 1;
}

function buildDamageEntry({
  damage,
  healing = 0,
  id,
  immune = false,
  multiplier = 1,
  stacks,
  triggerCount = 1,
}) {
  return {
    damage: Math.max(0, Math.floor(Number(damage) || 0)),
    healing: Math.max(0, Math.floor(Number(healing) || 0)),
    id,
    immune,
    label: NEGATIVE_STATUS_DEFINITIONS[id].label,
    multiplier,
    stacks,
    triggerCount,
  };
}

export function calculateNegativeStatusSettlement({
  applications = {},
  attacker = null,
  defender,
  directDamage = 0,
  enabled = false,
  modifiers = {},
  statuses = {},
  thunderWeather = false,
  typeChart = null,
} = {}) {
  if (!enabled) return null;
  const current = normalizeNegativeStatusSide(statuses);
  const added = normalizeNegativeStatusSide(applications);
  const stacks = Object.fromEntries(
    NEGATIVE_STATUS_KEYS.map((key) => [key, Math.min(99, current[key] + added[key])]),
  );
  if (thunderWeather) stacks.electrified = Math.min(99, stacks.electrified + 1);
  const maxHp = Math.max(1, Math.floor(Number(defender?.maxHp) || 1));
  const currentHp = Math.min(
    maxHp,
    Math.max(0, Math.floor(Number(defender?.currentHp) || 0)),
  );
  const direct = Math.max(0, Math.floor(Number(directDamage) || 0));
  const directHpLoss = Math.min(currentHp, direct);
  const remainingAfterDirect = Math.max(0, currentHp - directHpLoss);

  if (remainingAfterDirect === 0) {
    return {
      added,
      breakdown: [],
      combinedHpLoss: directHpLoss,
      directDamage: direct,
      freeze: null,
      lethal: true,
      outcome: "技能直接击倒",
      remainingHp: 0,
      skipped: "direct-ko",
      stacks,
      statusDamage: 0,
      actualStatusDamage: 0,
      maxHp,
    };
  }

  const types = defender?.types ?? [];
  const burnImmune = hasType(types, "火");
  const poisonImmune = hasType(types, "毒") || hasType(types, "机械");
  const parasiteImmune = hasType(types, "草");
  const freezeImmune = hasType(types, "冰");
  const electrifiedImmune = hasType(types, "电");
  const burnMultiplier = burnImmune
    ? 0
    : statusMultiplier("火", types, typeChart);
  const poisonMultiplier = poisonImmune
    ? 0
    : statusMultiplier("毒", types, typeChart);
  const burnTriggerCount = 1 + Math.max(
    0,
    Math.floor(Number(modifiers.burnImmediateTriggers) || 0),
  );
  const burnDamage = Math.floor(
    Math.min(maxHp, 1000) * stacks.burn * 0.02 * burnMultiplier,
  ) * burnTriggerCount;
  const poisonTriggerCount = modifiers.poisonExtraTrigger ? 2 : 1;
  const poisonDamage = Math.floor(
    maxHp * stacks.poison * 0.03 * poisonMultiplier,
  ) * poisonTriggerCount;
  const parasitismDamage = parasiteImmune
    ? 0
    : Math.floor(maxHp * stacks.parasitism * 0.02);
  const electrifiedTriggerCount = electrifiedImmune
    ? 0
    : Math.floor(stacks.electrified / 2);
  const electrifiedMultiplier = electrifiedImmune
    ? 0
    : statusMultiplier("电", types, typeChart);
  const electrifiedDamage = Math.floor(
    maxHp * 0.25 * electrifiedMultiplier,
  ) * electrifiedTriggerCount;
  const attackerMaxHp = Math.max(0, Math.floor(Number(attacker?.maxHp) || 0));
  const attackerCurrentHp = Math.min(
    attackerMaxHp,
    Math.max(0, Math.floor(Number(attacker?.currentHp) || 0)),
  );
  const parasiteHealing = Math.min(
    parasitismDamage,
    Math.max(0, attackerMaxHp - attackerCurrentHp),
  );
  const requestedTraitHealing =
    (modifiers.healFromBurn ? burnDamage : 0) +
    (modifiers.healFromPoison ? poisonDamage : 0);
  const remainingHealingCapacity = Math.max(
    0,
    attackerMaxHp - attackerCurrentHp - parasiteHealing,
  );
  const traitHealing = Math.min(requestedTraitHealing, remainingHealingCapacity);
  const totalHealing = parasiteHealing + traitHealing;
  const breakdown = [
    buildDamageEntry({
      damage: burnDamage,
      id: "burn",
      immune: burnImmune,
      multiplier: burnMultiplier,
      stacks: stacks.burn,
      triggerCount: burnTriggerCount,
    }),
    buildDamageEntry({
      damage: poisonDamage,
      id: "poison",
      immune: poisonImmune,
      multiplier: poisonMultiplier,
      stacks: stacks.poison,
    }),
    buildDamageEntry({
      damage: parasitismDamage,
      healing: parasiteHealing,
      id: "parasitism",
      immune: parasiteImmune,
      stacks: stacks.parasitism,
    }),
  ];
  if (stacks.electrified > 0) {
    breakdown.push({
      ...buildDamageEntry({
        damage: electrifiedDamage,
        id: "electrified",
        immune: electrifiedImmune,
        multiplier: electrifiedMultiplier,
        stacks: stacks.electrified,
        triggerCount: electrifiedTriggerCount,
      }),
      triggered: electrifiedTriggerCount > 0,
    });
  }
  const statusDamage = breakdown.reduce((sum, entry) => sum + entry.damage, 0);
  const actualStatusDamage = Math.min(remainingAfterDirect, statusDamage);
  const remainingHp = Math.max(0, remainingAfterDirect - actualStatusDamage);
  const thresholdPercent = freezeImmune ? 0 : Math.min(100, stacks.freeze * 5);
  const thresholdHp = Math.floor(maxHp * thresholdPercent / 100);
  const freezeLethal = thresholdHp > 0 && remainingHp <= thresholdHp;
  const lethal = remainingHp === 0 || freezeLethal;

  return {
    added,
    breakdown,
    combinedHpLoss: directHpLoss + actualStatusDamage,
    directDamage: direct,
    freeze: {
      immune: freezeImmune,
      label: "冻结",
      lethal: freezeLethal,
      stacks: stacks.freeze,
      thresholdHp,
      thresholdPercent,
    },
    lethal,
    nextStacks: {
      ...stacks,
      burn: modifiers.burnGrows
        ? Math.min(99, stacks.burn + Math.ceil(stacks.burn / 2))
        : Math.floor(stacks.burn / 2),
      electrified: electrifiedImmune ? 0 : stacks.electrified % 2,
    },
    outcome: freezeLethal
      ? "冻结斩杀"
      : remainingHp === 0
        ? "负面状态击倒"
        : `剩余 ${remainingHp} HP`,
    remainingHp,
    skipped: null,
    stacks,
    statusDamage,
    actualStatusDamage,
    maxHp,
    totalHealing,
    traitHealing,
  };
}

export function projectNegativeStatusTurns({
  applications = {},
  attacker = null,
  defender,
  directDamage = 0,
  enabled = false,
  modifiers = {},
  repeatApplications = applications,
  repeatDirectDamage = directDamage,
  statuses = {},
  thunderWeather = false,
  typeChart = null,
} = {}) {
  if (!enabled) return null;
  const shared = {
    attacker,
    enabled: true,
    modifiers,
    thunderWeather,
    typeChart,
  };
  const current = calculateNegativeStatusSettlement({
    ...shared,
    applications,
    defender,
    directDamage,
    statuses,
  });
  if (!current || current.skipped === "direct-ko") {
    return current ? { current, nextWithRepeat: null, nextWithoutRepeat: null } : null;
  }
  const nextDefender = {
    ...defender,
    currentHp: current.remainingHp,
  };
  const nextAttacker = attacker
    ? {
        ...attacker,
        currentHp: Math.min(
          Math.max(0, Number(attacker.maxHp) || 0),
          Math.max(0, Number(attacker.currentHp) || 0) +
            Math.max(0, Number(current.totalHealing) || 0),
        ),
      }
    : null;
  const nextShared = {
    ...shared,
    attacker: nextAttacker,
    defender: nextDefender,
    statuses: current.nextStacks,
  };
  const passiveModifiers = {
    ...modifiers,
    burnImmediateTriggers: 0,
  };
  return {
    current,
    nextWithoutRepeat: calculateNegativeStatusSettlement({
      ...nextShared,
      applications: {},
      directDamage: 0,
      modifiers: passiveModifiers,
    }),
    nextWithRepeat: calculateNegativeStatusSettlement({
      ...nextShared,
      applications: repeatApplications,
      directDamage: repeatDirectDamage,
    }),
  };
}
