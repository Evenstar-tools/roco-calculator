import { useState } from "react";
import { Text, View } from "@tarojs/components";

function isCompactChange(item) {
  return item.kind === "stat" && typeof item.before !== "string";
}

function ChangeItem({ item }) {
  if (isCompactChange(item)) {
    const delta = Number(item.after) - Number(item.before);
    return (
      <View className="entity-change-sheet__metric">
        <Text>{item.label}</Text>
        <Text className="entity-change-sheet__transition">
          {item.before} → {item.after}
        </Text>
        <Text className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}>
          {delta > 0 ? `+${delta}` : delta || "—"}
        </Text>
      </View>
    );
  }

  return (
    <View className="entity-change-sheet__detail">
      <Text className="entity-change-sheet__detail-title">{item.label}</Text>
      {item.before ? (
        <View>
          <Text className="entity-change-sheet__caption">调整前</Text>
          <Text>{item.before}</Text>
        </View>
      ) : null}
      {item.after ? (
        <View>
          <Text className="entity-change-sheet__caption">
            {item.before ? "调整后" : "内容"}
          </Text>
          <Text>{item.after}</Text>
        </View>
      ) : null}
      {item.note ? <Text className="entity-change-sheet__note">{item.note}</Text> : null}
    </View>
  );
}

export default function EntityChangeHint({ changeInfo, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!changeInfo?.items?.length || changeInfo.isNew) return null;
  const entityName = changeInfo.entityName ?? "当前项目";

  function stopAndClose(event) {
    event?.stopPropagation?.();
    setOpen(false);
  }

  return (
    <>
      <View
        aria-expanded={open}
        aria-label={`查看${entityName}本期改动`}
        className={`entity-change-hint ${className}`.trim()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        role="button"
        tabIndex={0}
      >
        <Text aria-hidden="true">!</Text>
      </View>
      {open ? (
        <View className="entity-change-sheet-layer" catchMove>
          <View
            aria-label="关闭改动详情"
            className="entity-change-sheet__backdrop"
            onClick={stopAndClose}
            role="button"
          />
          <View
            aria-label={`${entityName}本期改动`}
            aria-modal="true"
            className="entity-change-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <View className="entity-change-sheet__header">
              <View className="entity-change-sheet__patch">
                <Text className="entity-change-sheet__status">
                  {changeInfo.patch?.status === "preview" ? "前瞻" : "更新"}
                </Text>
                <Text className="entity-change-sheet__label">
                  {changeInfo.patch?.label ?? "本期改动"}
                </Text>
                <Text className="entity-change-sheet__date">{changeInfo.patch?.date}</Text>
              </View>
              <View
                aria-label="关闭改动详情"
                className="entity-change-sheet__close"
                onClick={stopAndClose}
                role="button"
              >
                <Text>×</Text>
              </View>
            </View>
            <Text className="entity-change-sheet__title">{entityName}</Text>
            <View className="entity-change-sheet__items">
              {changeInfo.items.map((item, index) => (
                <ChangeItem item={item} key={`${item.kind}-${item.label}-${index}`} />
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}
