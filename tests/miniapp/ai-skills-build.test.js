// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { AI_SKILL_PATH, buildAiSkills } from "../../scripts/miniapp/build-ai-skills.mjs";

let distRoot;
let result;
const read = (file) => fs.readFileSync(path.join(distRoot, file), "utf8");

beforeAll(async () => {
  distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "roco-ai-build-"));
  fs.writeFileSync(path.join(distRoot, "app.json"), JSON.stringify({ pages: ["pages/index/index"], darkmode: true }), "utf8");
  fs.writeFileSync(path.join(distRoot, "project.config.json"), JSON.stringify({ appid: "wx82f11dfdd3d28bc8", packOptions: { include: [] } }), "utf8");
  result = await buildAiSkills({ distRoot });
});

afterAll(() => { if (distRoot) fs.rmSync(distRoot, { recursive: true, force: true }); });

test("微信AI元数据与独立分包注册一致，不改变原页面或引入页面框架", () => {
  const app = JSON.parse(read("app.json"));
  const project = JSON.parse(read("project.config.json"));
  expect(result.enabled).toBe(true);
  expect(app.pages).toEqual(["pages/index/index"]);
  expect(app.darkmode).toBe(true);
  expect(app.lazyCodeLoading).toBe("requiredComponents");
  expect(app.agent.skills).toEqual([expect.objectContaining({ path: AI_SKILL_PATH })]);
  expect(app.subPackages).toEqual([{ root: "skills", independent: true, pages: [] }]);
  expect(project.packOptions.include).toContainEqual({ type: "folder", value: "skills" });
  expect(read(`${AI_SKILL_PATH}/utils/engine.js`)).not.toMatch(/getApp\(|require\(["'](?:\.\.\/|@tarojs|react|node:)/u);
});

test("独立冷启动在缺失Android新API时可注册并真实查询，接口不读写用户存储", async () => {
  const handlers = new Map();
  const context = vm.createContext({ console, wx: { modelContext: { registerAPI: (name, handler) => handlers.set(name, handler) } } });
  vm.runInContext("globalThis.Intl=undefined;Object.hasOwn=undefined;Array.prototype.at=undefined;globalThis.structuredClone=undefined;", context);
  const moduleCache = new Map();
  function load(file) {
    const absolute = path.resolve(distRoot, file);
    expect(absolute.startsWith(`${path.resolve(distRoot, AI_SKILL_PATH)}${path.sep}`)).toBe(true);
    if (moduleCache.has(absolute)) return moduleCache.get(absolute).exports;
    const module = { exports: {} };
    moduleCache.set(absolute, module);
    const execute = vm.runInContext(`(function(require,module,exports){${fs.readFileSync(absolute, "utf8")}\n})`, context, { filename: absolute });
    execute((relative) => load(path.relative(distRoot, path.resolve(path.dirname(absolute), relative))), module, module.exports);
    return module.exports;
  }
  load(`${AI_SKILL_PATH}/index.js`);
  expect([...handlers.keys()]).toEqual(["searchRocoData", "calculateRocoDamage"]);
  const queried = await handlers.get("searchRocoData")(vm.runInContext('({ kind: "spirit", query: "乌拉塔" })', context));
  expect(queried.isError).toBe(false);
  expect(queried.structuredContent.results.length).toBeGreaterThan(0);
  const calculated = await handlers.get("calculateRocoDamage")(vm.runInContext('({ attacker: "龙鱼", defender: "岚鸟（春天的样子）", defenderNature: "固执", skill: "先发制人" })', context));
  expect(calculated.isError).toBe(false);
  expect(calculated.structuredContent).toMatchObject({ status: "exact", hitCount: 1 });
  expect(calculated.structuredContent.damage).toBeGreaterThan(0);
  const invalid = await handlers.get("calculateRocoDamage")(vm.runInContext('({ attacker: "不存在", defender: "不存在", skill: "不存在" })', context));
  expect(invalid.isError).toBe(true);
});

test("回退开关仅移除AI声明与分包，普通计算页面保持可用入口", async () => {
  const withOtherMetadata = JSON.parse(read("app.json"));
  withOtherMetadata.agent.instruction = "existing-agent-instruction.md";
  withOtherMetadata.subpackages = withOtherMetadata.subPackages;
  delete withOtherMetadata.subPackages;
  fs.writeFileSync(path.join(distRoot, "app.json"), JSON.stringify(withOtherMetadata), "utf8");
  await buildAiSkills({ distRoot, enabled: false });
  const app = JSON.parse(read("app.json"));
  expect(app.pages).toEqual(["pages/index/index"]);
  expect(app.agent).toEqual({ instruction: "existing-agent-instruction.md" });
  expect(app.subPackages).toBeUndefined();
  expect(app.subpackages).toBeUndefined();
  expect(fs.existsSync(path.join(distRoot, AI_SKILL_PATH))).toBe(false);
  expect(JSON.parse(read("project.config.json")).packOptions.include).toEqual([]);
});
