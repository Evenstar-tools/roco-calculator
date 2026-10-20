import { describe, expect, test } from "vitest";
import { calculateMatchup } from "../../src/domain/calculate.js";
import { assertCalculationEnvironment, getServerRelease } from "../../src/domain/server-environment.js";

const current = { meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" } };

describe("服务器计算环境", () => {
  test("旧国服输入及未声明服务器的历史夹具继续可用", () => {
    expect(assertCalculationEnvironment(current).serverId).toBe("cn");
    expect(assertCalculationEnvironment(
      { meta: { id: "s3-fixture", rulesVersion: "2026-07-23" } },
      { versions: { data: "s3-fixture", rules: "1.0.0" } },
    ).serverId).toBe("cn");
    expect(assertCalculationEnvironment(current, { serverId: "cn" }).dataURL).toBe("/data/runtime.json");
  });

  test("国际服未核验时不存在可用数据包，不能靠输入或伪造快照开启计算", () => {
    expect(getServerRelease("global")).toMatchObject({
      status: "unverified", dataURL: null, dataVersion: null, rulesVersion: null,
      capabilities: { calculate: false, search: false, explain: false },
    });
    expect(() => calculateMatchup(current, { serverId: "global" })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
    expect(() => calculateMatchup({ meta: { ...current.meta, serverId: "global", capabilities: { calculate: true } } }, { serverId: "global" }))
      .toThrow(expect.objectContaining({ code: "SERVER_DATA_UNVERIFIED" }));
  });

  test.each(["unknown", "__proto__", "", null])("拒绝未知服务器 %s，不默认降级国服", (serverId) => {
    expect(() => getServerRelease(serverId)).toThrow(expect.objectContaining({ code: "UNKNOWN_SERVER" }));
    expect(() => calculateMatchup(current, { serverId })).toThrow(expect.objectContaining({ code: "UNKNOWN_SERVER" }));
  });

  test("快照与输入的服务器声明冲突时在解析精灵之前拒绝", () => {
    expect(() => calculateMatchup({ meta: { ...current.meta, serverId: "global" } }, {}))
      .toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
    expect(() => assertCalculationEnvironment({ ...current, serverId: "global", meta: { ...current.meta, serverId: "cn" } }, {}))
      .toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  });

  test.each([
    { dataVersion: "other-data" },
    { rulesVersion: "other-rules" },
    { versions: { data: "other-data", rules: "s4-2026-09-10" } },
    { versions: { data: "s4-2026-09-10", rules: "other-rules" } },
  ])("输入不兼容版本不能被计算入口忽略：%j", (input) => {
    expect(() => calculateMatchup(current, input)).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SERVER_VERSION" }));
  });

  test("显式服务器发布包必须同时匹配当前数据和规则，不接受新旧混装", () => {
    for (const meta of [
      { ...current.meta, serverId: "cn", id: "other-data" },
      { ...current.meta, serverId: "cn", rulesVersion: "other-rules" },
      { ...current.meta, rulesVersion: "other-rules" },
    ]) {
      expect(() => assertCalculationEnvironment({ meta })).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SERVER_VERSION" }));
    }
  });
});
