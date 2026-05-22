import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";

export type EditStartedEvent = {
  editId: string;
  sessionId: string;
  remotePath: string;
  localPath: string;
  name: string;
};

export type EditSyncEvent = {
  editId: string;
  bytes: number;
  timestampMs: number;
};

export const editApi = {
  openRemote: (sessionId: string, remotePath: string) =>
    invoke<EditStartedEvent>("open_remote_edit", { sessionId, remotePath }),
  cancel: (editId: string) => invoke<boolean>("cancel_remote_edit", { editId }),
};

export function onEditSaved(
  editId: string,
  handler: (e: EditSyncEvent) => void,
): Promise<UnlistenFn> {
  return listen<EditSyncEvent>(`edit-saved-${editId}`, (e) => handler(e.payload));
}
