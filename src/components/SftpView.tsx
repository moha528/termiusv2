import { useCallback, useMemo, useState } from "react";

import type { FileDragPayload } from "@/lib/fs";
import { type FsAdapter, joinPath, localAdapter, makeRemoteAdapter } from "@/lib/fs";
import { sftpApi } from "@/lib/sftp";
import { useTransfersStore } from "@/stores/useTransfersStore";

import { FilePane } from "./FilePane";

type Props = {
  sessionId: string;
};

/**
 * Clipboard shared between the two panes. `copy` keeps the source after
 * paste; `cut` would delete it on a successful paste (future P2-T11+).
 */
export type Clipboard = {
  mode: "copy" | "cut";
  sourceKind: "local" | "remote";
  basePath: string;
  names: string[];
};

/**
 * Side-by-side Local / Remote file browser with drag&drop transfers and
 * a shared clipboard so users can Copy on one side and Paste on the other.
 */
export function SftpView({ sessionId }: Props) {
  const remoteAdapter = useMemo(() => makeRemoteAdapter(sessionId), [sessionId]);
  const register = useTransfersStore((s) => s.register);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const dispatchTransfer = useCallback(
    (
      direction: "upload" | "download",
      sourceKind: "local" | "remote",
      basePath: string,
      destAdapter: FsAdapter,
      destPath: string,
      names: string[],
    ) => {
      for (const name of names) {
        const sourceAdapter = sourceKind === "local" ? localAdapter : remoteAdapter;
        const fullSource = joinPath(sourceAdapter, basePath, name);
        const fullDest = joinPath(destAdapter, destPath, name);
        const fire =
          direction === "upload"
            ? sftpApi.upload(sessionId, fullSource, fullDest)
            : sftpApi.download(sessionId, fullSource, fullDest);
        fire
          .then((id) => {
            register({
              transferId: id,
              sessionId,
              direction,
              name,
              sourcePath: fullSource,
              destPath: fullDest,
            });
          })
          .catch((e) => console.warn(`transfer ${name}:`, e));
      }
    },
    [remoteAdapter, sessionId, register],
  );

  const handleCrossDrop = useCallback(
    (payload: FileDragPayload, destAdapter: FsAdapter, destPath: string) => {
      const direction =
        payload.sourceKind === "local" && destAdapter.kind === "remote" ? "upload" : "download";
      dispatchTransfer(
        direction,
        payload.sourceKind,
        payload.basePath,
        destAdapter,
        destPath,
        payload.names,
      );
    },
    [dispatchTransfer],
  );

  const handlePaste = useCallback(
    (destAdapter: FsAdapter, destPath: string) => {
      if (!clipboard) return;
      // Cross-side paste = transfer. Same-side paste = filesystem copy
      // (not implemented yet — would need a backend copy command).
      if (clipboard.sourceKind === destAdapter.kind) {
        console.warn("Same-side paste not implemented yet");
        return;
      }
      const direction =
        clipboard.sourceKind === "local" && destAdapter.kind === "remote" ? "upload" : "download";
      dispatchTransfer(
        direction,
        clipboard.sourceKind,
        clipboard.basePath,
        destAdapter,
        destPath,
        clipboard.names,
      );
      // For "cut" the source delete would happen here; left out until P2 wraps up.
    },
    [clipboard, dispatchTransfer],
  );

  return (
    <div className="flex h-full w-full bg-(--color-bg)">
      <FilePane
        adapter={localAdapter}
        title="Local"
        onCrossDrop={handleCrossDrop}
        clipboard={clipboard}
        onClipboardChange={setClipboard}
        onPaste={handlePaste}
      />
      <FilePane
        adapter={remoteAdapter}
        title="Remote"
        onCrossDrop={handleCrossDrop}
        clipboard={clipboard}
        onClipboardChange={setClipboard}
        onPaste={handlePaste}
      />
    </div>
  );
}
