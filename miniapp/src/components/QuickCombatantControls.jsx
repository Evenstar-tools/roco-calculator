import { Button, Image, Text, View } from "@tarojs/components";
import {
  getNature,
  QUICK_STATS,
  resolveCompactNaturePreset,
  STAT_LABELS,
} from "../shared/domain/natures.js";
import StatIcon from "./StatIcon.jsx";
import statusCheckIcon from "../assets/icons/status-check.png";
import statusUpIcon from "../assets/icons/status-up.png";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

export default function QuickCombatantControls({
  configuration,
  onIvChange,
  onNatureChange,
  side,
}) {
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const displayIvs = configuration?.displayIvs ?? {};
  const nature = getNature(configuration?.nature);
  const invested = QUICK_STATS.filter((stat) => displayIvs[stat] === 60);
  const investmentSummary =
    invested.length === QUICK_STATS.length
      ? "全选"
      : invested.length
        ? invested.map((stat) => STAT_LABELS[stat]).join(" · ")
        : "未加点";
  const natureSummary = nature.upStat && nature.downStat
    ? `${nature.name} · ${STAT_LABELS[nature.upStat]}↑ / ${STAT_LABELS[nature.downStat]}↓`
    : "";
  const summary = [natureSummary, `个体${investmentSummary}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      aria-label={`${sideLabel}快速属性配置`}
      className="quick-controls"
    >
      <View
        aria-label={`${sideLabel}性格六维`}
        className="quick-controls__row quick-controls__row--nature"
      >
        <Text className="quick-controls__row-label">性格</Text>
        {QUICK_STATS.map((stat) => {
          const selected = nature.upStat === stat;
          return (
            <Button
              aria-label={`${sideLabel}${STAT_LABELS[stat]}正面性格`}
              aria-pressed={selected}
              className={[
                "quick-controls__option quick-controls__option--stat",
                selected ? "quick-controls__option--selected" : "",
              ].filter(Boolean).join(" ")}
              hoverClass="quick-controls__option--pressed"
              key={stat}
              onClick={() =>
                onNatureChange(
                  selected
                    ? "neutral"
                    : resolveCompactNaturePreset(stat, displayIvs),
                )
              }
            >
              <View className="quick-controls__icon-stage">
                <StatIcon label={STAT_LABELS[stat]} stat={stat} />
              </View>
              <Text className="quick-controls__stat-label">
                {STAT_LABELS[stat]}
              </Text>
              {selected ? (
                <Image
                  alt=""
                  aria-hidden="true"
                  className="quick-controls__status-badge quick-controls__status-badge--nature"
                  mode="aspectFit"
                  src={statusUpIcon}
                />
              ) : null}
            </Button>
          );
        })}
      </View>
      <View
        aria-label={`${sideLabel}个体六维`}
        className="quick-controls__row quick-controls__row--iv"
      >
        <Text className="quick-controls__row-label">个体</Text>
        {QUICK_STATS.map((stat) => {
          const selected = displayIvs[stat] === 60;
          return (
            <Button
              aria-label={`${sideLabel}${STAT_LABELS[stat]}个体加点`}
              aria-pressed={selected}
              className={[
                "quick-controls__option quick-controls__option--stat",
                selected ? "quick-controls__option--selected" : "",
              ].filter(Boolean).join(" ")}
              hoverClass="quick-controls__option--pressed"
              key={stat}
              onClick={() => onIvChange(stat, selected ? 0 : 60)}
            >
              <View className="quick-controls__icon-stage">
                <StatIcon label={STAT_LABELS[stat]} stat={stat} />
              </View>
              <Text className="quick-controls__stat-label">
                {STAT_LABELS[stat]}
              </Text>
              {selected ? (
                <Image
                  alt=""
                  aria-hidden="true"
                  className="quick-controls__status-badge quick-controls__status-badge--iv"
                  mode="aspectFit"
                  src={statusCheckIcon}
                />
              ) : null}
            </Button>
          );
        })}
      </View>
      <View
        aria-label={summary}
        className="quick-controls__summary"
      >
        {nature.upStat && nature.downStat ? (
          <>
            <Text className="quick-controls__summary-nature">
              {nature.name}
            </Text>
            <Text className="quick-controls__summary-separator">·</Text>
            <Text className="quick-controls__summary-stat">
              {STAT_LABELS[nature.upStat]}
            </Text>
            <Text className="quick-controls__summary-arrow quick-controls__summary-arrow--up">
              ↑
            </Text>
            <Text className="quick-controls__summary-slash">/</Text>
            <Text className="quick-controls__summary-stat">
              {STAT_LABELS[nature.downStat]}
            </Text>
            <Text className="quick-controls__summary-arrow quick-controls__summary-arrow--down">
              ↓
            </Text>
            <Text className="quick-controls__summary-separator">·</Text>
          </>
        ) : null}
        <Text className="quick-controls__summary-iv">
          个体{investmentSummary}
        </Text>
      </View>
    </View>
  );
}
