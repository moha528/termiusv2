import { create } from "zustand";

import { portForwardsApi, vaultApi } from "@/lib/ipc";
import { useForwardsStore } from "@/stores/useForwardsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

/**
 * Vault state: master password presence + lock status.
 *
 * `locked` is the authoritative gate for the UI. While true, the
 * `<UnlockOverlay />` covers everything and blocks input. The session
 * store is asked to close every tab at lock time — we don't keep
 * authenticated SSH sessions alive behind a lock prompt.
 */
type VaultState = {
  /** Has the user configured a master password? */
  hasMaster: boolean;
  /** Currently locked — render the unlock overlay only. */
  locked: boolean;
  /** Lock state synced from settings. 0 = disabled. */
  autoLockMinutes: number;
  /** Hydrate `hasMaster` + initial lock state from the backend. */
  hydrate: () => Promise<void>;
  /** Verify password + unlock if correct. */
  unlock: (password: string) => Promise<boolean>;
  /** Force lock now (closes all sessions). */
  lock: () => Promise<void>;
  /** Sync `autoLockMinutes` from outside (settings change). */
  setAutoLockMinutes: (minutes: number) => void;
  /** Mark as "master enabled" after a Settings dialog change. */
  refresh: () => Promise<void>;
};

export const useVaultStore = create<VaultState>((set, get) => ({
  hasMaster: false,
  locked: false,
  autoLockMinutes: 0,

  async hydrate() {
    try {
      const hasMaster = await vaultApi.hasPin();
      // If a PIN is set, the app starts locked. The user must
      // unlock to do anything.
      set({ hasMaster, locked: hasMaster });
    } catch (e) {
      console.warn("vault hydrate:", e);
    }
  },

  async unlock(pin) {
    const ok = await vaultApi.verify(pin);
    if (ok) set({ locked: false });
    return ok;
  },

  async lock() {
    // Don't lock if there's no PIN to unlock with.
    if (!get().hasMaster) return;
    if (get().locked) return;
    // Close every open session — we don't want them lingering behind the lock.
    const sessions = useSessionsStore.getState();
    for (const tab of sessions.tabs) {
      try {
        await sessions.closeTab(tab.id);
      } catch (e) {
        console.warn("close tab on lock:", e);
      }
    }
    // Stop every active port forward server-side too. Active -L/-R/-D
    // listeners would otherwise keep accepting traffic past the lock — a
    // hole if someone has physical access to the machine. Best-effort: we
    // log failures but still flip to locked.
    try {
      await portForwardsApi.stopAll();
      // Mirror the empty active-set in the local store.
      useForwardsStore.setState({ active: new Set() });
    } catch (e) {
      console.warn("stop forwards on lock:", e);
    }
    set({ locked: true });
  },

  setAutoLockMinutes(minutes) {
    set({ autoLockMinutes: minutes });
  },

  async refresh() {
    const hasMaster = await vaultApi.hasPin();
    set({ hasMaster });
  },
}));
