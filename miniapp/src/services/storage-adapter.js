export function createStorageAdapter(taro) {
  if (
    !taro ||
    typeof taro.getStorageSync !== "function" ||
    typeof taro.setStorageSync !== "function" ||
    typeof taro.removeStorageSync !== "function"
  ) {
    throw new TypeError("Taro 同步存储接口不可用");
  }

  return {
    get(key) {
      return taro.getStorageSync(key);
    },
    set(key, value) {
      taro.setStorageSync(key, value);
    },
    remove(key) {
      taro.removeStorageSync(key);
    },
  };
}
