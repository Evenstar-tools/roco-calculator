import { createCalculatorSessionStore } from "./workspace-store.js";
import { createServerStorage } from "../state/server-storage.js";

const BACKUP_KEY = "rock-calculator.calculator.pre-release-session.v1";

export function migrateGlobalDraftState(value, initialState) {
  if (value?.versions?.data !== null || value?.versions?.rules !== null || !initialState?.versions?.data) return value;
  return {
    ...value,
    versions: { ...initialState.versions },
    sides: Object.fromEntries(Object.entries(value.sides ?? {}).map(([key, side]) => [key, {
      ...side,
      nature: side.nature ?? initialState.sides[key]?.nature ?? "neutral",
      displayIvs: Object.fromEntries(Object.entries(side.displayIvs ?? {}).map(([stat, iv]) =>
        [stat, iv ?? initialState.sides[key]?.displayIvs?.[stat] ?? 60])),
    }])),
  };
}

/** Upgrade the old unversioned workspace on read; retain its untouched payload before the first save. */
export function createGlobalSessionStore({ initialState, storage = globalThis.localStorage, validateState }) {
  const migrate = value => migrateGlobalDraftState(value, initialState);
  const rawStore = createCalculatorSessionStore({ serverId: "global", storage, validateState: value => validateState?.(migrate(value)) });
  const target = createServerStorage("global", storage);
  let original = null;
  const migrateSession = session => session && ({
    present: migrate(session.present),
    past: session.past.map(entry => ({ ...entry, state: migrate(entry.state) })),
    future: session.future.map(entry => ({ ...entry, state: migrate(entry.state) })),
  });
  return {
    loadSession: () => {
      original = rawStore.loadSession();
      return migrateSession(original);
    },
    saveSession: value => {
      if (original?.present?.versions?.data === null && target.getItem(BACKUP_KEY) === null) {
        target.setItem(BACKUP_KEY, JSON.stringify(original));
      }
      return rawStore.saveSession(value);
    },
  };
}
