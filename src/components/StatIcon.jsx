import { STAT_LABELS } from "../domain/natures.js";

const STAT_ASSETS = Object.freeze({
  hp: "hp",
  magicalAttack: "magical-attack",
  magicalDefense: "magical-defense",
  physicalAttack: "physical-attack",
  physicalDefense: "physical-defense",
  speed: "speed",
});

export function StatIcon({ label = false, size = 18, stat }) {
  const asset = STAT_ASSETS[stat];
  if (!asset) return null;
  return (
    <img
      alt={label ? STAT_LABELS[stat] : ""}
      className="stat-icon"
      height={size}
      src={`/assets/stats/${asset}.png`}
      width={size}
    />
  );
}
