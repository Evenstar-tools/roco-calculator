const DIRECT_TRAIT_DAMAGE_RULES = Object.freeze({
  刺肤: Object.freeze({
    basePower: 50,
    category: "physical",
    id: "direct-trait-damage:skin-spikes",
    name: "刺肤",
    typeLabel: "无·特性",
  }),
});

function traitName(trait) {
  return trait?.displayName ?? trait?.name ?? null;
}

export function getDirectTraitDamageRule(trait) {
  return DIRECT_TRAIT_DAMAGE_RULES[traitName(trait)] ?? null;
}

export function findDirectTraitDamageRule(traits = []) {
  for (const trait of traits) {
    const rule = getDirectTraitDamageRule(trait);
    if (rule) return rule;
  }
  return null;
}
