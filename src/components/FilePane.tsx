import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  Home,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { FileEntry } from "@/lib/bindings/FileEntry";
import { type FsAdapter, joinPath, parentOf, splitPath } from "@/lib/fs";
import { cn } from "@/lib/utils";

type Props = {
  adapter: FsAdapter;
  title: string;
};

/**
 * Renders one side of the SFTP dual-pane. Generic over the data source (`adapter`),
 * so both Local and Remote panes share the same UX (breadcrumb, refresh, navigation).
 *
 * Selection / drag-and-drop / context-menu actions are added in P2-T10 and T11.
 */
export function FilePane({ adapter, title }: Props) {
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // On adapter change, jump to its initial path and load.
  useEffect(() => {
    adapter
      .initialPath()
      .then((p) => reload(p))
      .catch((e) => setError(String(e)));
  }, [adapter, reload]);

  const navigateTo = (next: string) => {
    void reload(next);
  };

  const goUp = () => {
    if (!path) return;
    const parent = parentOf(adapter, path);
    if (parent !== path) navigateTo(parent);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-(--color-border) last:border-r-0">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-panel) px-2 text-xs">
        <span className="font-semibold uppercase tracking-wider text-(--color-muted)">{title}</span>
        <div className="flex items-center gap-1">
          <IconBtn label="Home" onClick={() => adapter.initialPath().then(navigateTo)}>
            <Home className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Refresh" onClick={() => path && void reload(path)}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </IconBtn>
        </div>
      </header>

      <Breadcrumb path={path} adapter={adapter} onNavigate={navigateTo} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="m-2 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
        {loading && entries.length === 0 && (
          <div className="grid place-items-center py-8 text-(--color-muted)">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && entries.length === 0 && !error && (
          <div className="px-3 py-2 text-xs italic text-(--color-muted-soft)">Dossier vide</div>
        )}

        {entries.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-(--color-bg-soft) text-(--color-muted)">
              <tr className="border-b border-(--color-border)">
                <th className="px-2 py-1 text-left font-medium">Nom</th>
                <th className="px-2 py-1 text-right font-medium">Taille</th>
                <th className="hidden px-2 py-1 text-left font-medium md:table-cell">Modifié</th>
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
              {entries.map((entry) => (
                <tr
                  key={entry.name}
                  onDoubleClick={() => {
                    if (!path) return;
                    if (entry.is_dir) {
                      navigateTo(joinPath(adapter, path, entry.name));
                    }
                  }}
                  className={cn(
                    "cursor-pointer hover:bg-(--color-panel-hover)",
                    entry.is_dir && "text-(--color-text)",
                    !entry.is_dir && "text-(--color-text-soft)",
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
                    {entry.is_dir ? "—" : formatSize(entry.size ?? 0)}
                  </td>
                  <td className="hidden px-2 py-1 text-(--color-muted) md:table-cell">
                    {entry.mtime ? formatDate(entry.mtime) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
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
