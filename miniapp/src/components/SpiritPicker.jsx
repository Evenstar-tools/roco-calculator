import { useMemo, useState } from "react";
import { Button, Image, Input, Text, View } from "@tarojs/components";
import {
  createSpiritSearchIndex,
  searchSpiritsWithFavorites,
} from "../view-models/spirit-search.js";
import ElementIcon from "./ElementIcon.jsx";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

function readInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

export default function SpiritPicker({
  favoriteIds = [],
  hideTrigger = false,
  imageUrls = {},
  value,
  spirits,
  onChange,
  onOpenChange,
  open: controlledOpen,
  side,
}) {
  const [query, setQuery] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = typeof controlledOpen === "boolean"
    ? controlledOpen
    : internalOpen;
  const index = useMemo(
    () => createSpiritSearchIndex({ spirits }),
    [spirits],
  );
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const selected = spirits.find((spirit) => spirit.id === value);
  const results = query.trim()
    ? searchSpiritsWithFavorites(index, query, favoriteIds)
    : [];

  function setOpen(nextValue) {
    const nextOpen = typeof nextValue === "function"
      ? nextValue(open)
      : nextValue;
    if (typeof controlledOpen !== "boolean") {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  function selectSpirit(spiritId) {
    onChange(spiritId);
    setQuery("");
    setOpen(false);
  }

  function closePicker() {
    setQuery("");
    setOpen(false);
  }

  return (
    <View
      className={open ? "spirit-picker spirit-picker--open" : "spirit-picker"}
      onClick={(event) => event.stopPropagation()}
    >
      {open ? (
        <View
          aria-label={`关闭${sideLabel}宠物搜索`}
          className="spirit-picker__backdrop"
          onClick={closePicker}
        />
      ) : null}
      {!hideTrigger ? (
        <Button
          aria-expanded={open}
          aria-label={`更换${sideLabel}宠物`}
          className={open
            ? "spirit-picker__mobile-trigger spirit-picker__mobile-trigger--expanded"
            : "spirit-picker__mobile-trigger"}
          hoverClass="button-hover"
          onClick={() => setOpen((current) => !current)}
        >
          {selected ? "更换" : "选择"}
        </Button>
      ) : null}
      <Input
        aria-label={`搜索${sideLabel}宠物`}
        className="spirit-picker__input"
        placeholder={`搜索${sideLabel}宠物`}
        type="text"
        value={query}
        onInput={(event) => {
          setOpen(true);
          setQuery(readInputValue(event));
        }}
      />
      {open && query.trim() ? (
        <View
          aria-label={`${sideLabel}宠物搜索结果`}
          className="spirit-picker__results"
        >
          {results.length ? results.map((spirit) => {
            const imageUrl = imageUrls[spirit.id] ?? spirit.imageUrl;
            return (
              <Button
                aria-label={`选择${spirit.fullName ?? spirit.name}`}
                className={[
                  "spirit-picker__result",
                  spirit.id === value
                    ? "spirit-picker__result--selected"
                    : "",
                ].filter(Boolean).join(" ")}
                hoverClass="button-hover"
                key={spirit.id}
                onClick={() => selectSpirit(spirit.id)}
              >
                {imageUrl ? (
                  <Image
                    alt={`${spirit.fullName ?? spirit.name}头像`}
                    aria-label={`${spirit.fullName ?? spirit.name}头像`}
                    className="spirit-picker__result-image"
                    mode="aspectFit"
                    src={imageUrl}
                  />
                ) : null}
                <View className="spirit-picker__result-copy">
                  <Text className="spirit-picker__result-name">
                    {spirit.fullName ?? spirit.name}
                  </Text>
                  <View className="spirit-picker__result-types">
                    {(spirit.types ?? []).map((type) => (
                      <ElementIcon key={type} type={type} />
                    ))}
                    <Text>{(spirit.types ?? []).join(" · ")}</Text>
                  </View>
                </View>
              </Button>
            );
          }) : (
            <Text className="spirit-picker__empty">未找到匹配宠物</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
