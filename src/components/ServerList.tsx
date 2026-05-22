import { Server } from "lucide-react";
import { useEffect, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { cn } from "@/lib/utils";
import { useServersStore } from "@/stores/useServersStore";

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

type OnOpenSession = (host: Host) => void;

type Props = {
  onOpenSession?: OnOpenSession;
};

export function ServerList({ onOpenSession }: Props) {
  const { hosts, selectedId, loading, error, refresh, select } = useServersStore();
  const remove = useServersStore((s) => s.remove);
  const [editing, setEditing] = useState<Host | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Host | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && hosts.length === 0) {
    return <p className="px-2 py-1 text-xs italic text-(--color-muted)">Chargement…</p>;
  }

  if (error) {
    return (
      <p className="px-2 py-1 text-xs text-red-400" title={error}>
        Erreur : impossible de charger les serveurs
      </p>
    );
  }

  if (hosts.length === 0) {
    return (
      <p className="px-2 py-1 text-xs italic text-(--color-muted)">
        Aucun serveur. Cliquez sur « + Add » pour en créer un.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {hosts.map((host) => (
          <ContextMenu key={host.id}>
            <ContextMenuTrigger asChild>
              <li>
                <button
                  type="button"
                  onClick={() => select(host.id)}
                  onDoubleClick={() => onOpenSession?.(host)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                    "hover:bg-white/5",
                    selectedId === host.id && "bg-white/10",
                  )}
                >
                  <Server className="h-4 w-4 shrink-0 text-(--color-accent)" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{host.label}</span>
                    <span className="truncate text-xs text-(--color-muted)">
                      {host.username}@{host.hostname}
                      {host.port !== 22 ? `:${host.port}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  onOpenSession?.(host);
                }}
              >
                Open SSH session
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
