import { Minus, Plus } from "@phosphor-icons/react";
import { NatureEffect } from "./NatureEffect.jsx";
import { NatureSelect } from "./NatureSelect.jsx";
import { StatTile } from "./StatTile.jsx";

function SideStats({
  accent,
  label,
  onIvChange,
  onLevelChange = () => {},
  onNatureChange,
  side,
}) {
  const level = side.level ?? {
    label: label === "攻击方" ? "攻击能力等级" : "防御能力等级",
    multiplier: 1,
    stage: 0,
  };
  const levelPercent = Math.round((level.multiplier - 1) * 100);
  return (
    <div aria-label={`${label}能力`} className="nature-side" role="group">
      <NatureSelect
        ariaLabel={`${label}性格`}
        onChange={onNatureChange}
        value={side.nature}
      />
      <NatureEffect natureId={side.nature} />

      <div className="stat-grid">
        {side.stats.map((stat) => (
          <StatTile
            accent={accent}
            displayIv={stat.displayIv}
            key={stat.key}
            label={stat.label}
            onIvChange={(value) => onIvChange(stat.key, value)}
            panel={stat.panel}
            race={stat.race}
            stat={stat.key}
          />
        ))}
      </div>

      <div className="level-control">
        <span>{level.label}</span>
        <div>
          <button
            aria-label={`${label}等级减一`}
            disabled={level.stage <= -50}
            onClick={() => onLevelChange(level.stage - 1)}
            type="button"
          >
            <Minus aria-hidden="true" size={14} />
          </button>
          <output>
            {level.stage}层 · {levelPercent > 0 ? "+" : ""}
            {levelPercent}%
          </output>
          <button
            aria-label={`${label}等级加一`}
            disabled={level.stage >= 50}
            onClick={() => onLevelChange(level.stage + 1)}
            type="button"
          >
            <Plus aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NatureStatsStep({
  attacker,
  defender,
  onAttackerIvChange,
  onAttackerLevelChange,
  onAttackerNatureChange,
  onDefenderIvChange,
  onDefenderLevelChange,
  onDefenderNatureChange,
}) {
  return (
    <section aria-label="性格配置" className="calculator-step">
      <div className="nature-grid">
        <SideStats
          accent="attack"
          label="攻击方"
          onIvChange={onAttackerIvChange}
          onLevelChange={onAttackerLevelChange}
          onNatureChange={onAttackerNatureChange}
          side={attacker}
        />
        <SideStats
          accent="defense"
          label="防御方"
          onIvChange={onDefenderIvChange}
          onLevelChange={onDefenderLevelChange}
          onNatureChange={onDefenderNatureChange}
          side={defender}
        />
      </div>
    </section>
  );
}
