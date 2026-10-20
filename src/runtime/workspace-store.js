import { createServerStorage, storageError } from "../state/server-storage.js";

const CALCULATOR_KEY = "rock-calculator.calculator.session.v1";
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const fail = (message) => { throw storageError("INVALID_WORKSPACE", message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function exact(value, keys) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail("工作区字段无效");
}
export function assertWorkspaceJson(value, depth = 0, ancestors = new Set()) {
  if (depth > 24) fail("工作区嵌套过深");
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if ((!Array.isArray(value) && !object(value)) || ancestors.has(value)) fail("工作区包含无效 JSON 值");
  ancestors.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.has(key)) fail("工作区包含不安全字段");
    assertWorkspaceJson(item, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return value;
}

function createRecords(serverId, storage) {
  const target = createServerStorage(serverId, storage);
  const observed = new Map();
  function read(key, kind, validate, update = false) {
    const raw = target.getItem(key);
    if (update && observed.has(key) && observed.get(key) !== raw) throw storageError("STORAGE_CONFLICT", "另一标签页已修改存档；本标签内容已保留");
    if (raw === null) { observed.set(key, null); return null; }
    try {
      const record = JSON.parse(raw);
      if (record.serverId !== serverId) throw storageError("SERVER_MISMATCH", "存档服务器不匹配");
      exact(record, ["schemaVersion", "serverId", "kind", "payload"]);
      if (record.schemaVersion !== 1 || record.kind !== kind) fail("存档版本或类型不受支持");
      validate(record.payload);
      observed.set(key, raw);
      return record.payload;
    } catch (error) {
      if (["SERVER_MISMATCH", "INCOMPATIBLE_SERVER_VERSION"].includes(error.code)) throw error;
      throw storageError("STORAGE_CORRUPT", "存档损坏或版本不受支持；原始内容未覆盖", error);
    }
  }
  function write(key, kind, payload, validate) {
    validate(payload);
    read(key, kind, validate, true);
    const raw = JSON.stringify({ schemaVersion: 1, serverId, kind, payload });
    target.setItem(key, raw);
    observed.set(key, raw);
    return JSON.parse(raw).payload;
  }
  return { read, write };
}


export function createCalculatorSessionStore({ serverId = "cn", storage = globalThis.localStorage, validateState } = {}) {
  const records = createRecords(serverId, storage);
  const state = (value) => { assertWorkspaceJson(value); if (!object(value)) fail("计算会话无效"); validateState?.(value); };
  const history = (entry) => {
    exact(entry, ["state", "rememberSides"]); state(entry.state);
    if (!Array.isArray(entry.rememberSides) || entry.rememberSides.some((side) => !["attacker", "defender"].includes(side))) fail("撤销记录无效");
  };
  function session(value) {
    exact(value, ["present", "past", "future"]); state(value.present);
    for (const stack of [value.past, value.future]) {
      if (!Array.isArray(stack) || stack.length > 50) fail("撤销记录超过上限");
      stack.forEach(history);
    }
  }
  return {
    loadSession: () => records.read(CALCULATOR_KEY, "calculator-session", session),
    saveSession: (value) => records.write(CALCULATOR_KEY, "calculator-session", value, session),
  };
}
