import { ChevronDown, ChevronRight, FolderClosed, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Group } from "@/lib/bindings/Group";
import type { Host } from "@/lib/bindings/Host";
import { withToast } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGroupsStore } from "@/stores/useGroupsStore";
import { useServersStore } from "@/stores/useServersStore";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useTagsStore } from "@/stores/useTagsStore";

import { HostFormDialog } from "./HostFormDialog";
import { TagBadge } from "./TagBadge";
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

const UNGROUPED_KEY = "__ungrouped__";
/** Cross-component DnD payload key. */
const HOST_DND_TYPE = "application/x-lynk-host";

type OnOpenSession = (host: Host, type?: SessionTabType) => void;

type Props = {
  onOpenSession?: OnOpenSession;
  /** Open the port-forwards manager for a given host. */
  onOpenForwards?: (host: Host) => void;
  /** Case-insensitive substring filter on label, hostname or username. */
  query?: string;
};

function matchesQuery(host: Host, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    host.label.toLowerCase().includes(q) ||
    host.hostname.toLowerCase().includes(q) ||
    host.username.toLowerCase().includes(q)
  );
}

function matchesTags(hostId: string, selected: string[], links: Record<string, string[]>): boolean {
  if (selected.length === 0) return true;
  const hostTags = links[hostId] ?? [];
  // OR semantics: at least one selected tag must be assigned to the host.
  return selected.some((t) => hostTags.includes(t));
}

export function ServerList({ onOpenSession, onOpenForwards, query = "" }: Props) {
  const { hosts, selectedId, loading, error, refresh, select } = useServersStore();
  const remove = useServersStore((s) => s.remove);

  const groups = useGroupsStore((s) => s.groups);
  const collapsed = useGroupsStore((s) => s.collapsed);
  const refreshGroups = useGroupsStore((s) => s.refresh);
  const moveHost = useGroupsStore((s) => s.moveHost);
  const renameGroup = useGroupsStore((s) => s.rename);
  const removeGroup = useGroupsStore((s) => s.remove);
  const toggleCollapsed = useGroupsStore((s) => s.toggleCollapsed);

  const tags = useTagsStore((s) => s.tags);
  const links = useTagsStore((s) => s.links);
  const selectedTagIds = useTagsStore((s) => s.selectedTagIds);
  const refreshTags = useTagsStore((s) => s.refresh);

  const [editing, setEditing] = useState<Host | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Host | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<Group | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<Group | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    refreshGroups();
    refreshTags();
  }, [refresh, refreshGroups, refreshTags]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const filtered = useMemo(
    () => hosts.filter((h) => matchesQuery(h, query) && matchesTags(h.id, selectedTagIds, links)),
    [hosts, query, selectedTagIds, links],
  );

  const grouped = useMemo(() => groupHostsByGroup(filtered, groups), [filtered, groups]);

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
    return <div className="px-2 py-1.5 text-xs text-(--color-muted-soft)">Aucun résultat</div>;
  }

  const onDropOn = async (groupId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const hostId = e.dataTransfer.getData(HOST_DND_TYPE);
    if (!hostId) return;
    const host = hosts.find((h) => h.id === hostId);
    if (!host) return;
    if ((host.group_id ?? null) === groupId) return;
    await withToast(
      moveHost(hostId, groupId).then(() => refresh()),
      {
        loading: "Déplacement…",
        success: groupId
          ? `Déplacé dans « ${groups.find((g) => g.id === groupId)?.name ?? ""} »`
          : "Détaché du groupe",
      },
    );
  };

  return (
    <>
      <div className="flex flex-col gap-px">
        {grouped.map(({ key, group, hosts: items }) => {
          const dropKey = key;
          const isCollapsed = group ? collapsed[group.id] === true : false;
          return (
            <div key={key} className="flex flex-col">
              {group ? (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(group.id)}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(HOST_DND_TYPE)) {
                          e.preventDefault();
                          setDropTarget(dropKey);
                        }
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === dropKey ? null : t))}
                      onDrop={(e) => onDropOn(group.id, e)}
                      className={cn(
                        "group/header flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors",
                        "hover:bg-(--color-panel-hover)",
                        dropTarget === dropKey &&
                          "ring-1 ring-inset ring-(--color-accent) bg-(--color-accent)/10",
                      )}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3 text-(--color-muted)" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-(--color-muted)" />
                      )}
                      <FolderClosed className="h-3.5 w-3.5 text-(--color-muted)" />
                      <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
                        {group.name}
                      </span>
                      <span className="text-[10px] text-(--color-muted-soft)">{items.length}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => setRenamingGroup(group)}>
                      Renommer le groupe…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem destructive onSelect={() => setConfirmDeleteGroup(group)}>
                      Supprimer le groupe…
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ) : (
                items.length > 0 && (
                  <div
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes(HOST_DND_TYPE)) {
                        e.preventDefault();
                        setDropTarget(dropKey);
                      }
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === dropKey ? null : t))}
                    onDrop={(e) => onDropOn(null, e)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] uppercase tracking-wider text-(--color-muted-soft)",
                      dropTarget === dropKey &&
                        "ring-1 ring-inset ring-(--color-accent) bg-(--color-accent)/10",
                    )}
                  >
                    Sans groupe
                  </div>
                )
              )}

              {!isCollapsed && (
                <ul className="flex flex-col gap-px">
                  {items.map((host) => (
                    <ContextMenu key={host.id}>
                      <ContextMenuTrigger asChild>
                        <li>
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(HOST_DND_TYPE, host.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
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
                            <span className="flex min-w-0 flex-1 flex-col leading-tight">
                              <span className="truncate font-medium text-(--color-text)">
                                {host.label}
                              </span>
                              <span className="truncate text-[11px] text-(--color-muted)">
                                {host.username}@{host.hostname}
                                {host.port !== 22 ? `:${host.port}` : ""}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1">
                                {(links[host.id] ?? []).map((tid) => {
                                  const tag = tagById.get(tid);
                                  if (!tag) return null;
                                  return <TagBadge key={tid} tag={tag} size="xs" />;
                                })}
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
                        {onOpenForwards && (
                          <ContextMenuItem onSelect={() => onOpenForwards(host)}>
                            Port forwards…
                          </ContextMenuItem>
                        )}
                        {host.group_id && (
                          <ContextMenuItem
                            onSelect={async () => {
                              await withToast(
                                moveHost(host.id, null).then(() => refresh()),
                                { loading: "Détachement…", success: "Détaché du groupe" },
                              );
                            }}
                          >
                            Retirer du groupe
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem destructive onSelect={() => setConfirmDelete(host)}>
                          Delete…
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

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
                    await withToast(remove(confirmDelete.id), {
                      loading: `Suppression de « ${confirmDelete.label} »`,
                      success: "Serveur supprimé",
                    });
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

      <PromptDialog
        open={renamingGroup !== null}
        title="Renommer le groupe"
        label="Nom du groupe"
        initialValue={renamingGroup?.name ?? ""}
        confirmText="Renommer"
        onOpenChange={(o) => !o && setRenamingGroup(null)}
        onConfirm={async (name) => {
          if (!renamingGroup || !name) return;
          await withToast(renameGroup(renamingGroup.id, name), {
            loading: "Renommage…",
            success: "Groupe renommé",
          });
        }}
      />

      <AlertDialog
        open={confirmDeleteGroup !== null}
        onOpenChange={(o) => !o && setConfirmDeleteGroup(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer ce groupe ?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDeleteGroup
              ? `Le groupe « ${confirmDeleteGroup.name} » sera supprimé. Les serveurs qu'il contient ne sont pas supprimés, ils repassent dans « Sans groupe ».`
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
                  if (!confirmDeleteGroup) return;
                  await withToast(
                    removeGroup(confirmDeleteGroup.id).then(() => refresh()),
                    { loading: "Suppression…", success: "Groupe supprimé" },
                  );
                  setConfirmDeleteGroup(null);
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

/**
 * Group hosts by `group_id`. Result is ordered: ungrouped bucket first,
 * then groups in their store order.
 *
 * Hidden buckets (no hosts and no group) are omitted by the caller; we keep
 * empty groups visible so the user has a drop target.
 */
function groupHostsByGroup(
  hosts: Host[],
  groups: Group[],
): { key: string; group: Group | null; hosts: Host[] }[] {
  const byGroup: Record<string, Host[]> = {};
  byGroup[UNGROUPED_KEY] = [];
  for (const g of groups) byGroup[g.id] = [];
  for (const h of hosts) {
    const k = h.group_id ?? UNGROUPED_KEY;
    if (!byGroup[k]) byGroup[k] = [];
    byGroup[k].push(h);
  }
  return [
    { key: UNGROUPED_KEY, group: null, hosts: byGroup[UNGROUPED_KEY] },
    ...groups.map((g) => ({ key: g.id, group: g, hosts: byGroup[g.id] })),
  ];
}
