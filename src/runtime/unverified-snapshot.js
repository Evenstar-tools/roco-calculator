// 保留原计算器的空态结构；没有任何国服实体、数值或规则。
export const UNVERIFIED_GLOBAL_SNAPSHOT = Object.freeze({
  meta: Object.freeze({ serverId: "global", id: null, rulesVersion: null, status: "unverified" }),
  spirits: Object.freeze([]), skills: Object.freeze([]), traits: Object.freeze([]),
  learnsets: Object.freeze([]), rules: Object.freeze([]), typeChart: Object.freeze({ types: [], matrix: [] }),
});
