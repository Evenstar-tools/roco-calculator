import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calculateMatchup } from "../domain/calculate.js";
import {
  getNatureMultipliers,
  NATURES,
  normalizeNatureId,
} from "../domain/natures.js";
import { withCalculatorExtras } from "../data/snapshot-extras.js";

const ALL_FULL_IVS = Object.freeze({
  hp: 60,
  speed: 60,
  physicalAttack: 60,
  magicalAttack: 60,
  physicalDefense: 60,
  magicalDefense: 60,
});

const INPUT_SCHEMA_VERSION = 1;

class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·（）()_\-/]+/gu, "");
}

function optionValue(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (index === args.length - 1 || args[index + 1].startsWith("--")) {
    throw new CliError("ARGUMENT_REQUIRED", `${name} 需要一个值`, {
      argument: name,
    });
  }
  return args[index + 1];
}

function loadJson(filePath, label) {
  let source;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new CliError("INPUT_READ_FAILED", `无法读取${label}`, {
      path: filePath,
      reason: error.message,
    });
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new CliError("INPUT_INVALID_JSON", `${label}不是有效 JSON`, {
      path: filePath,
      reason: error.message,
    });
  }
}

function loadContext(projectRoot) {
  const snapshotPath = path.join(projectRoot, "data", "snapshots", "current.json");
  const packagePath = path.join(projectRoot, "package.json");
  const snapshot = withCalculatorExtras(loadJson(snapshotPath, "数据快照"));
  const packageJson = loadJson(packagePath, "package.json");
  const indexes = {
    spirits: new Map(snapshot.spirits.map((entry) => [entry.id, entry])),
    skills: new Map(snapshot.skills.map((entry) => [entry.id, entry])),
    traits: new Map(snapshot.traits.map((entry) => [entry.id, entry])),
    learnsets: new Map(
      snapshot.learnsets.map((entry) => [entry.spiritId, entry]),
    ),
  };
  return { indexes, packageJson, snapshot, snapshotPath };
}

function engineMetadata(context) {
  const meta = context.snapshot.meta ?? {};
  return {
    productVersion: context.packageJson.version,
    dataVersion: meta.id ?? meta.dataVersion ?? meta.version ?? null,
    rulesVersion: meta.rulesVersion ?? meta.ruleVersion ?? null,
    snapshotVersion: meta.snapshotVersion ?? null,
  };
}

function entityCollection(context, kind) {
  if (kind === "spirit") return context.snapshot.spirits;
  if (kind === "skill") return context.snapshot.skills;
  if (kind === "trait") return context.snapshot.traits;
  throw new CliError("INVALID_ENTITY_KIND", "实体类型必须是 spirit、skill 或 trait", {
    kind,
  });
}

function entityName(entity, kind) {
  return kind === "spirit" ? entity.fullName : entity.name;
}

function entitySearchText(entity, kind) {
  if (kind === "spirit") {
    return [
      entity.id,
      entity.fullName,
      entity.baseName,
      entity.variantName,
      entity.pinyin,
      entity.initials,
      entity.dexNo,
    ]
      .filter(Boolean)
      .map(compact);
  }
  return [
    entity.id,
    entity.name,
    entity.type,
    entity.category,
    entity.description,
    entity.searchText,
  ]
    .filter(Boolean)
    .map(compact);
}

function searchEntities(context, kind, query, { allowedIds = null, limit = 10 } = {}) {
  const needle = compact(query);
  const results = entityCollection(context, kind)
    .filter((entity) => !allowedIds || allowedIds.has(entity.id))
    .map((entity) => {
      const name = compact(entityName(entity, kind));
      const id = compact(entity.id);
      const fields = entitySearchText(entity, kind);
      const exact = id === needle || name === needle;
      const prefix = !exact && fields.some((field) => field.startsWith(needle));
      const included = exact || prefix || fields.some((field) => field.includes(needle));
      return { entity, exact, prefix, included };
    })
    .filter((entry) => entry.included)
    .sort(
      (left, right) =>
        Number(right.exact) - Number(left.exact) ||
        Number(right.prefix) - Number(left.prefix) ||
        entityName(left.entity, kind).localeCompare(
          entityName(right.entity, kind),
          "zh-CN",
        ),
    )
    .slice(0, limit)
    .map((entry) => entry.entity);
  return results;
}

function formatEntity(entity, kind) {
  if (kind === "spirit") {
    return {
      id: entity.id,
      name: entity.fullName,
      baseName: entity.baseName ?? null,
      variantName: entity.variantName ?? null,
      types: entity.types ?? [],
      stage: entity.stage ?? null,
      traitName: entity.traitName ?? null,
    };
  }
  if (kind === "skill") {
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      category: entity.category,
      basePower: entity.basePower,
      cost: entity.cost,
      description: entity.description ?? "",
    };
  }
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description ?? "",
  };
}

function refParts(ref, kind) {
  if (typeof ref === "string") return { id: ref, name: ref };
  if (!ref || typeof ref !== "object") return { id: null, name: null };
  return {
    id:
      ref.id ??
      (kind === "spirit" ? ref.spiritId : null) ??
      (kind === "skill" ? ref.skillId : null),
    name: ref.name ?? ref.fullName ?? null,
    type: ref.type ?? null,
    category: ref.category ?? null,
  };
}

function resolveEntity(context, kind, ref, field, { allowedIds = null } = {}) {
  const parts = refParts(ref, kind);
  const collection = entityCollection(context, kind);
  const byId = kind === "spirit"
    ? context.indexes.spirits
    : kind === "skill"
      ? context.indexes.skills
      : context.indexes.traits;
  const direct = parts.id ? byId.get(parts.id) : null;
  if (direct && (!allowedIds || allowedIds.has(direct.id))) return direct;

  const needle = compact(parts.name ?? parts.id);
  let candidates = collection.filter((entity) => {
    if (allowedIds && !allowedIds.has(entity.id)) return false;
    if (compact(entityName(entity, kind)) !== needle) return false;
    if (parts.type && entity.type !== parts.type) return false;
    if (parts.category && entity.category !== parts.category) return false;
    return true;
  });

  if (candidates.length === 0 && allowedIds) {
    candidates = collection.filter((entity) => {
      if (compact(entityName(entity, kind)) !== needle) return false;
      if (parts.type && entity.type !== parts.type) return false;
      if (parts.category && entity.category !== parts.category) return false;
      return true;
    });
  }

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new CliError("ENTITY_AMBIGUOUS", `${field} 匹配到多个实体，请改用稳定 ID`, {
      field,
      candidates: candidates.slice(0, 10).map((entry) => formatEntity(entry, kind)),
    });
  }
  throw new CliError("ENTITY_NOT_FOUND", `${field} 找不到实体`, {
    field,
    query: parts.name ?? parts.id ?? null,
    candidates: searchEntities(context, kind, parts.name ?? parts.id ?? "", {
      allowedIds,
      limit: 5,
    }).map((entry) => formatEntity(entry, kind)),
  });
}

function resolveSkillEntry(context, entry, field, allowedIds) {
  if (entry === null || entry === undefined || entry === "") return null;
  const ref =
    typeof entry === "object"
      ? entry.skill ?? entry.skillId ?? entry.id ?? entry
      : entry;
  const qualifiers =
    typeof entry === "object" && typeof ref === "string"
      ? { name: ref, type: entry.type, category: entry.category }
      : ref;
  const skill = resolveEntity(context, "skill", qualifiers, field, { allowedIds });
  if (typeof entry === "string") return skill.id;
  return {
    ...entry,
    id: undefined,
    name: undefined,
    skill: undefined,
    skillId: skill.id,
  };
}

function resolveNatureMultipliers(value, field) {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") {
    throw new CliError("INVALID_NATURE", `${field} 必须是性格中文名或 ID`, {
      field,
      value,
    });
  }
  const normalized = normalizeNatureId(value);
  const known =
    NATURES.some((nature) => nature.id === value || nature.name === value) ||
    normalized !== "neutral" ||
    value === "普通（无修正）";
  if (!known) {
    throw new CliError("INVALID_NATURE", `${field} 不是已知性格`, {
      field,
      value,
      candidates: NATURES.map((nature) => ({ id: nature.id, name: nature.name })),
    });
  }
  return getNatureMultipliers(normalized);
}

function resolveDisplayIvs(value, field) {
  if (value === undefined || value === null) return { ...ALL_FULL_IVS };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("INPUT_VALIDATION_FAILED", `${field} 必须是六维对象`, {
      field,
    });
  }
  const resolved = { ...ALL_FULL_IVS };
  for (const [key, raw] of Object.entries(value)) {
    if (!Object.hasOwn(ALL_FULL_IVS, key)) {
      throw new CliError("INPUT_VALIDATION_FAILED", `${field}.${key} 不是有效六维字段`, {
        field: `${field}.${key}`,
        allowed: Object.keys(ALL_FULL_IVS),
      });
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 60) {
      throw new CliError("INPUT_VALIDATION_FAILED", `${field}.${key} 必须在 0 到 60 之间`, {
        field: `${field}.${key}`,
        value: raw,
      });
    }
    resolved[key] = numeric;
  }
  return resolved;
}

function compileSide(context, sideInput, field, mode) {
  if (!sideInput || typeof sideInput !== "object") {
    throw new CliError("INPUT_VALIDATION_FAILED", `${field} 必须是对象`, { field });
  }
  const spirit = resolveEntity(
    context,
    "spirit",
    sideInput.spirit ?? sideInput.spiritId,
    `${field}.spirit`,
  );
  const learnset = context.indexes.learnsets.get(spirit.id);
  const allowedIds = learnset ? new Set(learnset.skillIds ?? []) : null;
  const rawFour = Array.isArray(sideInput.skills)
    ? sideInput.skills
    : Array.isArray(sideInput.skills?.four)
      ? sideInput.skills.four
      : [];
  const rawSingle =
    sideInput.skill ?? sideInput.skills?.single ?? rawFour.find(Boolean) ?? null;
  if (!rawSingle && rawFour.length === 0) {
    throw new CliError("INPUT_VALIDATION_FAILED", `${field} 至少需要一个技能`, {
      field: `${field}.skill`,
    });
  }
  const single = resolveSkillEntry(
    context,
    rawSingle ?? rawFour[0],
    `${field}.skill`,
    allowedIds,
  );
  const fourSource = rawFour.length > 0 ? rawFour : [rawSingle];
  const four = fourSource.map((entry, index) =>
    resolveSkillEntry(context, entry, `${field}.skills[${index}]`, allowedIds),
  );
  while (four.length < 4) four.push(null);
  const {
    currentHp: _currentHp,
    displayIvs,
    ivs,
    nature,
    skill: _skill,
    skills: _skills,
    spirit: _spirit,
    spiritId: _spiritId,
    ...rest
  } = sideInput;
  return {
    side: {
      ...rest,
      spiritId: spirit.id,
      displayIvs: resolveDisplayIvs(displayIvs ?? ivs, `${field}.ivs`),
      natureMultipliers:
        sideInput.natureMultipliers ??
        resolveNatureMultipliers(nature, `${field}.nature`),
      skills: {
        single,
        four: mode === "four" ? four : four.slice(0, 4),
      },
    },
    spirit,
  };
}

function compileDirection(raw = {}, currentHp = null) {
  const selectedSkillIndex = raw.skill === undefined
    ? raw.selectedSkillIndex ?? 0
    : Math.max(0, Math.floor(Number(raw.skill) || 1) - 1);
  const { skill: _skill, ...rest } = raw;
  return {
    reduction: 1,
    hitCount: 1,
    traitDamageHitCount: 1,
    starfallStacks: 0,
    finalDamageMultiplier: 1,
    context: {},
    overrides: {},
    ...rest,
    selectedSkillIndex,
    currentHp: rest.currentHp ?? currentHp,
  };
}

function compileInput(context, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CliError("INPUT_VALIDATION_FAILED", "输入必须是 JSON 对象");
  }
  if (
    input.schemaVersion !== undefined &&
    input.schemaVersion !== INPUT_SCHEMA_VERSION
  ) {
    throw new CliError("UNSUPPORTED_SCHEMA_VERSION", "不支持此输入版本", {
      expected: INPUT_SCHEMA_VERSION,
      received: input.schemaVersion,
    });
  }
  const mode = input.mode === "four" ? "four" : "single";
  const attacker = compileSide(context, input.attacker, "attacker", mode);
  const defender = compileSide(context, input.defender, "defender", mode);
  const battle = {
    schemaVersion: INPUT_SCHEMA_VERSION,
    mode,
    level: Number.isFinite(Number(input.level)) ? Number(input.level) : 60,
    marks: input.marks ?? null,
    sides: {
      attacker: attacker.side,
      defender: defender.side,
    },
    directions: {
      forward: compileDirection(input.forward ?? input.directions?.forward, input.defender.currentHp),
      reverse: compileDirection(input.reverse ?? input.directions?.reverse, input.attacker.currentHp),
    },
  };
  return {
    battle,
    resolved: {
      attacker: {
        spiritId: attacker.spirit.id,
        spiritName: attacker.spirit.fullName,
        skillIds: battle.sides.attacker.skills.four.filter(Boolean).map((entry) =>
          typeof entry === "string" ? entry : entry.skillId,
        ),
      },
      defender: {
        spiritId: defender.spirit.id,
        spiritName: defender.spirit.fullName,
        skillIds: battle.sides.defender.skills.four.filter(Boolean).map((entry) =>
          typeof entry === "string" ? entry : entry.skillId,
        ),
      },
    },
    spirits: {
      attacker: attacker.spirit,
      defender: defender.spirit,
    },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableValue(value[key])]),
  );
}

function inputDigest(battle) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(stableValue(battle)))
    .digest("hex")}`;
}

function compactResult(result) {
  if (!result) return null;
  return {
    skillId: result.skillId ?? null,
    skillName: result.skillName ?? null,
    status: result.status,
    reason: result.reason ?? null,
    totalDamage: result.totalDamage ?? null,
    hpPercent: result.hpPercent ?? null,
    lethal: result.lethal === true,
    hitCount: result.hitCount ?? null,
    displayPower: result.displayPower ?? result.panelPower ?? null,
    effectivePower: result.effectivePower ?? null,
    typeLabel: result.typeLabel ?? null,
    typeMultiplier: result.typeMultiplier ?? null,
    warnings: result.warnings ?? [],
    postAttackEffects: result.postAttackEffects ?? null,
    markSettlements: result.markSettlements ?? [],
    traitSettlements: result.traitSettlements ?? [],
  };
}

function summarizeDirection(directionResult, attacker, defender) {
  return {
    attacker: attacker.fullName,
    defender: defender.fullName,
    selected: compactResult(directionResult.selectedResult),
    skills: directionResult.results.map((result, index) => ({
      index: index + 1,
      ...compactResult(result),
    })),
  };
}

function compactSource(source) {
  if (!source || typeof source !== "object") return source;
  if (source.title || source.url || source.revision !== undefined) {
    return {
      title: source.title ?? null,
      url: source.url ?? null,
      revision: source.revision ?? null,
    };
  }
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, compactSource(value)]),
  );
}

function explainResult(result) {
  return {
    ...compactResult(result),
    combatPanel: result?.combatPanel ?? null,
    formulaSteps: (result?.formulaSteps ?? []).map((step) => ({
      ...step,
      source: compactSource(step.source),
    })),
    sources: (result?.sources ?? []).map(compactSource),
  };
}

function readInput(args, cwd) {
  const inputPath = optionValue(args, "--input", "-");
  return loadJson(inputPath === "-" ? 0 : path.resolve(cwd, inputPath), "CLI 输入");
}

function schemaResponse() {
  return {
    ok: true,
    command: "schema",
    inputSchemaVersion: INPUT_SCHEMA_VERSION,
    commands: {
      meta: { args: [] },
      schema: { args: [] },
      search: {
        args: ["<spirit|skill|trait>", "<query>"],
        options: ["--limit <1..50>", "--spirit <name-or-id>"],
      },
      calculate: { options: ["--input <utf8-json-file|->"] },
      explain: {
        options: [
          "--input <utf8-json-file|->",
          "--direction <forward|reverse>",
          "--skill <1-based-index>",
        ],
      },
    },
    compactInput: {
      required: ["attacker", "defender"],
      defaults: {
        schemaVersion: 1,
        mode: "single",
        level: 60,
        nature: "普通",
        ivs: "六项均为60",
        currentHp: "满生命",
      },
      fields: {
        side: {
          spirit: "精灵全名或稳定 ID",
          skill: "单技能名称、稳定 ID，或 {name,type,category}",
          skills: "四技能数组；元素可附带 context/overrides",
          nature: "性格中文名或 ID",
          ivs: "六维对象",
          currentHp: "当前生命",
        },
        direction: {
          skill: "选中技能序号，从1开始",
          reduction: "减伤倍率",
          hitCount: "手动连击数",
          traitDamageHitCount: "特性伤害次数",
          starfallStacks: "星陨层数",
          finalDamageMultiplier: "最终伤害倍率",
          context: "技能/特性触发上下文",
          overrides: "公式覆盖项",
        },
      },
      example: {
        schemaVersion: 1,
        mode: "single",
        level: 60,
        attacker: { spirit: "迪莫", skill: "光球" },
        defender: { spirit: "水蓝蓝", skill: "水炮" },
      },
    },
  };
}

export function executeCli(argv, { cwd, projectRoot }) {
  const command = argv[0];
  const context = loadContext(projectRoot);
  if (command === "meta") {
    return {
      ok: true,
      command,
      engine: engineMetadata(context),
      counts: context.snapshot.meta?.counts ?? {
        spirits: context.snapshot.spirits.length,
        skills: context.snapshot.skills.length,
        learnsets: context.snapshot.learnsets.length,
        traits: context.snapshot.traits.length,
      },
    };
  }
  if (command === "schema") return schemaResponse();
  if (command === "search") {
    const kind = argv[1];
    const query = argv[2] ?? "";
    let allowedIds = null;
    const spiritRef = optionValue(argv, "--spirit");
    if (spiritRef) {
      if (kind !== "skill") {
        throw new CliError("INVALID_ARGUMENT", "--spirit 只能用于技能检索");
      }
      const spirit = resolveEntity(context, "spirit", spiritRef, "--spirit");
      allowedIds = new Set(
        context.indexes.learnsets.get(spirit.id)?.skillIds ?? [],
      );
    }
    const rawLimit = Number(optionValue(argv, "--limit", 10));
    const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 10));
    return {
      ok: true,
      command,
      kind,
      query,
      results: searchEntities(context, kind, query, { allowedIds, limit }).map(
        (entry) => formatEntity(entry, kind),
      ),
    };
  }
  if (command === "calculate" || command === "explain") {
    const input = readInput(argv, cwd);
    const compiled = compileInput(context, input);
    let calculation;
    try {
      calculation = calculateMatchup(context.snapshot, compiled.battle);
    } catch (error) {
      throw new CliError("CALCULATION_FAILED", error.message);
    }
    const digest = inputDigest(compiled.battle);
    if (command === "calculate") {
      return {
        ok: true,
        command,
        engine: engineMetadata(context),
        inputDigest: digest,
        resolved: compiled.resolved,
        results: {
          forward: summarizeDirection(
            calculation.forward,
            compiled.spirits.attacker,
            compiled.spirits.defender,
          ),
          reverse: summarizeDirection(
            calculation.reverse,
            compiled.spirits.defender,
            compiled.spirits.attacker,
          ),
        },
      };
    }
    const direction = optionValue(argv, "--direction", "forward");
    if (direction !== "forward" && direction !== "reverse") {
      throw new CliError("INVALID_ARGUMENT", "--direction 必须是 forward 或 reverse", {
        argument: "--direction",
      });
    }
    const directionResult = calculation[direction];
    const requestedSkill = optionValue(argv, "--skill");
    let result = directionResult.selectedResult;
    if (requestedSkill !== undefined) {
      const index = Math.floor(Number(requestedSkill)) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= directionResult.results.length) {
        throw new CliError("INVALID_ARGUMENT", "--skill 必须是已有技能的序号", {
          argument: "--skill",
        });
      }
      result = directionResult.results[index];
    }
    const attacker = direction === "forward"
      ? compiled.spirits.attacker
      : compiled.spirits.defender;
    const defender = direction === "forward"
      ? compiled.spirits.defender
      : compiled.spirits.attacker;
    return {
      ok: true,
      command,
      engine: engineMetadata(context),
      inputDigest: digest,
      direction,
      attacker: attacker.fullName,
      defender: defender.fullName,
      result: explainResult(result),
    };
  }
  throw new CliError("UNKNOWN_COMMAND", "命令必须是 meta、schema、search、calculate 或 explain", {
    command: command ?? null,
  });
}

export function serializeCliError(error) {
  if (error instanceof CliError) {
    return {
      exitCode: 2,
      payload: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...error.details,
        },
      },
    };
  }
  return {
    exitCode: 1,
    payload: {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    },
  };
}
