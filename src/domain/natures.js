const PRIMARY_NATURES = [
  ["bold", "大胆", "physicalAttack", "physicalDefense"],
  ["adamant", "固执", "physicalAttack", "magicalAttack"],
  ["naughty", "调皮", "physicalAttack", "magicalDefense"],
  ["brave", "勇敢", "physicalAttack", "speed"],
  ["defiant", "逞强", "physicalAttack", "hp"],
  ["steady", "稳重", "physicalDefense", "physicalAttack"],
  ["naive", "天真", "physicalDefense", "magicalAttack"],
  ["lazy", "懒散", "physicalDefense", "magicalDefense"],
  ["relaxed", "悠闲", "physicalDefense", "speed"],
  ["frank", "坦率", "physicalDefense", "hp"],
  ["smart", "聪明", "magicalAttack", "physicalAttack"],
  ["focused", "专注", "magicalAttack", "physicalDefense"],
  ["paranoid", "偏执", "magicalAttack", "magicalDefense"],
  ["calm", "冷静", "magicalAttack", "speed"],
  ["rational", "理性", "magicalAttack", "hp"],
  ["vigilant", "警惕", "magicalDefense", "physicalAttack"],
  ["gentle", "温顺", "magicalDefense", "physicalDefense"],
  ["shy", "害羞", "magicalDefense", "magicalAttack"],
  ["cautious", "慎重", "magicalDefense", "speed"],
  ["anxious", "焦虑", "magicalDefense", "hp"],
  ["timid", "胆小", "speed", "physicalAttack"],
  ["hasty", "急躁", "speed", "physicalDefense"],
  ["cheerful", "开朗", "speed", "magicalAttack"],
  ["rash", "莽撞", "speed", "magicalDefense"],
  ["enthusiastic", "热情", "speed", "hp"],
  ["silent", "沉默", "hp", "physicalAttack"],
  ["melancholy", "忧郁", "hp", "physicalDefense"],
  ["peaceful", "平和", "hp", "magicalAttack"],
  ["careless", "粗心", "hp", "magicalDefense"],
  ["grounded", "踏实", "hp", "speed"],
];

export const STAT_LABELS = Object.freeze({
  hp: "生命",
  magicalAttack: "魔攻",
  magicalDefense: "魔防",
  physicalAttack: "物攻",
  physicalDefense: "物防",
  speed: "速度",
});

export const QUICK_STATS = Object.freeze([
  "hp",
  "physicalAttack",
  "magicalAttack",
  "speed",
  "physicalDefense",
  "magicalDefense",
]);

function createNature([id, name, upStat, downStat]) {
  return Object.freeze({
    downStat,
    id,
    multipliers: Object.freeze({
      [downStat]: 0.9,
      [upStat]: 1.2,
    }),
    name,
    upStat,
  });
}

const neutral = Object.freeze({
  downStat: null,
  id: "neutral",
  multipliers: Object.freeze({}),
  name: "普通",
  upStat: null,
});

export const NATURES = Object.freeze([
  neutral,
  ...PRIMARY_NATURES.map(createNature),
]);

const NATURE_BY_ID = new Map(NATURES.map((nature) => [nature.id, nature]));
const NATURE_BY_NAME = new Map(
  NATURES.map((nature) => [nature.name, nature.id]),
);

const LEGACY_IDS = new Map([
  ["普通（无修正）", "neutral"],
  ["固执（+物攻，-魔攻）", "adamant"],
  ["保守（+魔攻，-物攻）", "smart"],
  ["胆小（+速度，-物攻）", "timid"],
  ["勇敢（+物攻，-速度）", "brave"],
  ["淘气（+物防，-魔攻）", "naive"],
  ["慎重（+魔防，-魔攻）", "shy"],
]);

const QUICK_NATURE_IDS = Object.freeze({
  hp: "grounded",
  magicalAttack: "smart",
  magicalDefense: "shy",
  physicalAttack: "adamant",
  physicalDefense: "naive",
  speed: "timid",
});

export function normalizeNatureId(value) {
  if (NATURE_BY_ID.has(value)) return value;
  if (NATURE_BY_NAME.has(value)) return NATURE_BY_NAME.get(value);
  return LEGACY_IDS.get(value) ?? "neutral";
}

export function getNature(value) {
  return NATURE_BY_ID.get(normalizeNatureId(value)) ?? neutral;
}

export function getNatureMultipliers(value) {
  return getNature(value).multipliers;
}

export function getQuickNatureId(upStat) {
  return QUICK_NATURE_IDS[upStat] ?? "neutral";
}
