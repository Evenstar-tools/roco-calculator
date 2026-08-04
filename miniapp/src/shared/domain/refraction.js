const EFFECTS = Object.freeze({
  地: {
    deltas: { targetHitCountAdd: -2, targetSpeedFlat: -40 },
    label: "地·敌速-40/连击-2",
  },
  普通: { deltas: { ownFixedPower: 10 }, label: "普·威力+10" },
  机械: { deltas: { ownDefense: 3 }, label: "机·双防+3层" },
  草: { label: "草·回复15%", operations: { healPercent: 15 } },
  火: { label: "火·敌灼烧+4", status: "敌方灼烧+4" },
  冰: { label: "冰·敌冰冻+2", status: "敌方冰冻+2" },
  毒: { label: "毒·敌中毒+2", status: "敌方中毒+2" },
  虫: { deltas: { targetDefense: -4 }, label: "虫·敌双防-4层" },
  龙: { deltas: { targetDefense: -4 }, label: "龙·敌双防-4层" },
  翼: { deltas: { ownHitCountAdd: 1 }, label: "翼·连击+1" },
  水: {
    label: "水·能耗-1",
    operations: { refractionEnergyCostReduction: 1 },
    status: "全技能能耗-1",
  },
  武: { deltas: { ownAttack: 3 }, label: "武·双攻+3层" },
  光: { deltas: { ownAttack: 3 }, label: "光·双攻+3层" },
  幻: { label: "幻·敌星陨+1", operations: { targetStarfallStacks: 1 } },
  幽: { label: "幽·敌能量-2", status: "敌方能量-2" },
  恶: { label: "恶·吸血+30%", status: "吸血+30%" },
  电: { deltas: { ownSpeedFlat: 20 }, label: "电·速度+20" },
  萌: { deltas: { targetAttack: -3 }, label: "萌·敌双攻-3层" },
});

const DELTA_KEYS = [
  "ownAttack",
  "ownDefense",
  "ownFixedPower",
  "ownHitCountAdd",
  "ownSpeedFlat",
  "targetAttack",
  "targetDefense",
  "targetFixedPower",
  "targetHitCountAdd",
  "targetSpeedFlat",
];

function emptyDeltas() {
  return Object.fromEntries(DELTA_KEYS.map((key) => [key, 0]));
}

const SPROUT_DELTA_STEPS = Object.freeze({
  ownAttack: 1,
  ownDefense: 1,
  ownFixedPower: 10,
  ownHitCountAdd: 1,
  ownSpeedFlat: 10,
});

function normalizedSproutStacks(value) {
  return Math.min(99, Math.max(0, Math.floor(Number(value) || 0)));
}

function effectDeltasWithSprout(deltas = {}, sproutStacks = 0) {
  return Object.fromEntries(
    Object.entries(deltas).map(([key, value]) => [
      key,
      Number(value) > 0 && SPROUT_DELTA_STEPS[key]
        ? Number(value) + SPROUT_DELTA_STEPS[key] * sproutStacks
        : Number(value) || 0,
    ]),
  );
}

function effectLabel(type, effect, deltas, operations) {
  if (type === "普通") return `普·威力+${deltas.ownFixedPower}`;
  if (type === "机械") return `机·双防+${deltas.ownDefense}层`;
  if (type === "翼") return `翼·连击+${deltas.ownHitCountAdd}`;
  if (type === "水") return `水·能耗-${operations.refractionEnergyCostReduction}`;
  if (type === "武") return `武·双攻+${deltas.ownAttack}层`;
  if (type === "光") return `光·双攻+${deltas.ownAttack}层`;
  if (type === "电") return `电·速度+${deltas.ownSpeedFlat}`;
  return effect.label;
}

export function resolveRefractionEffects({
  selectedSkill,
  carriedSkills = [],
  sproutStacks = 0,
}) {
  if (selectedSkill?.name !== "折射") return null;
  const normalizedStacks = normalizedSproutStacks(sproutStacks);
  const types = [];
  const seen = new Set();
  for (const skill of carriedSkills) {
    if (!skill?.type || skill.name === "折射" || !EFFECTS[skill.type]) continue;
    if (seen.has(skill.type)) continue;
    seen.add(skill.type);
    types.push(skill.type);
  }

  const deltas = emptyDeltas();
  const operations = { refractionTypes: [...types] };
  const statuses = [];
  const labels = [];
  for (const type of types) {
    const effect = EFFECTS[type];
    const scaledDeltas = effectDeltasWithSprout(
      effect.deltas,
      normalizedStacks,
    );
    const scaledOperations = { ...(effect.operations ?? {}) };
    if (Number(scaledOperations.refractionEnergyCostReduction) > 0) {
      scaledOperations.refractionEnergyCostReduction += normalizedStacks;
    }
    labels.push(effectLabel(type, effect, scaledDeltas, scaledOperations));
    for (const [key, value] of Object.entries(scaledDeltas)) {
      deltas[key] += Number(value) || 0;
    }
    for (const [key, value] of Object.entries(scaledOperations)) {
      operations[key] = Number(operations[key] ?? 0) + Number(value ?? 0);
    }
    if (effect.status) {
      statuses.push({
        label: type === "水"
          ? `全技能能耗-${scaledOperations.refractionEnergyCostReduction}`
          : effect.status,
        type,
      });
    }
  }
  if (statuses.length > 0) operations.refractionStatuses = statuses;
  return {
    deltas,
    operations,
    statuses,
    summary: labels.join("　"),
    types,
  };
}

export function buildRefractionHint({
  selectedSkill,
  carriedSkills = [],
  sproutStacks = 0,
}) {
  const result = resolveRefractionEffects({
    selectedSkill,
    carriedSkills,
    sproutStacks,
  });
  if (!result) return null;
  return result.summary
    ? `本次可得：${result.summary}`
    : "本次可得：需再携带其他系别技能";
}
