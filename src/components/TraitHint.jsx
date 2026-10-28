import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { useId, useState } from "react";

export function TraitHint({ description, name, trait }) {
  const { tc, entityName, entityDescription } = useCalculatorLocale();
  const displayName = trait ? entityName("trait", trait) : tc(name);
  const displayDescription = trait ? entityDescription("trait", trait) : tc(description);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  if (!description) return <span>{displayName}</span>;

  return (
    <span
      aria-describedby={open ? tooltipId : undefined}
      className="trait-hint"
      onBlur={() => setOpen(false)}
      onClick={(event) => {
        event.currentTarget.focus();
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      tabIndex={0}
    >
      {displayName}
      {open ? (
        <span className="trait-hint__tooltip" id={tooltipId} role="tooltip">
          {displayDescription}
        </span>
      ) : null}
    </span>
  );
}

export function TraitSkillPowerBonuses({ ariaLabel, bonuses = [] }) {
  const { tc } = useCalculatorLocale();
  if (bonuses.length === 0) return null;
  return (
    <div
      aria-label={tc(ariaLabel)}
      className="trait-skill-power-bonuses"
      role="note"
    >
      {bonuses.map(({ fixedPowerAdd, perHit, skillName }) => (
        <span key={skillName}>
          {tc(skillName)} {perHit ? tc("每段") : tc("")}+{tc(fixedPowerAdd)}
        </span>
      ))}
    </div>
  );
}
