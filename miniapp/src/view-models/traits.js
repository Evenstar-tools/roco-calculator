import { getTraitView } from "../shared/domain/calculator-view-model.js";
import { canonicalTraitControlKey } from "../shared/state/trait-values.js";
import { getSkill } from "./skills.js";

export function createTraitView(snapshot, side, role, ownerSide, skills = []) {
  const spirit = (snapshot?.spirits ?? []).find(
    (entry) => entry.id === side?.spiritId,
  );
  const trait = spirit ? getTraitView(snapshot, spirit, role, skills) : null;
  if (!trait) return null;
  return {
    ...trait,
    controls: trait.inputs.map((input) => ({
      ...input,
      canonicalKey: canonicalTraitControlKey(input),
    })),
    ownerSide,
  };
}

export function createDirectionTraitViews(snapshot, state, direction) {
  const attackerSide = direction === "reverse" ? "defender" : "attacker";
  const defenderSide = direction === "reverse" ? "attacker" : "defender";
  const carriedSkills = (side) => [
    ...(state.sides[side]?.skills?.four ?? []),
    state.sides[side]?.skills?.single,
  ]
    .map((entry) => getSkill(snapshot, entry))
    .filter((skill, index, values) =>
      skill && values.findIndex((candidate) => candidate?.id === skill.id) === index
    );
  return {
    attacker: createTraitView(
      snapshot,
      state.sides[attackerSide],
      "attacker",
      attackerSide,
      carriedSkills(attackerSide),
    ),
    defender: createTraitView(
      snapshot,
      state.sides[defenderSide],
      "defender",
      defenderSide,
      carriedSkills(defenderSide),
    ),
  };
}
