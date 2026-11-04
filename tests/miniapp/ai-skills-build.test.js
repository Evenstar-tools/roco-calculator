// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, test } from "vitest";
import { AI_SKILL_PATH, buildAiSkills } from "../../scripts/miniapp/build-ai-skills.mjs";

let distRoot;
let result;
const read = (file) => fs.readFileSync(path.join(distRoot, file), "utf8");

function resolveSchema(schema, root) {
  if (!schema.$ref) return schema;
  expect(schema.$ref).toMatch(/^#\/definitions\//u);
  const resolved = root.definitions[schema.$ref.slice("#/definitions/".length)];
  expect(resolved, schema.$ref).toBeDefined();
  return resolved;
}

function checkSchemaStructure(schema, root, seen = new Set()) {
  schema = resolveSchema(schema, root);
  if (seen.has(schema)) return;
  seen.add(schema);
  const types = [].concat(schema.type ?? []);
  if (types.includes("object")) expect(Object.keys(schema.properties ?? {})).not.toHaveLength(0);
  if (types.includes("array")) expect(schema.items).toBeDefined();
  expect(schema.additionalProperties).not.toBe(true);
  const children = [
    ...Object.values(schema.properties ?? {}), ...Object.values(schema.patternProperties ?? {}),
    ...Object.values(schema.definitions ?? {}), ...(schema.anyOf ?? []),
    ...(schema.items ? [schema.items] : []),
  ];
  for (const child of children) checkSchemaStructure(child, root, seen);
}

// Match the host's extra warning rule: every returned field must be declared,
// even when JSON Schema's default additionalProperties would otherwise allow it.
function responseSchemaErrors(schema, value, root, location = "$result") {
  schema = resolveSchema(schema, root);
  if (schema.anyOf) {
    const branches = schema.anyOf.map(branch => responseSchemaErrors(branch, value, root, location));
    return branches.find(errors => errors.length === 0) ?? branches.flat();
  }
  const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const types = [].concat(schema.type ?? []);
  if (types.length && !types.includes(actualType) &&
      !(actualType === "number" && types.includes("integer") && Number.isInteger(value))) {
    return [`${location}: expected ${types.join("|")}, got ${actualType}`];
  }
  const errors = schema.enum && !schema.enum.includes(value) ? [`${location}: invalid enum value`] : [];
  if (actualType === "array") {
    return errors.concat(value.flatMap((entry, index) => responseSchemaErrors(schema.items, entry, root, `${location}[${index}]`)));
  }
  if (actualType !== "object") return errors;
  for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${location}.${key}: required`);
  for (const [key, entry] of Object.entries(value)) {
    const declared = schema.properties?.[key];
    const patterns = Object.entries(schema.patternProperties ?? {})
      .filter(([pattern]) => new RegExp(pattern, "u").test(key)).map(([, child]) => child);
    if (!declared && !patterns.length) errors.push(`${location}.${key}: undeclared field`);
    for (const child of [...(declared ? [declared] : []), ...patterns]) {
      errors.push(...responseSchemaErrors(child, entry, root, `${location}.${key}`));
    }
  }
  return errors;
}

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

test("响应schema的所有对象与数组声明完整，完整元数据不超24KB", () => {
  const mcp = JSON.parse(read(`${AI_SKILL_PATH}/mcp.json`));
  expect(Buffer.byteLength(JSON.stringify(mcp))).toBeLessThanOrEqual(24_000);
  for (const api of mcp.apis) checkSchemaStructure(api.outputSchema, api.outputSchema);
});

test("响应schema递归覆盖编译公共API的资料、控件、伤害与错误字段", () => {
  const mcp = JSON.parse(read(`${AI_SKILL_PATH}/mcp.json`));
  const engine = createRequire(import.meta.url)(path.join(distRoot, AI_SKILL_PATH, "utils/engine.js"));
  const owner = engine.searchRocoData({ query: "乌拉塔（极夜的样子）" }).structuredContent.results[0].id;
  const sample = { attacker: "龙鱼", defender: "岚鸟（春天的样子）", skill: "先发制人" };
  const bet = { attacker: "乌拉塔（极夜的样子）", defender: "龙鱼", skill: "下注" };
  const queries = [
    { query: "龙鱼" }, { query: "岚鸟" }, { kind: "trait", query: "洄游" },
    { kind: "skill", query: "下注", spiritId: owner }, { kind: "skill", query: "花炮" },
    { kind: "skill", query: "skill", limit: 12 }, { query: "龙鱼", kind: "invalid" },
  ];
  const calculations = [
    sample, { ...sample, attackStage: 1, defenseStage: -1 },
    { ...bet, skillValues: { betMode: "lowHp" } },
    { attacker: "黑猫密探", defender: "龙鱼", skill: "午夜噪音" },
    { attacker: "阿布", defender: "龙鱼", skill: "先发制人", attackerLevel: 79 },
    { attacker: "缇塔", defender: "龙鱼", skill: "飞踢" },
    { attacker: "缇塔", defender: "龙鱼", skill: "飞踢", skillValues: { skillPosition: 2 } },
    { ...sample, attacker: "岚鸟" }, { ...sample, attackerNature: "固" },
    { ...sample, skill: "午夜噪音" }, { ...sample, skill: "防御" },
    { ...bet, skillValues: { betMode: "invalid" } }, { ...sample, skillValues: { typo: 1 } },
  ];
  for (const [name, inputs] of [["searchRocoData", queries], ["calculateRocoDamage", calculations]]) {
    const schema = mcp.apis.find(api => api.name === name).outputSchema;
    for (const input of inputs) {
      const result = engine[name](input);
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      expect(responseSchemaErrors(schema, result.structuredContent, schema), `${name} ${JSON.stringify(input)}`).toEqual([]);
    }
  }
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
