import type { Host } from "@/lib/bindings/Host";
import type { HostInput } from "@/lib/bindings/HostInput";
import { hostsApi } from "@/lib/ipc";
import { create } from "zustand";

type ServersState = {
  hosts: Host[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  create: (input: HostInput) => Promise<Host>;
  update: (id: string, input: HostInput) => Promise<Host>;
  remove: (id: string) => Promise<void>;
};

export const useServersStore = create<ServersState>((set, get) => ({
  hosts: [],
  selectedId: null,
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      const hosts = await hostsApi.list();
      set({ hosts, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  select(id) {
    set({ selectedId: id });
  },

  async create(input) {
    const host = await hostsApi.create(input);
    set({ hosts: [...get().hosts, host].sort(byLabel) });
    return host;
  },

  async update(id, input) {
    const host = await hostsApi.update(id, input);
    set({
      hosts: get()
        .hosts.map((h) => (h.id === id ? host : h))
        .sort(byLabel),
    });
    return host;
  },

  async remove(id) {
    await hostsApi.delete(id);
    set({
      hosts: get().hosts.filter((h) => h.id !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },
}));

function byLabel(a: Host, b: Host): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}
