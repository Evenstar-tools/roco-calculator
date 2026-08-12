import { Button, Text, View } from "@tarojs/components";
import { createCombatantView } from "../view-models/combatant.js";
import StatIcon from "./StatIcon.jsx";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

export default function CombatantStatGrid({
  configuration,
  onOpen,
  side,
  snapshot,
}) {
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const view = createCombatantView(snapshot, configuration);

  return (
    <View aria-label={`${sideLabel}六维参数`} className="stat-grid">
      {view.stats.map((stat) => {
        const raised = view.nature.upStat === stat.key;
        const lowered = view.nature.downStat === stat.key;
        return (
          <Button
            aria-label={`${sideLabel}${stat.label} ${stat.panel}`}
            className={[
              "stat-grid__item",
              raised ? "stat-grid__item--raised" : "",
              lowered ? "stat-grid__item--lowered" : "",
            ].filter(Boolean).join(" ")}
            hoverClass="button-hover"
            key={stat.key}
            onClick={() => onOpen?.(side)}
          >
            <StatIcon label={stat.label} stat={stat.key} />
            <View className="stat-grid__copy">
              <Text className="stat-grid__label">{stat.label}</Text>
              <Text className="stat-grid__value">{stat.panel}</Text>
            </View>
            {raised || lowered ? (
              <Text className="stat-grid__nature" aria-hidden="true">
                {raised ? "+" : "−"}
              </Text>
            ) : null}
          </Button>
        );
      })}
    </View>
  );
}
