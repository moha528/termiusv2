import { create } from "zustand";

import type { SshKey } from "@/lib/bindings/SshKey";
import type { SshKeyAlgorithm } from "@/lib/bindings/SshKeyAlgorithm";
import { sshKeysApi } from "@/lib/ipc";

type SshKeysState = {
  keys: SshKey[];
  /** host_id -> ordered list of key_id (by priority asc). */
  hostLinks: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  generate: (
    name: string,
    algorithm: SshKeyAlgorithm,
    passphrase: string | null,
  ) => Promise<SshKey>;
  import: (filePath: string, name: string, passphrase: string | null) => Promise<SshKey>;
  remove: (id: string) => Promise<void>;
  setHostKeys: (hostId: string, keyIds: string[]) => Promise<void>;
};

export const useSshKeysStore = create<SshKeysState>((set, get) => ({
  keys: [],
  hostLinks: {},
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      const [keys, links] = await Promise.all([sshKeysApi.list(), sshKeysApi.listHostLinks()]);
      // links come ordered by (host_id, priority asc), so we can just bucket.
      const hostLinks: Record<string, string[]> = {};
      for (const l of links) {
        if (!hostLinks[l.host_id]) hostLinks[l.host_id] = [];
        hostLinks[l.host_id].push(l.key_id);
      }
      set({ keys, hostLinks, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async setHostKeys(hostId, keyIds) {
    await sshKeysApi.setHostKeys(hostId, keyIds);
    set({ hostLinks: { ...get().hostLinks, [hostId]: [...keyIds] } });
  },

  async generate(name, algorithm, passphrase) {
    const key = await sshKeysApi.generate(name, algorithm, passphrase);
    set({ keys: [...get().keys, key].sort(byName) });
    return key;
  },

  async import(filePath, name, passphrase) {
    const key = await sshKeysApi.import(filePath, name, passphrase);
    set({ keys: [...get().keys, key].sort(byName) });
    return key;
  },

  async remove(id) {
    await sshKeysApi.delete(id);
    set({ keys: get().keys.filter((k) => k.id !== id) });
  },
}));

function byName(a: SshKey, b: SshKey): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
