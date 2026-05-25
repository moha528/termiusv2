import { create } from "zustand";

import type { Identity } from "@/lib/bindings/Identity";
import type { IdentityInput } from "@/lib/bindings/IdentityInput";
import { identitiesApi } from "@/lib/ipc";

type IdentitiesState = {
  identities: Identity[];
  /** identityId → ordered list of key ids by priority. */
  keyLinks: Record<string, string[]>;
  loaded: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  create: (input: IdentityInput) => Promise<Identity>;
  update: (id: string, input: IdentityInput) => Promise<Identity>;
  remove: (id: string) => Promise<void>;
  setKeys: (identityId: string, keyIds: string[]) => Promise<void>;
};

export const useIdentitiesStore = create<IdentitiesState>((set, get) => ({
  identities: [],
  keyLinks: {},
  loaded: false,
  loading: false,

  async refresh() {
    set({ loading: true });
    try {
      const [identities, links] = await Promise.all([
        identitiesApi.list(),
        identitiesApi.listLinks(),
      ]);
      const keyLinks: Record<string, string[]> = {};
      for (const l of links) {
        if (!keyLinks[l.identity_id]) keyLinks[l.identity_id] = [];
        keyLinks[l.identity_id].push(l.key_id);
      }
      set({ identities, keyLinks, loaded: true, loading: false });
    } catch (e) {
      console.warn("identities refresh:", e);
      set({ loading: false });
    }
  },

  async create(input) {
    const i = await identitiesApi.create(input);
    set({ identities: sorted([...get().identities, i]) });
    return i;
  },

  async update(id, input) {
    const i = await identitiesApi.update(id, input);
    set({ identities: sorted(get().identities.map((x) => (x.id === id ? i : x))) });
    return i;
  },

  async remove(id) {
    await identitiesApi.delete(id);
    const { [id]: _drop, ...rest } = get().keyLinks;
    set({
      identities: get().identities.filter((i) => i.id !== id),
      keyLinks: rest,
    });
  },

  async setKeys(identityId, keyIds) {
    await identitiesApi.setKeys(identityId, keyIds);
    set({ keyLinks: { ...get().keyLinks, [identityId]: [...keyIds] } });
  },
}));

function sorted(list: Identity[]): Identity[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
