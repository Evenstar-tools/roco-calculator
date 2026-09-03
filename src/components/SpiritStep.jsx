import { ArrowsLeftRight } from "@phosphor-icons/react";
import { SpiritPicker } from "./SpiritPicker.jsx";

export function SpiritStep({
  attacker,
  attackerFavoriteState,
  attackerTraitEditor,
  defender,
  defenderFavoriteState,
  defenderTraitEditor,
  onAttackerFavoriteToggle,
  onAttackerSelect,
  onDefenderFavoriteToggle,
  onDefenderSelect,
  onSwap,
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
          selected={defender}
          side="defense"
          spirits={spirits}
        />
        {attackerTraitEditor ? (
          <div className="spirit-step__trait-editor spirit-step__trait-editor--attacker">
            {attackerTraitEditor}
          </div>
        ) : null}
        {defenderTraitEditor ? (
          <div className="spirit-step__trait-editor spirit-step__trait-editor--defender">
            {defenderTraitEditor}
          </div>
        ) : null}
      </div>
    </section>
  );
}
