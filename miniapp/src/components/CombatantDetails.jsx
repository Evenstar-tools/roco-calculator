import { View } from "@tarojs/components";
import { createCombatantView } from "../view-models/combatant.js";
import IvEditor from "./IvEditor.jsx";
import NaturePicker from "./NaturePicker.jsx";

export default function CombatantDetails({
  configuration,
  onIvChange,
  onNatureChange,
  side,
  snapshot,
}) {
  const view = createCombatantView(snapshot, configuration);
  if (!view.spirit) return null;

  return (
    <View className="combatant-details">
      <NaturePicker
        onChange={onNatureChange}
        side={side}
        value={view.nature.id}
      />
      <IvEditor onChange={onIvChange} side={side} stats={view.stats} />
    </View>
  );
}
