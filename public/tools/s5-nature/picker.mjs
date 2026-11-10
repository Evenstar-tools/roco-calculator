const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let opened;

// Render a bounded slice. Searching and keyboard navigation cover the whole catalog.
export function createPicker({
  anchor,
  trigger,
  source,
  rows,
  label,
  image,
  describe,
  onSelect,
  button = false,
  buttonLabel,
  optionAttribute,
}) {
  const host = document.getElementById(anchor);
  const control = document.getElementById(trigger);
  const select = document.getElementById(source);
  const popup = document.createElement("div");
  popup.className = "picker-popup";
  popup.hidden = true;
  const listId = `${anchor}-listbox`;
  const search = button ? document.createElement("input") : control;
  if (button) {
    search.className = "picker-menu-search";
    search.placeholder = "搜索性格";
    search.setAttribute("aria-label", "搜索性格");
    popup.append(search);
  }
  const list = document.createElement("div");
  list.id = listId;
  list.className = "picker-list";
  list.setAttribute("role", "listbox");
  popup.append(list);
  const foot = document.createElement("p");
  foot.className = "picker-foot";
  popup.append(foot);
  host.append(popup);
  control.setAttribute("role", "combobox");
  control.setAttribute("aria-label", label);
  control.setAttribute("aria-haspopup", "listbox");
  control.setAttribute("aria-controls", listId);
  control.setAttribute("aria-expanded", "false");
  search.setAttribute("autocomplete", "off");
  let candidates = [],
    active = -1,
    limit = 24,
    query = "";
  const current = () => rows().find((row) => row.id === select.value);
  function refresh() {
    if (!popup.hidden) {
      filter();
      return;
    }
    const row = current();
    if (button && buttonLabel) control.innerHTML = buttonLabel(row);
    else if (button) control.textContent = row?.name ?? "选择性格";
    else control.value = row?.name ?? "";
  }
  function render() {
    const visible = candidates.slice(0, limit);
    list.innerHTML = visible.length
      ? visible
          .map(
            (row, index) =>
              `<button type="button" role="option" id="${listId}-${index}" data-picker-id="${escape(row.id)}" ${optionAttribute ? `${optionAttribute}="${escape(row.id)}"` : ""} aria-selected="${row.id === select.value}" class="picker-option${index === active ? " is-active" : ""}">${image?.(row) ? `<img loading="lazy" src="${escape(image(row))}" alt=""/>` : ""}<span><strong>${escape(row.name)}</strong><small>${escape(describe?.(row) ?? "")}</small></span>${row.id === select.value ? '<span class="picker-check">✓</span>' : ""}</button>`,
          )
          .join("")
      : '<p class="picker-empty">没有匹配项</p>';
    foot.textContent = `${candidates.length} 项 · ↑↓ 选择，Enter 确认`;
    search.setAttribute(
      "aria-activedescendant",
      active >= 0 ? `${listId}-${active}` : "",
    );
  }
  function filter() {
    const needle = query
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, "")
      .replace(/^#/, "");
    candidates = rows().filter(
      (row) =>
        !row.hiddenFromSearch && (!needle ||
        String(row.searchText ?? row.name)
          .toLocaleLowerCase()
          .replace(/\s+/g, "")
          .includes(needle)),
    );
    active = candidates.length ? 0 : -1;
    limit = 24;
    render();
  }
  function close(restore = true) {
    popup.hidden = true;
    control.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
    if (opened?.close === close) opened = null;
    if (restore) refresh();
  }
  function open() {
    if (!popup.hidden) return;
    opened?.close();
    opened = { close };
    popup.hidden = false;
    control.setAttribute("aria-expanded", "true");
    query = "";
    search.value = "";
    filter();
    const bottom = host.getBoundingClientRect().bottom;
    popup.classList.toggle(
      "picker-popup--up",
      innerHeight - bottom < 260 && bottom > innerHeight / 2,
    );
    if (button) search.focus();
  }
  function choose(id) {
    const chosen = candidates.find((row) => row.id === id);
    if (!chosen) return;
    // Catalog-backed pickers keep only the current value in their hidden select.
    // The searchable list still comes from rows(), including keyboard choices.
    if (!Array.from(select.options).some(option => option.value === id))
      select.add(new Option(chosen.name, id));
    select.value = id;
    close(false);
    onSelect?.(id);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    refresh();
    control.focus();
  }
  control.addEventListener("click", () => {
    if (button && !popup.hidden) close();
    else open();
  });
  if (!button) control.addEventListener("focus", open);
  search.addEventListener("input", () => {
    query = search.value;
    filter();
  });
  function keydown(event) {
    if (event.key === "Escape") {
      close();
      control.focus();
      event.stopPropagation();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (popup.hidden) open();
      else {
        active = Math.max(
          0,
          Math.min(
            candidates.length - 1,
            active + (event.key === "ArrowDown" ? 1 : -1),
          ),
        );
        limit = Math.max(limit, active + 1);
        render();
        document
          .getElementById(`${listId}-${active}`)
          ?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter" && !popup.hidden) {
      event.preventDefault();
      if (active >= 0) choose(candidates[active].id);
    } else if (event.key === "Tab") close();
  }
  control.addEventListener("keydown", keydown);
  if (button) search.addEventListener("keydown", keydown);
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-picker-id]");
    if (item) choose(item.dataset.pickerId);
  });
  list.addEventListener("scroll", () => {
    if (
      list.scrollTop + list.clientHeight >= list.scrollHeight - 60 &&
      limit < candidates.length
    ) {
      limit += 24;
      render();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!host.contains(event.target)) close();
  });
  select.addEventListener("change", refresh);
  refresh();
  return { refresh, close, open };
}
