import { restoreS5RuntimeRelations } from "./vendor/s5-runtime-relations.js";
import { loadToolData } from "./load-data.mjs";
import { createMatchupUi, normalizeDiceSettings, validatePreviewSettings } from "./matchup-ui.mjs";
import { solve, resolveObservationPower } from "./engine.mjs";
import { calculateOwnPanel } from "./own-panel.mjs";
import { resolveOwnPreset } from "./own-presets.mjs";
import { createPicker } from "./picker.mjs";
import { analyzeHealth, compareFieldSamples, poisonMultiplier } from "./calibration.mjs";
import { getAwakeningBonuses } from "./awakening.mjs";

const STORAGE_KEY = "roco-pve-nature-manual-v1";
const STATS = {
  hp: "生命",
  physicalAttack: "物攻",
  magicalAttack: "魔攻",
  physicalDefense: "物防",
  magicalDefense: "魔防",
  speed: "速度",
};
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const defaultSession = () => ({
  demo: false,
  targetId: "spirit_4901e4794bd32f40",
  wildStatFormId: "",
  level: 42,
  profiles: [
    {
      id: "luoyin",
      name: "罗隐",
      spiritId: "spirit_4e7acb9d14c8f373",
      level: null,
      awakening: 5,
      panel: Object.fromEntries(Object.keys(STATS).map((key) => [key, null])),
    },
    {
      id: "dimo",
      name: "迪莫",
      spiritId: "spirit_db5a2cb398dc0385",
      level: null,
      awakening: 5,
      panel: Object.fromEntries(Object.keys(STATS).map((key) => [key, null])),
    },
  ],
  observations: [],
});
let catalog;
let session = defaultSession();
let activeProfile = "luoyin";
let direction = "outgoing";
let editingId = null;
let history = [];
let result;
let demoBackup = null;
let skillMap;
let spiritMap;
let seasonGroups = [];
let targetFilter = "initial";
let workspaceMode = "preview";
let matchupUi;
let diceCatalog = { dice: [] };
let traitCatalog = { traits: {} };
let presetLibrary = { entries: [] };
let pickers = {};
let fieldData = { formMappings: [], entries: [] };
let lastHealthView = false;

let noticeTimer;
function notice(message, error = false) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").className = `notice${error ? " error" : ""}`;
  $("notice").hidden = !message;
  if (message && !error) noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 4000);
}

function remember() {
  history.push(clone(session));
  if (history.length > 40) history.shift();
}

function clearWildObservations() {
  session.observations = [];
  for (const profile of session.profiles) if (profile.preview) {
    profile.preview.observed = {};
    profile.preview.picked = {};
  }
  if (session.preview) {
    session.preview.incomingDamages = [];
    session.preview.incomingPicks = [];
    delete session.preview.incomingDamage;
  }
}

function persist() {
  if (!demoBackup && !session.demo) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      notice("本机保存失败，请导出记录后继续。", true);
    }
  }
  if (!demoBackup && !session.demo)
    window.pveNaturePersistence?.save?.(clone(session));
}

function readNumber(id) {
  const value = $(id).value.trim();
  return value === "" ? null : Number(value);
}

function profileComplete(profile) {
  return (
    Number.isInteger(profile.level) &&
    profile.level > 0 &&
    [
      "physicalAttack",
      "magicalAttack",
      "physicalDefense",
      "magicalDefense",
    ].every(
      (key) => Number.isInteger(profile.panel?.[key]) && profile.panel[key] > 0,
    )
  );
}

function hasCompleteRaceStats(spirit) {
  return (
    spirit?.hasCompleteRaceStats ??
    Object.keys(STATS).every((key) => Number.isFinite(spirit?.raceStats?.[key]))
  );
}

function groupIdsFor(spiritId) {
  return seasonGroups
    .filter((group) => group.spiritIds?.includes(spiritId))
    .map((group) => group.id);
}

function groupLabelsFor(spiritId) {
  return seasonGroups
    .filter((group) => group.spiritIds?.includes(spiritId))
    .map((group) => group.shortLabel ?? group.id);
}

function matchesSpirit(spirit, query) {
  const text = query
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/^#/, "");
  if (!text) return true;
  const dex = spirit.dexNo == null ? "" : String(spirit.dexNo);
  return [
    spirit.name,
    spirit.pinyin,
    spirit.initials,
    ...(spirit.aliases ?? []),
    ...(spirit.formerNames ?? []),
    dex,
    dex.padStart(3, "0"),
  ].some((value) =>
    String(value ?? "")
      .toLocaleLowerCase()
      .replace(/\s+/g, "")
      .includes(text),
  );
}

function spiritLabel(spirit) {
  const dex =
    spirit.dexNo == null ? "" : `#${String(spirit.dexNo).padStart(3, "0")} `;
  const seasons = groupLabelsFor(spirit.id);
  return `${dex}${spirit.name}${spirit.types?.length ? ` · ${spirit.types.join("/")}` : ""}${seasons.length ? ` · ${seasons.join("/")}` : ""}${hasCompleteRaceStats(spirit) ? "" : " · 资料不足"}`;
}

function renderSpiritOptions(select, query, currentId, filter = "all") {
  const rows = catalog.spirits.filter(
    (spirit) =>
      matchesSpirit(spirit, query) &&
      (["all", "priority"].includes(filter) ||
        filter === "initial" && groupIdsFor(spirit.id).length > 0 && spirit.stage === "一阶" ||
        groupIdsFor(spirit.id).includes(filter)),
  );
  rows.sort((a, b) => {
    const priority =
      Number(groupIdsFor(b.id).length > 0) -
      Number(groupIdsFor(a.id).length > 0);
    return (
      (select.id === "target-species" && filter === "priority"
        ? priority
        : 0) ||
      (Number(a.dexNo) || 9999) - (Number(b.dexNo) || 9999) ||
      a.name.localeCompare(b.name, "zh-CN") ||
      a.id.localeCompare(b.id)
    );
  });
  const current = spiritMap.get(currentId);
  const outside = current && !rows.some((row) => row.id === currentId);
  select.innerHTML = `${outside ? `<option value="${escapeHtml(currentId)}">当前选择（筛选外）：${escapeHtml(spiritLabel(current))}</option>` : ""}${rows.map((spirit) => `<option value="${escapeHtml(spirit.id)}">${escapeHtml(spiritLabel(spirit))}</option>`).join("")}`;
  if (!rows.length && !current)
    select.innerHTML = '<option value="">没有匹配的精灵</option>';
  select.value = currentId;
  return { count: rows.length, outside };
}

function renderTargetPicker() {
  const spirit = spiritMap.get(session.targetId);
  $("target-name").textContent = spirit?.name ?? "未知精灵";
  $("target-level").value = session.level;
  $("target-filter").value = targetFilter;
  const { count, outside } = renderSpiritOptions(
    $("target-species"),
    $("target-search").value,
    session.targetId,
    targetFilter,
  );
  const group = seasonGroups.find((row) => row.id === targetFilter);
  const selectedGroups = ["all", "priority", "initial"].includes(targetFilter)
    ? seasonGroups
    : seasonGroups.filter((row) => row.id === targetFilter);
  $("target-catalog-note").textContent =
    `${count} 项${outside ? " · 当前目标在筛选外" : ""}${targetFilter === "priority" ? " · 奇遇与通行证目标优先排列" : targetFilter === "all" ? " · 全目录" : targetFilter === "initial" ? " · 奇遇与通行证初始形态" : ` · ${group?.label ?? targetFilter}`}`;
  $("season-source-details").hidden = !selectedGroups.length;
  $("season-source-notes").innerHTML = selectedGroups
    .map((row) => `<p>${escapeHtml(row.sourceNote ?? row.label)}</p>`)
    .join("");

  const complete = hasCompleteRaceStats(spirit);
  $("target-data-note").hidden = complete;
  $("target-data-note").textContent = complete
    ? ""
    : "该形态缺少完整种族值，无法计算。";
  $("target-trait").textContent = spirit?.traitName
    ? `特性：${spirit.traitName}`
    : "";
  setSpiritImage("target-image", spirit);
  $("target-tags").innerHTML = tagsFor(spirit);
  $("level-seg").innerHTML = [41, 42, 43, "all"]
    .map((level) => `<button type="button" data-level="${level}" aria-pressed="${session.level === level}">${level === "all" ? "41–43级全部" : level}</button>`)
    .join("");
  const form = fieldData.formMappings.find(row => row.sourceId === spirit?.id && row.initialId !== spirit.id);
  $("use-initial-form").hidden = !form;
  $("use-initial-form").textContent = form ? `改用初始形态：${form.initialName}` : "";
  pickers.target?.refresh();
}

function renderMatchup() {
  const combatDirection = workspaceMode === "preview" || ["hp", "poison"].includes(direction) ? "outgoing" : direction;
  const ownAttacks = combatDirection === "outgoing";
  $("versus-grid").dataset.direction = combatDirection;
  $("own-side").dataset.role = ownAttacks ? "attack" : "defense";
  $("wild-side").dataset.role = ownAttacks ? "defense" : "attack";
  $("own-role").textContent = ownAttacks ? "攻击方" : "防御方";
  $("wild-role").textContent = ownAttacks ? "防御方" : "攻击方";
  const target = spiritMap.get(session.targetId)?.name ?? "目标";
  const profile = session.profiles.find(
    (item) => item.id === $("record-profile").value,
  );
  const attack = direction === "incoming" ? target : (profile?.name ?? "我方");
  const defense = direction === "incoming" ? (profile?.name ?? "我方") : target;
  $("rail-matchup").innerHTML =
    `<span class="attack-name">${escapeHtml(attack)}</span><span>→</span><span class="defense-name">${escapeHtml(defense)}</span>`;
  $("current-matchup").textContent =
    direction === "hp"
      ? `生命验证：${target} · ${session.level === "all" ? "41–43" : session.level} 级`
      : direction === "incoming"
        ? `攻击方：${target} → 防御方：${profile?.name ?? "我方精灵"}`
        : `攻击方：${profile?.name ?? "我方精灵"} → 防御方：${target}`;
}

function setSpiritImage(id, spirit) {
  const node = $(id);
  const url = spirit?.imageUrl;
  node.hidden = !url;
  if (url && node.getAttribute("src") !== url) node.src = url;
}

function tagsFor(spirit) {
  return `${(spirit?.types ?? []).map((type) => `<span class="type-chip">${escapeHtml(type)}</span>`).join("")}<span>${escapeHtml(spirit?.stage ?? "")}</span>`;
}

function refreshQuickIvs() {
  $("quick-ivs").innerHTML = Object.entries(STATS)
    .map(([key, label]) => {
      const value = readNumber(`profile-iv-${key}`) ?? 0;
      const icon = catalog.assets?.stats?.[key];
      return `<button type="button" data-iv-stat="${key}" aria-pressed="${value === 60}" aria-label="${label}个体 ${value}" title="${label}个体 ${value}，点击切换 0 / 60">${icon ? `<img src="${escapeHtml(icon)}" alt=""/>` : ""}<span>${label}</span></button>`;
    })
    .join("");
}

function generatedProfile(profile, overrides = {}) {
  const displayIvs =
    profile.displayIvs ??
    Object.fromEntries(Object.keys(STATS).map((key) => [key, 0]));
  const next = {
    ...profile,
    level: profile.level ?? 60,
    natureId: profile.natureId ?? "neutral",
    displayIvs,
    ...overrides,
  };
  return {
    ...next,
    panel: calculateOwnPanel(
      {
        raceStats: spiritMap.get(next.spiritId)?.raceStats,
        level: next.level,
        natureId: next.natureId,
        displayIvs: next.displayIvs,
      },
      catalog,
    ),
    panelSource: "pvp-five-star",
  };
}

function presetProfile(profile, spirit = spiritMap.get(profile.spiritId)) {
  const preset = resolveOwnPreset(spirit.id, catalog, presetLibrary, traitCatalog);
  const next = {
    ...profile, spiritId: spirit.id, name: spirit.name, level: 60,
    awakening: preset?.awakening ?? profile.awakening ?? 5,
    natureId: preset?.natureId ?? "neutral",
    displayIvs: preset?.displayIvs ?? Object.fromEntries(Object.keys(STATS).map(key => [key, 60])),
    preview: preset ? {
      speciesId: spirit.id, skillIds: preset.skillIds,
      trait: preset.trait, skillOverrides: {}, observed: {}, picked: {},
    } : {},
  };
  try { return generatedProfile(next); }
  catch { return { ...next, panel: Object.fromEntries(Object.keys(STATS).map(key => [key, null])), panelSource: "pvp-five-star" }; }
}

function autoGenerateProfile() {
  const profile = session.profiles.find((row) => row.id === activeProfile);
  try {
    const displayIvs = Object.fromEntries(
      Object.keys(STATS).map((key) => [key, readNumber(`profile-iv-${key}`)]),
    );
    const next = generatedProfile(profile, {
      level: readNumber("profile-level"),
      natureId: $("profile-nature").value,
      displayIvs,
    });
    remember();
    Object.assign(profile, next);
    persist();
    renderProfiles();
    renderSkills();
    render();
    notice("");
  } catch (error) {
    renderProfiles();
    notice(`未生成面板：${error.message}`, true);
  }
}

function initializePickers() {
  const spiritRows = (selectId) =>
    Array.from($(selectId).options)
      .map((option) => spiritMap.get(option.value))
      .filter(Boolean)
      .map((spirit) => ({
        ...spirit,
        searchText: [
          spirit.name,
          spirit.pinyin,
          spirit.initials,
          spirit.dexNo,
          ...(spirit.aliases ?? []),
          ...(spirit.formerNames ?? []),
        ].join(" "),
      }));
  pickers.own = createPicker({
    anchor: "own-picker",
    trigger: "own-picker-input",
    source: "profile-species",
    label: "选择我方精灵",
    rows: () => spiritRows("profile-species"),
    image: (row) => row.imageUrl,
    describe: (row) =>
      `${row.dexNo ? `#${row.dexNo} · ` : ""}${row.types.join(" / ")} · ${row.stage ?? ""}${hasCompleteRaceStats(row) ? "" : " · 资料不足"}`,
  });
  pickers.target = createPicker({
    anchor: "target-picker",
    trigger: "target-picker-input",
    source: "target-species",
    label: "选择野生目标",
    rows: () => spiritRows("target-species"),
    image: (row) => row.imageUrl,
    describe: (row) =>
      `${row.dexNo ? `#${row.dexNo} · ` : ""}${row.types.join(" / ")} · ${groupLabelsFor(row.id).join(" / ")}${hasCompleteRaceStats(row) ? "" : " · 资料不足"}`,
  });
  pickers.skill = createPicker({
    anchor: "skill-picker",
    trigger: "skill-picker-input",
    source: "record-skill",
    label: "选择当前技能",
    rows: () =>
      Array.from($("record-skill").options)
        .map((option) => skillMap.get(option.value))
        .filter(Boolean),
    image: (row) => row.iconUrl ?? catalog.assets?.elements?.[row.type],
    describe: (row) =>
      `${row.type} · ${row.category === "physical" ? "物攻" : row.category === "magical" ? "魔攻" : "变化"} ${row.basePower ?? ""}${skillSupport(row) ? " · 不参与伤害匹配" : ""}`,
    optionAttribute: "data-skill-id",
  });
  pickers.nature = createPicker({
    anchor: "nature-picker",
    trigger: "nature-picker-trigger",
    source: "profile-nature",
    label: "选择我方性格",
    button: true,
    buttonLabel: (row) =>
      !row || row.id === "neutral"
        ? "普通"
        : `${escapeHtml(row.name)} <span class="up">${STATS[row.upStat]}↑</span> <span class="down">${STATS[row.downStat]}↓</span>`,
    rows: () => [{ id: "neutral", name: "普通" }, ...catalog.natures],
    describe: (row) =>
      row.id === "neutral"
        ? "无性格加减"
        : `${STATS[row.upStat]} +20% / ${STATS[row.downStat]} -10%`,
    optionAttribute: "data-nature-id",
  });
}

function renderProfiles() {
  $("profile-tabs").innerHTML = session.profiles
    .map(
      (profile) =>
        `<button type="button" role="tab" aria-selected="${profile.id === activeProfile}" data-profile="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} <span class="tab-star">${(profile.awakening ?? 5) + 5}★</span></button>`,
    )
    .join("");
  const complete = session.profiles.filter(profileComplete);
  $("profile-summary").textContent = complete.length
    ? complete
        .map((profile) => `${profile.name} ${profile.level}级`)
        .join(" · ")
    : "先登记实际面板";
  const profile =
    session.profiles.find((item) => item.id === activeProfile) ??
    session.profiles[0];
  activeProfile = profile.id;
  session.activeProfileId = activeProfile;
  const profileSpecies = spiritMap.get(profile.spiritId);
  const { count } = renderSpiritOptions(
    $("profile-species"),
    $("profile-species-search").value,
    profile.spiritId,
  );
  $("profile-species-note").textContent =
    `${count} 项可选${hasCompleteRaceStats(profileSpecies) ? "" : " · 种族值资料不足，仍可登记实际面板"}`;
  $("load-own-preset").disabled = !resolveOwnPreset(profile.spiritId, catalog, presetLibrary, traitCatalog);
  $("profile-level").value = profile.level ?? "";
  $("profile-awakening").value = profile.awakening ?? 5;
  $("star-seg").innerHTML = [0, 1, 2, 3, 4, 5]
    .map((awakening) => `<button type="button" data-awakening="${awakening}" aria-pressed="${(profile.awakening ?? 5) === awakening}">${awakening + 5}★</button>`)
    .join("");
  $("stab-badge").textContent = `本系 ×${getAwakeningBonuses(profile.awakening ?? 5).sameTypeMultiplier.toFixed(2)}`;
  $("profile-nature").innerHTML =
    '<option value="neutral">普通 · 无性格加减（基准）</option>' +
    catalog.natures
      .map(
        (nature) =>
          `<option value="${escapeHtml(nature.id)}">${escapeHtml(nature.name)} · ${escapeHtml(STATS[nature.upStat])}↑ ${escapeHtml(STATS[nature.downStat])}↓</option>`,
      )
      .join("");
  $("profile-nature").value = profile.natureId ?? "neutral";
  for (const key of Object.keys(STATS))
    $(`profile-iv-${key}`).value = profile.displayIvs?.[key] ?? 0;
  $("profile-panel-feedback").textContent = "";
  for (const key of Object.keys(STATS))
    $(`panel-${key}`).value = profile.panel?.[key] ?? "";
  $("profile-save-state").textContent = profileComplete(profile)
    ? "使用此档案反推；面板变化后请更新。"
    : "此档案尚未登记，生命记录可直接使用。";
  const selected = activeProfile;
  $("record-profile").innerHTML = session.profiles
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}${profileComplete(item) ? ` · ${item.level}级` : " · 未登记"}</option>`,
    )
    .join("");
  if (session.profiles.some((item) => item.id === selected))
    $("record-profile").value = selected;
  $("own-name").textContent = profile.name;
  setSpiritImage("own-image", profileSpecies);
  $("own-tags").innerHTML = tagsFor(profileSpecies);
  $("own-trait").textContent = profileSpecies?.traitName
    ? `特性：${profileSpecies.traitName}`
    : "";
  $("profile-summary").textContent =
    profile.panelSource === "pvp-five-star"
      ? "五星 PVP 面板"
      : "手动实际面板";
  $("profile-save-state").textContent =
    profile.panelSource === "pvp-five-star"
      ? "性格 / 个体即时更新 · 星级只影响本系加成"
      : "已保留手动面板";
  refreshQuickIvs();
  pickers.own?.refresh();
  pickers.nature?.refresh();
  renderMatchup();
}

function skillSupport(skill) {
  if (!skill.supported)
    return readableMessage(skill.unsupportedReason || "含条件或特殊效果，请改用简单单击，或用“血量验证”记录已知掉血。");
  const profile = session.profiles.find(
    (item) => item.id === $("record-profile").value,
  );
  const defender = spiritMap.get(
    direction === "incoming" ? profile?.spiritId : session.targetId,
  );
  const chart = catalog.typeChart;
  const attackIndex = chart.types.indexOf(skill.type);
  if (attackIndex < 0 || !defender) return "缺少系别资料，请重新选择双方精灵。";
  const factors = defender.types.map(
    (type) => chart.matrix[attackIndex]?.[chart.types.indexOf(type)] ?? NaN,
  );
  if (factors.some((factor) => factor !== 1))
    return "此记录页不计算克制或抵抗；请换中性技能，或用“血量验证”记录已知掉血。";
  return null;
}

function renderSkills(preferredId) {
  const previous = preferredId ?? $("record-skill").value;
  const profile = session.profiles.find(
    (item) => item.id === $("record-profile").value,
  );
  const spiritId =
    direction === "incoming" ? session.targetId : profile?.spiritId;
  const learnset = catalog.learnsets.find((item) => item.spiritId === spiritId);
  const query = $("skill-search").value.trim().toLocaleLowerCase();
  const skills = (learnset?.skillIds ?? [])
    .map((id) => skillMap.get(id))
    .filter(Boolean)
    .filter((skill) => skill.name.toLocaleLowerCase().includes(query))
    .sort(
      (a, b) =>
        Number(Boolean(skillSupport(a))) - Number(Boolean(skillSupport(b))),
    );
  const available = skills.filter((skill) => !skillSupport(skill));
  const pending = skills.filter((skill) => skillSupport(skill));
  const options = (list) =>
    list
      .map(
        (skill) =>
          `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.name)} · ${skill.category === "physical" ? "物攻" : skill.category === "magical" ? "魔攻" : "变化"} ${skill.basePower ?? ""}</option>`,
      )
      .join("");
  $("record-skill").innerHTML = skills.length
    ? `${available.length ? `<optgroup label="参与伤害匹配">${options(available)}</optgroup>` : ""}${pending.length ? `<optgroup label="可保存，不参与伤害匹配">${options(pending)}</optgroup>` : ""}`
    : '<option value="">没有匹配的学习面技能</option>';
  if (skills.some((skill) => skill.id === previous))
    $("record-skill").value = previous;
  renderSkillDescription();
  pickers.skill?.refresh();
  renderMatchup();
}

function renderSkillDescription() {
  const skill = skillMap.get($("record-skill").value);
  const costRule = ["incoming", "outgoing"].includes(direction) && skill?.recordCostPower;
  const costInput = $("record-skill-cost");
  $("record-cost-settings").hidden = !costRule;
  costInput.disabled = !costRule;
  costInput.required = Boolean(costRule);
  const costKey = `${direction}:${skill?.id ?? ""}`;
  if (costInput.dataset.skill !== costKey) {
    costInput.dataset.skill = costKey;
    costInput.value = costRule ? costRule.baseCost : "";
  }
  if (direction === "poison") {
    $("skill-description").textContent = "记录中毒的单个跳字。毒孢子施加5层；额外触发的第二跳分开记录。";
    $("skill-description").classList.remove("blocked");
    $("rail-skill").textContent = "中毒单跳 · 生命上限反推";
    return;
  }
  const reason = skill ? skillSupport(skill) : "请更换搜索词。";
  $("skill-description").textContent =
    direction === "hp"
      ? "填写本次实际扣除的生命与前后百分比，不需要出战档案或觉醒乘区。"
      : skill
        ? `${skill.type}系 · ${skill.description}${reason ? `　${reason}` : "　按单次伤害匹配；请填写实际掉血与回合状态。"}`
        : reason;
  let power = skill?.basePower;
  if (costRule) {
    try { power = resolveObservationPower(skill, { actualSkillCost: readNumber("record-skill-cost") }); }
    catch { power = "?"; }
  }
  $("skill-power").textContent = skill
    ? `${skill.category === "physical" ? "物" : skill.category === "magical" ? "魔" : "变"} ${power ?? ""}`
    : "";
  $("rail-skill").textContent =
    direction === "hp"
      ? "已知掉血与血量验证"
      : (skill?.name ?? "请选择本次技能");
  $("skill-description").classList.toggle(
    "blocked",
    direction !== "hp" && Boolean(reason),
  );
}

function setDirection(value, preferredSkill) {
  direction = value;
  document
    .querySelectorAll("button[data-direction]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.direction === direction),
      ),
    );
  $("record-profile-label").hidden = ["hp", "poison"].includes(direction);
  $("record-skill-label").hidden = ["hp", "poison"].includes(direction);
  $("poison-settings").hidden = direction !== "poison";
  const multiplier = poisonMultiplier(spiritMap.get(session.targetId), catalog);
  $("poison-multiplier").value = multiplier ?? "";
  $("poison-rule").textContent = multiplier == null
    ? "当前属性无法使用普通中毒反推。"
    : `每层3%最大生命，单跳向下取整；按当前属性默认 ×${multiplier}，有特殊修正请核对。`;
  $("percent-section").hidden = direction === "incoming";
  $("own-defeated-label").hidden = direction !== "incoming";
  $("damage-label").textContent =
    direction === "incoming" ? "我方实际掉血" : direction === "poison" ? "单次中毒跳字" : "敌方实际掉血";
  $("record-damage").required = direction !== "outgoing";
  $("percent-hint").textContent =
    "填写实际扣血；倒下时不填技能过量伤害。同一目标按记录顺序追踪，显示 0% 不等于确认倒下。";
  $("skill-search").value = "";
  syncPercentInputs();
  renderSkills(preferredSkill);
}

function syncPercentInputs() {
  const game = $("percent-mode").value === "game";
  if (game) $("percent-digits").value = "0";
  $("percent-digits").disabled = game;
  const step = $("percent-digits").value === "0" ? "1" : "0.1";
  $("before-percent").step = step;
  $("after-percent").step = step;
}

function clearEditor() {
  editingId = null;
  const profileId = $("record-profile").value;
  $("observation-form").reset();
  $("record-skill-cost").dataset.skill = "";
  if (session.profiles.some((profile) => profile.id === profileId))
    $("record-profile").value = profileId;
  $("observation-heading").textContent = "添加战斗记录";
  $("add-observation").textContent = "加入记录";
  $("cancel-edit").hidden = true;
  $("record-feedback").textContent = "";
  setDirection(direction);
}

function descriptionForObservation(observation) {
  const profile = session.profiles.find(
    (item) => item.id === observation.profileId,
  );
  const skill = skillMap.get(observation.skillId);
  const target = spiritMap.get(session.targetId)?.name ?? "未知目标";
  if (observation.direction === "hp") return `${target} · 生命验证`;
  if (observation.direction === "poison") return `${target} · ${observation.poison?.layers ?? "?"}层中毒单跳`;
  return `${observation.direction === "incoming" ? `${target} → ${profile?.name ?? "未知档案"}` : `${profile?.name ?? "未知档案"} → ${target}`} · ${skill?.name ?? "未知技能"}${skill?.recordCostPower ? ` · 实际能耗 ${observation.actualSkillCost ?? "未确认"}` : ""}`;
}

function renderRecords() {
  $("record-count").textContent = session.observations.length;
  $("records-list").innerHTML = session.observations.length
    ? session.observations
        .map((observation, index) => {
          const evidence = result?.observations?.find(
            (item) => item.id === observation.id,
          );
          const percentText = [
            observation.beforePercent,
            observation.afterPercent,
          ].some((value) => value !== null && value !== undefined)
            ? ` · ${observation.beforePercent ?? "?"}% → ${observation.afterPercent ?? "?"}%`
            : "";
          return `<article class="record-row"><div class="record-row-head"><span class="record-number">${index + 1}</span><span class="record-title">${escapeHtml(descriptionForObservation(observation))}</span><div class="record-actions"><button type="button" data-edit="${escapeHtml(observation.id)}" aria-label="修改第${index + 1}条记录">修改</button><button type="button" data-delete="${escapeHtml(observation.id)}" aria-label="删除第${index + 1}条记录">删除</button></div></div><div class="record-value">${observation.damage == null ? "未填实际掉血" : `实际掉血 <strong>${observation.damage}</strong> HP`}${escapeHtml(percentText)}${observation.defeated ? " · 已倒下" : ""}</div><p class="record-reason ${evidence?.status === "used" ? "used" : ""}">${escapeHtml(observation.direction === "poison" ? "毒伤记录 · 查看生命上限匹配结果" : evidence?.status === "used" ? `匹配到 ${evidence.remainingCount ?? "?"} 种性格` : `未参与匹配：${readableMessage(evidence?.reason ?? "请核对本条输入")}`)}</p>${observation.note ? `<p class="record-note-text">${escapeHtml(observation.note)}</p>` : ""}</article>`;
        })
        .join("")
    : '<p class="records-empty">从一条实际掉血开始；每加入一条，重新交叉筛选。</p>';
}

function readableMessage(message) {
  let text = String(message ?? "");
  const actions = {
    "野怪面板模型实测未通过，结果仅供校准。": "匹配使用当前目标面板；读数不符时，请用“血量验证”核对生命上限。",
    "当前模型与已核算记录冲突，不能据此确认实战性格。": "请核对实际掉血、技能、面板与记录顺序，再修改或撤销不符的记录。",
    "补齐标记为待校准的记录；存在未核算记录时，不给出确定性格。": "修改标记为“未参与匹配”的记录，补齐列出的条件。",
    "场上状态尚未确认；请排除增减攻防、护盾、暴击及其他额外效果。": "核对强化、减伤、护盾与暴击后，在“当回合状态”选择确认。",
    "该技能尚未纳入简单单击白名单，暂不参与反推。": "此技能不参与伤害匹配；请换简单单击，或用“血量验证”记录已知掉血。",
  };
  text = actions[text] ?? text;
  text = text.replace(/未适配特性，仅按基础公式预估。?/g, "当前未计入特性伤害；请用“血量验证”，或返回判断页填写特性条件。")
    .replace(/预测伤害/g, "计算伤害").replace(/预估/g, "计算").replace(/候选/g, "性格")
    .replace(/待校准/g, "需补充条件");
  // The engine uses stable IDs; the interface refers to the visible record order.
  const records = session.observations
    .map((observation, index) => ({ id: observation.id, label: `第 ${index + 1} 条记录` }))
    .sort((a, b) => b.id.length - a.id.length);
  for (const { id, label } of records) {
    text = text.split(`记录${id}`).join(label).split(id).join(label);
  }
  return text;
}

function rangesText(ranges) {
  return ranges.map(row => row.min === row.max ? String(row.min) : `${row.min}–${row.max}`).join("、");
}

function renderCalibration() {
  const health = analyzeHealth(session, catalog);
  const pending = health.poison.filter(row => row.status === "unconfirmed");
  const hasHealthRecords = session.observations.some(row => ["hp", "poison"].includes(row.direction) || row.afterPercent != null);
  if (hasHealthRecords !== lastHealthView) $("formula-preview").open = !hasHealthRecords;
  lastHealthView = hasHealthRecords;
  $("health-result").hidden = !hasHealthRecords;
  const title = health.status === "empty" ? "等待完整读数" : health.status === "conflict" ? "血量条件冲突"
    : `${rangesText(health.ranges)}${health.capped ? "＋" : ""} HP`;
  const preview = health.naturePreview;
  const directions = preview && [...new Set(preview.map(nature => nature.upStat === "hp" ? "生命增强" : nature.downStat === "hp" ? "生命削弱" : "生命不变"))];
  $("health-result").innerHTML = `<div class="health-heading">反推生命上限</div><strong class="health-value">${escapeHtml(title)}</strong>
    <p>${health.usedCount ? "由实际掉血反推的整数范围" : "填写单跳毒伤，或已知扣血与前后百分比"}${health.capped ? "；已到搜索边界，真实上限可能更高" : ""}</p>
    ${health.poison.filter(row => row.label).map(row => `<p class="field-hint">第 ${row.index + 1} 条：${escapeHtml(row.label)}</p>`).join("")}
    ${pending.map(row => `<p class="calibration-note">第 ${row.index + 1} 条：${escapeHtml(row.reason)}</p>`).join("")}
    ${health.percentages.blocked.filter(row => session.observations[row.index]?.direction !== "incoming").length && !health.usedCount ? '<p class="calibration-note">百分比记录需确认显示精度、舍入方式及回合状态。</p>' : ""}
    ${preview && health.status !== "conflict" ? `<details class="hp-model-note"><summary>匹配结果：${directions.length ? escapeHtml(directions.join(" / ")) : "未找到匹配"}${preview.length ? ` · ${preview.length}种性格` : ""}</summary>
      <p>按当前目标的等级、生命性格和异色状态匹配奇遇血量。</p>
      <p>${preview.map(nature => escapeHtml(nature.name)).join("、") || "当前血量范围未匹配到性格，请补充其他伤害记录。"}</p></details>` : ""}`;
  const comparisons = compareFieldSamples(session, catalog, fieldData);
  $("field-result").hidden = !comparisons.length;
  $("field-result").innerHTML = comparisons.length ? `<details class="field-comparison" open><summary>同读数的历史样本</summary>${comparisons.map(item =>
    `<div class="field-match"><strong>第 ${item.index + 1} 条</strong>${item.matches.map(row => `<p>${escapeHtml(STATS[row.stat])}：${escapeHtml({up:"增强",neutral:"不变",down:"削弱","not-up":"未增强（含不变 / 削弱）"}[row.label] ?? row.label)}<br><span class="muted">${escapeHtml(row.sourceTitle)} · ${escapeHtml(`第 ${String(row.sourceRow).split("/").at(-1)} 行`)}</span></p>${!row.configurationMatches ? '<p class="calibration-note">当前配置与原记录条件不同，请展开核对出战精灵、等级和防御。</p>' : ""}<details><summary>原记录条件</summary><p>${escapeHtml(row.notes)}</p></details>`).join("")}</div>`).join("")}<p class="field-hint">样本对照只包含单项属性，完整性格需同时匹配增强与削弱项。</p></details>` : "";
  return health;
}

function renderResults() {
  const health = renderCalibration();
  const count = result.candidates?.length ?? 0;
  const used =
    result.observations?.filter((item) => item.status === "used").length ?? 0;
  const modelStatus = result.modelStatus ?? result.status;
  const directRecords = session.observations.filter(row => row.direction !== "poison");
  const blocked = (result.observations ?? []).filter(item => item.status === "blocked" && directRecords.some(row => row.id === item.id)).length;
  const statusText = {
    empty: "待录入实测",
    incomplete: "请补全记录条件",
    conflict: "未找到匹配",
  };
  const label =
    !directRecords.length && lastHealthView ? "生命上限结果见上方"
      : used && count ? count === 1 ? `匹配性格：${result.candidates[0].nature.name}` : `${count} 种匹配性格`
      : statusText[modelStatus] ?? "待录入实测";
  const description = used
    ? `${used} 条记录参与匹配${blocked ? ` · ${blocked} 条需补全条件` : ""}${session.demo ? " · 合成演示" : ""}`
    : directRecords.length ? "尚无记录参与伤害匹配，请修改下方提示的记录。" : "添加实际掉血，或使用血量验证。";
  $("result-status").innerHTML =
    `<div class="result-label ${modelStatus === "conflict" ? "conflict" : ""}">${escapeHtml(label)}</div><div class="result-description">${escapeHtml(description)}</div>`;
  const independentHealthRecord = session.observations.some(row => ["hp", "poison"].includes(row.direction));
  const showHealthSummary = lastHealthView && (health.usedCount > 0 || used === 0 || independentHealthRecord);
  $("record-result-brief").textContent = showHealthSummary ? health.status === "conflict" ? "血量条件冲突" : health.usedCount ? `生命上限：${rangesText(health.ranges)}${health.capped ? "＋" : ""} HP` : "请补全血量记录条件" : label;
  $("record-result-dock").querySelector("button").dataset.resultTarget = showHealthSummary ? "health-result" : "result-status";
  const showCandidates = used > 0 && count > 0;
  const candidates = showCandidates
    ? `<ul class="candidate-list">${result.candidates
        .map(
          ({ nature, panel, panels }) =>
            `<li><details><summary><span class="candidate-main"><span class="candidate-name">${escapeHtml(nature.name)}${panels ? ` · ${panels.map(row => row.level).join("/")}级` : ""}</span><span class="candidate-change"><span class="up">${escapeHtml(STATS[nature.upStat] ?? nature.upStat)} ↑</span><span class="down">${escapeHtml(STATS[nature.downStat] ?? nature.downStat)} ↓</span></span></span></summary><div class="candidate-panel">${Object.entries(
              STATS,
            )
              .map(
                ([key, label]) => `${label} ${escapeHtml(panels ? [...new Set(panels.map(row => row.panel[key]))].join(" / ") : panel?.[key] ?? "—")}`,
              )
              .join(" · ")}</div></details></li>`,
        )
        .join("")}</ul>`
    : `<p class="result-empty">${!directRecords.length && lastHealthView ? "毒伤记录用于上方生命上限匹配；补充单次伤害可继续匹配其他属性。" : modelStatus === "conflict" ? "没有性格同时匹配这些记录。请检查实际面板、技能、回合状态与记录顺序，再修改或撤销。" : modelStatus === "incomplete" ? "记录已保存，请按各条提示补齐条件，或改用“血量验证”记录已知掉血。" : "登记出战面板并录入伤害，也可直接使用“血量验证”核对敌方生命。"}</p>`;
  const evidence = (result.observations ?? []).filter(
    (item) => item.status === "used",
  );
  $("results-body").innerHTML =
    candidates +
    (evidence.length
      ? `<section class="result-subsection"><h4>数值依据</h4>${evidence
          .map((item) => {
            const observation = session.observations.find(
              (row) => row.id === item.id,
            );
            const predictions = item.predictions ?? [];
            const compatible = predictions.filter(
              (prediction) => prediction.compatible,
            );
            const value = (prediction) =>
              (prediction.targetLevel ? `${prediction.targetLevel}级 · ` : "") + (observation?.direction === "hp"
                ? `生命 ${prediction.hpMax ?? "—"}`
                : `伤害 ${prediction.damage ?? "—"} · 生命 ${prediction.hpMax ?? "—"}`);
            return `<details class="evidence-row"><summary>第 ${session.observations.indexOf(observation) + 1} 条 · 匹配 ${item.remainingCount ?? compatible.length} 种性格</summary><div class="evidence-details"><p>${escapeHtml(readableMessage(item.reason ?? descriptionForObservation(observation ?? {})))}</p><div class="evidence-table">${predictions
              .map((prediction) => {
                const nature = catalog.natures.find(
                  (row) => row.id === prediction.natureId,
                );
                return `<span class="${prediction.compatible ? "" : "not-compatible"}">${escapeHtml(nature?.name ?? prediction.natureId)}${prediction.compatible ? " ✓" : " ×"}</span><span>${escapeHtml(value(prediction))}</span>`;
              })
              .join("")}</div></div></details>`;
          })
          .join("")}</section>`
      : "") +
    (directRecords.length && (result.suggestions ?? []).length
      ? `<section class="result-subsection"><h4>下一步怎么测</h4><ul>${result.suggestions.map((suggestion) => `<li>${escapeHtml(readableMessage(suggestion))}</li>`).join("")}</ul></section>`
      : "") +
    (directRecords.length && (result.warnings ?? []).length
      ? `<section class="result-subsection"><h4>核对条件</h4><ul>${result.warnings.map((warning) => `<li>${escapeHtml(readableMessage(warning))}</li>`).join("")}</ul></section>`
      : "");
}

function render(message) {
  const diceCleanup = normalizeDiceSettings(session, diceCatalog);
  renderTargetPicker();
  renderMatchup();
  $("undo").disabled = !history.length;
  $("demo-banner").hidden = !demoBackup && !session.demo;
  try {
    result = solve(session, catalog);
  } catch (error) {
    result = {
      status: "incomplete",
      candidates: [],
      observations: [],
      suggestions: [],
      warnings: [`核算未完成：${error.message}`],
    };
  }
  renderRecords();
  renderResults();
  matchupUi?.render();
  if (diceCleanup.changed) persist();
  if (diceCleanup.removed.length) notice(`已取消未参与计算的骰子：${diceCleanup.removed.join('、')}。请核对当前骰子配置。`, true);
  else if (message !== undefined) notice(message);
}

function validateImport(value) {
  const incoming = value.session ?? value;
  if (
    !incoming ||
    !spiritMap.has(incoming.targetId) ||
    ![41, 42, 43, "all"].includes(incoming.level) ||
    !Array.isArray(incoming.profiles) ||
    incoming.profiles.length !== 2 ||
    !Array.isArray(incoming.observations) ||
    incoming.observations.length > 1000
  )
    throw new Error("需要本工具的 41–43 级记录，且精灵必须在当前目录中。");
  for (const profile of incoming.profiles) {
    if (
      typeof profile.id !== "string" ||
      !profile.id ||
      !spiritMap.has(profile.spiritId) ||
      (profile.level != null &&
        (!Number.isInteger(profile.level) ||
          profile.level < 1 ||
          profile.level > 60)) ||
      !Number.isInteger(profile.awakening) ||
      profile.awakening < 0 ||
      profile.awakening > 5 ||
      !profile.panel ||
      Object.keys(STATS).some((key) => !(key in profile.panel)) ||
      Object.values(profile.panel).some(
        (number) =>
          number !== null &&
          (!Number.isInteger(number) || number < 1 || number > 100000),
      )
    )
      throw new Error("出战档案的精灵或面板数值无效。");
    profile.name = spiritMap.get(profile.spiritId).name;
  }
  const profileIds = new Set(incoming.profiles.map((profile) => profile.id));
  if (profileIds.size !== 2) throw new Error("出战档案重复。");
  const observationIds = new Set();
  for (const observation of incoming.observations) {
    if (
      typeof observation.id !== "string" ||
      !observation.id ||
      observationIds.has(observation.id) ||
      !["incoming", "outgoing", "hp", "poison"].includes(observation.direction) ||
      !["clean", "unknown"].includes(observation.context) ||
      (!["hp", "poison"].includes(observation.direction) &&
        (!profileIds.has(observation.profileId) ||
          !skillMap.has(observation.skillId))) ||
      (observation.damage != null &&
        (!Number.isInteger(observation.damage) || observation.damage < 1)) ||
      ["beforePercent", "afterPercent"].some(
        (key) =>
          observation[key] != null &&
          (!Number.isFinite(observation[key]) ||
            observation[key] < 0 ||
            observation[key] > 100),
      )
    )
      throw new Error("战斗记录含未知档案、技能或无效数值。");
    if (observation.percentMode != null && !["unknown", "game", "round", "floor"].includes(observation.percentMode))
      throw new Error("百分比显示规则无效，请选择游戏显示、四舍五入或向下截断。");
    if (observation.percentMode === "game" && (observation.percentDigits !== 0 || [observation.beforePercent, observation.afterPercent].some(value => value != null && !Number.isInteger(value))))
      throw new Error("游戏显示需使用整数百分比，请将精度设为整数并核对前后读数。");
    observationIds.add(observation.id);
  }
  validatePreviewSettings(incoming, spiritMap.get(incoming.targetId));
  return clone(incoming);
}

function initialTargetId(id) {
  const explicit = fieldData.formMappings.find(row => row.sourceId === id);
  if (explicit && spiritMap.has(explicit.initialId)) return explicit.initialId;
  const spirit = spiritMap.get(id);
  if (!spirit || spirit.stage === "一阶") return id;
  const initial = catalog.spirits.filter(row => row.evolutionFamilyId && row.evolutionFamilyId === spirit.evolutionFamilyId && row.stage === "一阶");
  return initial.length === 1 ? initial[0].id : id;
}

function setWorkspaceMode(mode) {
  workspaceMode = mode;
  document.body.dataset.workspaceMode = workspaceMode;
  $("toggle-validation").textContent = workspaceMode === "preview" ? "实测记录" : "返回判断";
  renderMatchup();
  matchupUi?.render();
}

function attachEvents() {
  for (const button of document.querySelectorAll("button[data-result-target]"))
    button.addEventListener("click", () => {
      const target = $(button.dataset.resultTarget);
      if (target.id === "result-status") $("formula-preview").open = true;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.focus({ preventScroll: true });
    });
  for (const button of document.querySelectorAll("button[data-workspace-mode]"))
    button.addEventListener("click", () => setWorkspaceMode(button.dataset.workspaceMode));
  $("toggle-validation").addEventListener("click", () =>
    setWorkspaceMode(workspaceMode === "preview" ? "validation" : "preview"),
  );
  $("star-seg").addEventListener("click", (event) => {
    const button = event.target.closest("[data-awakening]");
    if (!button) return;
    $("profile-awakening").value = button.dataset.awakening;
    $("profile-awakening").dispatchEvent(new Event("change"));
  });
  $("level-seg").addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (!button) return;
    $("target-level").value = button.dataset.level;
    $("target-level").dispatchEvent(new Event("change"));
  });
  $("use-initial-form").addEventListener("click", () => {
    const form = fieldData.formMappings.find(row => row.sourceId === session.targetId);
    if (!form || !spiritMap.has(form.initialId)) return;
    $("target-species").value = form.initialId;
    $("target-species").dispatchEvent(new Event("change"));
  });
  $("swap-direction").addEventListener("click", () => {
    if (workspaceMode === "preview") $("preview-incoming").scrollIntoView({ behavior: "smooth", block: "center" });
    else setDirection(direction === "incoming" ? "outgoing" : "incoming");
  });
  for (const [id, value] of [
    ["ivs-zero", 0],
    ["ivs-max", 60],
  ])
    $(id).addEventListener("click", () => {
      for (const key of Object.keys(STATS))
        $(`profile-iv-${key}`).value = value;
      autoGenerateProfile();
    });
  $("quick-ivs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-iv-stat]");
    if (!button) return;
    const input = $(`profile-iv-${button.dataset.ivStat}`);
    input.value = Number(input.value) === 60 ? 0 : 60;
    autoGenerateProfile();
  });
  for (const key of Object.keys(STATS))
    $(`profile-iv-${key}`).addEventListener("change", autoGenerateProfile);
  $("profile-nature").addEventListener("change", autoGenerateProfile);
  $("profile-level").addEventListener("change", autoGenerateProfile);
  $("profile-awakening").addEventListener("change", () => {
    remember();
    session.profiles.find((row) => row.id === activeProfile).awakening =
      readNumber("profile-awakening");
    persist();
    renderProfiles();
    renderSkills();
    render();
  });
  $("generate-panel").addEventListener("click", autoGenerateProfile);
  $("load-own-preset").addEventListener("click", () => {
    const profile = session.profiles.find(row => row.id === activeProfile);
    remember();
    Object.assign(profile, presetProfile(profile));
    session.observations = session.observations.filter(row => row.profileId !== profile.id);
    // The same target now faces a different own panel; clear its old observations.
    if (session.preview) {
      session.preview.incomingDamages = [];
      session.preview.incomingPicks = [];
    }
    persist();
    renderProfiles();
    clearEditor();
    render();
    notice("已载入预设，可撤销。");
  });
  for (const key of Object.keys(STATS))
    $(`panel-${key}`).addEventListener("input", () => {
      $("profile-panel-feedback").textContent = "手动改动尚未保存。";
    });
  $("profile-species-search").addEventListener("input", () => renderProfiles());
  $("profile-species").addEventListener("change", () => {
    const profile = session.profiles.find((row) => row.id === activeProfile);
    const spirit = spiritMap.get($("profile-species").value);
    if (!spirit || profile.spiritId === spirit.id) return;
    remember();
    const hadRecords = session.observations.some(
      (row) => row.profileId === profile.id,
    );
    if (hadRecords) session.observations = [];
    Object.assign(profile, presetProfile(profile, spirit));
    persist();
    renderProfiles();
    clearEditor();
    render();
    notice(
      hadRecords
        ? "已换我方精灵，本场旧记录已清空，可撤销；另一个档案保留。"
        : "",
    );
  });
  $("target-search").addEventListener("input", renderTargetPicker);
  $("target-filter").addEventListener("change", () => {
    targetFilter = $("target-filter").value;
    renderTargetPicker();
  });
  $("target-species").addEventListener("change", () => {
    const chosenId = $("target-species").value;
    const id = workspaceMode === "preview" ? initialTargetId(chosenId) : chosenId;
    if (!spiritMap.has(id)) return;
    if (id === session.targetId) {
      // A different evolution can resolve to the already selected initial form.
      // Restore the picker identity without discarding this encounter's records.
      if (chosenId !== id) renderTargetPicker();
      return;
    }
    remember();
    session.targetId = id;
    session.wildStatFormId = "";
    clearWildObservations();
    persist();
    clearEditor();
    render();
    notice(id !== chosenId ? `已按初始形态选择 ${spiritMap.get(id).name}，本场实测已清空，可撤销。` : "");
  });
  $("profile-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile]");
    if (!button) return;
    activeProfile = button.dataset.profile;
    $("profile-species-search").value = "";
    renderProfiles();
    renderSkills();
    render();
  });
  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const panel = Object.fromEntries(
      Object.keys(STATS).map((key) => [key, readNumber(`panel-${key}`)]),
    );
    if (
      [
        "physicalAttack",
        "magicalAttack",
        "physicalDefense",
        "magicalDefense",
      ].some((key) => !Number.isInteger(panel[key]) || panel[key] <= 0) ||
      Object.values(panel).some(
        (value) => value !== null && (!Number.isInteger(value) || value <= 0),
      )
    ) {
      notice("请填写正整数双攻、双防；生命与速度可选填。", true);
      return;
    }
    remember();
    Object.assign(
      session.profiles.find((row) => row.id === activeProfile),
      { panel, panelSource: "manual" },
    );
    persist();
    renderProfiles();
    renderSkills();
    render();
    notice("已保存手动面板。");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("more-menu").open = false;
  });
  document.addEventListener("pointerdown", (event) => {
    if (!$("more-menu").contains(event.target)) $("more-menu").open = false;
  });
  $("more-menu").addEventListener("click", (event) => {
    if (event.target.closest("button")) $("more-menu").open = false;
  });
  document
    .querySelectorAll("button[data-direction]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        setDirection(button.dataset.direction),
      ),
    );
  $("record-profile").addEventListener("change", () => {
    activeProfile = $("record-profile").value;
    renderProfiles();
    renderSkills();
    render();
  });
  $("record-skill").addEventListener("change", renderSkillDescription);
  $("record-skill-cost").addEventListener("input", renderSkillDescription);
  $("skill-search").addEventListener("input", () => renderSkills());
  $("before-full").addEventListener("click", () => {
    $("before-percent").value = 100;
    $("before-full-confirmed").checked = true;
  });
  $("before-percent").addEventListener("input", () => { $("before-full-confirmed").checked = false; });
  $("percent-mode").addEventListener("change", syncPercentInputs);
  $("percent-digits").addEventListener("change", syncPercentInputs);
  $("before-full-confirmed").addEventListener("change", () => {
    if ($("before-full-confirmed").checked) $("before-percent").value = 100;
  });
  $("cancel-edit").addEventListener("click", clearEditor);
  $("observation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const damage = readNumber("record-damage");
    const beforePercent =
      direction === "incoming" ? null : readNumber("before-percent");
    const afterPercent =
      direction === "incoming" ? null : readNumber("after-percent");
    if (damage !== null && (!Number.isInteger(damage) || damage < 1)) {
      $("record-feedback").textContent = "实际掉血请填正整数。";
      return;
    }
    if (direction === "poison" && (damage === null || !Number.isInteger(readNumber("poison-layers")) || readNumber("poison-layers") < 1 || readNumber("poison-layers") > 100)) {
      $("record-feedback").textContent = "请填写单次中毒跳字与1至100的当前总层数。";
      return;
    }
    if (!["hp", "poison"].includes(direction) && !$("record-skill").value) {
      $("record-feedback").textContent = "请选择技能。";
      return;
    }
    if (direction === "outgoing" && damage === null && afterPercent === null) {
      $("record-feedback").textContent = "至少填写实际掉血或受击后百分比。";
      return;
    }
    if (
      direction === "hp" &&
      (damage === null || beforePercent === null || afterPercent === null)
    ) {
      $("record-feedback").textContent = "生命验证需要实际掉血及前后百分比。";
      return;
    }
    if (
      beforePercent !== null &&
      afterPercent !== null &&
      afterPercent > beforePercent
    ) {
      $("record-feedback").textContent =
        "这条记录的血量增加了；请核对前后读数，有回血时开始新目标重新记录。";
      return;
    }
    const observation = {
      id:
        editingId ??
        `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      profileId: ["hp", "poison"].includes(direction) ? null : $("record-profile").value,
      direction,
      skillId: direction === "hp" ? null : direction === "poison" ? "skill_e8ae25185fcd9973" : $("record-skill").value,
      ...(!$("record-skill-cost").disabled ? { actualSkillCost: readNumber("record-skill-cost") } : {}),
      damage,
      beforePercent,
      afterPercent,
      beforeFull: direction !== "incoming" && $("before-full-confirmed").checked,
      ...(direction === "poison" ? {poison: {layers: readNumber("poison-layers"), multiplier: readNumber("poison-multiplier"), confirmed: $("poison-confirmed").checked}} : {}),
      percentMode: $("percent-mode").value,
      percentDigits: readNumber("percent-digits"),
      defeated: direction !== "incoming" && $("record-defeated").checked,
      ownDefeated: direction === "incoming" && $("record-own-defeated").checked,
      context: $("record-context").value,
      reduction: 1,
      note: $("record-note").value.trim(),
    };
    remember();
    if (editingId)
      session.observations[
        session.observations.findIndex((item) => item.id === editingId)
      ] = observation;
    else session.observations.push(observation);
    persist();
    clearEditor();
    render();
    notice("");
  });
  $("records-list").addEventListener("click", (event) => {
    const deleting = event.target.closest("[data-delete]");
    if (deleting) {
      remember();
      session.observations = session.observations.filter(
        (item) => item.id !== deleting.dataset.delete,
      );
      persist();
      clearEditor();
      render();
      return;
    }
    const editing = event.target.closest("[data-edit]");
    if (!editing) return;
    const observation = session.observations.find(
      (item) => item.id === editing.dataset.edit,
    );
    editingId = observation.id;
    activeProfile = observation.profileId ?? activeProfile;
    renderProfiles();
    $("record-profile").value = activeProfile;
    setDirection(observation.direction, observation.skillId);
    $("record-skill-cost").value = observation.actualSkillCost ?? "";
    renderSkillDescription();
    $("record-damage").value = observation.damage ?? "";
    $("before-percent").value = observation.beforePercent ?? "";
    $("before-full-confirmed").checked = observation.beforeFull === true;
    if (observation.direction === "poison") {
      $("poison-layers").value = observation.poison?.layers ?? 5;
      $("poison-multiplier").value = observation.poison?.multiplier ?? "";
      $("poison-confirmed").checked = observation.poison?.confirmed === true;
    }
    $("after-percent").value = observation.afterPercent ?? "";
    $("percent-mode").value = observation.percentMode ?? "unknown";
    $("percent-digits").value = observation.percentDigits ?? 0;
    syncPercentInputs();
    $("record-context").value = observation.context;
    $("record-note").value = observation.note ?? "";
    $("record-defeated").checked = Boolean(observation.defeated);
    $("record-own-defeated").checked = Boolean(observation.ownDefeated);
    $("observation-heading").textContent =
      `修改第 ${session.observations.indexOf(observation) + 1} 条记录`;
    $("add-observation").textContent = "保存修改";
    $("cancel-edit").hidden = false;
    $("observation-form").scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  });
  $("target-level").addEventListener("change", () => {
    const level = $("target-level").value === "all" ? "all" : readNumber("target-level");
    if (level === session.level) return;
    remember();
    session.level = level;
    session.observations = [];
    persist();
    clearEditor();
    render();
    notice("已换野怪等级，本场实测已清空，可撤销。");
  });
  $("new-target").addEventListener("click", () => {
    remember();
    session.wildStatFormId = "";
    session.observations = [];
    session.preview = {};
    for (const profile of session.profiles) if (profile.preview) profile.preview.observed = {};
    persist();
    clearEditor();
    render();
    notice("已开始新目标，出战档案保留。");
  });
  $("undo").addEventListener("click", () => {
    if (!history.length) return;
    session = history.pop();
    activeProfile = session.activeProfileId ?? session.profiles[0].id;
    persist();
    clearEditor();
    renderProfiles();
    render("已撤销上一步。");
  });
  $("export-json").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "roco-pve-nature-v1",
            exportedAt: new Date().toISOString(),
            synthetic: Boolean(demoBackup),
            session,
          },
          null,
          2,
        ),
      ],
      { type: "application/json;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${spiritMap.get(session.targetId)?.name ?? "精灵"}性格记录-${new Date().toISOString().slice(0, 10)}${demoBackup ? "-合成演示" : ""}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("import-json").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async () => {
    const file = $("import-file").files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("记录文件大于 2 MB。");
      const payload = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      const incoming = validateImport(payload);
      if ((payload.synthetic || incoming.demo) && !demoBackup)
        demoBackup = clone(session);
      incoming.demo = Boolean(payload.synthetic || incoming.demo);
      if (!incoming.demo) demoBackup = null;
      remember();
      session = incoming;
      activeProfile = session.activeProfileId ?? session.profiles[0].id;
      persist();
      clearEditor();
      renderProfiles();
      render(
        incoming.demo ? "已导入合成演示记录。" : "记录已导入。",
      );
    } catch (error) {
      notice(`导入失败：${error.message}`, true);
    }
    $("import-file").value = "";
  });
  $("load-demo").addEventListener("click", async () => {
    try {
      const response = await fetch("./data/demo-session.json");
      if (!response.ok) throw new Error("演示数据尚未就绪");
      const demo = await response.json();
      if (!demoBackup) demoBackup = clone(session);
      session = validateImport(demo);
      history = [];
      clearEditor();
      renderProfiles();
      render("");
      $("profiles-section").open = false;
    } catch (error) {
      notice(`未载入演示：${error.message}`, true);
    }
  });
  $("leave-demo").addEventListener("click", () => {
    if (!demoBackup) return;
    session = demoBackup;
    demoBackup = null;
    history = [];
    persist();
    clearEditor();
    renderProfiles();
    render("已返回你的本机记录。");
  });
}

try {
  const data = await loadToolData();
  catalog = restoreS5RuntimeRelations(data.catalog);
  ({ fieldData, diceCatalog, traitCatalog, presetLibrary } = data);
  skillMap = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  spiritMap = new Map(catalog.spirits.map((spirit) => [spirit.id, spirit]));
  seasonGroups = Array.isArray(catalog.targetGroups)
    ? catalog.targetGroups
    : [];
  try {
    const seasonResponse = seasonGroups.length
      ? null
      : await fetch("./data/season-targets.json");
    if (!seasonGroups.length && seasonResponse?.ok) {
      const seasons = await seasonResponse.json();
      seasonGroups = Array.isArray(seasons) ? seasons : (seasons.groups ?? []);
    }
  } catch {
    /* The whole catalog remains available when optional season groups are absent. */
  }
  if (!seasonGroups.length && Array.isArray(catalog.targetGroups))
    seasonGroups = catalog.targetGroups;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      session = validateImport(JSON.parse(saved));
      activeProfile = session.activeProfileId ?? session.profiles[0].id;
    }
  } catch {
    notice(
      "上次记录未能恢复，当前已打开空白档案。可导入之前导出的记录。",
      true,
    );
  }
  renderProfiles();
  for (const profile of session.profiles) {
    if (
      !profileComplete(profile) &&
      Object.values(profile.panel ?? {}).every((value) => value == null)
    ) {
      try {
        Object.assign(profile, presetProfile(profile));
      } catch {
        /* Missing species data stays explicit. */
      }
    }
  }
  renderProfiles();
  setDirection("outgoing");
  initializePickers();
  matchupUi = createMatchupUi({ catalog, diceCatalog, traitCatalog, getSession: () => session,
    getProfile: () => session.profiles.find(row => row.id === activeProfile),
    commit: mutation => { remember(); mutation(); render(); persist(); },
  });
  attachEvents();
  render();
  $("profiles-section").open = false;
  window.pveNatureUi = {
    getSession: () => clone(session),
    getPreview: () => clone(matchupUi.getResult()),
    setSession(value) {
      const incoming = validateImport(value);
      if (incoming.demo && !demoBackup) demoBackup = clone(session);
      if (!incoming.demo) demoBackup = null;
      session = incoming;
      activeProfile = session.activeProfileId ?? session.profiles[0].id;
      persist();
      renderProfiles();
      clearEditor();
      render();
    },
    render,
  };
} catch (error) {
  $("app").innerHTML =
    `<section class="load-failure"><h2>页面未能加载</h2><p>${escapeHtml(error.message)}</p><p><a href="./index.html">重新加载</a> · <a href="/">返回国服计算器</a></p></section>`;
}
