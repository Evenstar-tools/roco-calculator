const STATUS_LABELS = { burn: "灼烧", poison: "中毒", parasitism: "寄生", electrified: "引电" };

// Read settled HP loss without treating healing or a freeze threshold as damage.
export function damagePresentation(result) {
  const directDamage = result?.totalDamage ?? result?.damage;
  const settlement = result?.negativeStatusSettlement;
  const statusDamage = settlement?.skipped ? 0 : Math.max(0, Number(settlement?.actualStatusDamage) || 0);
  const directPercent = Number.isFinite(result?.hpPercent) ? result.hpPercent : null;
  const maxHp = Number(settlement?.maxHp) > 0 ? Number(settlement.maxHp)
    : directPercent > 0 && Number.isFinite(directDamage) ? directDamage / directPercent * 100 : null;
  const statusPercent = maxHp > 0 ? statusDamage / maxHp * 100 : 0;
  const freezePercent = settlement?.freeze?.immune || settlement?.skipped
    ? 0 : Math.max(0, Number(settlement?.freeze?.thresholdPercent) || 0);
  const damagingStatuses = (settlement?.breakdown ?? []).filter(entry => !entry.immune && entry.damage > 0);
  const statusLabel = damagingStatuses.length === 1 ? STATUS_LABELS[damagingStatuses[0].id] ?? "异常" : "异常";
  const hasStatusImpact = statusPercent > 0 || freezePercent > 0;
  const percent = directPercent === null ? null : directPercent + statusPercent + freezePercent;
  const lethal = settlement?.lethal ?? result?.lethal ?? false;
  const freezeLethal = Boolean(settlement?.freeze?.lethal && settlement.remainingHp > 0);
  const detail = hasStatusImpact ? [
    directPercent > 0 ? `伤害 ${directPercent.toFixed(1)}%` : null,
    statusPercent > 0 ? `${statusLabel} ${statusPercent.toFixed(1)}%` : null,
    freezePercent > 0 ? `冻结 ${freezePercent}%` : null,
  ].filter(Boolean).join(" ＋ ") : null;
  return {
    damage: result?.statusOnly
      ? statusDamage > 0 ? statusDamage : null
      : Number.isFinite(directDamage) ? directDamage + statusDamage : null,
    detail, directPercent: directPercent ?? 0, freezePercent, freezeLethal,
    hasStatusImpact, lethal, percent, statusDamage, statusPercent,
    remainingHp: lethal ? 0 : settlement?.remainingHp ?? result?.remainingHp,
    outcome: lethal ? freezeLethal ? "本次可击倒 · 冻结斩杀"
      : statusDamage > 0 ? "本次可击倒 · 异常结算" : "可击倒" : null,
  };
}

export function damageSegments(presentation) {
  let remaining = 100;
  return [["direct", presentation.directPercent], ["status", presentation.statusPercent], ["freeze", presentation.freezePercent]]
    .map(([kind, percent]) => {
      const width = Math.min(remaining, Math.max(0, percent));
      remaining -= width;
      return { kind, width };
    }).filter(segment => segment.width > 0);
}

export function hasBurnPreview(settlement) {
  return !settlement?.lethal && !settlement?.skipped && Number(settlement?.stacks?.burn) > 0 &&
    Boolean(settlement?.turnPreview?.next);
}

export function statusLossText(phase, entry) {
  if (entry?.immune) return "免疫";
  if (entry?.id === "electrified" && !entry.triggered) return "未触发";
  const damage = Math.max(0, Number(entry?.damage) || 0);
  const maxHp = Number(phase?.maxHp);
  return damage > 0 ? `${maxHp > 0 ? `${(damage / maxHp * 100).toFixed(1)}% · ` : ""}${damage} HP` : "不扣血";
}
