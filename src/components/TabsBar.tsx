import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/useSessionsStore";

export function TabsBar() {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const setActive = useSessionsStore((s) => s.setActive);
  const closeTab = useSessionsStore((s) => s.closeTab);

  if (tabs.length === 0) {
    return (
      <div className="flex h-9 shrink-0 items-center border-b border-(--color-border) bg-(--color-panel) px-2 text-xs italic text-(--color-muted)">
        Aucun onglet ouvert
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-(--color-border) bg-(--color-panel)">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(tab.id);
              }
            }}
            className={cn(
              "group flex min-w-32 max-w-56 cursor-pointer items-center gap-2 border-r border-(--color-border) px-3 text-xs outline-none",
              active
                ? "bg-(--color-bg) text-(--color-text)"
                : "text-(--color-muted) hover:bg-white/5",
            )}
          >
            <StatusDot kind={tab.status.kind} />
            <span className="flex-1 truncate text-left">{tab.title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(tab.id);
              }}
              className="rounded p-0.5 opacity-50 hover:bg-white/10 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ kind }: { kind: "connecting" | "open" | "closed" | "error" }) {
  const color = {
    connecting: "bg-yellow-400 animate-pulse",
    open: "bg-emerald-400",
    closed: "bg-zinc-500",
    error: "bg-red-500",
  }[kind];
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", color)} />;
}
