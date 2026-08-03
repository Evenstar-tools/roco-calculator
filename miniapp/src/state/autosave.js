export const AUTOSAVE_DELAY_MS = 250;

export function createAutosaveController({
  persistence,
  store,
  wait = AUTOSAVE_DELAY_MS,
}) {
  let disposed = false;
  let timer = null;

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  const unsubscribe = store.subscribe((state) => {
    if (disposed) {
      return;
    }
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (disposed) {
        return;
      }
      try {
        persistence.save(state);
      } catch {
        // 本机存储失败不阻断当前计算。
      }
    }, wait);
  });

  return {
    cancel,
    dispose() {
      disposed = true;
      cancel();
      unsubscribe();
    },
  };
}
