import { invoke } from "@tauri-apps/api/core";

import type { FileEntry } from "./bindings/FileEntry";

export const sftpApi = {
  listDir: (sessionId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { sessionId, path }),
  stat: (sessionId: string, path: string) => invoke<FileEntry>("sftp_stat", { sessionId, path }),
  mkdir: (sessionId: string, path: string) => invoke<void>("sftp_mkdir", { sessionId, path }),
  remove: (sessionId: string, path: string) => invoke<void>("sftp_remove", { sessionId, path }),
  rename: (sessionId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { sessionId, from, to }),
};
