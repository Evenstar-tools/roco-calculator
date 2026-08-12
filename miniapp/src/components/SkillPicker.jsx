import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Image,
  Input,
  ScrollView,
  Text,
  View,
} from "@tarojs/components";
import selectedIcon from "../assets/icons/status-check.png";
import {
  buildSkillCategoryOptions,
  filterSkillChoices,
  SKILL_CATEGORY_LABELS,
} from "../view-models/skill-filters.js";
import searchIcon from "../assets/icons/search.png";
import ElementIcon from "./ElementIcon.jsx";

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function readInputValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? "";
}

function SkillMeta({ skill }) {
  const power = Number(skill?.basePower);
  const cost = Number(skill?.cost);

  return (
    <View className="skill-picker__meta">
      <Text className="skill-picker__meta-item">
        {SKILL_CATEGORY_LABELS[skill?.category] ?? "技能"}
      </Text>
      <Text className="skill-picker__meta-item">
        {Number.isFinite(power) && power > 0 ? `威力 ${power}` : "辅助"}
      </Text>
      {Number.isFinite(cost) ? (
        <Text className="skill-picker__meta-item">能量 {cost}</Text>
      ) : null}
    </View>
  );
}

function skillSummary(skill) {
  const category = SKILL_CATEGORY_LABELS[skill.category] ?? "技能";
  const power = Number(skill.basePower) > 0
    ? `威力 ${skill.basePower}`
    : "辅助";
  const cost = Number.isFinite(Number(skill.cost))
    ? `能量 ${skill.cost}`
    : "";
  return [skill.type ?? "未知系", category, power, cost]
    .filter(Boolean)
    .join(" · ");
}

export default function SkillPicker({
  choices,
  fallbackSkill,
  label,
  onChange,
  onOpen,
  value,
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [query, setQuery] = useState("");
  const selectedId = entryId(value);
  const selected = choices.find((skill) => skill.id === selectedId);
  const fallbackName = fallbackSkill?.skillName ?? fallbackSkill?.name;
  const displayed = selected ?? (
    fallbackName
      ? {
          basePower:
            fallbackSkill.displayedPower ??
            fallbackSkill.skillPower ??
            fallbackSkill.basePower,
          category:
            fallbackSkill.skillCategory ?? fallbackSkill.category,
          cost: fallbackSkill.skillCost ?? fallbackSkill.cost,
          name: fallbackName,
          type: fallbackSkill.skillType ?? fallbackSkill.type,
        }
      : null
  );
  const categoryOptions = useMemo(
    () => buildSkillCategoryOptions(choices),
    [choices],
  );
  const filteredChoices = useMemo(
    () => filterSkillChoices(choices, { category, query }),
    [category, choices, query],
  );
  const activeCategory = categoryOptions.find((option) =>
    option.key === category
  ) ?? categoryOptions[0];
  const scrollTarget = useMemo(() => {
    if (!filteredChoices.length) return undefined;
    const target = category === "all" && !query.trim() && selected
      ? selected
      : filteredChoices[0];
    return `skill-picker-option-${target.id}`;
  }, [category, filteredChoices, query, selected]);

  useEffect(() => {
    if (!categoryOptions.some((option) => option.key === category)) {
      setCategory("all");
    }
  }, [category, categoryOptions]);

  function resetFilters() {
    setCategory("all");
    setQuery("");
  }

  function toggle() {
    const nextOpen = !open;
    if (nextOpen) resetFilters();
    setKeyboardHeight(0);
    setOpen(nextOpen);
    if (nextOpen) onOpen?.();
  }

  function close() {
    resetFilters();
    setKeyboardHeight(0);
    setOpen(false);
  }

  function select(skillId) {
    onChange(skillId);
    close();
  }

  return (
    <View className="skill-picker">
      <Button
        aria-expanded={open}
        aria-label={`选择${label}`}
        className={[
          "skill-picker__trigger",
          !displayed?.type ? "skill-picker__trigger--empty" : "",
          open ? "skill-picker__trigger--expanded" : "",
        ].filter(Boolean).join(" ")}
        hoverClass="button-hover"
        onClick={toggle}
      >
        {displayed?.type ? <ElementIcon type={displayed.type} /> : null}
        <View className="skill-picker__trigger-copy">
          <Text className="skill-picker__label">{label}</Text>
          <Text className="skill-picker__name">
            {displayed?.name ?? "请选择技能"}
          </Text>
          {displayed ? (
            <SkillMeta skill={displayed} />
          ) : (
            <Text className="skill-picker__meta">仅显示可学习技能</Text>
          )}
        </View>
      </Button>
      {open ? (
        <View
          className="skill-picker__overlay"
          catchMove
          style={{
            "--skill-picker-keyboard-height": `${keyboardHeight}px`,
          }}
        >
          <View
            aria-label={`关闭${label}选项`}
            className="skill-picker__backdrop"
            onClick={close}
            role="button"
          />
          <View
            aria-label={`${label}选项`}
            aria-modal="true"
            className="skill-picker__sheet"
            role="dialog"
          >
            <View className="skill-picker__sheet-header">
              <View className="skill-picker__sheet-heading">
                <Text className="skill-picker__sheet-title">选择技能</Text>
                <Text className="skill-picker__sheet-count">
                  {category === "all"
                    ? (query.trim()
                        ? `${filteredChoices.length} 项匹配`
                        : `共 ${activeCategory.count} 项`)
                    : `${activeCategory.label} ${filteredChoices.length} 项`}
                </Text>
              </View>
              <Button
                aria-label={`关闭${label}选项`}
                className="skill-picker__close"
                hoverClass="button-hover"
                onClick={close}
              >
                关闭
              </Button>
            </View>
            <View
              aria-label="技能分类"
              className="skill-picker__categories"
              role="group"
            >
              {categoryOptions.map((option) => {
                const isActive = option.key === category;
                return (
                  <Button
                    aria-label={`筛选${option.label}技能，共 ${option.count} 项`}
                    aria-pressed={isActive}
                    className={[
                      "skill-picker__category",
                      isActive ? "skill-picker__category--active" : "",
                    ].filter(Boolean).join(" ")}
                    hoverClass="button-hover"
                    key={option.key}
                    onClick={() => setCategory(
                      isActive && option.key !== "all" ? "all" : option.key
                    )}
                  >
                    <Text>{option.label}</Text>
                    <Text className="skill-picker__category-count">
                      {option.count}
                    </Text>
                  </Button>
                );
              })}
            </View>
            <View className="skill-picker__search-wrap">
              <View className="skill-picker__search-field">
                <Image
                  alt="搜索"
                  className="skill-picker__search-icon"
                  mode="aspectFit"
                  src={searchIcon}
                />
                <Input
                  adjustPosition={false}
                  aria-label={`搜索${label}`}
                  className="skill-picker__search"
                  confirmType="search"
                  onInput={(event) => setQuery(readInputValue(event))}
                  onKeyboardHeightChange={(event) => {
                    const height = Number(event?.detail?.height);
                    setKeyboardHeight(Number.isFinite(height) && height > 0 ? height : 0);
                  }}
                  placeholder="搜索技能名、系别或拼音"
                  type="text"
                  value={query}
                />
              </View>
            </View>
            <ScrollView
              aria-label={`${label}可选技能`}
              className="skill-picker__options"
              scrollIntoView={scrollTarget}
              scrollY
              showScrollbar
            >
              {filteredChoices.length ? (
                filteredChoices.map((skill) => {
                  const isSelected = skill.id === selectedId;
                  return (
                    <Button
                      aria-label={`${skill.name} ${skillSummary(skill)}`}
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "skill-picker__option skill-picker__option--selected"
                          : "skill-picker__option"
                      }
                      hoverClass="button-hover"
                      id={`skill-picker-option-${skill.id}`}
                      key={skill.id}
                      onClick={() => select(skill.id)}
                    >
                      <ElementIcon type={skill.type} />
                      <View className="skill-picker__option-copy">
                        <Text className="skill-picker__option-name">
                          {skill.name}
                        </Text>
                        <SkillMeta skill={skill} />
                      </View>
                      {isSelected ? (
                        <Image
                          alt="当前已选技能"
                          className="skill-picker__selected-icon"
                          mode="aspectFit"
                          src={selectedIcon}
                        />
                      ) : <View className="skill-picker__selected-spacer" />}
                    </Button>
                  );
                })
              ) : (
                <View className="skill-picker__empty">
                  <Text>
                    {choices.length
                      ? "当前筛选无结果"
                      : "当前宠物没有可用技能数据"}
                  </Text>
                  {choices.length ? (
                    <Button
                      className="skill-picker__clear"
                      hoverClass="button-hover"
                      onClick={resetFilters}
                    >
                      清除筛选
                    </Button>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
