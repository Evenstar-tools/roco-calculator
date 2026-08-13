import { Button, Text, View } from "@tarojs/components";
import CombatantDetails from "./CombatantDetails.jsx";
import QuickCombatantControls from "./QuickCombatantControls.jsx";

const SIDE_LABELS = Object.freeze({
  attacker: "攻击方",
  defender: "防守方",
});

export default function CombatantParameterSheet({
  configuration,
  onClose,
  onIvChange,
  onNatureChange,
  open,
  side,
  snapshot,
}) {
  if (!open) return null;
  const sideLabel = SIDE_LABELS[side] ?? "当前";

  return (
    <View className="parameter-sheet__overlay" onClick={onClose}>
      <View
        aria-label={`${sideLabel}参数设置`}
        aria-modal="true"
        className={`parameter-sheet parameter-sheet--${side}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <View className="parameter-sheet__header">
          <View>
            <Text className="parameter-sheet__eyebrow">{sideLabel}</Text>
            <Text className="parameter-sheet__title">能力参数</Text>
          </View>
          <Button
            aria-label={`完成${sideLabel}参数设置`}
            className="parameter-sheet__done"
            hoverClass="button-hover"
            onClick={onClose}
          >
            完成
          </Button>
        </View>
        <View className="parameter-sheet__content">
          <QuickCombatantControls
            configuration={configuration}
            onIvChange={onIvChange}
            onNatureChange={onNatureChange}
            side={side}
          />
          <CombatantDetails
            configuration={configuration}
            onIvChange={onIvChange}
            onNatureChange={onNatureChange}
            side={side}
            snapshot={snapshot}
          />
        </View>
      </View>
    </View>
  );
}
