import { useMemo, useRef, useState } from "react";
import { buildBalanceComparison } from "./model.js";

// Trial values deliberately stay outside the saved/shared calculator session.
export function useBalanceComparison({ snapshot, state, activeDirection, serverId,
  spiritIndex, completeSpiritIds, favoriteSpiritIds }) {
  const [customStats, setCustomStats] = useState({});
  const [customEnabled, setCustomEnabled] = useState({});
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

  function setCustom(side, spiritId, checked) {
    setCustomEnabled((previous) => ({
      ...previous, [side]: { ...previous[side], [spiritId]: checked },
    }));
  }

  return {
    ...comparison, customStats, customEnabled,
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
      setHpInputModes({}); setHpBasis({}); hpModeRef.current = {};
    },
    reset() {
      setCustomStats({}); setCustomEnabled({});
      setHpInputModes({});
      setHpBasis({});
      hpModeRef.current = {};
    },
    swap() {
      setCustomStats((previous) => ({ attacker: previous.defender, defender: previous.attacker }));
      setCustomEnabled((previous) => ({ attacker: previous.defender, defender: previous.attacker }));
      setHpInputModes((previous) => ({ forward: previous.reverse, reverse: previous.forward }));
      setHpBasis((previous) => ({ forward: previous.reverse, reverse: previous.forward }));
      hpModeRef.current = { forward: hpModeRef.current.reverse, reverse: hpModeRef.current.forward };
    },
  };
}
