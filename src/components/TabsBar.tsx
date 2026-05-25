import { Cpu, FolderTree, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { SessionTab, SessionTabType } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

type Props = {
  onNewTab: () => void;
};

export function TabsBar({ onNewTab }: Props) {
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const setActive = useSessionsStore((s) => s.setActive);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const setTitle = useSessionsStore((s) => s.setTitle);

  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-(--color-border) bg-(--color-bg-soft)"
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onActivate={() => setActive(tab.id)}
          onClose={() => closeTab(tab.id)}
          onRename={(title) => setTitle(tab.id, title)}
        />
      ))}
      <NewTabButton onClick={onNewTab} />
    </div>
  );
}

function TabItem({
  tab,
  active,
  onActivate,
  onClose,
  onRename,
}: {
  tab: SessionTab;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(tab.title);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== tab.title) onRename(next);
    setEditing(false);
  };

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
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
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 rounded-sm bg-(--color-bg-soft) px-1 text-xs text-(--color-text) outline-none ring-1 ring-(--color-accent)"
        />
      ) : (
        <span
          className="flex-1 truncate text-left"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          title="Double-clic pour renommer"
        >
          {tab.title}
        </span>
      )}
      <button
        type="button"
        aria-label="Close tab"
        onClick={(e) => {
          e.stopPropagation();
          void onClose();
        }}
        className="rounded p-0.5 opacity-0 transition-opacity hover:bg-(--color-panel-hover) group-hover:opacity-60 hover:!opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function NewTabButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Nouvel onglet  ·  Ctrl+K"
      aria-label="Nouvel onglet"
      className="flex items-center justify-center px-3 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function TabIcon({ type }: { type: SessionTabType }) {
  const cls = "h-3 w-3 shrink-0 text-(--color-muted-soft)";
  if (type === "sftp") return <FolderTree className={cls} />;
  if (type === "local") return <Cpu className={cls} />;
  return <TerminalIcon className={cls} />;
}

function StatusDot({ kind }: { kind: "open" | "closed" | "connecting" }) {
  if (kind === "connecting") {
    // Pulsing amber dot to signal "we're working on it". Tailwind's
    // animate-ping fades a halo around the dot; the inner dot stays solid.
    return (
      <span className="relative h-1.5 w-1.5 shrink-0">
        <span className="absolute inset-0 rounded-full bg-amber-400 opacity-75 animate-ping" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      </span>
    );
  }
  const color = {
    open: "bg-(--color-success) shadow-[0_0_6px_var(--color-success)]",
    closed: "bg-(--color-muted-soft)",
  }[kind];
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", color)} />;
}
