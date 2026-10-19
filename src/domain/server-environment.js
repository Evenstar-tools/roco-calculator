export const SERVER_RELEASES = Object.freeze({
  cn: Object.freeze({
    serverId: "cn",
    status: "verified",
    dataVersion: "s4-2026-09-10",
    rulesVersion: "s4-2026-09-10",
    dataURL: "/data/runtime.json",
    catalogURL: "/data/skill-query/catalog.json",
    snapshotPath: "data/snapshots/current.json",
    capabilities: Object.freeze({ calculate: true, search: true, explain: true }),
  }),
  global: Object.freeze({
    serverId: "global",
    status: "unverified",
    dataVersion: null,
    rulesVersion: null,
    dataURL: null,
    catalogURL: null,
    snapshotPath: null,
    capabilities: Object.freeze({ calculate: false, search: false, explain: false }),
  }),
});

function rejectEnvironment(code, message, details = {}) {
  const error = new Error(message);
  error.name = "CalculationEnvironmentError";
  error.code = code;
  error.details = details;
  throw error;
}

export function getServerRelease(serverId = "cn") {
  if (typeof serverId !== "string" || !Object.hasOwn(SERVER_RELEASES, serverId)) {
    rejectEnvironment("UNKNOWN_SERVER", "不支持的服务器", { serverId });
  }
  return SERVER_RELEASES[serverId];
}

export function assertCalculationEnvironment(snapshot, battleInput = {}) {
  const meta = snapshot?.meta ?? {};
  const snapshotServer = meta.serverId !== undefined ? meta.serverId : snapshot?.serverId !== undefined ? snapshot.serverId : "cn";
  const inputServer = battleInput?.serverId === undefined ? "cn" : battleInput.serverId;
  const release = getServerRelease(snapshotServer);
  getServerRelease(inputServer);
  if ((snapshot?.serverId !== undefined && snapshot.serverId !== snapshotServer) || inputServer !== snapshotServer) {
    rejectEnvironment("SERVER_MISMATCH", "计算输入与数据快照的服务器不匹配", {
      snapshotServerId: snapshotServer,
      inputServerId: inputServer,
    });
  }
  if (!release.capabilities.calculate) {
    rejectEnvironment("SERVER_DATA_UNVERIFIED", "国际服数据与规则尚未核验，当前不能计算或检索", {
      serverId: release.serverId,
      availability: release.status,
    });
  }
  const dataVersion = meta.id ?? meta.dataVersion ?? meta.version;
  const rulesVersion = meta.rulesVersion ?? meta.ruleVersion;
  const declaredEnvironment = meta.serverId !== undefined || snapshot?.serverId !== undefined || battleInput?.serverId !== undefined;
  // 旧国服夹具没有服务器声明；显式环境和当前发布包必须匹配已支持的版本。
  if ((declaredEnvironment || dataVersion === release.dataVersion) &&
      (dataVersion !== release.dataVersion || rulesVersion !== release.rulesVersion)) {
    rejectEnvironment("INCOMPATIBLE_SERVER_VERSION", "数据或规则版本与当前服务器引擎不兼容", {
      serverId: release.serverId, dataVersion, rulesVersion,
      expectedDataVersion: release.dataVersion,
      expectedRulesVersion: release.rulesVersion,
    });
  }
  // 历史国服夹具的 versions 曾只作标签；不把新发布契约追溯到未声明环境的旧样本。
  const validateLegacyVersions = declaredEnvironment || dataVersion === release.dataVersion;
  const declaredVersions = [
    ["dataVersion", battleInput?.dataVersion, dataVersion],
    ["rulesVersion", battleInput?.rulesVersion, rulesVersion],
    ...(validateLegacyVersions ? [
      ["versions.data", battleInput?.versions?.data, dataVersion],
      ["versions.rules", battleInput?.versions?.rules, rulesVersion],
    ] : []),
  ];
  for (const [field, requested, actual] of declaredVersions) {
    if (requested !== undefined && requested !== actual) {
      rejectEnvironment("INCOMPATIBLE_SERVER_VERSION", "输入声明的数据或规则版本与快照不匹配", {
        serverId: release.serverId, field, requested, actual,
      });
    }
  }
  return release;
}
