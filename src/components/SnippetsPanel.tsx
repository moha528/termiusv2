import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronRight, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { resolveActiveTerminal, sendToActiveTerminal } from "@/lib/activeTerminal";
import type { Snippet } from "@/lib/bindings/Snippet";
import { withToast } from "@/lib/feedback";
import { snippetsApi } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useSnippetsStore } from "@/stores/useSnippetsStore";

import { SnippetEditorDialog } from "./SnippetEditorDialog";
import { SnippetVariablesDialog } from "./SnippetVariablesDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/AlertDialog";
import { Button } from "./ui/Button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Right-side slide-in panel listing every saved snippet, grouped by folder.
 *
 * Sending a snippet:
 *   - If the content has variables → opens the values modal
 *   - The rendered string is pushed to the focused terminal pane of the
 *     active tab (`sendToActiveTerminal`), then a `\r` is appended to fire
 *     the command. Snippets without a terminating newline are still
 *     "executed" — assume the user wants the command to run; an empty
 *     terminal target shows a toast and aborts.
 */
export function SnippetsPanel({ open, onOpenChange }: Props) {
  const snippets = useSnippetsStore((s) => s.snippets);
  const loaded = useSnippetsStore((s) => s.loaded);
  const refresh = useSnippetsStore((s) => s.refresh);
  const removeSnippet = useSnippetsStore((s) => s.remove);

  const [query, setQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Snippet | null | undefined>(undefined);
  const [varsForSnippet, setVarsForSnippet] = useState<{
    snippet: Snippet;
    variables: string[];
  } | null>(null);
  const [toDelete, setToDelete] = useState<Snippet | null>(null);

  useEffect(() => {
    if (open && !loaded) {
      void refresh();
    }
  }, [open, loaded, refresh]);

  const groups = useMemo(() => groupAndFilter(snippets, query), [snippets, query]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleRun = async (snippet: Snippet) => {
    const variables = await snippetsApi.extractVariables(snippet.content);
    // Built-ins we substitute ourselves so the user never has to type them.
    const builtins = builtinValues();
    const custom = variables.filter((v) => !(v in builtins));
    if (custom.length === 0) {
      const rendered = await snippetsApi.render(snippet.content, builtins);
      await runRendered(rendered);
      return;
    }
    setVarsForSnippet({ snippet, variables: custom });
  };

  const runRendered = async (rendered: string) => {
    const target = resolveActiveTerminal();
    if (!target) {
      // No live terminal → silently abort with a feedback toast.
      withToast(Promise.reject(new Error("Ouvre un terminal d'abord")), {
        loading: "Insertion…",
        success: "OK",
      });
      return;
    }
    // Ensure the command actually runs: append `\r` if the snippet doesn't
    // already end with one. Multi-line content keeps its existing newlines.
    const payload = rendered.endsWith("\n") || rendered.endsWith("\r") ? rendered : `${rendered}\r`;
    await sendToActiveTerminal(payload);
  };

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-(--color-border-strong) bg-(--color-panel) shadow-2xl shadow-black/40",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
              "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
            )}
            // Stop the typed query from triggering global shortcuts (Ctrl+K).
            onKeyDownCapture={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <DialogPrimitive.Title className="text-sm font-semibold">
                  Snippets
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[11px] text-(--color-muted)">
                  Commandes réutilisables · variables {"{{var}}"}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Fermer"
                className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </header>

            <div className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2">
              <Search className="h-3.5 w-3.5 text-(--color-muted-soft)" />
              <input
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Filtrer (nom, dossier, contenu)…"
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-(--color-muted-soft)"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setEditing(null)}
              >
                <Plus className="h-3 w-3" />
                Nouveau
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {groups.length === 0 ? (
                <div className="mx-2 mt-6 rounded-md border border-dashed border-(--color-border) bg-(--color-bg-soft) px-3 py-6 text-center text-[11px] text-(--color-muted)">
                  {snippets.length === 0
                    ? "Aucun snippet pour l'instant. Crées-en un avec « Nouveau »."
                    : "Aucun snippet ne correspond à la recherche."}
                </div>
              ) : (
                groups.map(({ folder, items }) => {
                  const folderKey = folder ?? "__none__";
                  const collapsed = collapsedFolders.has(folderKey);
                  return (
                    <section key={folderKey} className="mb-1">
                      <button
                        type="button"
                        onClick={() => toggleFolder(folderKey)}
                        className="flex w-full items-center gap-1 rounded px-2 py-1 text-[10px] uppercase tracking-wide text-(--color-muted-soft) transition-colors hover:bg-(--color-panel-hover)"
                      >
                        {collapsed ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        <span className="flex-1 text-left">{folder ?? "Sans dossier"}</span>
                        <span className="text-(--color-muted-soft)">{items.length}</span>
                      </button>
                      {!collapsed && (
                        <ul className="mt-0.5 flex flex-col gap-0.5 pl-1">
                          {items.map((snippet) => (
                            <SnippetRow
                              key={snippet.id}
                              snippet={snippet}
                              onRun={() => handleRun(snippet)}
                              onEdit={() => setEditing(snippet)}
                              onDelete={() => setToDelete(snippet)}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })
              )}
            </div>

            <footer className="border-t border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-[10px] text-(--color-muted)">
              <span>
                <kbd className="rounded border border-(--color-border) bg-(--color-panel) px-1 font-mono">
                  Ctrl+Shift+S
                </kbd>{" "}
                pour ouvrir / fermer · clic ↩ insère et exécute
              </span>
            </footer>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <SnippetEditorDialog snippet={editing} onClose={() => setEditing(undefined)} />

      <SnippetVariablesDialog
        request={varsForSnippet}
        onClose={() => setVarsForSnippet(null)}
        onConfirm={async (values) => {
          if (!varsForSnippet) return;
          const merged = { ...builtinValues(), ...values };
          const rendered = await snippetsApi.render(varsForSnippet.snippet.content, merged);
          setVarsForSnippet(null);
          await runRendered(rendered);
        }}
      />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer ce snippet ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {toDelete?.name} » sera supprimé définitivement.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button
                type="button"
                className="rounded-md border border-(--color-border) px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Annuler
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="button"
                onClick={async () => {
                  if (!toDelete) return;
                  await withToast(removeSnippet(toDelete.id), {
                    loading: "Suppression…",
                    success: "Snippet supprimé",
                  });
                  setToDelete(null);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              >
                Supprimer
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SnippetRow({
  snippet,
  onRun,
  onEdit,
  onDelete,
}: {
  snippet: Snippet;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-1 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-(--color-border) hover:bg-(--color-bg-soft)">
      <button
        type="button"
        onClick={onRun}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className="truncate text-xs font-medium text-(--color-text)">{snippet.name}</span>
        <code className="truncate font-mono text-[10px] text-(--color-muted)">
          {snippet.content.split("\n")[0]}
          {snippet.content.includes("\n") ? " …" : ""}
        </code>
      </button>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onRun}
          title="Insérer dans le terminal"
          aria-label="Insérer dans le terminal"
          className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-accent)"
        >
          <Play className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="Modifier"
          aria-label="Modifier"
          className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Supprimer"
          aria-label="Supprimer"
          className="rounded p-1 text-(--color-muted) hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

type Group = { folder: string | null; items: Snippet[] };

function groupAndFilter(snippets: Snippet[], query: string): Group[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? snippets.filter((s) =>
        `${s.name} ${s.folder ?? ""} ${s.tags_csv} ${s.content}`.toLowerCase().includes(q),
      )
    : snippets;

  const map = new Map<string | null, Snippet[]>();
  for (const s of filtered) {
    const key = s.folder ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(s);
  }
  const groups: Group[] = Array.from(map.entries()).map(([folder, items]) => ({ folder, items }));
  groups.sort((a, b) => {
    if (a.folder === null) return 1;
    if (b.folder === null) return -1;
    return a.folder.localeCompare(b.folder, undefined, { sensitivity: "base" });
  });
  return groups;
}

/**
 * Built-in variables auto-substituted before showing the custom prompt.
 * Anchored to the *active* terminal so `{{host}}`/`{{user}}` reflect what the
 * user is currently typing into.
 */
function builtinValues(): Record<string, string> {
  const target = resolveActiveTerminal();
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    host: target?.hostLabel ?? "",
    user: target?.hostUsername ?? "",
    date,
  };
}
