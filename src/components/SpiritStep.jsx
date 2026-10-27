import { useLocale } from "../i18n/LocaleContext.jsx";
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
  comparisonControls,
  comparisonSummaries,
  comparisonActive,
  comparisonActions,
  spirits,
}) {
  const { t } = useLocale();
  return (
    <section aria-label={t("精灵配置")} className="calculator-step calculator-step--spirits">
      <div className="versus-grid">
        <SpiritPicker
          favoriteState={attackerFavoriteState}
          guideTarget="attacker"
          label={t("攻击方")}
          onFavoriteToggle={onAttackerFavoriteToggle}
          onSelect={onAttackerSelect}
          formSide={formSides?.attacker}
          onFormSelect={onFormSelect?.bind(null, "attacker")}
          onOpenDeer={["波普鹿", "爵士鹿"].includes(attacker?.fullName) ? onOpenDeer : undefined}
          selected={attacker}
          comparisonControls={comparisonControls?.attacker}
          comparisonSummary={comparisonSummaries?.attacker}
          comparisonActive={comparisonActive?.attacker}
          renderComparisonAction={comparisonActions?.attacker}
          side="attack"
          spirits={spirits}
        />
        <button
          aria-label={t("交换双方完整配置")}
          className="swap-action"
          onClick={onSwap}
          title={t("交换双方")}
          type="button"
        >
          <ArrowsLeftRight aria-hidden="true" size={23} weight="bold" />
        </button>
        <SpiritPicker
          favoriteState={defenderFavoriteState}
          guideTarget="defender"
          label={t("防御方")}
          onFavoriteToggle={onDefenderFavoriteToggle}
          onSelect={onDefenderSelect}
          formSide={formSides?.defender}
          onFormSelect={onFormSelect?.bind(null, "defender")}
          selected={defender}
          comparisonControls={comparisonControls?.defender}
          comparisonSummary={comparisonSummaries?.defender}
          comparisonActive={comparisonActive?.defender}
          renderComparisonAction={comparisonActions?.defender}
          side="defense"
          spirits={spirits}
        />
      </div>
    </section>
  );
}
