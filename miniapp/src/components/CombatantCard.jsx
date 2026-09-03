import { useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import CombatantDetails from "./CombatantDetails.jsx";
import FavoriteButton from "./FavoriteButton.jsx";
import QuickCombatantControls from "./QuickCombatantControls.jsx";
import SpiritPicker from "./SpiritPicker.jsx";
import ElementIcon from "./ElementIcon.jsx";
import EntityChangeHint from "./EntityChangeHint.jsx";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

export default function CombatantCard({
  configuration,
  favorite,
  favoriteIds,
  imageUrl,
  imageUrls,
  identityOnly = false,
  active = false,
  onActivate,
  onIvChange,
  onChange,
  onFavoriteToggle,
  onNatureChange,
  onPickerOpenChange,
  pickerOpen: controlledPickerOpen,
  side,
  snapshot,
  spirit,
  spirits,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [internalPickerOpen, setInternalPickerOpen] = useState(false);
  const pickerOpen = typeof controlledPickerOpen === "boolean"
    ? controlledPickerOpen
    : internalPickerOpen;
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const spiritName = spirit?.fullName ?? spirit?.name ?? "尚未选择";
  const types = (spirit?.types ?? []).join(" · ");

  function setPickerOpen(nextValue) {
    const nextOpen = typeof nextValue === "function"
      ? nextValue(pickerOpen)
      : nextValue;
    if (typeof controlledPickerOpen !== "boolean") {
      setInternalPickerOpen(nextOpen);
    }
    onPickerOpenChange?.(nextOpen);
  }

  return (
    <View
      aria-label={`${sideLabel}配置`}
      className={[
        `combatant-card combatant-card--${side}`,
        active ? "combatant-card--active" : "",
        identityOnly ? "combatant-card--identity-only" : "",
      ].filter(Boolean).join(" ")}
    >
      <View
        aria-label={`${sideLabel}宠物摘要`}
        aria-pressed={identityOnly ? active : undefined}
        className="combatant-card__summary"
        hoverClass="button-hover"
          onClick={(event) => {
            event.stopPropagation();
            onActivate?.();
            if (identityOnly) setPickerOpen(true);
          }}
        role={identityOnly ? "button" : undefined}
        tabIndex={identityOnly ? 0 : undefined}
      >
        {imageUrl ? (
          <Image
            alt={`${spiritName}头像`}
            aria-label={`${spiritName}头像`}
            className="combatant-card__image"
            mode="aspectFit"
            src={imageUrl}
          />
        ) : null}
        <View className="combatant-card__identity">
          <Text className="combatant-card__label">{sideLabel}</Text>
          <View className="combatant-card__name-row">
            <Text className="combatant-card__name">{spiritName}</Text>
            <EntityChangeHint changeInfo={spirit?.changeInfo} />
          </View>
          {types ? (
            <View className="combatant-card__types">
              {(spirit?.types ?? []).map((type) => (
                <ElementIcon key={type} type={type} />
              ))}
              <Text>{types}</Text>
            </View>
          ) : null}
          {spirit?.calculationStatus === "pending-race-stats" ? (
            <Text className="combatant-card__pending">
              种族值待确认
            </Text>
          ) : null}
        </View>
        {spirit && !identityOnly ? (
          <FavoriteButton
            favorite={favorite}
            onToggle={() => onFavoriteToggle?.(spirit.id)}
            spiritName={spiritName}
          />
        ) : null}
      </View>
      <SpiritPicker
        favoriteIds={favoriteIds}
        hideTrigger={identityOnly}
        imageUrls={imageUrls}
        onChange={onChange}
        onOpenChange={identityOnly ? setPickerOpen : undefined}
        open={identityOnly ? pickerOpen : undefined}
        side={side}
        spirits={spirits}
        value={spirit?.id ?? null}
      />
      {!identityOnly && spirit ? (
        <QuickCombatantControls
          configuration={configuration}
          onIvChange={onIvChange}
          onNatureChange={onNatureChange}
          side={side}
        />
      ) : null}
      {!identityOnly && spirit ? (
        <Button
          aria-expanded={detailsOpen}
          aria-label={`${detailsOpen ? "收起" : "展开"}${sideLabel}属性配置`}
          className={detailsOpen
            ? "combatant-card__details-toggle combatant-card__details-toggle--expanded"
            : "combatant-card__details-toggle"}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? "收起详细数值" : "详细数值"}
        </Button>
      ) : null}
      {!identityOnly && detailsOpen ? (
        <CombatantDetails
          configuration={configuration}
          onIvChange={onIvChange}
          onNatureChange={onNatureChange}
          side={side}
          snapshot={snapshot}
        />
      ) : null}
    </View>
  );
}
