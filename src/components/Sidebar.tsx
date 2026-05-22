import { Plus, Search, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";

import type { Host } from "@/lib/bindings/Host";

import { HostFormDialog } from "./HostFormDialog";
import { ServerList } from "./ServerList";
import { Input } from "./ui/Input";

type SidebarProps = {
  width: number;
  onOpenSession?: (host: Host) => void;
  onOpenSettings?: () => void;
};

export function Sidebar({ width, onOpenSession, onOpenSettings }: SidebarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-(--color-border) bg-(--color-panel)"
      style={{ width }}
    >
      <div className="flex h-10 items-center justify-between border-b border-(--color-border) px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
          Servers
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
          <button
            type="button"
            aria-label="Settings"
            onClick={onOpenSettings}
            className="rounded p-1 text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-b border-(--color-border) p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-muted)" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Rechercher…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <ServerList onOpenSession={onOpenSession} query={query} />
      </div>

      <HostFormDialog open={addOpen} onOpenChange={setAddOpen} host={null} />
    </aside>
  );
}
