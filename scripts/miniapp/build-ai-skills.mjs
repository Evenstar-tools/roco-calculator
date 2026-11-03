import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const AI_SKILL_PATH = "skills/roco-calculator";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value)}\n`, "utf8");

export async function buildAiSkills({
  root = repositoryRoot,
  distRoot = path.join(root, "miniapp/dist"),
  enabled = process.env.MINIAPP_AI_SKILLS !== "0",
} = {}) {
  const appFile = path.join(distRoot, "app.json");
  const projectFile = path.join(distRoot, "project.config.json");
  const app = readJson(appFile);
  const project = readJson(projectFile);
  const previousSkills = (app.agent?.skills ?? []).filter(({ path: skillPath }) => skillPath !== AI_SKILL_PATH);
  const target = path.resolve(distRoot, AI_SKILL_PATH);
  if (!target.startsWith(`${path.resolve(distRoot)}${path.sep}`)) throw new Error("AI package escapes the output directory");
  fs.rmSync(target, { recursive: true, force: true });

  if (!enabled) {
    if (app.agent) {
      if (previousSkills.length) app.agent.skills = previousSkills;
      else delete app.agent.skills;
      if (!Object.keys(app.agent).length) delete app.agent;
    }
    if (!previousSkills.some(({ path: skillPath }) => skillPath.startsWith("skills/"))) {
      app.subPackages = (app.subPackages ?? app.subpackages ?? []).filter(({ root: packageRoot }) => packageRoot !== "skills");
      delete app.subpackages;
      if (!app.subPackages.length) delete app.subPackages;
      if (project.packOptions?.include) {
        project.packOptions.include = project.packOptions.include.filter(({ type, value }) => type !== "folder" || value !== "skills");
      }
    }
    writeJson(appFile, app);
    writeJson(projectFile, project);
    return { enabled: false, skillPath: AI_SKILL_PATH };
  }

  const source = path.join(root, "miniapp/ai-skills/roco-calculator");
  const mcp = readJson(path.join(source, "mcp.json"));
  const skillText = fs.readFileSync(path.join(source, "SKILL.md"), "utf8");
  const registry = fs.readFileSync(path.join(source, "index.js"), "utf8");
  const mcpInput = { ...mcp, apis: mcp.apis.map(({ outputSchema: _outputSchema, ...api }) => api) };
  if (Buffer.byteLength(JSON.stringify(mcpInput)) > 24_000 || Buffer.byteLength(skillText) > 16_000) {
    throw new Error("AI skill metadata exceeds WeChat limits");
  }
  if (mcp.apis.some(({ name }) => !registry.includes(`registerAPI("${name}"`))) {
    throw new Error("AI metadata and registered APIs differ");
  }
  const requireFromMiniapp = createRequire(path.join(root, "miniapp/package.json"));
  const { build } = requireFromMiniapp("esbuild");
  fs.mkdirSync(target, { recursive: true });
  for (const filename of ["mcp.json", "SKILL.md"]) fs.copyFileSync(path.join(source, filename), path.join(target, filename));
  await build({
    stdin: { contents: registry, resolveDir: source, sourcefile: "index.js" },
    outfile: path.join(target, "index.js"),
    target: "es2017", format: "cjs", minify: true, logLevel: "silent",
  });
  const result = await build({
    entryPoints: [path.join(root, "miniapp/src/ai/skill-entry.js")],
    outfile: path.join(target, "utils/engine.js"),
    bundle: true, platform: "browser", format: "cjs", target: "es2017",
    minify: true, legalComments: "none", metafile: true, logLevel: "silent",
  });
  if (Object.values(result.metafile.outputs).some(({ imports }) => imports.length)) {
    throw new Error("AI package must not depend on main-package modules");
  }
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((file) => /(?:@tarojs|react(?:-dom)?[\\/])/u.test(file))) {
    throw new Error("AI package must not load the page framework");
  }
  app.lazyCodeLoading = "requiredComponents";
  app.agent = { ...app.agent, skills: [...previousSkills, {
    name: "洛克资料与伤害计算",
    description: "查询洛克王国世界国服精灵、技能和特性，按小程序内置规则计算伤害。",
    path: AI_SKILL_PATH,
  }] };
  const packages = app.subPackages ?? app.subpackages ?? [];
  if (packages.some(({ root: packageRoot }) => packageRoot === "skills")) {
    if (!packages.find(({ root: packageRoot }) => packageRoot === "skills").independent) {
      throw new Error("AI skills require an independent package");
    }
  } else packages.push({ root: "skills", independent: true, pages: [] });
  app.subPackages = packages;
  delete app.subpackages;
  project.packOptions ??= {};
  project.packOptions.include ??= [];
  if (!project.packOptions.include.some(({ type, value }) => type === "folder" && value === "skills")) {
    project.packOptions.include.push({ type: "folder", value: "skills" });
  }
  writeJson(appFile, app);
  writeJson(projectFile, project);
  return { enabled: true, skillPath: AI_SKILL_PATH, inputs: inputs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await buildAiSkills())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
