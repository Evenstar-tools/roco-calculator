import { normalizeNatureId } from "../domain/natures.js";
import { getTraitView } from "../domain/calculator-view-model.js";
import { getSpiritSkillSlotCapacity, normalizeSkillSlots } from "../domain/skill-slot-capacity.js";
import { extractTraitValues, canonicalTraitControlKey } from "./trait-values.js";

export function presetConfigKey(config, snapshot) {
  const spirit = snapshot?.spirits?.find((item) => item.id === config.spiritId);
  const controls = new Map();
  for (const role of ["attacker", "defender"]) {
    for (const control of spirit ? getTraitView(snapshot, spirit, role)?.inputs ?? [] : []) {
      if (control.scope !== "battle") controls.set(canonicalTraitControlKey(control), control);
    }
  }
  const traits = extractTraitValues(config, snapshot);
  const slots = Array.isArray(config.skills) ? config.skills : config.skills?.four;
  return JSON.stringify([
    normalizeNatureId(config.natureId ?? config.nature),
    ["hp", "speed", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense"].map((key) => Number(config.displayIvs?.[key]) || 0),
    normalizeSkillSlots(slots, spirit ? getSpiritSkillSlotCapacity(snapshot, spirit.id) : slots?.length ?? 4).map((slot) => {
      const id = typeof slot === "string" ? slot : slot?.skillId ?? slot?.id ?? null;
      return slot?.overrides && Object.keys(slot.overrides).length ? [id, slot.overrides] : id;
    }),
    [...controls].sort(([a], [b]) => a.localeCompare(b)).map(([key, control]) => [key, traits[key] ?? control.defaultValue]),
  ]);
}
