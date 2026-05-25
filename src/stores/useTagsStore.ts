import { create } from "zustand";

import type { Tag } from "@/lib/bindings/Tag";
import type { TagInput } from "@/lib/bindings/TagInput";
import { tagsApi } from "@/lib/ipc";

/**
 * Tag store: persists the list of tags + the host_tags links so the sidebar
 * can compute `hostTagsMap: hostId -> Tag[]` without N+1 queries.
 *
 * `selectedTagIds` is the filter applied in the sidebar (OR semantics —
 * cf P2-T03). Empty set = no filter.
 */
type TagsState = {
  tags: Tag[];
  /** host_id -> Set of tag_id */
  links: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  selectedTagIds: string[];
  refresh: () => Promise<void>;
  create: (input: TagInput) => Promise<Tag>;
  rename: (id: string, name: string, color: string) => Promise<Tag>;
  remove: (id: string) => Promise<void>;
  setHostTags: (hostId: string, tagIds: string[]) => Promise<void>;
  toggleSelected: (tagId: string) => void;
  clearSelected: () => void;
};

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: [],
  links: {},
  loading: false,
  error: null,
  selectedTagIds: [],

  async refresh() {
    set({ loading: true, error: null });
    try {
      const [tags, links] = await Promise.all([tagsApi.list(), tagsApi.listLinks()]);
      const map: Record<string, string[]> = {};
      for (const { host_id, tag_id } of links) {
        if (!map[host_id]) map[host_id] = [];
        map[host_id].push(tag_id);
      }
      set({ tags, links: map, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  async create(input) {
    const tag = await tagsApi.create(input);
    set({ tags: [...get().tags, tag] });
    return tag;
  },

  async rename(id, name, color) {
    const updated = await tagsApi.update(id, { name, color });
    set({ tags: get().tags.map((t) => (t.id === id ? updated : t)) });
    return updated;
  },

  async remove(id) {
    await tagsApi.delete(id);
    const links = { ...get().links };
    for (const k of Object.keys(links)) {
      links[k] = links[k].filter((tid) => tid !== id);
    }
    set({
      tags: get().tags.filter((t) => t.id !== id),
      links,
      selectedTagIds: get().selectedTagIds.filter((tid) => tid !== id),
    });
  },

  async setHostTags(hostId, tagIds) {
    await tagsApi.setHostTags(hostId, tagIds);
    set({ links: { ...get().links, [hostId]: [...tagIds] } });
  },

  toggleSelected(tagId) {
    const set_ = new Set(get().selectedTagIds);
    if (set_.has(tagId)) set_.delete(tagId);
    else set_.add(tagId);
    set({ selectedTagIds: Array.from(set_) });
  },

  clearSelected() {
    set({ selectedTagIds: [] });
  },
}));
