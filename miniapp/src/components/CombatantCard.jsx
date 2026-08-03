import { useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import CombatantDetails from "./CombatantDetails.jsx";
import FavoriteButton from "./FavoriteButton.jsx";
import SpiritPicker from "./SpiritPicker.jsx";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

export default function CombatantCard({
  configuration,
  favorite,
  favoriteIds,
  imageUrl,
  onIvChange,
  onChange,
  onFavoriteToggle,
  onNatureChange,
  side,
  snapshot,
  spirit,
  spirits,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const spiritName = spirit?.fullName ?? spirit?.name ?? "尚未选择";
  const types = (spirit?.types ?? []).join(" · ");

  return (
    <View
      aria-label={`${sideLabel}配置`}
      className={`combatant-card combatant-card--${side}`}
    >
      <View
        aria-label={`${sideLabel}宠物摘要`}
        className="combatant-card__summary"
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
          <Text className="combatant-card__name">{spiritName}</Text>
          {types ? (
            <Text className="combatant-card__types">{types}</Text>
          ) : null}
        </View>
        {spirit ? (
          <FavoriteButton
            favorite={favorite}
            onToggle={() => onFavoriteToggle?.(spirit.id)}
            spiritName={spiritName}
          />
        ) : null}
      </View>
      <SpiritPicker
        favoriteIds={favoriteIds}
        onChange={onChange}
        side={side}
        spirits={spirits}
        value={spirit?.id ?? null}
      />
      {spirit ? (
        <Button
          aria-expanded={detailsOpen}
          aria-label={`${detailsOpen ? "收起" : "展开"}${sideLabel}属性配置`}
          className="combatant-card__details-toggle"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? "收起属性配置" : "展开属性配置"}
        </Button>
      ) : null}
      {detailsOpen ? (
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
