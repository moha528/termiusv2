import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Tag } from "@/lib/bindings/Tag";
import { cn } from "@/lib/utils";
import { useTagsStore } from "@/stores/useTagsStore";

import { TagBadge } from "./TagBadge";

const DEFAULT_PALETTE = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#64748b", // slate
];

type Props = {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
};

/**
 * Multi-tag selector for the host form. Displays currently selected tags as
 * removable badges + a popover combobox to add an existing tag or create a
 * new one on the fly (with a random palette color).
 */
export function TagPicker({ selectedTagIds, onChange }: Props) {
  const tags = useTagsStore((s) => s.tags);
  const refresh = useTagsStore((s) => s.refresh);
  const createTag = useTagsStore((s) => s.create);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, query]);

  const canCreate =
    query.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selectedTagIds.filter((t) => t !== id));
    else onChange([...selectedTagIds, id]);
  };

  const createAndSelect = async () => {
    const name = query.trim();
    if (!name) return;
    const color = DEFAULT_PALETTE[tags.length % DEFAULT_PALETTE.length];
    const tag = await createTag({ name, color });
    onChange([...selectedTagIds, tag.id]);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-1.5 min-h-9">
        {selectedTagIds.map((id) => {
          const tag = tagById.get(id);
          if (!tag) return null;
          return (
            <TagBadge
              key={id}
              tag={tag}
              size="sm"
              onRemove={() => onChange(selectedTagIds.filter((t) => t !== id))}
            />
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-(--color-border) px-2 py-0.5 text-[11px] text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          aria-label="Ajouter un tag"
        >
          <Plus className="h-3 w-3" />
          Tag
        </button>
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-(--color-border-strong) bg-(--color-elevated) shadow-2xl shadow-black/40">
          <input
            // biome-ignore lint/a11y/noAutofocus: combobox opened intentionally on user click
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Rechercher ou créer…"
            className="w-full border-b border-(--color-border) bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-(--color-muted-soft)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canCreate) void createAndSelect();
                else if (filtered.length === 1) {
                  toggle(filtered[0].id);
                  setQuery("");
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors",
                    "hover:bg-(--color-panel-hover)",
                  )}
                >
                  <span
                    className="h-3 w-3 rounded-full border border-(--color-border)"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="flex-1 truncate text-(--color-text)">{t.name}</span>
                  {selectedSet.has(t.id) && <Check className="h-3 w-3 text-(--color-accent)" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !canCreate && (
              <li className="px-2 py-1.5 text-[11px] text-(--color-muted-soft)">Aucun tag</li>
            )}
            {canCreate && (
              <li>
                <button
                  type="button"
                  onClick={createAndSelect}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-(--color-panel-hover)"
                >
                  <Plus className="h-3 w-3 text-(--color-accent)" />
                  <span>
                    Créer le tag <span className="text-(--color-accent)">« {query.trim()} »</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
          {selectedTagIds.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center justify-center gap-1 border-t border-(--color-border) px-2 py-1.5 text-[11px] text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
            >
              <X className="h-3 w-3" />
              Vider la sélection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Type-only re-export so consumers can pass a Tag list cleanly if needed later.
export type { Tag };
