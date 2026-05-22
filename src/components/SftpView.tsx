import { useCallback, useMemo } from "react";

import {
  type FileDragPayload,
  type FsAdapter,
  joinPath,
  localAdapter,
  makeRemoteAdapter,
} from "@/lib/fs";
import { sftpApi } from "@/lib/sftp";
import { useTransfersStore } from "@/stores/useTransfersStore";

import { FilePane } from "./FilePane";

type Props = {
  sessionId: string;
};

/**
 * Side-by-side Local / Remote file browser with drag&drop transfers.
 *
 * Cross-pane drops are dispatched to the global `useTransfersStore` (see
 * `TransferPanel`), so a user can leave this view while a long upload keeps
 * progressing in the background drawer.
 */
export function SftpView({ sessionId }: Props) {
  const remoteAdapter = useMemo(() => makeRemoteAdapter(sessionId), [sessionId]);
  const register = useTransfersStore((s) => s.register);

  const handleCrossDrop = useCallback(
    async (payload: FileDragPayload, destAdapter: FsAdapter, destPath: string) => {
      const direction =
        payload.sourceKind === "local" && destAdapter.kind === "remote" ? "upload" : "download";

      for (const name of payload.names) {
        try {
          if (direction === "upload") {
            const localPath = joinPath(localAdapter, payload.basePath, name);
            const remotePath = joinPath(destAdapter, destPath, name);
            const id = await sftpApi.upload(sessionId, localPath, remotePath);
            register({
              transferId: id,
              sessionId,
              direction: "upload",
              name,
              sourcePath: localPath,
              destPath: remotePath,
            });
          } else {
            const remotePath = joinPath(remoteAdapter, payload.basePath, name);
            const localPath = joinPath(destAdapter, destPath, name);
            const id = await sftpApi.download(sessionId, remotePath, localPath);
            register({
              transferId: id,
              sessionId,
              direction: "download",
              name,
              sourcePath: remotePath,
              destPath: localPath,
            });
          }
        } catch (e) {
          console.warn(`transfer ${name}:`, e);
        }
      }
    },
    [remoteAdapter, sessionId, register],
  );

  return (
    <div className="flex h-full w-full bg-(--color-bg)">
      <FilePane adapter={localAdapter} title="Local" onCrossDrop={handleCrossDrop} />
      <FilePane adapter={remoteAdapter} title="Remote" onCrossDrop={handleCrossDrop} />
    </div>
  );
}
