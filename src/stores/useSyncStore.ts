import { create } from "zustand";

import type { SyncResult } from "@/lib/bindings/SyncResult";
import type { SyncState } from "@/lib/bindings/SyncState";
import { syncGitApi } from "@/lib/ipc";

/**
 * Runtime sync status displayed in the header / status bar.
 *
 * `lastResult` is the most recent push/pull outcome, surfaced as a tooltip
 * so the user can see *what* changed without going into Settings.
 */
type SyncStoreState = {
  /** Persisted configuration row, or `null` when sync is not set up yet. */
  config: SyncState | null;
  loaded: boolean;
  /**
   * `idle` = nothing happening right now ; `busy` = a push or pull is
   * in-flight ; `error` = the last attempt failed (look at `config.last_error`).
   */
  status: "idle" | "busy" | "error";
  lastResult: SyncResult | null;
  /**
   * `true` once we've confirmed via the backend that an encryption
   * password is stored in the keychain. Without it, push/pull would 500.
   */
  hasPassword: boolean;

  hydrate: () => Promise<void>;
  refreshPassword: () => Promise<void>;
  pushNow: () => Promise<SyncResult | null>;
  pullNow: () => Promise<SyncResult | null>;
};

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  config: null,
  loaded: false,
  status: "idle",
  lastResult: null,
  hasPassword: false,

  async hydrate() {
    try {
      const [config, hasPassword] = await Promise.all([
        syncGitApi.getState(),
        syncGitApi.hasPassword(),
      ]);
      set({
        config,
        hasPassword,
        loaded: true,
        status: config?.last_error ? "error" : "idle",
      });
    } catch (e) {
      console.warn("sync hydrate:", e);
      set({ loaded: true });
    }
  },

  async refreshPassword() {
    try {
      set({ hasPassword: await syncGitApi.hasPassword() });
    } catch (e) {
      console.warn("refreshPassword:", e);
    }
  },

  async pushNow() {
    const { config, hasPassword } = get();
    if (!config?.enabled || !hasPassword) return null;
    set({ status: "busy" });
    try {
      const r = await syncGitApi.pushNow();
      const cfg = await syncGitApi.getState();
      set({ status: "idle", lastResult: r, config: cfg });
      return r;
    } catch (e) {
      const cfg = await syncGitApi.getState();
      set({ status: "error", config: cfg });
      throw e;
    }
  },

  async pullNow() {
    const { config, hasPassword } = get();
    if (!config?.enabled || !hasPassword) return null;
    set({ status: "busy" });
    try {
      const r = await syncGitApi.pullNow();
      const cfg = await syncGitApi.getState();
      set({ status: "idle", lastResult: r, config: cfg });
      return r;
    } catch (e) {
      const cfg = await syncGitApi.getState();
      set({ status: "error", config: cfg });
      throw e;
    }
  },
}));

/**
 * Debounced auto-push : appelle `pushNow()` au plus une fois toutes les 30s
 * après le dernier appel à `schedulePush()`. À déclencher depuis chaque
 * mutation de store (host créé, snippet modifié, etc.).
 */
let pushTimer: number | null = null;
const DEBOUNCE_MS = 30_000;
export function schedulePush(): void {
  const { config, hasPassword } = useSyncStore.getState();
  if (!config?.enabled || !hasPassword) return;
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void useSyncStore
      .getState()
      .pushNow()
      .catch((e) => {
        console.warn("auto-push:", e);
      });
  }, DEBOUNCE_MS);
}
