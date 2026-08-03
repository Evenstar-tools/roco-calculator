export const RESULT_TRIGGER_ID = "result-bar-trigger";

const RESTORE_MESSAGE = "已关闭伤害结果，已返回结果栏";

export function restoreResultContext({ platform, trigger }) {
  if (typeof trigger?.focus === "function") {
    trigger.focus();
    return "h5-focus";
  }

  platform?.nextTick?.(() => {
    platform?.pageScrollTo?.({
      duration: 0,
      selector: `#${RESULT_TRIGGER_ID}`,
    });
    platform?.showToast?.({
      duration: 1500,
      icon: "none",
      title: RESTORE_MESSAGE,
    });
  });
  return "weapp-context";
}
