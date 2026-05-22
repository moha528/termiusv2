import {
  Download,
  FolderTree,
  Plus,
  Search,
  Settings as SettingsIcon,
  Terminal as TerminalIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { cn } from "@/lib/utils";
import { useServersStore } from "@/stores/useServersStore";
import type { SessionTabType } from "@/stores/useSessionsStore";

import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";

type Action =
  | { kind: "open-host"; type: SessionTabType; host: Host }
  | { kind: "new-host" }
  | { kind: "import-ssh-config" }
  | { kind: "open-settings" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenHost: (host: Host, type: SessionTabType) => void;
  onNewHost: () => void;
  onImport: () => void;
  onOpenSettings: () => void;
};

/**
 * Spotlight-style command palette opened with `Ctrl+K` or the `+` button in
 * the tabs bar.
 *
 * Layout (top to bottom):
 *   1. Search input
 *   2. Result list: quick actions first, then SSH and SFTP entries for every
 *      saved host that matches the query. Up/Down arrows + Enter to fire.
 *
 * Hosts appear twice (one row to open SSH, one to open SFTP) because that's
 * the fastest path to "I want sftp on this server" — no extra modal, no
 * intermediate menu.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onOpenHost,
  onNewHost,
  onImport,
  onOpenSettings,
}: Props) {
  const hosts = useServersStore((s) => s.hosts);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const filtered = useMemo(() => filterActions(hosts, query), [hosts, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is the trigger
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Scroll the active item into view when navigating with the keyboard.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLLIElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const runAction = (action: Action) => {
    onOpenChange(false);
    switch (action.kind) {
      case "open-host":
        onOpenHost(action.host, action.type);
        break;
      case "new-host":
        onNewHost();
        break;
      case "import-ssh-config":
        onImport();
        break;
      case "open-settings":
        onOpenSettings();
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[activeIdx];
      if (action) runAction(action);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[20%] max-w-xl translate-y-0 gap-0 p-0"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2.5">
          <Search className="h-4 w-4 text-(--color-muted-soft)" />
          <input
            // biome-ignore lint/a11y/noAutofocus: command palettes need autofocus, that's the point
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Rechercher un serveur, taper une action…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-muted-soft)"
          />
          <kbd className="rounded border border-(--color-border) px-1.5 py-0.5 text-[10px] text-(--color-muted)">
            Esc
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-(--color-muted-soft)">
              Aucun résultat
            </li>
          ) : (
            filtered.map((action, idx) => (
              <ActionRow
                key={actionKey(action)}
                action={action}
                active={idx === activeIdx}
                idx={idx}
                onHover={() => setActiveIdx(idx)}
                onSelect={() => runAction(action)}
              />
            ))
          )}
        </ul>

        <footer className="flex items-center justify-between gap-3 border-t border-(--color-border) bg-(--color-bg-soft) px-3 py-1.5 text-[10px] text-(--color-muted)">
          <span className="flex items-center gap-2">
            <Hint k="↑↓">naviguer</Hint>
            <Hint k="↵">lancer</Hint>
            <Hint k="Esc">fermer</Hint>
          </span>
          <span>
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({
  action,
  active,
  idx,
  onHover,
  onSelect,
}: {
  action: Action;
  active: boolean;
  idx: number;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <li
      data-idx={idx}
      onMouseEnter={onHover}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm",
        active && "bg-(--color-accent-bg)/40",
      )}
    >
      <ActionIcon action={action} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-(--color-text)">{actionLabel(action)}</span>
        <span className="truncate text-[11px] text-(--color-muted)">
          {actionDescription(action)}
        </span>
      </span>
      <span className="shrink-0 rounded bg-(--color-panel) px-1.5 py-0.5 font-mono text-[10px] text-(--color-muted)">
        {actionBadge(action)}
      </span>
    </li>
  );
}

function ActionIcon({ action }: { action: Action }) {
  const cls = "h-4 w-4 shrink-0";
  switch (action.kind) {
    case "open-host":
      return action.type === "sftp" ? (
        <FolderTree className={cn(cls, "text-(--color-accent)")} />
      ) : (
        <TerminalIcon className={cn(cls, "text-(--color-accent)")} />
      );
    case "new-host":
      return <Plus className={cn(cls, "text-(--color-muted)")} />;
    case "import-ssh-config":
      return <Download className={cn(cls, "text-(--color-muted)")} />;
    case "open-settings":
      return <SettingsIcon className={cn(cls, "text-(--color-muted)")} />;
  }
}

function actionKey(action: Action): string {
  switch (action.kind) {
    case "open-host":
      return `host-${action.host.id}-${action.type}`;
    default:
      return action.kind;
  }
}

function actionLabel(action: Action): string {
  switch (action.kind) {
    case "open-host":
      return action.host.label;
    case "new-host":
      return "Ajouter un serveur";
    case "import-ssh-config":
      return "Importer ~/.ssh/config";
    case "open-settings":
      return "Ouvrir les réglages";
  }
}

function actionDescription(action: Action): string {
  switch (action.kind) {
    case "open-host": {
      const endpoint = `${action.host.username}@${action.host.hostname}${
        action.host.port !== 22 ? `:${action.host.port}` : ""
      }`;
      return `${action.type === "sftp" ? "SFTP" : "SSH"} · ${endpoint}`;
    }
    case "new-host":
      return "Créer un nouveau host";
    case "import-ssh-config":
      return "Importer des hôtes depuis OpenSSH";
    case "open-settings":
      return "Préférences, thèmes, …";
  }
}

function actionBadge(action: Action): string {
  switch (action.kind) {
    case "open-host":
      return action.type === "sftp" ? "SFTP" : "SSH";
    default:
      return "Action";
  }
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-(--color-border) bg-(--color-panel) px-1 font-mono">
        {k}
      </kbd>
      <span>{children}</span>
    </span>
  );
}

function filterActions(hosts: Host[], query: string): Action[] {
  const q = query.trim().toLowerCase();
  const all: Action[] = [];

  // SSH + SFTP rows per host
  for (const host of hosts) {
    all.push({ kind: "open-host", type: "ssh", host });
    all.push({ kind: "open-host", type: "sftp", host });
  }

  // Quick actions
  all.push({ kind: "new-host" });
  all.push({ kind: "import-ssh-config" });
  all.push({ kind: "open-settings" });

  if (!q) return all;

  return all.filter((a) => {
    const hay =
      a.kind === "open-host"
        ? `${a.host.label} ${a.host.hostname} ${a.host.username} ${a.type}`
        : a.kind;
    return hay.toLowerCase().includes(q);
  });
}
