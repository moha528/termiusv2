import { Eraser, History, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveActiveTerminal, sendToActiveTerminal } from "@/lib/activeTerminal";
import type { CommandHistoryEntry } from "@/lib/bindings/CommandHistoryEntry";
import { withToast } from "@/lib/feedback";
import { commandHistoryApi } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

import { Dialog, DialogContent, DialogTitle } from "./ui/Dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Ctrl+R / Cmd+R fuzzy command history. Lists every previously-typed command
 * (deduplicated, most recent first). Selecting one types it into the active
 * terminal **without auto-submitting** so the user can edit before running —
 * that matches what `Ctrl+R` does in bash/zsh.
 */
export function CommandHistoryDialog({ open, onOpenChange }: Props) {
  const historyScope = useSettingsStore((s) => s.commandHistoryScope);
  const [entries, setEntries] = useState<CommandHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const target = resolveActiveTerminal();
    const scope = historyScope === "host" && target?.type === "ssh" ? target.hostId : null;
    setLoading(true);
    commandHistoryApi
      .list(scope, 500)
      .then((rows) => setEntries(rows))
      .catch((e) => console.warn("history list:", e))
      .finally(() => setLoading(false));
  }, [open, historyScope]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.command.toLowerCase().includes(q));
  }, [entries, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate — reset on query change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.querySelector<HTMLLIElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIdx]);

  const choose = async (entry: CommandHistoryEntry) => {
    const target = resolveActiveTerminal();
    if (!target) {
      withToast(Promise.reject(new Error("Aucun terminal actif")), {
        loading: "…",
        success: "OK",
      });
      return;
    }
    onOpenChange(false);
    // No trailing newline — the user reviews before running.
    await sendToActiveTerminal(entry.command);
  };

  const handleClear = async () => {
    const target = resolveActiveTerminal();
    const scope = historyScope === "host" && target?.type === "ssh" ? target.hostId : null;
    await withToast(
      commandHistoryApi.clear(scope).then(() => setEntries([])),
      {
        loading: "Effacement…",
        success: scope ? "Historique du host vidé" : "Historique vidé",
      },
    );
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
      const entry = filtered[activeIdx];
      if (entry) void choose(entry);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Historique des commandes</DialogTitle>
        <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2.5">
          <History className="h-4 w-4 text-(--color-muted-soft)" />
          <input
            // biome-ignore lint/a11y/noAutofocus: history finders rely on autofocus
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Rechercher dans l'historique…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-(--color-muted-soft)"
          />
          <button
            type="button"
            onClick={handleClear}
            title="Vider l'historique"
            aria-label="Vider l'historique"
            className="rounded p-1 text-(--color-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <kbd className="rounded border border-(--color-border) px-1.5 py-0.5 text-[10px] text-(--color-muted)">
            Esc
          </kbd>
        </div>

        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {loading ? (
            <li className="px-3 py-6 text-center text-xs text-(--color-muted-soft)">Chargement…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-(--color-muted-soft)">
              {entries.length === 0
                ? "Aucune commande dans l'historique."
                : "Aucune commande ne correspond."}
            </li>
          ) : (
            filtered.map((entry, idx) => (
              <li
                key={entry.id}
                data-idx={idx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => choose(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void choose(entry);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-1.5",
                  idx === activeIdx && "bg-(--color-accent-bg)/40",
                )}
              >
                <Search className="h-3 w-3 shrink-0 text-(--color-muted-soft)" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-(--color-text)">
                  {entry.command}
                </code>
                <span className="shrink-0 text-[10px] text-(--color-muted-soft)">
                  {entry.host_id ? "host" : "global"}
                </span>
              </li>
            ))
          )}
        </ul>

        <footer className="flex items-center justify-between gap-3 border-t border-(--color-border) bg-(--color-bg-soft) px-3 py-1.5 text-[10px] text-(--color-muted)">
          <span className="flex items-center gap-2">
            <Hint k="↑↓">naviguer</Hint>
            <Hint k="↵">insérer (sans exécuter)</Hint>
            <Hint k="Esc">fermer</Hint>
          </span>
          <span>
            {filtered.length} entrée{filtered.length > 1 ? "s" : ""} ·{" "}
            {historyScope === "host" ? "host" : "global"}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
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
