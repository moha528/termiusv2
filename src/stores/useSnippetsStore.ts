import { create } from "zustand";

import type { Snippet } from "@/lib/bindings/Snippet";
import type { SnippetInput } from "@/lib/bindings/SnippetInput";
import { snippetsApi } from "@/lib/ipc";

type SnippetsState = {
  snippets: Snippet[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: SnippetInput) => Promise<Snippet>;
  update: (id: string, input: SnippetInput) => Promise<Snippet>;
  remove: (id: string) => Promise<void>;
};

export const useSnippetsStore = create<SnippetsState>((set, get) => ({
  snippets: [],
  loaded: false,
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      const snippets = await snippetsApi.list();
      set({ snippets, loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async create(input) {
    const s = await snippetsApi.create(input);
    set({ snippets: sorted([...get().snippets, s]) });
    return s;
  },

  async update(id, input) {
    const s = await snippetsApi.update(id, input);
    set({ snippets: sorted(get().snippets.map((x) => (x.id === id ? s : x))) });
    return s;
  },

  async remove(id) {
    await snippetsApi.delete(id);
    set({ snippets: get().snippets.filter((s) => s.id !== id) });
  },
}));

function sorted(list: Snippet[]): Snippet[] {
  return [...list].sort((a, b) => {
    const fa = a.folder ?? "￿";
    const fb = b.folder ?? "￿";
    if (fa !== fb) return fa.localeCompare(fb, undefined, { sensitivity: "base" });
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
