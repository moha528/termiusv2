import { FolderTree, Terminal as TerminalIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

export function TabsBar() {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const setActive = useSessionsStore((s) => s.setActive);
  const closeTab = useSessionsStore((s) => s.closeTab);

  if (tabs.length === 0) {
    return <div className="h-9 shrink-0 border-b border-(--color-border) bg-(--color-bg-soft)" />;
  }

  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-(--color-border) bg-(--color-bg-soft)"
    >
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
              "group relative flex min-w-36 max-w-56 cursor-pointer items-center gap-2 border-r border-(--color-border) px-3 text-xs outline-none transition-colors",
              active
                ? "bg-(--color-bg) text-(--color-text)"
                : "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text-soft)",
            )}
          >
            {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-(--color-accent)" />}
            <StatusDot kind={tab.status.kind} />
            <TabIcon type={tab.type} />
            <span className="flex-1 truncate text-left">{tab.title}</span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(tab.id);
              }}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-(--color-panel-hover) group-hover:opacity-60 hover:!opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function TabIcon({ type }: { type: SessionTabType }) {
  const cls = "h-3 w-3 shrink-0 text-(--color-muted-soft)";
  return type === "sftp" ? <FolderTree className={cls} /> : <TerminalIcon className={cls} />;
}

function StatusDot({ kind }: { kind: "open" | "closed" }) {
  const color = {
    open: "bg-(--color-success) shadow-[0_0_6px_var(--color-success)]",
    closed: "bg-(--color-muted-soft)",
  }[kind];
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", color)} />;
}
