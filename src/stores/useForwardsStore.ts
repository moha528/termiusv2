import { create } from "zustand";

import type { PortForward } from "@/lib/bindings/PortForward";
import type { PortForwardInput } from "@/lib/bindings/PortForwardInput";
import { portForwardsApi } from "@/lib/ipc";

type ForwardsState = {
  /** host_id -> ordered list of forwards. */
  byHost: Record<string, PortForward[]>;
  /** Set of forward ids currently running (held in the backend ForwardRegistry). */
  active: Set<string>;
  loading: boolean;
  error: string | null;
  refresh: (hostId: string) => Promise<void>;
  refreshActive: () => Promise<void>;
  create: (input: PortForwardInput) => Promise<PortForward>;
  update: (id: string, input: PortForwardInput) => Promise<PortForward>;
  remove: (id: string, hostId: string) => Promise<void>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
};

export const useForwardsStore = create<ForwardsState>((set, get) => ({
  byHost: {},
  active: new Set(),
  loading: false,
  error: null,

  async refresh(hostId) {
    set({ loading: true, error: null });
    try {
      const list = await portForwardsApi.listForHost(hostId);
      set({ byHost: { ...get().byHost, [hostId]: list }, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async refreshActive() {
    try {
      const ids = await portForwardsApi.listActive();
      set({ active: new Set(ids) });
    } catch (e) {
      console.warn("listActive:", e);
    }
  },

  async create(input) {
    const fwd = await portForwardsApi.create(input);
    const byHost = { ...get().byHost };
    byHost[fwd.host_id] = [...(byHost[fwd.host_id] ?? []), fwd].sort(
      (a, b) => a.local_port - b.local_port,
    );
    set({ byHost });
    return fwd;
  },

  async update(id, input) {
    const fwd = await portForwardsApi.update(id, input);
    const byHost = { ...get().byHost };
    byHost[fwd.host_id] = (byHost[fwd.host_id] ?? []).map((f) => (f.id === id ? fwd : f));
    set({ byHost });
    return fwd;
  },

  async remove(id, hostId) {
    await portForwardsApi.delete(id);
    const byHost = { ...get().byHost };
    byHost[hostId] = (byHost[hostId] ?? []).filter((f) => f.id !== id);
    const active = new Set(get().active);
    active.delete(id);
    set({ byHost, active });
  },

  async start(id) {
    await portForwardsApi.start(id);
    const active = new Set(get().active);
    active.add(id);
    set({ active });
  },

  async stop(id) {
    await portForwardsApi.stop(id);
    const active = new Set(get().active);
    active.delete(id);
    set({ active });
  },
}));
