import { Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { cn } from "@/lib/utils";
import { useServersStore } from "@/stores/useServersStore";
import type { SessionTabType } from "@/stores/useSessionsStore";

import { HostFormDialog } from "./HostFormDialog";
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

type OnOpenSession = (host: Host, type?: SessionTabType) => void;

type Props = {
  onOpenSession?: OnOpenSession;
  /** Case-insensitive substring filter on label, hostname or username. */
  query?: string;
};

/**
 * Substring filter on label / hostname / username.
 *
 * We deliberately keep it dependency-free (no fuse.js) — fuzzy matching is
 * marginal value for 5–100 hosts. Switch to fuse.js if signals say otherwise.
 */
function matches(host: Host, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    host.label.toLowerCase().includes(q) ||
    host.hostname.toLowerCase().includes(q) ||
    host.username.toLowerCase().includes(q)
  );
}

export function ServerList({ onOpenSession, query = "" }: Props) {
  const { hosts, selectedId, loading, error, refresh, select } = useServersStore();
  const remove = useServersStore((s) => s.remove);
  const [editing, setEditing] = useState<Host | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Host | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => hosts.filter((h) => matches(h, query)), [hosts, query]);

  if (loading && hosts.length === 0) {
    return <div className="px-2 py-1.5 text-xs text-(--color-muted-soft)">Chargement…</div>;
  }

  if (error) {
    return (
      <div
        className="rounded-md border border-red-900/40 bg-red-950/30 px-2 py-1.5 text-xs text-red-400"
        title={error}
      >
        Impossible de charger les serveurs
      </div>
    );
  }

  if (hosts.length === 0) {
    return (
      <div className="mt-4 flex flex-col items-center gap-1 px-2 text-center">
        <Server className="h-6 w-6 text-(--color-muted-soft)" />
        <p className="text-xs text-(--color-muted)">Aucun serveur</p>
        <p className="text-[11px] text-(--color-muted-soft)">
          Cliquez sur « + Add » pour en créer un
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-(--color-muted-soft)">
        Aucun résultat pour « {query} »
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-px">
        {filtered.map((host) => (
          <ContextMenu key={host.id}>
            <ContextMenuTrigger asChild>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    select(host.id);
                    onOpenSession?.(host, "ssh");
                  }}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    "hover:bg-(--color-panel-hover)",
                    selectedId === host.id &&
                      "bg-(--color-panel) ring-1 ring-inset ring-(--color-border-strong)",
                  )}
                >
                  {selectedId === host.id && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-(--color-accent)" />
                  )}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-(--color-panel) text-(--color-accent-soft) group-hover:text-(--color-accent)">
                    <Server className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate font-medium text-(--color-text)">{host.label}</span>
                    <span className="truncate text-[11px] text-(--color-muted)">
                      {host.username}@{host.hostname}
                      {host.port !== 22 ? `:${host.port}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onOpenSession?.(host, "ssh")}>
                Open SSH session
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onOpenSession?.(host, "sftp")}>
                Open SFTP
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  setEditing(host);
                  setEditorOpen(true);
                }}
              >
                Edit…
              </ContextMenuItem>
              <ContextMenuItem destructive onSelect={() => setConfirmDelete(host)}>
                Delete…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </ul>

      <HostFormDialog
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditing(null);
        }}
        host={editing}
      />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer ce serveur ?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDelete
              ? `« ${confirmDelete.label} » sera retiré de la liste. Cette action est irréversible.`
              : ""}
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
                  if (confirmDelete) {
                    await remove(confirmDelete.id);
                    setConfirmDelete(null);
                  }
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
