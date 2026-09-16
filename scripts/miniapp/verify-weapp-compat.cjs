const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("../../miniapp/node_modules/react");
const jsxRuntime = require("../../miniapp/node_modules/react/jsx-runtime");

process.on("uncaughtException", (error) => {
  // 单行压缩文件的默认异常输出会打印整段包体，仅保留错误和调用位置。
  process.stderr.write(`${error.name}: ${error.message}\n${String(error.stack).split("\n").slice(1, 7).join("\n")}\n`);
  process.exitCode = 1;
});

const dist = path.resolve(__dirname, "../../miniapp/dist");
const profiles = {
  "missing-Intl": "globalThis.Intl=undefined;",
  "missing-Collator": "globalThis.Intl={};",
  "missing-hasOwn": "Object.hasOwn=undefined;",
  "missing-at": "Array.prototype.at=undefined;",
  "missing-all": "globalThis.Intl=undefined;Object.hasOwn=undefined;Array.prototype.at=undefined;globalThis.structuredClone=undefined;",
};

// 只替代微信/Taro宿主边界；应用、公共模块和压缩数据均执行真实生产文件。
for (const [profile, setup] of Object.entries(profiles)) {
  const apps = [];
  const pages = [];
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    App: (config) => apps.push(config),
    Page: (config) => pages.push(config),
    wx: {},
  });
  vm.runInContext(setup, context);
  const taro = {
    React,
    reactExports: React,
    jsxRuntimeExports: jsxRuntime,
    Taro: {},
    taroExports: { initPxTransform() {}, useLaunch() {} },
    taroWindowProvider: {},
    createReactApp: () => ({}),
    createPageConfig: (component, pagePath) => ({ component, pagePath }),
    View: "view", Text: "text", Button: "button", Image: "image", Input: "input", ScrollView: "scroll-view", Picker: "picker",
  };
  const cache = new Map();
  function load(file) {
    if (file === path.join(dist, "taro.js")) return taro;
    if (cache.has(file)) return cache.get(file).exports;
    assert.ok(file.startsWith(`${dist}${path.sep}`), "unexpected production dependency");
    const module = { exports: {} };
    cache.set(file, module);
    const execute = vm.runInContext(`(function(require,module,exports){${fs.readFileSync(file, "utf8")}\n})`, context, { filename: file });
    execute((relative) => load(path.resolve(path.dirname(file), relative)), module, module.exports);
    return module.exports;
  }
  load(path.join(dist, "app.js"));
  load(path.join(dist, "pages/index/index.js"));
  assert.equal(apps.length, 1, "production App was not registered");
  assert.equal(pages.length, 1, "production homepage was not registered");
  assert.ok(vm.runInContext("typeof Object.hasOwn==='function' && typeof Array.prototype.at==='function'", context), "compatibility bootstrap is missing from production output");
  assert.equal(vm.runInContext("[1,2,3].at(-1)", context), 3);
  assert.ok(vm.runInContext("Object.hasOwn({x:undefined},'x') && !Object.hasOwn(Object.create({x:1}),'x')", context));
  process.stdout.write(`${profile}: production bootstrap passed\n`);
}
