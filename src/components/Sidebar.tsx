import { Plus } from "lucide-react";
import { useState } from "react";

import type { Host } from "@/lib/bindings/Host";

import { HostFormDialog } from "./HostFormDialog";
import { ServerList } from "./ServerList";

type SidebarProps = {
  width: number;
  onOpenSession?: (host: Host) => void;
};

export function Sidebar({ width, onOpenSession }: SidebarProps) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-(--color-border) bg-(--color-panel)"
      style={{ width }}
    >
      <div className="flex h-10 items-center justify-between border-b border-(--color-border) px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
          Servers
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <ServerList onOpenSession={onOpenSession} />
      </div>

      <HostFormDialog open={addOpen} onOpenChange={setAddOpen} host={null} />
    </aside>
  );
}
