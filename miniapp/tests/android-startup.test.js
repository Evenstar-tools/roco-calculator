import { execFileSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test.each([undefined, {}])("首页在 Intl.Collator 不可用时仍可加载包内数据 (%s)", async (intl) => {
  vi.resetModules();
  vi.stubGlobal("Intl", intl);
  const { createDefaultServices } = await import("../src/pages/index/index.jsx");
  const services = createDefaultServices({
    taro: {
      getStorageSync: () => undefined,
      setStorageSync: () => {},
      removeStorageSync: () => {},
    },
  });
  const loaded = await services.dataService.load();
  expect(loaded.source).toBe("bundled");
  expect(loaded.snapshot.spirits.length).toBeGreaterThan(600);
});

test("无 Intl 的耐久榜仍按数字图鉴号排序", async () => {
  vi.resetModules();
  vi.stubGlobal("Intl", undefined);
  const { createDurabilityRanking } = await import("../src/shared/features/team-ability/domain/durability-ranking.js");
  const spirits = ["10", "2"].map((dexNo) => ({
    id: `boss-${dexNo}`,
    dexNo,
    fullName: `测试${dexNo}`,
    stage: "首领",
    sourceCategory: "首领形态",
    types: ["水"],
    raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, speed: 100, physicalDefense: 100, magicalDefense: 100 },
  }));
  expect(createDurabilityRanking({ spirits }).rows.map((row) => row.spiritId)).toEqual(["boss-2", "boss-10"]);
});

test.each(["hasOwn"])("缺少 %s 时首页数据、首次计算和撤回仍可用", async (api) => {
  const target = api === "hasOwn" ? Object : Array.prototype;
  const original = Object.getOwnPropertyDescriptor(target, api);
  try {
    delete target[api];
    vi.resetModules();
    const { createDefaultServices } = await import("../src/pages/index/index.jsx");
    const loaded = await createDefaultServices({
      taro: { getStorageSync: () => undefined, setStorageSync: () => {}, removeStorageSync: () => {} },
    }).dataService.load();
    const { createInitialState } = await import("../src/shared/state/defaults.js");
    const { createCalculationView } = await import("../src/view-models/calculation.js");
    const { createUndoHistory } = await import("../src/state/undo-history.js");
    const state = createInitialState(loaded.snapshot);
    const view = createCalculationView(loaded.snapshot, state);
    expect(view.selectedResult.status).toBe("exact");
    expect(view.selectedResult.totalDamage).toBeGreaterThan(0);
    const history = createUndoHistory();
    history.record(state);
    expect(history.undo().state).toBe(state);
  } finally {
    if (original) Object.defineProperty(target, api, original);
    else delete target[api];
  }
});

test.each([
  "globalThis.Intl=undefined;",
  "Object.hasOwn=undefined;",
  "Array.prototype.at=undefined;",
  "globalThis.Intl=undefined;Object.hasOwn=undefined;Array.prototype.at=undefined;globalThis.structuredClone=undefined;",
])("独立受限引擎可完成解码、首次计算和撤回 (%s)", (missingApis) => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    ${missingApis}
    await import('./src/platform/runtime-compat.js');
    const {default:snapshot}=await import('./src/data/bundled-runtime.js');
    const {createInitialState}=await import('./src/shared/state/defaults.js');
    const {createCalculationView}=await import('./src/view-models/calculation.js');
    const {createUndoHistory}=await import('./src/state/undo-history.js');
    const state=createInitialState(snapshot);
    const view=createCalculationView(snapshot,state);
    const history=createUndoHistory();history.record(state);
    if(snapshot.spirits.length<600 || view.selectedResult?.status!=='exact' || !(view.selectedResult.totalDamage>0) || history.undo().state!==state)throw Error('startup failed');
    if([1,2,3].at(-1)!==3 || [1,2,3].at(1.9)!==2 || [1,2,3].at(Infinity)!==undefined)throw Error('at semantics failed');
    if(!Object.hasOwn({x:undefined},'x') || Object.hasOwn(Object.create({x:1}),'x'))throw Error('hasOwn semantics failed');
    console.log('startup, calculation and undo passed');
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 10000 });
  expect(output).toContain("startup, calculation and undo passed");
});

test("兼容层不替换设备已有的原生 API", async () => {
  vi.resetModules();
  const hasOwn = Object.hasOwn;
  const at = Array.prototype.at;
  await import("../src/platform/runtime-compat.js");
  expect(Object.hasOwn).toBe(hasOwn);
  expect(Array.prototype.at).toBe(at);
});
