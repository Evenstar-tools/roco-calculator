import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EntityChangeHint } from "./EntityChangeHint.jsx";
import { SkillIcon } from "./SkillIcon.jsx";

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
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

export function resolveSkillMenuLayout({
  inputBottom,
  inputTop,
  viewportHeight,
}) {
  const availableAbove = Math.max(
    0,
    inputTop - VIEWPORT_MARGIN - MENU_GAP,
  );
  const availableBelow = Math.max(
    0,
    viewportHeight - inputBottom - VIEWPORT_MARGIN - MENU_GAP,
  );
  const placement =
    availableBelow >= OPTION_VIEWPORT_HEIGHT ||
    availableBelow >= availableAbove
      ? "down"
      : "up";
  const available = placement === "up" ? availableAbove : availableBelow;
  return {
    maxHeight: Math.floor(Math.min(OPTION_VIEWPORT_HEIGHT, available)),
    placement,
  };
}

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
  const [menuLayout, setMenuLayout] = useState({
    maxHeight: OPTION_VIEWPORT_HEIGHT,
    placement: "down",
  });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 选中技能变化时重置搜索框，避免残留上一次过滤词
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
      Math.max(OPTION_HEIGHT, menuLayout.maxHeight) / OPTION_HEIGHT,
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
  }, [matches, menuLayout.maxHeight, scrollTop]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 过滤结果变化后收回虚拟列表滚动位置 */
    setActiveIndex((index) => Math.min(index, Math.max(0, matches.length - 1)));
    setScrollTop(0);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (listboxRef.current) listboxRef.current.scrollTop = 0;
  }, [matches]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    let frame = null;
    const updateLayout = () => {
      const input = inputRef.current;
      if (!input) return;
      const box = input.getBoundingClientRect();
      const next = resolveSkillMenuLayout({
        inputBottom: box.bottom,
        inputTop: box.top,
        viewportHeight: window.innerHeight,
      });
      setMenuLayout((current) =>
        current.maxHeight === next.maxHeight &&
        current.placement === next.placement
          ? current
          : next,
      );
    };
    const scheduleUpdate = (event) => {
      if (event?.type === "scroll" && event.target === listboxRef.current) {
        return;
      }
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateLayout);
    };
    updateLayout();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !listboxRef.current || !matches[activeIndex]) return;
    const top = activeIndex * OPTION_HEIGHT;
    const bottom = top + OPTION_HEIGHT;
    const viewportTop = listboxRef.current.scrollTop;
    const viewportHeight =
      listboxRef.current.clientHeight || menuLayout.maxHeight;
    const viewportBottom = viewportTop + viewportHeight;
    let nextScrollTop = viewportTop;
    if (top < viewportTop) nextScrollTop = top;
    else if (bottom > viewportBottom) {
      nextScrollTop = bottom - viewportHeight;
    }
    if (nextScrollTop !== viewportTop) {
      listboxRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
  }, [activeIndex, matches, menuLayout.maxHeight, open]);

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
    const viewportHeight =
      event.currentTarget.clientHeight || menuLayout.maxHeight;
    const viewportStart = Math.min(
      Math.ceil(nextScrollTop / OPTION_HEIGHT),
      Math.max(0, matches.length - 1),
    );
    const viewportEnd = Math.min(
      matches.length - 1,
      Math.ceil(
        (nextScrollTop + viewportHeight) / OPTION_HEIGHT,
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
      {selected && query === selected.name ? (
        <SkillIcon
          className="skill-picker__selected-icon"
          skill={selected}
          size={24}
        />
      ) : (
        <MagnifyingGlass
          aria-hidden="true"
          className="skill-picker__search-icon"
          size={14}
        />
      )}
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
      {selected?.changeInfo ? (
        <EntityChangeHint
          changeInfo={selected.changeInfo}
          className="skill-picker__change-hint"
        />
      ) : null}
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
          data-placement={menuLayout.placement}
          id={listboxId}
          onScroll={handleScroll}
          ref={listboxRef}
          role="listbox"
          style={{ maxHeight: `${menuLayout.maxHeight}px` }}
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
                const isPendingPreview =
                  skill.calculationStatus === "pending-skill-data";
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
                      <SkillIcon
                        className="skill-picker__option-icon"
                        label
                        skill={skill}
                        size={30}
                      />
                      <strong>{skill.name}</strong>
                      <EntityChangeHint changeInfo={skill.changeInfo} />
                      <small>
                        {isPendingPreview
                          ? "参数待确认"
                          : CATEGORY_LABELS[skill.category] ?? skill.category}
                      </small>
                    </span>
                    <span className="skill-picker__option-meta">
                      {isPendingPreview ? (
                        <small>威力/能耗待确认</small>
                      ) : (
                        <>
                          <small>威 {skill.basePower ?? "动态"}</small>
                          <small>耗 {skill.cost ?? "—"}</small>
                        </>
                      )}
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
