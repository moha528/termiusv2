import { create } from "zustand";

import type { Group } from "@/lib/bindings/Group";
import type { GroupInput } from "@/lib/bindings/GroupInput";
import { groupsApi } from "@/lib/ipc";

type GroupsState = {
  groups: Group[];
  loading: boolean;
  error: string | null;
  collapsed: Record<string, boolean>;
  refresh: () => Promise<void>;
  create: (input: GroupInput) => Promise<Group>;
  rename: (id: string, name: string) => Promise<Group>;
  remove: (id: string) => Promise<void>;
  moveHost: (hostId: string, groupId: string | null) => Promise<void>;
  toggleCollapsed: (id: string) => void;
};

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  loading: false,
  error: null,
  collapsed: {},

  async refresh() {
    set({ loading: true, error: null });
    try {
      const groups = await groupsApi.list();
      set({ groups, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async create(input) {
    const g = await groupsApi.create(input);
    set({ groups: [...get().groups, g] });
    return g;
  },

  async rename(id, name) {
    const existing = get().groups.find((g) => g.id === id);
    if (!existing) throw new Error(`unknown group ${id}`);
    const updated = await groupsApi.update(id, {
      name,
      parent_id: existing.parent_id,
      position: existing.position,
    });
    set({ groups: get().groups.map((g) => (g.id === id ? updated : g)) });
    return updated;
  },

  async remove(id) {
    await groupsApi.delete(id);
    set({ groups: get().groups.filter((g) => g.id !== id) });
  },

  async moveHost(hostId, groupId) {
    await groupsApi.moveHost(hostId, groupId);
  },

  toggleCollapsed(id) {
    set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } });
  },
}));
