function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

export function getLegalSkillIds(snapshot, spiritId) {
  return [...new Set([
    ...(snapshot.learnsets?.find(
      (learnset) => learnset.spiritId === spiritId,
    )?.skillIds ?? []),
  ])];
}

export function getSkillChoices(snapshot, spiritId) {
  const legalIds = getLegalSkillIds(snapshot, spiritId);
  const legalSet = new Set(legalIds);
  const byId = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const legal = legalIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((skill) => ({ ...skill, learnable: true }));
  const other = [...byId.values()]
    .filter((skill) => !legalSet.has(skill.id))
    .map((skill) => ({ ...skill, learnable: false }));
  return [...legal, ...other];
}

export function chooseDefaultSkillIds(snapshot, spiritId) {
  const legalIds = getLegalSkillIds(snapshot, spiritId);
  const byId = new Map(
    (snapshot.skills ?? []).map((skill) => [skill.id, skill]),
  );
  const legal = legalIds.map((id) => byId.get(id)).filter(Boolean);
  const damaging = legal.filter(
    (skill) =>
      Number.isFinite(skill.basePower) &&
      skill.basePower > 0 &&
      (skill.category === "physical" || skill.category === "magical"),
  );
  const preferredNames = ["风力冲击", "威力冲击", "当头棒喝"];
  const preferred = preferredNames
    .map((name) => damaging.find((skill) => skill.name === name))
    .find(Boolean);
  const ordered = [preferred, ...damaging, ...legal].filter(Boolean);
  const chosen = [
    ...new Map(ordered.map((skill) => [skill.id, skill])).values(),
  ]
    .slice(0, 4)
    .map((skill) => skill.id);
  while (chosen.length < 4) chosen.push(null);
  return chosen;
}

export function reconcileSkillLoadout(currentSkills, legalSkillIds) {
  const legal = [...new Set(legalSkillIds.filter(Boolean))];
  const legalSet = new Set(legal);
  const used = new Set();
  const currentFour = Array.from(
    { length: 4 },
    (_, index) => currentSkills?.four?.[index] ?? null,
  );

  for (const entry of currentFour) {
    const id = entryId(entry);
    if (id && legalSet.has(id)) used.add(id);
  }

  const replacements = legal.filter((id) => !used.has(id));
  const four = currentFour.map((entry) => {
    const id = entryId(entry);
    if (id && legalSet.has(id)) return entry;
    return replacements.shift() ?? null;
  });
  const currentSingleId = entryId(currentSkills?.single);
  const single =
    currentSingleId && legalSet.has(currentSingleId)
      ? currentSkills.single
      : four.find((entry) => entryId(entry)) ?? null;

  return { four, single };
}
