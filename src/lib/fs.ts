import { invoke } from "@tauri-apps/api/core";

import type { FileEntry } from "./bindings/FileEntry";
import type { EditStartedEvent } from "./edit";
import { editApi } from "./edit";
import { sftpApi } from "./sftp";

export const localFs = {
  homeDir: () => invoke<string>("local_home_dir"),
  listDir: (path: string) => invoke<FileEntry[]>("local_list_dir", { path }),
  mkdir: (path: string) => invoke<void>("local_mkdir", { path }),
  createFile: (path: string) => invoke<void>("local_create_file", { path }),
  remove: (path: string) => invoke<void>("local_remove", { path }),
  rename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
};

/**
 * Uniform file-pane adapter so the dual-pane component doesn't care whether
 * it's driving the local filesystem or an SFTP subsystem.
 */
export type FsAdapter = {
  kind: "local" | "remote";
  separator: "/" | "\\";
  initialPath: () => Promise<string>;
  listDir: (path: string) => Promise<FileEntry[]>;
  mkdir: (path: string) => Promise<void>;
  createFile: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  /**
   * Open a remote file in the OS-default editor and start watching it for
   * re-uploads (P2-T13). Only set on the remote adapter — local files are
   * already, well, local.
   */
  editRemote?: (path: string) => Promise<EditStartedEvent>;
};

export const localAdapter: FsAdapter = {
  kind: "local",
  /**
   * Tauri returns OS-native paths. We pick the separator by sniffing the home
   * dir on first use — `C:\Users\...` on Windows, `/home/...` elsewhere.
   */
  separator: detectLocalSeparator(),
  initialPath: () => localFs.homeDir(),
  listDir: (p) => localFs.listDir(p),
  mkdir: (p) => localFs.mkdir(p),
  createFile: (p) => localFs.createFile(p),
  remove: (p) => localFs.remove(p),
  rename: (f, t) => localFs.rename(f, t),
};

function detectLocalSeparator(): "/" | "\\" {
  if (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)) {
    return "\\";
  }
  return "/";
}

export function makeRemoteAdapter(sessionId: string): FsAdapter {
  return {
    kind: "remote",
    separator: "/",
    initialPath: async () => "/",
    listDir: (p) => sftpApi.listDir(sessionId, p),
    mkdir: (p) => sftpApi.mkdir(sessionId, p),
    createFile: (p) => sftpApi.createFile(sessionId, p),
    remove: (p) => sftpApi.remove(sessionId, p),
    rename: (f, t) => sftpApi.rename(sessionId, f, t),
    editRemote: (p) => editApi.openRemote(sessionId, p),
  };
}

/**
 * Concatenate `base` + `name` honouring the adapter's separator. Trailing
 * separators on `base` are normalised.
 */
export function joinPath(adapter: FsAdapter, base: string, name: string): string {
  const sep = adapter.separator;
  if (!base) return name;
  if (base.endsWith(sep)) return base + name;
  return `${base}${sep}${name}`;
}

/**
 * Split `path` into its leading prefix (e.g. `/`, `C:\`, `~`) and a list of
 * segments, suitable for rendering a breadcrumb.
 */
export function splitPath(
  adapter: FsAdapter,
  path: string,
): {
  prefix: string;
  segments: string[];
} {
  const sep = adapter.separator;
  if (sep === "\\") {
    // Windows: detect drive letter prefix like "C:\".
    const match = path.match(/^[A-Za-z]:\\?/);
    if (match) {
      const prefix = match[0].endsWith("\\") ? match[0] : `${match[0]}\\`;
      const rest = path.slice(match[0].length);
      return { prefix, segments: rest.split("\\").filter(Boolean) };
    }
    return { prefix: "", segments: path.split("\\").filter(Boolean) };
  }
  return { prefix: "/", segments: path.split("/").filter(Boolean) };
}

export function parentOf(adapter: FsAdapter, path: string): string {
  const { prefix, segments } = splitPath(adapter, path);
  if (segments.length === 0) return prefix || path;
  return prefix + segments.slice(0, -1).join(adapter.separator);
}

/** MIME type we attach to inter-pane drag events so we can detect our own drops. */
export const DRAG_MIME = "application/x-termiusv2-files";

/**
 * What we encode in `dataTransfer` when the user drags one or more rows from
 * a pane. The receiver decides whether to upload or download based on its own
 * `adapter.kind` vs `sourceKind`.
 */
export type FileDragPayload = {
  sourceKind: "local" | "remote";
  /** Full path of the directory those names belong to. */
  basePath: string;
  /** File names (not paths) selected at drag time. */
  names: string[];
};

export function readDragPayload(dt: DataTransfer): FileDragPayload | null {
  const raw = dt.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FileDragPayload;
  } catch {
    return null;
  }
}
