import { useMemo, useRef, useState } from "react";
import { buildBalanceComparison, buildBattleLevelComparison } from "./model.js";

// Trial values deliberately stay outside the saved/shared calculator session.
export function useBalanceComparison({ snapshot, state, activeDirection, serverId,
  spiritIndex, completeSpiritIds, favoriteSpiritIds }) {
  const [customStats, setCustomStats] = useState({});
  const [customEnabled, setCustomEnabled] = useState({});
  const [appliedPatches, setAppliedPatches] = useState({});
  const [hpInputModes, setHpInputModes] = useState({});
  const [hpBasis, setHpBasis] = useState({});
  const hpModeRef = useRef({});
  const comparison = useMemo(() => buildBalanceComparison({
    snapshot, state, activeDirection, serverId, spiritIndex, completeSpiritIds,
    favoriteSpiritIds, customStats, customEnabled,
    hpInputModes: Object.fromEntries(["forward", "reverse"].map((direction) => {
      const side = state.sides[direction === "forward" ? "defender" : "attacker"];
      const input = state.directions[direction];
      const basis = hpBasis[direction];
      const matches = basis && basis.hp === input.currentHp && basis.percent === input.context?.currentHpPercent &&
        basis.spiritId === side.spiritId && basis.formId === side.battleForm?.spiritId &&
        basis.snapshot === snapshot && basis.hpIv === side.displayIvs?.hp &&
        basis.nature === JSON.stringify(side.nature);
      return [direction, matches ? hpInputModes[direction] : undefined];
    })),
  }), [snapshot, state, activeDirection, serverId,
    spiritIndex, completeSpiritIds, favoriteSpiritIds,
    customStats, customEnabled, hpInputModes, hpBasis]);
  const levelComparison = useMemo(() => buildBattleLevelComparison({
    afterView: comparison.afterView, snapshot, state, activeDirection, serverId,
    spiritIndex, completeSpiritIds, favoriteSpiritIds, customStats, customEnabled,
  }), [comparison.afterView, snapshot, state, activeDirection, serverId,
    spiritIndex, completeSpiritIds, favoriteSpiritIds, customStats, customEnabled]);

  function setCustom(side, spiritId, checked) {
    setAppliedPatches(previous => ({ ...previous, [side]: { ...previous[side], [spiritId]: null } }));
    setCustomEnabled((previous) => ({
      ...previous, [side]: { ...previous[side], [spiritId]: checked },
    }));
  }

  return {
    ...comparison, levelComparison, customStats, customEnabled, appliedPatches,
    applyBefore(side, spiritId, record, raceStats) {
      setCustomStats(previous => ({ ...previous, [side]: { ...previous[side], [spiritId]: raceStats } }));
      setCustom(side, spiritId, true);
      setAppliedPatches(previous => ({ ...previous, [side]: { ...previous[side], [spiritId]: record.patch?.id ?? record } }));
    },
    setHpInputMode(direction, mode) {
      hpModeRef.current = { ...hpModeRef.current, [direction]: mode };
      setHpInputModes((previous) => ({ ...previous, [direction]: mode }));
    },
    getHpInputMode(direction) { return hpModeRef.current[direction]; },
    rememberHpBasis(direction, hp, percent, side) {
      setHpBasis((previous) => ({ ...previous, [direction]: {
        hp, percent, spiritId: side.spiritId, formId: side.battleForm?.spiritId,
        snapshot, hpIv: side.displayIvs?.hp, nature: JSON.stringify(side.nature),
      } }));
    },
    setCustom,
    setStat(side, spiritId, key, value) {
      setAppliedPatches(previous => ({ ...previous, [side]: { ...previous[side], [spiritId]: null } }));
      setCustomStats((previous) => ({
        ...previous,
        [side]: { ...previous[side], [spiritId]: {
          ...previous[side]?.[spiritId], [key]: value,
        } },
      }));
    },
    restore(side, spiritId) {
      setCustom(side, spiritId, false);
    },
    stop() {
      setCustomEnabled({});
      setAppliedPatches({});
      setHpInputModes({}); setHpBasis({}); hpModeRef.current = {};
    },
    reset() {
      setCustomStats({}); setCustomEnabled({});
      setAppliedPatches({});
      setHpInputModes({});
      setHpBasis({});
      hpModeRef.current = {};
    },
    swap() {
      setAppliedPatches(previous => ({ attacker: previous.defender, defender: previous.attacker }));
      setCustomStats((previous) => ({ attacker: previous.defender, defender: previous.attacker }));
      setCustomEnabled((previous) => ({ attacker: previous.defender, defender: previous.attacker }));
      setHpInputModes((previous) => ({ forward: previous.reverse, reverse: previous.forward }));
      setHpBasis((previous) => ({ forward: previous.reverse, reverse: previous.forward }));
      hpModeRef.current = { forward: hpModeRef.current.reverse, reverse: hpModeRef.current.forward };
    },
  };
}
