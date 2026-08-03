import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ElementIcon } from "./ElementIcon.jsx";

const CATEGORY_LABELS = {
  defense: "防御",
  dual: "双攻",
  magical: "魔法",
  physical: "物理",
  status: "变化",
};

const searchTextCache = new Map();
const OPTION_HEIGHT = 42;
const OPTION_OVERSCAN = 5;
const OPTION_VIEWPORT_HEIGHT = 360;

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
  const listboxRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

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

  const visibleWindow = useMemo(() => {
    const viewportItems = Math.ceil(
      OPTION_VIEWPORT_HEIGHT / OPTION_HEIGHT,
    );
    const start = Math.max(
      0,
      Math.floor(scrollTop / OPTION_HEIGHT) - OPTION_OVERSCAN,
    );
    const end = Math.min(
      matches.length,
      start + viewportItems + OPTION_OVERSCAN * 2,
    );
    return {
      end,
      items: matches.slice(start, end),
      start,
    };
  }, [matches, scrollTop]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, matches.length - 1)));
    setScrollTop(0);
    if (listboxRef.current) listboxRef.current.scrollTop = 0;
  }, [matches]);

  useLayoutEffect(() => {
    if (!open || !listboxRef.current || !matches[activeIndex]) return;
    const top = activeIndex * OPTION_HEIGHT;
    const bottom = top + OPTION_HEIGHT;
    const viewportTop = listboxRef.current.scrollTop;
    const viewportBottom = viewportTop + OPTION_VIEWPORT_HEIGHT;
    let nextScrollTop = viewportTop;
    if (top < viewportTop) nextScrollTop = top;
    else if (bottom > viewportBottom) {
      nextScrollTop = bottom - OPTION_VIEWPORT_HEIGHT;
    }
    if (nextScrollTop !== viewportTop) {
      listboxRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [activeIndex, matches, open]);

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

  function handleScroll(event) {
    const nextScrollTop = event.currentTarget.scrollTop;
    const viewportStart = Math.min(
      Math.ceil(nextScrollTop / OPTION_HEIGHT),
      Math.max(0, matches.length - 1),
    );
    const viewportEnd = Math.min(
      matches.length - 1,
      Math.ceil(
        (nextScrollTop + OPTION_VIEWPORT_HEIGHT) / OPTION_HEIGHT,
      ) - 1,
    );
    setScrollTop(nextScrollTop);
    setActiveIndex((index) =>
      index < viewportStart || index > viewportEnd ? viewportStart : index,
    );
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
        aria-activedescendant={
          open && matches[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
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
        <ul
          className="skill-picker__options"
          id={listboxId}
          onScroll={handleScroll}
          ref={listboxRef}
          role="listbox"
        >
          {matches.length ? (
            <>
              {visibleWindow.start > 0 ? (
                <li
                  aria-hidden="true"
                  className="skill-picker__spacer"
                  role="presentation"
                  style={{ height: visibleWindow.start * OPTION_HEIGHT }}
                />
              ) : null}
              {visibleWindow.items.map((skill, offset) => {
                const index = visibleWindow.start + offset;
                return (
                  <li
                    aria-posinset={index + 1}
                    aria-selected={skill.id === selected?.id}
                    aria-setsize={matches.length}
                    className={index === activeIndex ? "is-active" : ""}
                    id={`${listboxId}-option-${index}`}
                    key={skill.id}
                    onClick={() => commit(skill)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    <span className="skill-picker__option-name">
                      <ElementIcon label size={20} type={skill.type} />
                      <strong>{skill.name}</strong>
                      <small>
                        {CATEGORY_LABELS[skill.category] ?? skill.category}
                      </small>
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
                );
              })}
              {visibleWindow.end < matches.length ? (
                <li
                  aria-hidden="true"
                  className="skill-picker__spacer"
                  role="presentation"
                  style={{
                    height: (matches.length - visibleWindow.end) * OPTION_HEIGHT,
                  }}
                />
              ) : null}
            </>
          ) : (
            <li className="skill-picker__empty">没有匹配技能</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
