import { useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import caretDownIcon from "../assets/icons/caret-down.png";
import caretRightIcon from "../assets/icons/caret-right.png";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export default function ConditionSection({
  children,
  className,
  defaultOpen = false,
  summary,
  title,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View
      className={classes(
        "condition-section",
        open && "condition-section--open",
        className,
      )}
    >
      <Button
        aria-expanded={open}
        aria-label={`${open ? "收起" : "展开"}${title}`}
        className="condition-section__toggle"
        hoverClass="button-hover"
        onClick={() => setOpen((value) => !value)}
      >
        <Text className="condition-section__title">{title}</Text>
        {summary ? (
          <Text className="condition-section__summary">{summary}</Text>
        ) : null}
        <Image
          alt=""
          aria-hidden="true"
          className="condition-section__caret"
          mode="aspectFit"
          src={open ? caretDownIcon : caretRightIcon}
        />
      </Button>
      {open ? (
        <View className="condition-section__content">{children}</View>
      ) : null}
    </View>
  );
}
