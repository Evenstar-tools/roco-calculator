import { useMemo, useState } from "react";
import { Button, Input, Text, View } from "@tarojs/components";
import {
  createSpiritSearchIndex,
  searchSpiritsWithFavorites,
} from "../view-models/spirit-search.js";

const SIDE_LABELS = {
  attacker: "攻击方",
  defender: "防守方",
};

function readInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

export default function SpiritPicker({
  favoriteIds = [],
  value,
  spirits,
  onChange,
  side,
}) {
  const [query, setQuery] = useState("");
  const index = useMemo(
    () => createSpiritSearchIndex({ spirits }),
    [spirits],
  );
  const sideLabel = SIDE_LABELS[side] ?? "当前";
  const results = query.trim()
    ? searchSpiritsWithFavorites(index, query, favoriteIds)
    : [];

  function selectSpirit(spiritId) {
    onChange(spiritId);
    setQuery("");
  }

  return (
    <View className="spirit-picker">
      <Input
        aria-label={`搜索${sideLabel}宠物`}
        className="spirit-picker__input"
        placeholder={`搜索${sideLabel}宠物`}
        type="text"
        value={query}
        onInput={(event) => setQuery(readInputValue(event))}
      />
      {query.trim() ? (
        <View
          aria-label={`${sideLabel}宠物搜索结果`}
          className="spirit-picker__results"
        >
          {results.length ? results.map((spirit) => (
            <Button
              aria-label={`选择${spirit.fullName ?? spirit.name}`}
              className={[
                "spirit-picker__result",
                spirit.id === value
                  ? "spirit-picker__result--selected"
                  : "",
              ].filter(Boolean).join(" ")}
              key={spirit.id}
              onClick={() => selectSpirit(spirit.id)}
            >
              <Text className="spirit-picker__result-name">
                {spirit.fullName ?? spirit.name}
              </Text>
              <Text className="spirit-picker__result-types">
                {(spirit.types ?? []).join(" · ")}
              </Text>
            </Button>
          )) : (
            <Text className="spirit-picker__empty">未找到匹配宠物</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
