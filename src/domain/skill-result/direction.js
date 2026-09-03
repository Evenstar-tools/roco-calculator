import { buildChoiceSkillSequence } from "../choice-skill-sequence.js";
import {
  hasClownTrickTrait,
  resolveClownTrickDamage,
} from "../clown-trick.js";
import { resolveBloodlineMagicHealing } from "../bloodline-magic.js";
import { findDirectTraitDamageRule } from "../trait-damage.js";
import {
  galeTurbineCompanionIndex,
  isDamageSkill,
  isGaleTurbine,
  resolveWingExtensionSkill,
} from "../wing-extension.js";
import { calculateSkillResult } from "./calculate-skill-result.js";
import { calculateDirectTraitDamageResult } from "./direct-trait-damage.js";
import {
  entryDetails,
  isAdjacentPowerSkill,
  pressureValveFixedPowerAdds,
  resolveEmbeddedDamageSkill,
  resolveSkillEntity,
  skillEntriesForMode,
} from "./loadout.js";
import { finiteNumber } from "./numeric.js";
import {
  choiceTraitName,
  emptySlotResult,
  entryWithContext,
  formulaStep,
  mergeChoiceTraitResults,
  mergeGaleTurbineResults,
} from "./results.js";

export function calculateDirection({
  snapshot,
  mode,
  direction,
  attackerSide,
  attacker,
  attackerCurrentHp,
  attackerHpPercent,
  defender,
  defenderCurrentHp,
  defenderHpPercent,
  skillsById,
  level,
  sourceMarks,
  sourceSide,
  targetMarks,
  targetSide,
}) {
  const entries = skillEntriesForMode(attackerSide, mode);
  const pressureValveAdds = mode === "four"
    ? pressureValveFixedPowerAdds(entries, skillsById)
    : {};
  const existingFixedPowerAdds = direction.overrides?.fixedPowerAddsBySlot ?? {};
  const directionWithPressureValve = Object.keys(pressureValveAdds).length > 0
    ? {
        ...direction,
        overrides: {
          ...direction.overrides,
          fixedPowerAddsBySlot: Object.fromEntries(
            [...new Set([
              ...Object.keys(existingFixedPowerAdds),
              ...Object.keys(pressureValveAdds),
            ])].map((skillPosition) => [
              skillPosition,
              (Number(existingFixedPowerAdds[skillPosition]) || 0) +
                (Number(pressureValveAdds[skillPosition]) || 0),
            ]),
          ),
        },
      }
    : direction;
  const traitName = choiceTraitName(attacker);
  const currentHp = Math.min(
    defender.panelStats.hp,
    Math.max(
      0,
      finiteNumber(
        defenderCurrentHp,
        defender.currentHp,
        defender.panelStats.hp,
      ) ?? 0,
    ),
  );
  const preliminaryResults = entries.map((entry, index) => {
    const skill = resolveEmbeddedDamageSkill(
      resolveWingExtensionSkill({
        skill: resolveSkillEntity(entry, skillsById),
        traits: attacker.traits,
      }),
    );
    const details = entryDetails(entry);
    const sequence = buildChoiceSkillSequence({
      context: details.context,
      skill,
      sproutStacks:
        sourceMarks?.positive?.id === "sprout"
          ? sourceMarks.positive.stacks
          : 0,
      traitName,
    });
    const executions =
      mode === "four" &&
      skill &&
      skill.category !== "status" &&
      skill.category !== "defense"
        ? sequence.executions
        : [{ context: details.context }];
    const passResults = executions.map((execution) =>
      calculateSkillResult({
        snapshot,
        mode,
        skill,
        entry: entryWithContext(entry, execution.context),
        direction: directionWithPressureValve,
        attacker,
        attackerCurrentHp,
        attackerHpPercent,
        defender,
        defenderCurrentHp,
        defenderHpPercent,
        level,
        skillPosition: mode === "four" ? index + 1 : undefined,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
      }),
    );
    const companionIndex =
      mode === "four" && isGaleTurbine(skill)
        ? galeTurbineCompanionIndex(details.context, entries.length)
        : null;
    const companionEntry =
      companionIndex !== null && companionIndex !== index
        ? entries[companionIndex]
        : null;
    const companionSkill = resolveWingExtensionSkill({
      skill: resolveSkillEntity(companionEntry, skillsById),
      traits: attacker.traits,
    });
    if (
      companionIndex !== null &&
      companionSkill?.type === "翼" &&
      isDamageSkill(companionSkill)
    ) {
      const companionResult = calculateSkillResult({
        snapshot,
        mode,
        skill: companionSkill,
        entry: companionEntry,
        direction: directionWithPressureValve,
        attacker,
        attackerCurrentHp,
        attackerHpPercent,
        defender,
        defenderCurrentHp,
        defenderHpPercent,
        level,
        skillPosition: companionIndex + 1,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
      });
      return mergeGaleTurbineResults({
        companionResult,
        currentHp,
        defender,
        turbineResult: passResults[0],
      });
    }
    return passResults.length > 1
      ? mergeChoiceTraitResults(
          passResults,
          traitName,
          defender,
          currentHp,
          executions,
        )
      : passResults[0];
  });
  const calculatedResults = preliminaryResults.map((result, index) => {
    const entry = entries[index];
    const skill = resolveEmbeddedDamageSkill(
      resolveWingExtensionSkill({
        skill: resolveSkillEntity(entry, skillsById),
        traits: attacker.traits,
      }),
    );
    if (mode !== "four" || !isAdjacentPowerSkill(skill)) return result;

    const adjacent = (adjacentIndex) => {
      if (adjacentIndex < 0 || adjacentIndex >= entries.length) return null;
      const adjacentEntry = entries[adjacentIndex];
      const adjacentSkill = resolveEmbeddedDamageSkill(
        resolveWingExtensionSkill({
          skill: resolveSkillEntity(adjacentEntry, skillsById),
          traits: attacker.traits,
        }),
      );
      if (!adjacentSkill) return { name: "空技能槽", power: 0 };
      if (adjacentSkill.category === "status" || adjacentSkill.category === "defense") {
        return { name: adjacentSkill.name, power: 0 };
      }
      if (isAdjacentPowerSkill(adjacentSkill)) return null;
      const adjacentResult = preliminaryResults[adjacentIndex];
      if (
        adjacentResult?.status !== "exact" ||
        !Number.isFinite(Number(adjacentResult.effectivePower))
      ) return null;
      return {
        name: adjacentSkill.name,
        power: Number(adjacentResult.effectivePower),
      };
    };

    const fourSlotIndex = (offset) =>
      index < 4 && entries.length >= 4
        ? (index + offset + 4) % 4
        : index + offset;
    const left = adjacent(fourSlotIndex(-1));
    const right = adjacent(fourSlotIndex(1));
    const details = entryDetails(entry);
    return calculateSkillResult({
      snapshot,
      mode,
      skill,
      entry: entryWithContext(entry, {
        ...details.context,
        ...(left
          ? {
              adjacentLeftDisplayedPower: left.power,
              adjacentLeftSkillName: left.name,
            }
          : {}),
        ...(right
          ? {
              adjacentRightDisplayedPower: right.power,
              adjacentRightSkillName: right.name,
            }
          : {}),
      }),
      direction: directionWithPressureValve,
      attacker,
      attackerCurrentHp,
      attackerHpPercent,
      defender,
      defenderCurrentHp,
      defenderHpPercent,
      level,
      skillPosition: index + 1,
      sourceMarks,
      sourceSide,
      targetMarks,
      targetSide,
    });
  });
  const results = calculatedResults;
  const selectedIndex =
    mode === "four"
      ? Math.min(
          results.length - 1,
          Math.max(0, Math.floor(Number(direction.selectedSkillIndex) || 0)),
        )
      : 0;
  const traitResult =
    mode === "four"
      ? calculateDirectTraitDamageResult({
          attacker,
          defender,
          direction,
          level,
          rule: findDirectTraitDamageRule(attacker.traits),
        })
      : null;
  const bloodlineMagicHealing = resolveBloodlineMagicHealing({
    context: direction.context,
    maximumHp: attacker.panelStats.hp,
  });
  const bloodlineSettlement =
    bloodlineMagicHealing.active && hasClownTrickTrait(attacker.traits)
      ? resolveClownTrickDamage({
          attackerTraits: attacker.traits,
          attackerCurrentHp,
          attackerMaximumHp: attacker.panelStats.hp,
          context: direction.context,
          externalHealingSources: [
            {
              amount: bloodlineMagicHealing.healing,
              label: bloodlineMagicHealing.sourceLabel,
            },
          ],
          mainDamage: 0,
          persistentLifestealPercent: 0,
          skill: null,
        })
      : null;
  const bloodlineResult = bloodlineSettlement?.active
    ? {
        additionalDamage: 0,
        combatPanel: results.find((result) => result?.combatPanel)?.combatPanel,
        effectivePower: 0,
        formulaSteps: [
          formulaStep(
            "血脉魔法回复",
            `${attacker.panelStats.hp} × 15%（立即）`,
            bloodlineMagicHealing.healing,
            bloodlineMagicHealing.healing,
            "bloodline-magic:photosynthetic-healing-v2",
          ),
          formulaStep(
            "血脉魔法后续回复",
            {
              maximumHp: attacker.panelStats.hp,
              percent: 15,
              ticks: bloodlineMagicHealing.endTurnTicks,
            },
            bloodlineMagicHealing.endTurnHealing,
            bloodlineMagicHealing.endTurnHealing * bloodlineMagicHealing.endTurnTicks,
            "bloodline-magic:photosynthetic-healing-v2",
          ),
          formulaStep(
            "戏耍特性伤害",
            {
              actualHealing: bloodlineSettlement.actualHealing,
              missingHp: bloodlineSettlement.missingHp,
              requestedHealing: bloodlineSettlement.requestedHealing,
            },
            bloodlineSettlement.requestedHealing,
            bloodlineSettlement.damage,
            "reviewed-trait:clown-trick-v1",
          ),
        ],
        hitCount: 1,
        hpPercent:
          defender.panelStats.hp > 0
            ? (bloodlineSettlement.damage / defender.panelStats.hp) * 100
            : 0,
        lethal: currentHp <= bloodlineSettlement.damage,
        mainDamage: 0,
        skillId: "bloodline:photosynthetic-healing",
        skillName: "戏耍·光合治愈",
        skillPower: 0,
        sourceKind: "bloodline",
        sources: [
          "bloodline-magic:photosynthetic-healing-v2",
          "reviewed-trait:clown-trick-v1",
        ],
        status: "exact",
        totalDamage: bloodlineSettlement.damage,
        traitDamage: bloodlineSettlement.damage,
        traitSettlements: bloodlineSettlement.settlement
          ? [bloodlineSettlement.settlement]
          : [],
        typeLabel: "无·血脉",
        typeMultiplier: 1,
        warnings: [],
      }
    : null;
  const selectedResult =
    direction.selectedDamageSource === "trait" && traitResult
      ? traitResult
      : direction.selectedDamageSource === "bloodline" && bloodlineResult
        ? bloodlineResult
        : results[selectedIndex] ?? emptySlotResult();

  return {
    bloodlineResult,
    results,
    selectedResult,
    traitResult,
  };
}

export function selectedAttackForCounter({ direction, directionResult, side, skillsById }) {
  const index = Math.max(
    0,
    Math.floor(Number(direction?.selectedSkillIndex) || 0),
  );
  const entry = side?.skills?.four?.[index];
  const skill = resolveSkillEntity(entry, skillsById);
  const result = directionResult?.results?.[index];
  if (
    !skill ||
    !["physical", "magical", "dual"].includes(skill.category) ||
    result?.status !== "exact" ||
    !Number.isFinite(result.panelPower)
  ) return null;
  return { result, skill };
}

export function withListenBridgeCounters({
  snapshot,
  direction,
  directionResult,
  ownerSide,
  owner,
  ownerCurrentHp,
  ownerHpPercent,
  opponent,
  opponentCurrentHp,
  opponentHpPercent,
  sourceAttack,
  skillsById,
  level,
  sourceMarks,
  sourceSide,
  targetMarks,
  targetSide,
}) {
  if (!sourceAttack || !ownerSide?.skills?.four) return directionResult;
  let changed = false;
  const results = directionResult.results.map((result, index) => {
    const entry = ownerSide.skills.four[index];
    const skill = resolveSkillEntity(entry, skillsById);
    if (skill?.name !== "听桥") return result;
    changed = true;
    const reflectedResult = calculateSkillResult({
        snapshot,
        mode: "four",
        skill: {
          ...skill,
          basePower: sourceAttack.result.panelPower,
          category: "physical",
          type: "武",
        },
        entry: {
          skillId: skill.id,
          hitCount: 1,
          context: {},
          overrides: {},
        },
        direction,
        attacker: owner,
        attackerCurrentHp: ownerCurrentHp,
        attackerHpPercent: ownerHpPercent,
        defender: opponent,
        defenderCurrentHp: opponentCurrentHp,
        defenderHpPercent: opponentHpPercent,
        level,
        skillPosition: index + 1,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
        lockedPower: sourceAttack.result.panelPower,
      });
    return {
      ...reflectedResult,
      reflectedPower: sourceAttack.result.panelPower,
      reflectedSourceSkillId: sourceAttack.skill.id,
      reflectedSourceSkillName: sourceAttack.skill.name,
    };
  });
  if (!changed) return directionResult;
  const selectedIndex = Math.min(
    results.length - 1,
    Math.max(0, Math.floor(Number(direction.selectedSkillIndex) || 0)),
  );
  return {
    ...directionResult,
    results,
    selectedResult:
      direction.selectedDamageSource === "trait" && directionResult.traitResult
        ? directionResult.traitResult
        : direction.selectedDamageSource === "bloodline" &&
            directionResult.bloodlineResult
          ? directionResult.bloodlineResult
          : results[selectedIndex] ?? emptySlotResult(),
  };
}
