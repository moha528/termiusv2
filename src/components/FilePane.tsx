import {
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Loader2,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Clipboard } from "@/components/SftpView";
import type { FileEntry } from "@/lib/bindings/FileEntry";
import { withToast } from "@/lib/feedback";
import {
  DRAG_MIME,
  type FileDragPayload,
  type FsAdapter,
  joinPath,
  parentOf,
  readDragPayload,
  splitPath,
} from "@/lib/fs";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTransfersStore } from "@/stores/useTransfersStore";

import { FilePropertiesDialog } from "./FilePropertiesDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/AlertDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/ContextMenu";
import { PromptDialog } from "./ui/PromptDialog";

type Props = {
  adapter: FsAdapter;
  title: string;
  onCrossDrop?: (payload: FileDragPayload, destAdapter: FsAdapter, destPath: string) => void;
  clipboard?: Clipboard | null;
  onClipboardChange?: (clip: Clipboard | null) => void;
  onPaste?: (destAdapter: FsAdapter, destPath: string) => void;
};

/**
 * One side of the SFTP dual-pane. Driven by an `FsAdapter`.
 *
 * Multi-selection: Ctrl/Cmd+click toggles individual rows, Shift+click
 * extends a contiguous range. Right-clicking a row that's part of the
 * current selection runs the action against the whole selection; right-
 * clicking outside the selection narrows it to that single row first.
 *
 * Auto-refresh: the pane subscribes to the transfers store and reloads
 * whenever a transfer terminates and its destination directory matches the
 * directory we're displaying — so a fresh upload/download shows up without
 * the user having to hit Refresh.
 */
export function FilePane({
  adapter,
  title,
  onCrossDrop,
  clipboard,
  onClipboardChange,
  onPaste,
}: Props) {
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  type Dialogs =
    | { kind: "none" }
    | { kind: "mkdir" }
    | { kind: "newFile" }
    | { kind: "rename"; entry: FileEntry }
    | { kind: "delete"; entries: FileEntry[] }
    | { kind: "properties"; entry: FileEntry };
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  const closeDialog = () => setDialog({ kind: "none" });

  const reload = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await adapter.listDir(target);
        setEntries(list);
        setPath(target);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [adapter],
  );

  useEffect(() => {
    adapter
      .initialPath()
      .then((p) => reload(p))
      .catch((e) => setError(String(e)));
  }, [adapter, reload]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `path` is the trigger, not a body dep
  useEffect(() => {
    setSelected(new Set());
    setLastClicked(null);
  }, [path]);

  // Reload whenever a transfer touching our current directory completes.
  const completionTick = useTransfersStore((s) => s.completionTick);
  const lastCompleted = useTransfersStore((s) => s.lastCompleted);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the trigger
  useEffect(() => {
    if (!path || !lastCompleted) return;
    if (lastCompleted.status !== "done") return;
    const destDir = parentOf(adapter, lastCompleted.destPath);
    if (destDir === path) {
      void reload(path);
    }
  }, [completionTick]);

  const navigateTo = (next: string) => {
    void reload(next);
  };

  const refresh = () => {
    if (path) void reload(path);
  };

  const goUp = () => {
    if (!path) return;
    const parent = parentOf(adapter, path);
    if (parent !== path) navigateTo(parent);
  };

  // ---- Selection ----
  const handleRowClick = (e: React.MouseEvent, name: string) => {
    if (e.shiftKey && lastClicked) {
      const names = visibleEntries.map((x) => x.name);
      const a = names.indexOf(lastClicked);
      const b = names.indexOf(name);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelected(new Set(names.slice(from, to + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSelected(next);
      setLastClicked(name);
      return;
    }
    setSelected(new Set([name]));
    setLastClicked(name);
  };

  const handleRowContextMenu = (name: string) => {
    // If the right-clicked row isn't in the current selection, narrow the
    // selection to just that row before the menu opens. Matches Finder /
    // Explorer behaviour.
    if (!selected.has(name)) {
      setSelected(new Set([name]));
      setLastClicked(name);
    }
  };

  const showHidden = useSettingsStore((s) => s.showHiddenFiles);
  const setSetting = useSettingsStore((s) => s.set);
  const visibleEntries = useMemo(
    () => (showHidden ? entries : entries.filter((e) => !e.name.startsWith("."))),
    [entries, showHidden],
  );

  const selectedEntries = useMemo(
    () => visibleEntries.filter((e) => selected.has(e.name)),
    [visibleEntries, selected],
  );

  // ---- Drag & drop ----
  const handleDragStart = (e: React.DragEvent, name: string) => {
    if (!path) return;
    let names: string[];
    if (selected.has(name)) {
      names = Array.from(selected);
    } else {
      names = [name];
      setSelected(new Set([name]));
    }
    const payload: FileDragPayload = {
      sourceKind: adapter.kind,
      basePath: path,
      names,
    };
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handlePaneDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDropTarget) setIsDropTarget(true);
  };

  const handlePaneDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDropTarget(false);
  };

  const handlePaneDrop = (e: React.DragEvent) => {
    setIsDropTarget(false);
    const payload = readDragPayload(e.dataTransfer);
    if (!payload || !path) return;
    e.preventDefault();
    if (payload.sourceKind === adapter.kind) return;
    onCrossDrop?.(payload, adapter, path);
  };

  // ---- Clipboard ----
  const doCopy = (mode: "copy" | "cut") => {
    if (!path || selectedEntries.length === 0) return;
    onClipboardChange?.({
      mode,
      sourceKind: adapter.kind,
      basePath: path,
      names: selectedEntries.map((e) => e.name),
    });
  };

  const canPaste = clipboard && clipboard.names.length > 0 && clipboard.sourceKind !== adapter.kind;

  const doPaste = () => {
    if (!path || !canPaste) return;
    onPaste?.(adapter, path);
    if (clipboard?.mode === "cut") onClipboardChange?.(null);
  };

  // ---- Bulk delete ----
  const deleteSelected = async () => {
    if (!path || selectedEntries.length === 0) return;
    const items = selectedEntries;
    const label =
      items.length === 1
        ? `Suppression de « ${items[0].name} »`
        : `Suppression de ${items.length} éléments`;
    try {
      await withToast(
        Promise.all(items.map((e) => adapter.remove(joinPath(adapter, path, e.name)))),
        {
          loading: label,
          success: items.length === 1 ? "Supprimé" : `${items.length} éléments supprimés`,
        },
      );
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      closeDialog();
    }
  };

  return (
    <section
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className={cn(
        "flex min-w-0 flex-1 flex-col border-r border-(--color-border) last:border-r-0 transition-colors",
        isDropTarget && "bg-(--color-accent-bg)/30 ring-2 ring-inset ring-(--color-accent)",
      )}
    >
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-panel) px-2 text-xs">
        <span className="font-semibold uppercase tracking-wider text-(--color-muted)">
          {title}
          {selected.size > 0 && (
            <span className="ml-2 text-(--color-accent-soft)">({selected.size})</span>
          )}
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn label="New folder" onClick={() => setDialog({ kind: "mkdir" })}>
            <FolderPlus className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="New file" onClick={() => setDialog({ kind: "newFile" })}>
            <FilePlus className="h-3.5 w-3.5" />
          </IconBtn>
          <div className="mx-1 h-4 w-px bg-(--color-border)" />
          <IconBtn
            label={showHidden ? "Masquer les fichiers cachés" : "Afficher les fichiers cachés"}
            onClick={() => setSetting("showHiddenFiles", !showHidden)}
          >
            {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn label="Home" onClick={() => adapter.initialPath().then(navigateTo)}>
            <Home className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Refresh" onClick={refresh}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </IconBtn>
        </div>
      </header>

      <Breadcrumb path={path} adapter={adapter} onNavigate={navigateTo} />

      {/* Empty-area context menu wraps the whole list region so a right-click
          on the background (not on a row) shows Paste / New folder / etc. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="m-2 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}
            {loading && visibleEntries.length === 0 && (
              <div className="grid place-items-center py-8 text-(--color-muted)">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!loading && visibleEntries.length === 0 && !error && (
              <div className="px-3 py-2 text-xs italic text-(--color-muted-soft)">
                {entries.length === 0
                  ? "Dossier vide"
                  : "Aucun fichier visible (uniquement des fichiers cachés)"}
              </div>
            )}

            {visibleEntries.length > 0 && (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-(--color-bg-soft) text-(--color-muted)">
                  <tr className="border-b border-(--color-border)">
                    <th className="px-2 py-1 text-left font-medium">Nom</th>
                    <th className="px-2 py-1 text-right font-medium">Taille</th>
                    <th className="hidden px-2 py-1 text-left font-medium md:table-cell">
                      Modifié
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {path && parentOf(adapter, path) !== path && (
                    <tr
                      onDoubleClick={goUp}
                      className="cursor-pointer text-(--color-muted) hover:bg-(--color-panel-hover)"
                    >
                      <td className="flex items-center gap-2 px-2 py-1">
                        <Folder className="h-3.5 w-3.5" />
                        <span>..</span>
                      </td>
                      <td className="px-2 py-1 text-right">—</td>
                      <td className="hidden px-2 py-1 md:table-cell">—</td>
                    </tr>
                  )}
                  {visibleEntries.map((entry) => {
                    const isSelected = selected.has(entry.name);
                    const isClipped = isClipboardEntry(clipboard, adapter.kind, path, entry.name);
                    return (
                      <ContextMenu key={entry.name}>
                        <ContextMenuTrigger asChild>
                          <tr
                            draggable
                            onDragStart={(e) => handleDragStart(e, entry.name)}
                            onClick={(e) => handleRowClick(e, entry.name)}
                            onContextMenu={() => handleRowContextMenu(entry.name)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && entry.is_dir && path)
                                navigateTo(joinPath(adapter, path, entry.name));
                            }}
                            onDoubleClick={() => {
                              if (!path) return;
                              if (entry.is_dir) navigateTo(joinPath(adapter, path, entry.name));
                            }}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected
                                ? "bg-(--color-accent-bg)/60 text-(--color-text)"
                                : "hover:bg-(--color-panel-hover)",
                              !isSelected &&
                                (entry.is_dir ? "text-(--color-text)" : "text-(--color-text-soft)"),
                              isClipped && clipboard?.mode === "cut" && "opacity-60",
                            )}
                          >
                            <td className="flex items-center gap-2 px-2 py-1">
                              {entry.is_dir ? (
                                <FolderOpen className="h-3.5 w-3.5 text-(--color-accent)" />
                              ) : (
                                <FileIcon className="h-3.5 w-3.5 text-(--color-muted)" />
                              )}
                              <span className="truncate">{entry.name}</span>
                              {entry.is_symlink && (
                                <span className="rounded bg-white/5 px-1 text-[10px] text-(--color-muted)">
                                  ↪
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-(--color-muted)">
                              {entry.is_dir ? "—" : formatSize(Number(entry.size ?? 0))}
                            </td>
                            <td className="hidden px-2 py-1 text-(--color-muted) md:table-cell">
                              {entry.mtime ? formatDate(entry.mtime) : ""}
                            </td>
                          </tr>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {entry.is_dir && (
                            <ContextMenuItem
                              onSelect={() => {
                                if (path) navigateTo(joinPath(adapter, path, entry.name));
                              }}
                            >
                              Ouvrir
                            </ContextMenuItem>
                          )}
                          <ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => doCopy("copy")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copier
                            {selected.size > 1 && (
                              <span className="ml-auto text-(--color-muted-soft)">
                                {selected.size}
                              </span>
                            )}
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => doCopy("cut")}>
                            <Scissors className="h-3.5 w-3.5" />
                            Couper
                            {selected.size > 1 && (
                              <span className="ml-auto text-(--color-muted-soft)">
                                {selected.size}
                              </span>
                            )}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          {selected.size <= 1 && (
                            <ContextMenuItem onSelect={() => setDialog({ kind: "rename", entry })}>
                              Renommer…
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem
                            destructive
                            onSelect={() =>
                              setDialog({
                                kind: "delete",
                                entries: selectedEntries.length ? selectedEntries : [entry],
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Supprimer
                            {selected.size > 1 && <span className="ml-auto">{selected.size}</span>}
                          </ContextMenuItem>
                          {selected.size <= 1 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => setDialog({ kind: "properties", entry })}
                              >
                                Propriétés
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled={!canPaste} onSelect={doPaste}>
            <ClipboardPaste className="h-3.5 w-3.5" />
            Coller
            {clipboard && clipboard.names.length > 1 && (
              <span className="ml-auto text-(--color-muted-soft)">{clipboard.names.length}</span>
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setDialog({ kind: "mkdir" })}>
            <FolderPlus className="h-3.5 w-3.5" />
            Nouveau dossier
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setDialog({ kind: "newFile" })}>
            <FilePlus className="h-3.5 w-3.5" />
            Nouveau fichier
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => setSelected(new Set(visibleEntries.map((e) => e.name)))}
            disabled={visibleEntries.length === 0}
          >
            <Check className="h-3.5 w-3.5" />
            Tout sélectionner
          </ContextMenuItem>
          <ContextMenuItem onSelect={refresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Rafraîchir
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PromptDialog
        open={dialog.kind === "mkdir"}
        onOpenChange={(o) => !o && closeDialog()}
        title="Nouveau dossier"
        label="Nom"
        confirmText="Créer"
        onConfirm={async (name) => {
          if (!path) return;
          await withToast(adapter.mkdir(joinPath(adapter, path, name)), {
            loading: `Création de « ${name} »`,
            success: "Dossier créé",
          });
          refresh();
        }}
      />

      <PromptDialog
        open={dialog.kind === "newFile"}
        onOpenChange={(o) => !o && closeDialog()}
        title="Nouveau fichier"
        label="Nom"
        confirmText="Créer"
        onConfirm={async (name) => {
          if (!path) return;
          await withToast(adapter.createFile(joinPath(adapter, path, name)), {
            loading: `Création de « ${name} »`,
            success: "Fichier créé",
          });
          refresh();
        }}
      />

      <PromptDialog
        open={dialog.kind === "rename"}
        onOpenChange={(o) => !o && closeDialog()}
        title="Renommer"
        label="Nouveau nom"
        confirmText="Renommer"
        initialValue={dialog.kind === "rename" ? dialog.entry.name : ""}
        onConfirm={async (newName) => {
          if (!path || dialog.kind !== "rename") return;
          const from = joinPath(adapter, path, dialog.entry.name);
          const to = joinPath(adapter, path, newName);
          await withToast(adapter.rename(from, to), {
            loading: `Renommage en « ${newName} »`,
            success: "Renommé",
          });
          refresh();
        }}
      />

      <AlertDialog open={dialog.kind === "delete"} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer ?</AlertDialogTitle>
          <AlertDialogDescription>
            {dialog.kind === "delete"
              ? dialog.entries.length === 1
                ? `« ${dialog.entries[0].name} » sera supprimé${dialog.entries[0].is_dir ? " avec son contenu" : ""}.`
                : `${dialog.entries.length} éléments seront supprimés.`
              : ""}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button
                type="button"
                className="rounded-md border border-(--color-border) px-3 py-1.5 text-sm hover:bg-(--color-panel-hover)"
              >
                Annuler
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="button"
                onClick={deleteSelected}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              >
                Supprimer
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FilePropertiesDialog
        open={dialog.kind === "properties"}
        onOpenChange={(o) => !o && closeDialog()}
        path={
          path && dialog.kind === "properties" ? joinPath(adapter, path, dialog.entry.name) : ""
        }
        entry={dialog.kind === "properties" ? dialog.entry : null}
      />
    </section>
  );
}

function isClipboardEntry(
  clipboard: Clipboard | null | undefined,
  adapterKind: "local" | "remote",
  currentPath: string | null,
  name: string,
): boolean {
  if (!clipboard || !currentPath) return false;
  if (clipboard.sourceKind !== adapterKind) return false;
  if (clipboard.basePath !== currentPath) return false;
  return clipboard.names.includes(name);
}

function Breadcrumb({
  path,
  adapter,
  onNavigate,
}: {
  path: string | null;
  adapter: FsAdapter;
  onNavigate: (p: string) => void;
}) {
  if (!path) {
    return (
      <div className="flex h-7 items-center border-b border-(--color-border) px-2 text-xs text-(--color-muted-soft)">
        …
      </div>
    );
  }
  const { prefix, segments } = splitPath(adapter, path);

  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-(--color-border) bg-(--color-bg) px-2 text-xs">
      <button
        type="button"
        onClick={() => onNavigate(prefix || path)}
        className="rounded px-1 py-0.5 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
      >
        {prefix || "/"}
      </button>
      {segments.map((seg, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: path segments are positional, names can repeat
        <span key={`${seg}-${i}`} className="flex items-center">
          <ChevronRight className="h-3 w-3 text-(--color-muted-soft)" />
          <button
            type="button"
            onClick={() => onNavigate(prefix + segments.slice(0, i + 1).join(adapter.separator))}
            className="max-w-32 truncate rounded px-1 py-0.5 text-(--color-text-soft) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            {seg}
          </button>
        </span>
      ))}
    </div>
  );
}

function IconBtn({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
    >
      {children}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / k;
  let i = 0;
  while (v >= k && i < units.length - 1) {
    v /= k;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
