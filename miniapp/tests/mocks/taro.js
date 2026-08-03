const values = new Map();
let routerParams = {};
let shareMessageFactory = null;

const Taro = {
  getStorageSync(key) {
    return values.get(key);
  },
  setStorageSync(key, value) {
    values.set(key, value);
  },
  removeStorageSync(key) {
    values.delete(key);
  },
  async showModal() {
    return { cancel: false, confirm: true };
  },
  async showToast() {},
};

export function useRouter() {
  return { params: routerParams };
}

export function useShareAppMessage(factory) {
  shareMessageFactory = factory;
}

export function __getShareMessage() {
  return shareMessageFactory?.();
}

export function __setRouterParams(value = {}) {
  routerParams = value;
}

export default Taro;
