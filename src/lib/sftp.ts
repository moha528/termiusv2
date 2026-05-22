import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";

import type { FileEntry } from "./bindings/FileEntry";

export const sftpApi = {
  listDir: (sessionId: string, path: string) =>
    invoke<FileEntry[]>("sftp_list_dir", { sessionId, path }),
  stat: (sessionId: string, path: string) => invoke<FileEntry>("sftp_stat", { sessionId, path }),
  mkdir: (sessionId: string, path: string) => invoke<void>("sftp_mkdir", { sessionId, path }),
  createFile: (sessionId: string, path: string) =>
    invoke<void>("sftp_create_file", { sessionId, path }),
  remove: (sessionId: string, path: string) => invoke<void>("sftp_remove", { sessionId, path }),
  rename: (sessionId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { sessionId, from, to }),
  upload: (sessionId: string, localPath: string, remotePath: string) =>
    invoke<string>("sftp_upload", { sessionId, localPath, remotePath }),
  download: (sessionId: string, remotePath: string, localPath: string) =>
    invoke<string>("sftp_download", { sessionId, remotePath, localPath }),
  cancelTransfer: (transferId: string) => invoke<boolean>("sftp_cancel_transfer", { transferId }),
};

export const TRANSFER_CANCELLED_MESSAGE = "cancelled";

export type TransferProgress = {
  transferId: string;
  bytesDone: number;
  totalBytes: number;
  bytesPerSec: number;
};

export type TransferDone = {
  transferId: string;
  bytesTransferred: number;
  elapsedMs: number;
  error: string | null;
};

export function onTransferProgress(
  transferId: string,
  handler: (p: TransferProgress) => void,
): Promise<UnlistenFn> {
  return listen<TransferProgress>(`transfer-progress-${transferId}`, (e) => handler(e.payload));
}

export function onTransferDone(
  transferId: string,
  handler: (p: TransferDone) => void,
): Promise<UnlistenFn> {
  return listen<TransferDone>(`transfer-done-${transferId}`, (e) => handler(e.payload));
}
