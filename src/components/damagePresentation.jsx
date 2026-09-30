// Freeze extends KO coverage; it is not additional damage.
export function damagePresentation(result) {
  const directDamage = result?.totalDamage ?? result?.damage;
  const settlement = result?.negativeStatusSettlement;
  const statusDamage = Math.max(0, Number(settlement?.actualStatusDamage) || 0);
  const maxHp = Math.max(1, Number(settlement?.maxHp) || 1);
  const directPercent = Number.isFinite(result?.hpPercent) ? result.hpPercent : null;
  const statusPercent = statusDamage / maxHp * 100;
  const freezePercent = settlement?.freeze?.immune || settlement?.skipped
    ? 0
    : Math.max(0, Number(settlement?.freeze?.thresholdPercent) || 0);
  const hasStatusImpact = statusPercent > 0 || freezePercent > 0;
  const percent = directPercent === null ? null : directPercent + statusPercent + freezePercent;
  const detail = hasStatusImpact
    ? [
        directPercent > 0 ? `伤害 ${directPercent.toFixed(1)}%` : null,
        statusPercent > 0 ? `异常 ${statusPercent.toFixed(1)}%` : null,
        freezePercent > 0 ? `冻结 ${freezePercent}%` : null,
      ].filter(Boolean).join(" ＋ ")
    : null;
  return {
    damage: result?.statusOnly
      ? statusDamage > 0 ? statusDamage : null
      : Number.isFinite(directDamage) ? directDamage : null,
    detail,
    directPercent: directPercent ?? 0,
    freezePercent,
    hasStatusImpact,
    lethal: settlement?.lethal ?? result?.lethal ?? false,
    percent,
    remainingHp: settlement?.lethal ? 0 : settlement?.remainingHp,
    statusPercent,
  };
}

export function DamageSegments({ presentation, className = "" }) {
  let remaining = 100;
  const segments = [
    ["direct", presentation.directPercent],
    ["status", presentation.statusPercent],
    ["freeze", presentation.freezePercent],
  ].map(([kind, percent]) => {
    const width = Math.min(remaining, Math.max(0, percent));
    remaining -= width;
    return width > 0 ? (
      <span className={`damage-coverage__${kind}`} key={kind} style={{ width: `${width}%` }} />
    ) : null;
  });
  return <span className={`damage-coverage ${className}`.trim()}>{segments}</span>;
}
