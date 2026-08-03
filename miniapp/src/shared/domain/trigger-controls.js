const SOURCES = new Set(["skill", "attackerTrait", "defenderTrait"]);
const SCOPES = new Set(["slot", "direction", "battle"]);
const TYPES = new Set(["boolean", "number", "choice"]);

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`trigger control ${field} 无效`);
  }
  return value;
}

function normalizeScope(scope, source) {
  const normalized = scope === "skill"
    ? "slot"
    : scope ?? (source === "skill" ? "slot" : "direction");
  if (!SCOPES.has(normalized)) {
    throw new TypeError(`trigger control scope 无效：${String(scope)}`);
  }
  return normalized;
}

function optionValues(options) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new TypeError("trigger control choice 候选无效");
  }
  const values = options.map((option) =>
    option && typeof option === "object" ? option.value : option,
  );
  if (values.some((value) => value === undefined)) {
    throw new TypeError("trigger control choice 候选无效");
  }
  if (new Set(values.map((value) => JSON.stringify(value))).size !== values.length) {
    throw new TypeError("trigger control choice 候选重复");
  }
  return values;
}

function normalizeDefault(input, type) {
  if (type === "boolean") {
    if (input.defaultValue !== undefined && typeof input.defaultValue !== "boolean") {
      throw new TypeError("trigger control boolean 默认值无效");
    }
    return input.defaultValue ?? false;
  }
  if (type === "number") {
    const min = input.min ?? Number.NEGATIVE_INFINITY;
    const max = input.max ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(min) && min !== Number.NEGATIVE_INFINITY) {
      throw new TypeError("trigger control number 下限无效");
    }
    if (!Number.isFinite(max) && max !== Number.POSITIVE_INFINITY) {
      throw new TypeError("trigger control number 上限无效");
    }
    if (min > max) {
      throw new TypeError("trigger control number 范围无效");
    }
    if (!Object.hasOwn(input, "defaultValue") || input.defaultValue === undefined) {
      return undefined;
    }
    const candidate = input.defaultValue;
    if (!Number.isFinite(Number(candidate))) {
      throw new TypeError("trigger control number 默认值无效");
    }
    return Math.min(max, Math.max(min, Math.floor(Number(candidate))));
  }
  const values = optionValues(input.options);
  const candidate = input.defaultValue ?? values[0];
  if (!values.some((value) => Object.is(value, candidate))) {
    throw new TypeError("trigger control choice 默认值无效");
  }
  return candidate;
}

function semanticSignature(control) {
  return JSON.stringify({
    contextKey: canonicalRoleKey(control.contextKey),
    defaultValue: control.defaultValue,
    max: control.max ?? null,
    min: control.min ?? null,
    options: control.type === "choice"
      ? control.options.map((option) =>
          option && typeof option === "object" ? option.value : option,
        )
      : null,
    scope: control.scope,
    source: canonicalSource(control.source),
    type: control.type,
    visibleWhen: control.visibleWhen
      ? {
          contextKey: canonicalRoleKey(control.visibleWhen.contextKey),
          defaultValue: control.visibleWhen.defaultValue,
          equals: control.visibleWhen.equals,
        }
      : null,
  });
}

function canonicalSource(source) {
  return source === "attackerTrait" || source === "defenderTrait"
    ? "trait"
    : source;
}

function canonicalRoleKey(value) {
  return String(value)
    .replace(/^attackerTrait/, "trait")
    .replace(/^defenderTrait/, "trait");
}

function semanticFingerprint(control) {
  let hash = 0x811c9dc5;
  for (const character of semanticSignature(control)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function triggerControlId(source, contextKey, semantic = {}) {
  if (!SOURCES.has(source)) {
    throw new TypeError(`trigger control source 无效：${String(source)}`);
  }
  const key = requireText(contextKey, "contextKey");
  return `${source}.${key}.${semanticFingerprint({
    ...semantic,
    contextKey: key,
    source,
  })}`;
}

export function normalizeTriggerControl(input, { source, scope } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("trigger control 定义无效");
  }
  const normalizedSource = input.source ?? source;
  if (!SOURCES.has(normalizedSource)) {
    throw new TypeError(`trigger control source 无效：${String(normalizedSource)}`);
  }
  const contextKey = requireText(input.contextKey ?? input.key, "contextKey");
  const type = input.type;
  if (!TYPES.has(type)) {
    throw new TypeError(`trigger control type 无效：${String(type)}`);
  }
  const inferredScope = contextKey === "attackerHpPercent" ||
    contextKey === "defenderHpPercent"
    ? "battle"
    : scope;
  const normalizedScope = normalizeScope(
    input.scope ?? inferredScope,
    normalizedSource,
  );
  const visible = input.visibleWhen ?? input.when;
  const visibleContextKey = visible
    ? requireText(visible.contextKey ?? visible.key, "visibleWhen")
    : null;
  const visibleWhen = visible
    ? {
        contextKey: visibleContextKey,
        defaultValue: visible.defaultValue,
        equals: visible.equals,
        ...(visible.id ? { id: requireText(visible.id, "visibleWhen.id") } : {}),
      }
    : undefined;
  const defaultValue = normalizeDefault(input, type);
  const normalized = {
    ...input,
    contextKey,
    defaultValue,
    key: contextKey,
    scope: normalizedScope,
    source: normalizedSource,
    type,
    ...(visibleWhen ? { visibleWhen } : {}),
  };
  return {
    ...normalized,
    id: input.id
      ? requireText(input.id, "id")
      : triggerControlId(normalizedSource, contextKey, normalized),
  };
}

export function controlsAreSemanticallyEqual(left, right) {
  return Boolean(left && right) && semanticSignature(left) === semanticSignature(right);
}

export function normalizeTriggerControls(inputs = [], options = {}) {
  const initial = inputs.map((input) =>
    normalizeTriggerControl(input, options),
  );
  const byContextKey = new Map();
  for (const control of initial) {
    byContextKey.set(control.contextKey, [
      ...(byContextKey.get(control.contextKey) ?? []),
      control,
    ]);
  }
  const normalized = initial.map((control) => {
    if (!control.visibleWhen || control.visibleWhen.id) return control;
    const dependencies = byContextKey.get(control.visibleWhen.contextKey) ?? [];
    const dependencyIds = [...new Set(dependencies.map((entry) => entry.id))];
    if (dependencyIds.length > 1) {
      throw new TypeError(
        `trigger control ${control.id} 的 visibleWhen 依赖不明确`,
      );
    }
    return {
      ...control,
      visibleWhen: {
        ...control.visibleWhen,
        id: dependencyIds[0] ??
          `${control.source}.${control.visibleWhen.contextKey}.unresolved`,
      },
    };
  });
  const byId = new Map();
  for (const control of normalized) {
    const existing = byId.get(control.id);
    if (existing && !controlsAreSemanticallyEqual(existing, control)) {
      throw new TypeError(`trigger control ${control.id} 语义冲突`);
    }
    if (!existing) byId.set(control.id, control);
  }
  return [...byId.values()];
}

export function projectTriggerContext(context = {}, controls = []) {
  const normalized = normalizeTriggerControls(
    controls,
    controls[0]
      ? { source: controls[0].source, scope: controls[0].scope }
      : { source: "skill" },
  );
  const sanitized = {};
  const legacyCounts = new Map();
  for (const control of normalized) {
    legacyCounts.set(
      control.contextKey,
      (legacyCounts.get(control.contextKey) ?? 0) + 1,
    );
  }
  for (const control of normalized) {
    const hasStable = Object.hasOwn(context, control.id);
    const legacyId = `${control.source}.${control.contextKey}`;
    const hasLegacy =
      legacyCounts.get(control.contextKey) === 1 &&
      (Object.hasOwn(context, legacyId) ||
        Object.hasOwn(context, control.contextKey));
    if (hasStable) sanitized[control.id] = context[control.id];
    else if (hasLegacy) {
      sanitized[control.id] = Object.hasOwn(context, legacyId)
        ? context[legacyId]
        : context[control.contextKey];
    }
  }
  const projected = { ...context };
  for (const control of normalized) {
    delete projected[control.id];
    delete projected[`${control.source}.${control.contextKey}`];
    delete projected[control.contextKey];
  }
  const values = sanitizeTriggerValues(sanitized, normalized);
  for (const control of normalized) {
    if (Object.hasOwn(values, control.id)) {
      projected[control.contextKey] = values[control.id];
    }
  }
  return projected;
}

export function sanitizeTriggerValues(context = {}, controls = []) {
  const candidates = {};
  for (const control of controls) {
    const hasValue = Object.hasOwn(context, control.id);
    if (!hasValue && control.defaultValue === undefined) continue;
    const raw = hasValue ? context[control.id] : control.defaultValue;
    if (control.type === "boolean") {
      candidates[control.id] = typeof raw === "boolean"
        ? raw
        : control.defaultValue;
    } else if (control.type === "number") {
      const numeric = typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : Number.NaN;
      if (!Number.isFinite(numeric)) {
        if (control.defaultValue !== undefined) {
          candidates[control.id] = control.defaultValue;
        }
        continue;
      }
      candidates[control.id] = Math.min(
        control.max ?? Number.POSITIVE_INFINITY,
        Math.max(
          control.min ?? Number.NEGATIVE_INFINITY,
          Math.floor(numeric),
        ),
      );
    } else {
      const options = control.options.map((option) =>
        option && typeof option === "object" ? option.value : option,
      );
      candidates[control.id] = options.some((value) => Object.is(value, raw))
        ? raw
        : control.defaultValue;
    }
  }

  const byId = new Map(controls.map((control) => [control.id, control]));
  const visibility = new Map();
  function isVisible(control, visiting = new Set()) {
    if (!control.visibleWhen) return true;
    if (visibility.has(control.id)) return visibility.get(control.id);
    if (visiting.has(control.id)) return false;
    const nextVisiting = new Set(visiting).add(control.id);
    const dependency = byId.get(control.visibleWhen.id);
    const dependencyVisible = dependency
      ? isVisible(dependency, nextVisiting)
      : false;
    const actual = dependencyVisible && Object.hasOwn(candidates, dependency.id)
      ? candidates[dependency.id]
      : control.visibleWhen.defaultValue ?? dependency?.defaultValue;
    const result = Object.is(actual, control.visibleWhen.equals);
    visibility.set(control.id, result);
    return result;
  }

  return Object.fromEntries(
    controls
      .filter((control) => isVisible(control))
      .filter((control) => Object.hasOwn(candidates, control.id))
      .map((control) => [control.id, candidates[control.id]]),
  );
}
