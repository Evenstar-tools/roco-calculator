import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { executeCli } from "../../../src/cli/rock-calculator-cli.js";

// Local evidence adapter. It uses the current Web S5 pipeline and real UI
// selection defaults; no product or CLI behavior is changed.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../../..");

function selectUnique(items, value, fields) {
  const matches = items.filter((item) => fields.some((key) => item[key] === value));
  if (matches.length !== 1) throw new Error(`Expected one entity for ${value}; got ${matches.length}`);
  return matches[0];
}

function mergePatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] ??= {};
      mergePatch(target[key], value);
    } else target[key] = structuredClone(value);
  }
}

function pickResult(result) {
  if (!result) return null;
  return Object.fromEntries(["skillId", "skillName", "status", "reason", "skillCost", "resolvedPower",
    "staticPower", "displayPower", "hitCount", "hitDamages", "totalDamage", "hpPercent",
    "combatPanel", "gainSummary", "formulaSteps", "warnings"].map((key) => [key, result[key]]));
}

export async function replay(request) {
  const loader = await createServer({ root: projectRoot, configFile: false, logLevel: "error",
    server: { middlewareMode: true, watch: null } });
  let withWebPreview, createInitialState, selectSpirit, selectFourSkill, buildBalanceComparison;
  let getS5PreviewTraitInputs, withS5PreviewBattleLevels, buildCombatState;
  try {
    ({ withWebPreview } = await loader.ssrLoadModule("/src/features/s5-preview/with-web-preview.js"));
    ({ createInitialState } = await loader.ssrLoadModule("/src/state/defaults.js"));
    ({ selectSpirit, selectFourSkill } = await loader.ssrLoadModule("/src/state/calculator-session.js"));
    ({ buildBalanceComparison } = await loader.ssrLoadModule("/src/features/balance-comparison/model.js"));
    ({ getS5PreviewTraitInputs } = await loader.ssrLoadModule("/src/domain/s5-preview-traits.js"));
    ({ withS5PreviewBattleLevels } = await loader.ssrLoadModule("/src/domain/battle-level.js"));
    ({ buildCombatState } = await loader.ssrLoadModule("/src/domain/calculator-view-model.js"));
  } finally { await loader.close(); }
  const rawSnapshot = JSON.parse(await readFile(path.join(projectRoot, "data/snapshots/current.json"), "utf8"));
  const snapshot = withWebPreview(rawSnapshot);
  const localSkillAliases = {};
  const localModels = [];
  for (const skill of request.localSkills ?? []) {
    if (!skill.evidence || !skill.id?.startsWith("skill_local_video_")) throw new Error("Local skill needs evidence and skill_local_video_ ID");
    const index = snapshot.skills.findIndex((entry) => entry.id === skill.id || entry.name === skill.name);
    const productSkill = index === -1 ? null : snapshot.skills[index];
    const model = { ...productSkill, ...skill, id: productSkill?.id ?? skill.id,
      localAliasId: skill.id, localReplayOnly: true, notInProduct: !productSkill,
      localModelNotInProduct: true, replayModelScope: "仅算实帧参数对应的基础伤害，不结算待实现附加效果",
      omittedPendingEffects: productSkill?.s5StatusEffectPending ?? null,
      provenance: { ...productSkill?.provenance, basePower: skill.evidence, description: skill.evidence } };
    delete model.s5StatusEffectPending;
    localSkillAliases[skill.id] = model.id;
    localModels.push(model);
    if (index === -1) snapshot.skills.push(model);
    else snapshot.skills[index] = model;
  }
  const safeEventId = String(request.eventId ?? "event").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cliRoot = path.join(here, "cli-project", safeEventId);
  await mkdir(path.join(cliRoot, "data/snapshots"), { recursive: true });
  await writeFile(path.join(cliRoot, "data/snapshots/current.json"), JSON.stringify(snapshot), "utf8");
  await writeFile(path.join(cliRoot, "package.json"), await readFile(path.join(projectRoot, "package.json"), "utf8"), "utf8");
  const initialState = createInitialState(snapshot);
  let state = structuredClone(initialState);
  state.mode = "four";
  const defaultPresets = {};
  for (const side of ["attacker", "defender"]) {
    const spirit = selectUnique(snapshot.spirits, request[side], ["id", "fullName", "name"]);
    state = selectSpirit(state, { initialState, snapshot, side, spiritId: spirit.id }).state;
    const configured = state.sides[side];
    defaultPresets[side] = { spirit: spirit.fullName, spiritId: spirit.id,
      nature: configured.nature, natureId: configured.natureId, displayIvs: structuredClone(configured.displayIvs),
      traits: spirit.traitIds.map((id) => snapshot.traits.find((trait) => trait.id === id)?.name),
      skills: configured.skills.four.map((entry) => {
        const id = typeof entry === "string" ? entry : entry?.skillId ?? entry?.id;
        const skill = snapshot.skills.find((candidate) => candidate.id === id);
        return skill ? { id, name: skill.name, cost: skill.cost, basePower: skill.basePower } : null;
      }) };
  }
  let uiDefaultState = structuredClone(state);
  // Requested comparison baseline: ordinary nature, all six IVs60, both Lv60.
  // UI skill presets remain unchanged and are recorded separately above.
  for (const side of ["attacker", "defender"]) {
    state.sides[side].nature = "neutral";
    state.sides[side].natureId = "neutral";
    for (const key of Object.keys(state.sides[side].displayIvs)) state.sides[side].displayIvs[key] = 60;
    const spirit = snapshot.spirits.find((entry) => entry.id === state.sides[side].spiritId);
    const trait = snapshot.traits.find((entry) => spirit.traitIds.includes(entry.id));
    if (!trait) continue;
    for (const direction of ["forward", "reverse"]) {
      const role = (direction === "forward") === (side === "attacker") ? "attacker" : "defender";
      for (const control of (getS5PreviewTraitInputs(trait, role) ?? []).filter((entry) => entry.contextKey?.endsWith("BattleLevel"))) {
        state.directions[direction].context[control.id] = 60;
        state.directions[direction].context[control.contextKey] = 60;
      }
    }
  }
  const activeDirection = request.activeDirection ?? "forward";
  const activeSide = activeDirection === "forward" ? "attacker" : "defender";
  const selectedSkills = [];
  for (const side of ["attacker", "defender"]) {
    const requestedSkill = side === activeSide ? request.skill : request.opponentSkill;
    if (!requestedSkill) continue;
    const skill = selectUnique(snapshot.skills, localSkillAliases[requestedSkill] ?? requestedSkill, ["id", "name"]);
    const current = state.sides[side].skills.four;
    const found = current.findIndex((entry) => (typeof entry === "string" ? entry : entry?.skillId ?? entry?.id) === skill.id);
    const index = found === -1 ? 0 : found;
    if (found === -1) {
      state = selectFourSkill(state, { index, side, skillId: skill.id, snapshot }).state;
      uiDefaultState = selectFourSkill(uiDefaultState, { index, side, skillId: skill.id, snapshot }).state;
    }
    const direction = side === "attacker" ? "forward" : "reverse";
    state.directions[direction].selectedSkillIndex = index;
    uiDefaultState.directions[direction].selectedSkillIndex = index;
    selectedSkills.push({ side, skill: skill.name, skillId: skill.id, index,
      presentInDefaultFour: found !== -1,
      reason: "Select the observed action for damage replay; preserve other default slots." });
  }
  const steps = [];
  async function record(label, evidence = [], stateInput = state, fileTag = `step-${steps.length}`) {
    const evaluatedState = structuredClone(stateInput);
    const view = buildBalanceComparison({ snapshot, state: evaluatedState, activeDirection }).afterView;
    const projectedState = withS5PreviewBattleLevels(snapshot, evaluatedState);
    let cli = { skipped: true, reason: "At least one S5 owner level differs from60; ordinary compact CLI omits side.level." };
    if (["attacker", "defender"].every((side) => projectedState.sides[side].level === 60)) {
      const combat = buildCombatState(projectedState);
      const input = { schemaVersion: 1, serverId: "cn", mode: "four", level: 60, marks: combat.marks,
        forward: combat.directions.forward, reverse: combat.directions.reverse };
      for (const side of ["attacker", "defender"]) input[side] = {
        spirit: combat.sides[side].spiritId, nature: projectedState.sides[side].nature,
        ivs: combat.sides[side].displayIvs, skills: combat.sides[side].skills.four.map((entry) => {
          const id = typeof entry === "string" ? entry : entry?.skillId ?? entry?.id;
          const skill = snapshot.skills.find((candidate) => candidate.id === id);
          return skill ? { ...(typeof entry === "object" ? entry : {}), skillId: skill.name,
            type: skill.type, category: skill.category } : null;
        }),
      };
      const inputFile = path.join(cliRoot, `${safeEventId}-${fileTag}.cli-input.json`);
      await writeFile(inputFile, JSON.stringify(input), "utf8");
      let response;
      try { response = executeCli(["calculate", "--input", inputFile], { cwd: projectRoot, projectRoot: cliRoot }); }
      catch (error) { response = { ok: false, error: { code: error.code, message: error.message, details: error.details } }; }
      const selected = response.results?.[activeDirection]?.selected;
      cli = { inputFile, ok: response.ok, engine: response.engine, inputDigest: response.inputDigest,
        result: selected, error: response.error, matchesWebDamage: response.ok
          ? selected?.totalDamage === view.result.selectedResult?.totalDamage : null };
    }
    return { label, evidence, state: evaluatedState,
      result: pickResult(view.result.selectedResult),
      cli,
      panels: Object.fromEntries(["attacker", "defender"].map((side) => [side, view.sides[side].panelStats])) };
  }
  const uiDefaultBaseline = await record("Actual UI spirit-selection defaults with observed action selected; includes default trait controls/levels", [], uiDefaultState, "ui-default");
  steps.push(await record("Default skill presets, ordinary nature, all six IVs60, both Lv60; observed action selected (modeled baseline, not measured video configuration)"));
  for (const adjustment of request.knownAdjustments ?? []) {
    if (!adjustment.evidence || !adjustment.label) throw new Error("Every adjustment needs label and evidence");
    mergePatch(state, adjustment.patch);
    steps.push(await record(adjustment.label, adjustment.evidence));
  }
  return { eventId: request.eventId, source: request.source,
    engine: "Current Web S5 overlay -> UI selectSpirit/selectFourSkill -> buildBalanceComparison",
    cliBoundary: "Ordinary compact CLI omits per-owner S5 level; this adapter uses the actual Web level pipeline.",
    versions: initialState.versions, defaultPresets, selectedSkills,
    uiDefaultBaseline,
    localReplayOnlySkills: localModels, localSkillAliases, isolatedCliProjectRoot: cliRoot,
    expectedDamage: request.expectedDamage ?? null, steps,
    comparison: steps.map((step) => ({ label: step.label, status: step.result?.status,
      actualDamage: step.result?.totalDamage ?? null,
      expectedDamage: request.expectedDamage ?? null,
      delta: Number.isFinite(step.result?.totalDamage) && Number.isFinite(request.expectedDamage)
        ? step.result.totalDamage - request.expectedDamage : null })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: node replay-s5-web.mjs input.json [output.json]");
  const request = JSON.parse(await readFile(input, "utf8"));
  let result;
  if (Array.isArray(request)) {
    result = [];
    for (const entry of request) result.push(await replay(entry));
  } else result = await replay(request);
  if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify((Array.isArray(result) ? result : [result]).map((entry) => ({ eventId: entry.eventId,
    versions: entry.versions, defaultPresets: entry.defaultPresets, selectedSkills: entry.selectedSkills,
    comparison: entry.comparison }))));
}
