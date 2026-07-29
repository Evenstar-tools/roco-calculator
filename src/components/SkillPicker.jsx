import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ElementIcon } from "./ElementIcon.jsx";

const CATEGORY_LABELS = {
  defense: "防御",
  dual: "双攻",
  magical: "魔法",
  physical: "物理",
  status: "变化",
};

const searchTextCache = new Map();

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·（）()_\-/]+/g, "");
}

function searchText(skill) {
  const cacheKey = `${skill.id}:${skill.name}`;
  if (searchTextCache.has(cacheKey)) return searchTextCache.get(cacheKey);

  const value =
    skill.searchText ??
    [skill.name, skill.type, skill.category].map(compact).join("|");
  searchTextCache.set(cacheKey, value);
  return value;
}

export function SkillPicker({
  ariaLabel,
  className = "",
  onFocus,
  onSelect,
  selected,
  skills,
}) {
  const listboxId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const matches = useMemo(() => {
    const needle = compact(
      open && query === selected?.name ? "" : query,
    );
    const list = needle
      ? skills.filter((skill) => searchText(skill).includes(needle))
      : skills;
    return [...list].sort(
      (first, second) =>
        Number(first.learnable === false) -
        Number(second.learnable === false),
    );
  }, [open, query, selected?.name, skills]);

  function commit(skill) {
    setQuery(skill?.name ?? "");
    setOpen(false);
    onSelect(skill?.id ?? null);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      commit(matches[activeIndex]);
    } else if (event.key === "Escape") {
      setQuery(selected?.name ?? "");
      setOpen(false);
    }
  }

  return (
    <div
      className={`skill-picker ${className}`.trim()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery(selected?.name ?? "");
          setOpen(false);
        }
      }}
    >
      <MagnifyingGlass aria-hidden="true" className="skill-picker__search-icon" size={14} />
      <input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={ariaLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
          onFocus?.();
        }}
        onKeyDown={handleKeyDown}
        placeholder="输入技能名或拼音"
        ref={inputRef}
        role="combobox"
        value={query}
      />
      {selected ? (
        <button
          aria-label={`清空${ariaLabel}`}
          className="skill-picker__clear"
          onClick={() => {
            commit(null);
            inputRef.current?.focus();
          }}
          title={`清空${ariaLabel}`}
          type="button"
        >
          <X aria-hidden="true" size={12} weight="bold" />
        </button>
      ) : (
        <CaretDown
          aria-hidden="true"
          className="skill-picker__caret"
          size={12}
          weight="bold"
        />
      )}
      {open ? (
        <ul className="skill-picker__options" id={listboxId} role="listbox">
          {matches.length ? (
            matches.map((skill, index) => (
              <li
                aria-selected={skill.id === selected?.id}
                className={index === activeIndex ? "is-active" : ""}
                key={skill.id}
                onClick={() => commit(skill)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                <span className="skill-picker__option-name">
                  <ElementIcon label size={20} type={skill.type} />
                  <strong>{skill.name}</strong>
                  <small>{CATEGORY_LABELS[skill.category] ?? skill.category}</small>
                </span>
                <span className="skill-picker__option-meta">
                  <small>威 {skill.basePower ?? "动态"}</small>
                  <small>耗 {skill.cost ?? "—"}</small>
                  <small
                    className={
                      skill.learnable === false
                        ? "is-unlearnable"
                        : "is-learnable"
                    }
                  >
                    {skill.learnable === false ? "不可学习" : "可学习"}
                  </small>
                </span>
              </li>
            ))
          ) : (
            <li className="skill-picker__empty">没有匹配技能</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
