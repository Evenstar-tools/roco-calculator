import { useId, useState } from "react";

export function TraitHint({ description, name }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  if (!description) return <span>{name}</span>;

  return (
    <span
      aria-describedby={open ? tooltipId : undefined}
      className="trait-hint"
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      tabIndex={0}
    >
      {name}
      {open ? (
        <span className="trait-hint__tooltip" id={tooltipId} role="tooltip">
          {description}
        </span>
      ) : null}
    </span>
  );
}

export function TraitSkillPowerBonuses({ ariaLabel, bonuses = [] }) {
  if (bonuses.length === 0) return null;
  return (
    <div
      aria-label={ariaLabel}
      className="trait-skill-power-bonuses"
      role="note"
    >
      {bonuses.map(({ fixedPowerAdd, perHit, skillName }) => (
        <span key={skillName}>
          {skillName} {perHit ? "每段" : ""}+{fixedPowerAdd}
        </span>
      ))}
    </div>
  );
}
