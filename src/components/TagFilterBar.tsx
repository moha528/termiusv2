import { X } from "lucide-react";

import { useTagsStore } from "@/stores/useTagsStore";

import { TagBadge } from "./TagBadge";

/**
 * Pills cliquables affichées au-dessus de la liste des hosts. Cliquer un
 * tag toggle son appartenance au filtre (sémantique OR : un host passe le
 * filtre s'il porte au moins un des tags sélectionnés).
 *
 * Le composant ne rend rien quand aucun tag n'existe — on ne veut pas
 * réserver de place vide dans la sidebar.
 */
export function TagFilterBar() {
  const tags = useTagsStore((s) => s.tags);
  const selected = useTagsStore((s) => s.selectedTagIds);
  const toggle = useTagsStore((s) => s.toggleSelected);
  const clear = useTagsStore((s) => s.clearSelected);

  if (tags.length === 0) return null;

  const selectedSet = new Set(selected);

  return (
    <div className="flex items-center gap-1 border-b border-(--color-border) px-2 py-1.5">
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            selected={selectedSet.has(tag.id)}
            onClick={() => toggle(tag.id)}
          />
        ))}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={clear}
          aria-label="Effacer le filtre par tag"
          title="Effacer le filtre"
          className="shrink-0 inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 text-[10px] text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <X className="h-3 w-3" />
          {selected.length}
        </button>
      )}
    </div>
  );
}
