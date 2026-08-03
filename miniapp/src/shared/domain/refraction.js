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
  水: { label: "水·能耗-1", status: "全技能能耗-1" },
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

export function resolveRefractionEffects({ selectedSkill, carriedSkills = [] }) {
  if (selectedSkill?.name !== "折射") return null;
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
    labels.push(effect.label);
    for (const [key, value] of Object.entries(effect.deltas ?? {})) {
      deltas[key] += Number(value) || 0;
    }
    for (const [key, value] of Object.entries(effect.operations ?? {})) {
      operations[key] = Number(operations[key] ?? 0) + Number(value ?? 0);
    }
    if (effect.status) statuses.push({ label: effect.status, type });
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

export function buildRefractionHint({ selectedSkill, carriedSkills = [] }) {
  const result = resolveRefractionEffects({ selectedSkill, carriedSkills });
  if (!result) return null;
  return result.summary
    ? `本次可得：${result.summary}`
    : "本次可得：需再携带其他系别技能";
}
