export const SKILL_CATEGORY_LABELS = Object.freeze({
  defense: "防御",
  magical: "魔法",
  physical: "物理",
  status: "变化",
});

const CATEGORY_ORDER = Object.freeze([
  "physical",
  "magical",
  "status",
  "defense",
]);
const KNOWN_CATEGORIES = new Set(CATEGORY_ORDER);

export function normalizeSkillQuery(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·（）()_\-/|]+/gu, "");
}

function skillSearchText(skill) {
  const power = Number(skill?.basePower);
  const cost = Number(skill?.cost);
  const type = skill?.type ?? "";
  return [
    skill?.searchText,
    skill?.name,
    type,
    type ? `${type}系` : "",
    SKILL_CATEGORY_LABELS[skill?.category] ?? skill?.category,
    Number.isFinite(power) && power > 0 ? `威力${power}` : "辅助",
    Number.isFinite(cost) ? `能量${cost}` : "",
  ]
    .filter(Boolean)
    .map(normalizeSkillQuery)
    .join("|");
}

export function buildSkillCategoryOptions(choices = []) {
  const browsableChoices = choices.filter(
    (skill) => skill?.pickerVisibility !== "search-only",
  );
  const counts = new Map(CATEGORY_ORDER.map((key) => [key, 0]));
  let otherCount = 0;
  for (const skill of browsableChoices) {
    if (KNOWN_CATEGORIES.has(skill?.category)) {
      counts.set(skill.category, counts.get(skill.category) + 1);
    } else {
      otherCount += 1;
    }
  }

  const options = [
    { count: browsableChoices.length, key: "all", label: "全部" },
    ...CATEGORY_ORDER
      .map((key) => ({
        count: counts.get(key),
        key,
        label: SKILL_CATEGORY_LABELS[key],
      }))
      .filter((option) => option.count > 0),
  ];
  if (otherCount > 0) {
    options.push({ count: otherCount, key: "other", label: "其他" });
  }
  return options;
}

export function filterSkillChoices(
  choices = [],
  { category = "all", query = "" } = {},
) {
  const needle = normalizeSkillQuery(query);
  return choices.filter((skill) => {
    if (skill?.pickerVisibility === "search-only" && !needle) {
      return false;
    }
    const categoryMatches =
      category === "all" ||
      skill?.category === category ||
      (category === "other" && !KNOWN_CATEGORIES.has(skill?.category));
    return categoryMatches &&
      (!needle || skillSearchText(skill).includes(needle));
  });
}
