// 安卓微信的 JavaScript 引擎可能缺少这些 API；必须在页面依赖执行前补齐。
export function installRuntimeCompatibility() {
  if (typeof Object.hasOwn !== "function") {
    Object.defineProperty(Object, "hasOwn", {
      configurable: true,
      writable: true,
      value(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
      },
    });
  }
  if (typeof Array.prototype.at !== "function") {
    Object.defineProperty(Array.prototype, "at", {
      configurable: true,
      writable: true,
      value(index = 0) {
        if (this == null) throw new TypeError("Array.at requires an array-like value");
        const object = Object(this);
        const length = Math.min(Math.max(Math.trunc(Number(object.length) || 0), 0), Number.MAX_SAFE_INTEGER);
        const position = Math.trunc(Number(index) || 0);
        const resolved = position >= 0 ? position : length + position;
        return resolved < 0 || resolved >= length ? undefined : object[resolved];
      },
    });
  }
}

installRuntimeCompatibility();
