import { ArrowsLeftRight } from "@phosphor-icons/react";
import { SpiritPicker } from "./SpiritPicker.jsx";

export function SpiritStep({
  attacker,
  attackerFavoriteState,
  defender,
  defenderFavoriteState,
  formSides,
  onFormSelect,
  onAttackerFavoriteToggle,
  onAttackerSelect,
  onDefenderFavoriteToggle,
  onDefenderSelect,
  onSwap,
  onOpenDeer,
  spirits,
}) {
  return (
    <section aria-label="精灵配置" className="calculator-step calculator-step--spirits">
      <div className="versus-grid">
        <SpiritPicker
          favoriteState={attackerFavoriteState}
          guideTarget="attacker"
          label="攻击方"
          onFavoriteToggle={onAttackerFavoriteToggle}
          onSelect={onAttackerSelect}
          formSide={formSides?.attacker}
          onFormSelect={onFormSelect?.bind(null, "attacker")}
          onOpenDeer={["波普鹿", "爵士鹿"].includes(attacker?.fullName) ? onOpenDeer : undefined}
          selected={attacker}
          side="attack"
          spirits={spirits}
        />
        <button
          aria-label="交换双方完整配置"
          className="swap-action"
          onClick={onSwap}
          title="交换双方"
          type="button"
        >
          <ArrowsLeftRight aria-hidden="true" size={23} weight="bold" />
        </button>
        <SpiritPicker
          favoriteState={defenderFavoriteState}
          guideTarget="defender"
          label="防御方"
          onFavoriteToggle={onDefenderFavoriteToggle}
          onSelect={onDefenderSelect}
          formSide={formSides?.defender}
          onFormSelect={onFormSelect?.bind(null, "defender")}
          selected={defender}
          side="defense"
          spirits={spirits}
        />
      </div>
    </section>
  );
}
