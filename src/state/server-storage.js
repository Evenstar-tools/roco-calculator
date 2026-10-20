import { getServerRelease } from "../domain/server-environment.js";
import { legacyStorageKey } from "./storage-namespace.js";

const PREFIX = "rock-calculator.servers.";
const ADAPTER = Symbol("server-storage");

export function storageError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

export function serverStorageKey(serverId, key) {
  getServerRelease(serverId);
  const value = String(key);
  const prefix = `${PREFIX}${serverId}.`;
  if (value.startsWith(PREFIX)) {
    if (!value.startsWith(prefix)) throw storageError("SERVER_MISMATCH", "存储键属于另一服务器");
    return value;
  }
  const legacyPrefix = legacyStorageKey("");
  const suffix = value.startsWith("rock-calculator.") ? value.slice("rock-calculator.".length)
    : value.startsWith(legacyPrefix) ? value.slice(legacyPrefix.length) : value;
  if (!suffix || suffix.startsWith("__")) throw storageError("INVALID_STORAGE_KEY", "存储键无效");
  return `${prefix}${suffix}`;
}

// 服务器是适配器的不可变参数。读取旧键只为国服复制原文，永不删除恢复来源。
export function createServerStorage(serverId = "cn", storage = globalThis.localStorage) {
  getServerRelease(serverId);
  if (storage?.[ADAPTER]) {
    if (storage.serverId !== serverId) throw storageError("SERVER_MISMATCH", "存储适配器属于另一服务器");
    return storage;
  }
  if (!storage?.getItem) {
    throw storageError("STORAGE_UNAVAILABLE", "当前环境无法保存数据");
  }
  const prefix = `${PREFIX}${serverId}.`;
  const marker = (key) => `${prefix}__legacy.${key.slice(prefix.length)}`;
  function setRaw(key, value) {
    try { storage.setItem(key, value); }
    catch (cause) {
      if (typeof CustomEvent === "function") globalThis.dispatchEvent?.(new CustomEvent("roco-storage-error", { detail: { serverId } }));
      throw storageError("STORAGE_WRITE_FAILED", "存储写入失败；原始内容仍保留", cause);
    }
  }
  function keys() {
    const result = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix) && !key.startsWith(`${prefix}__`)) result.push(key);
    }
    return result;
  }
  return Object.freeze({
    [ADAPTER]: true,
    serverId,
    get length() { return keys().length; },
    key(index) { const key = keys()[index]; return key ? `rock-calculator.${key.slice(prefix.length)}` : null; },
    getItem(key) {
      const target = serverStorageKey(serverId, key);
      let raw;
      try { raw = storage.getItem(target); }
      catch (cause) { throw storageError("STORAGE_UNAVAILABLE", "无法读取存储", cause); }
      if (raw !== null || serverId !== "cn" || storage.getItem(marker(target)) !== null) return raw;
      const suffix = target.slice(prefix.length);
      for (const source of [`rock-calculator.${suffix}`, legacyStorageKey(suffix)]) {
        const original = storage.getItem(source);
        if (original === null) continue;
        setRaw(target, original);
        setRaw(marker(target), source);
        return original;
      }
      return null;
    },
    setItem(key, value) {
      const target = serverStorageKey(serverId, key);
      const next = String(value);
      const previous = storage.getItem(target);
      const recovery = `${prefix}__recovery.${target.slice(prefix.length)}`;
      // 首次覆盖保留原文。备份失败时停止写入，不假装已经安全保存。
      if (previous !== null && previous !== next && storage.getItem(recovery) === null) setRaw(recovery, previous);
      setRaw(target, next);
    },
    removeItem(key) {
      const target = serverStorageKey(serverId, key);
      // 删除后的国服键不再次从保留的旧值复活。
      if (serverId === "cn") setRaw(marker(target), "removed");
      try { storage.removeItem(target); }
      catch (cause) { throw storageError("STORAGE_WRITE_FAILED", "存储删除失败；原始内容仍保留", cause); }
    },
    clear() { for (const key of keys()) this.removeItem(key); },
  });
}

function hasEntries(value) {
  return value != null && (typeof value !== "object" || Object.keys(value).length > 0);
}

function hasCalculationCatalog(snapshot) {
  return hasEntries(snapshot.traits) || hasEntries(snapshot.rules) ||
    hasEntries(snapshot.typeChart?.types) || hasEntries(snapshot.typeChart?.matrix) ||
    (snapshot.typeChart != null && Object.keys(snapshot.typeChart).some((key) => !["types", "matrix"].includes(key)));
}

function isGlobalPlaceholderCatalog(snapshot) {
  const source = snapshot.meta?.placeholderSource;
  if (snapshot.meta?.status !== "unverified" || source?.serverId !== "cn" ||
      source.dataVersion !== getServerRelease("cn").dataVersion || source.locale !== "zh-CN" ||
      hasCalculationCatalog(snapshot)) return false;
  const prefix = "cn-placeholder:";
  const isReferenceId = (id) => typeof id === "string" && id.startsWith(prefix) && id.length > prefix.length;
  const isEntity = (item) => item && isReferenceId(item.id) && typeof item.reference?.sourceId === "string" &&
    item.id === `${prefix}${item.reference.sourceId}`;
  const { spirits, skills, learnsets } = snapshot;
  return Array.isArray(spirits) && Array.isArray(skills) && Array.isArray(learnsets) &&
    new Set(spirits.map((item) => item?.id)).size === spirits.length &&
    new Set(skills.map((item) => item?.id)).size === skills.length &&
    spirits.every((item) => isEntity(item) && item.raceStats == null && item.previewDefaults == null &&
      item.traitName == null && item.traitDescription == null && !hasEntries(item.traitIds) &&
      Array.isArray(item.evolutionChainIds) && item.evolutionChainIds.every(isReferenceId)) &&
    skills.every((item) => isEntity(item) && item.basePower == null && item.cost == null &&
      item.ruleId == null && item.ruleParams == null) &&
    learnsets.every((item) => item && isReferenceId(item.spiritId) &&
      Array.isArray(item.skillIds) && item.skillIds.every(isReferenceId) &&
      item.defaultSkillIds == null && item.bloodlineSkillIds == null);
}

export function assertRepositoryEnvironment(serverId = "cn", snapshot) {
  const release = getServerRelease(serverId);
  if (!snapshot) return release;
  const snapshotServer = snapshot?.meta?.serverId ?? snapshot?.serverId ?? "cn";
  if (snapshotServer !== release.serverId || (snapshot.serverId !== undefined && snapshot.serverId !== snapshotServer)) {
    throw storageError("SERVER_MISMATCH", "存档仓库与目录的服务器不匹配");
  }
  if (serverId === "global" && release.status !== "verified") {
    const hasVersions = [snapshot.meta?.id, snapshot.meta?.dataVersion, snapshot.meta?.version,
      snapshot.meta?.rulesVersion, snapshot.meta?.ruleVersion].some((value) => value != null);
    const hasCatalog = ["spirits", "skills", "traits", "learnsets"].some((key) => hasEntries(snapshot[key]));
    if (hasVersions || hasCalculationCatalog(snapshot) || (hasCatalog && !isGlobalPlaceholderCatalog(snapshot))) {
      throw storageError("SERVER_DATA_UNVERIFIED", "国际服目录未核验，不能用国服或未核验实体修复存档");
    }
  }
  return release;
}
