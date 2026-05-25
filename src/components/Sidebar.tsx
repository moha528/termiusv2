import { Download, FolderPlus, Plus, Search } from "lucide-react";
import { useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { withToast } from "@/lib/feedback";
import { useGroupsStore } from "@/stores/useGroupsStore";
import { useServersStore } from "@/stores/useServersStore";
import type { SessionTabType } from "@/stores/useSessionsStore";

import { ServerList } from "./ServerList";
import { TagFilterBar } from "./TagFilterBar";
import { Input } from "./ui/Input";
import { PromptDialog } from "./ui/PromptDialog";

type SidebarProps = {
  width: number;
  onOpenSession?: (host: Host, type?: SessionTabType) => void;
  onOpenImport: () => void;
  onOpenNewHost: () => void;
  onOpenForwards: (host: Host) => void;
};

export function Sidebar({
  width,
  onOpenSession,
  onOpenImport,
  onOpenNewHost,
  onOpenForwards,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const hostCount = useServersStore((s) => s.hosts.length);
  const createGroup = useGroupsStore((s) => s.create);

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg-soft)"
      style={{ width }}
    >
      <div className="flex h-9 items-center justify-between border-b border-(--color-border) px-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
            Servers
          </span>
          {hostCount > 0 && (
            <span className="rounded-full bg-(--color-panel) px-1.5 py-0.5 text-[10px] font-medium text-(--color-muted)">
              {hostCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNewGroupOpen(true)}
            aria-label="Nouveau groupe"
            title="Nouveau groupe"
            className="rounded-md p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenImport}
            aria-label="Import from ~/.ssh/config"
            title="Importer depuis ~/.ssh/config"
            className="rounded-md p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenNewHost}
            aria-label="Add server"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="font-medium">Add</span>
          </button>
        </div>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-muted-soft)" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Rechercher"
            className="h-8 border-(--color-border) bg-(--color-panel) pl-8 text-xs placeholder:text-(--color-muted-soft)"
          />
        </div>
      </div>

      <TagFilterBar />

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <ServerList onOpenSession={onOpenSession} onOpenForwards={onOpenForwards} query={query} />
      </div>

      <PromptDialog
        open={newGroupOpen}
        title="Nouveau groupe"
        label="Nom du groupe"
        confirmText="Créer"
        onOpenChange={setNewGroupOpen}
        onConfirm={async (name) => {
          if (!name) return;
          await withToast(createGroup({ name, parent_id: null, position: 0 }), {
            loading: "Création…",
            success: "Groupe créé",
          });
        }}
      />
    </aside>
  );
}
