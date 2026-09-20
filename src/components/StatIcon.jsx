import { STAT_LABELS } from "../domain/natures.js";

const STAT_ASSETS = Object.freeze({
  hp: "hp",
  magicalAttack: "magical-attack",
  magicalDefense: "magical-defense",
  physicalAttack: "physical-attack",
  physicalDefense: "physical-defense",
  speed: "speed",
});

export function StatIcon({ gain = false, label = false, size = 18, stat }) {
  const asset = STAT_ASSETS[stat];
  if (!asset) return null;
  if (gain) return <span
    aria-label={`${STAT_LABELS[stat]}性格增益 +20%`}
    className="stat-icon stat-icon--nature-gain"
    role="img"
    title={`${STAT_LABELS[stat]}性格增益 +20%`}
    style={{ width: size, height: size, "--stat-icon-url": `url(/assets/stats/${asset}.png)` }}
  />;
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
