import { ArrowDownToLine, ArrowUpFromLine, Loader2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  type FileDragPayload,
  type FsAdapter,
  joinPath,
  localAdapter,
  makeRemoteAdapter,
} from "@/lib/fs";
import { onTransferDone, onTransferProgress, sftpApi } from "@/lib/sftp";
import { cn } from "@/lib/utils";

import { FilePane } from "./FilePane";

type Props = {
  sessionId: string;
};

type TransferDirection = "upload" | "download";

type TransferState = {
  transferId: string;
  direction: TransferDirection;
  name: string;
  status: "running" | "done" | "error";
  bytesDone: number;
  totalBytes: number;
  bytesPerSec: number;
  error?: string;
};

/**
 * Side-by-side Local / Remote file browser with drag&drop transfers.
 *
 * Cross-pane drops are routed through `handleCrossDrop` which dispatches each
 * dragged name to `sftp_upload` or `sftp_download` depending on direction and
 * tracks progress events for a tiny inline transfer banner. The full transfer
 * queue (pause / cancel / persistent panel) lands in P2-T12.
 */
export function SftpView({ sessionId }: Props) {
  const remoteAdapter = useMemo(() => makeRemoteAdapter(sessionId), [sessionId]);
  const [transfers, setTransfers] = useState<TransferState[]>([]);

  const trackTransfer = useCallback(
    (init: Omit<TransferState, "status" | "bytesDone" | "totalBytes" | "bytesPerSec">) => {
      const initial: TransferState = {
        ...init,
        status: "running",
        bytesDone: 0,
        totalBytes: 0,
        bytesPerSec: 0,
      };
      setTransfers((prev) => [...prev, initial]);

      onTransferProgress(init.transferId, (p) => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.transferId === init.transferId
              ? {
                  ...t,
                  bytesDone: p.bytesDone,
                  totalBytes: p.totalBytes,
                  bytesPerSec: p.bytesPerSec,
                }
              : t,
          ),
        );
      });

      onTransferDone(init.transferId, (d) => {
        setTransfers((prev) =>
          prev.map((t) =>
            t.transferId === init.transferId
              ? {
                  ...t,
                  status: d.error ? "error" : "done",
                  error: d.error ?? undefined,
                  bytesDone: d.bytesTransferred,
                }
              : t,
          ),
        );
      });
    },
    [],
  );

  const handleCrossDrop = useCallback(
    async (payload: FileDragPayload, destAdapter: FsAdapter, destPath: string) => {
      const direction: TransferDirection =
        payload.sourceKind === "local" && destAdapter.kind === "remote" ? "upload" : "download";

      for (const name of payload.names) {
        try {
          if (direction === "upload") {
            const localPath = joinPath(localAdapter, payload.basePath, name);
            const remotePath = joinPath(destAdapter, destPath, name);
            const id = await sftpApi.upload(sessionId, localPath, remotePath);
            trackTransfer({ transferId: id, direction, name });
          } else {
            const remotePath = joinPath(remoteAdapter, payload.basePath, name);
            const localPath = joinPath(destAdapter, destPath, name);
            const id = await sftpApi.download(sessionId, remotePath, localPath);
            trackTransfer({ transferId: id, direction, name });
          }
        } catch (e) {
          console.warn(`transfer ${name}:`, e);
        }
      }
    },
    [remoteAdapter, sessionId, trackTransfer],
  );

  return (
    <div className="flex h-full w-full flex-col bg-(--color-bg)">
      <div className="flex min-h-0 flex-1">
        <FilePane adapter={localAdapter} title="Local" onCrossDrop={handleCrossDrop} />
        <FilePane adapter={remoteAdapter} title="Remote" onCrossDrop={handleCrossDrop} />
      </div>
      {transfers.length > 0 && <TransferBanner transfers={transfers} setTransfers={setTransfers} />}
    </div>
  );
}

function TransferBanner({
  transfers,
  setTransfers,
}: {
  transfers: TransferState[];
  setTransfers: React.Dispatch<React.SetStateAction<TransferState[]>>;
}) {
  const running = transfers.filter((t) => t.status === "running");
  const headline =
    running.length > 0
      ? `Transfert${running.length > 1 ? "s" : ""} en cours (${running.length})`
      : "Transferts terminés";

  return (
    <aside className="shrink-0 border-t border-(--color-border) bg-(--color-panel) text-xs">
      <header className="flex items-center justify-between px-3 py-1.5">
        <span className="font-semibold text-(--color-muted)">{headline}</span>
        <button
          type="button"
          onClick={() => setTransfers((prev) => prev.filter((t) => t.status === "running"))}
          className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          aria-label="Effacer les transferts terminés"
        >
          <X className="h-3 w-3" />
        </button>
      </header>
      <ul className="max-h-32 divide-y divide-(--color-border) overflow-y-auto">
        {transfers.map((t) => (
          <TransferRow key={t.transferId} t={t} />
        ))}
      </ul>
    </aside>
  );
}

function TransferRow({ t }: { t: TransferState }) {
  const ratio = t.totalBytes > 0 ? t.bytesDone / t.totalBytes : 0;
  const pct = Math.min(100, Math.round(ratio * 100));

  return (
    <li className="flex items-center gap-3 px-3 py-1.5">
      <DirectionIcon direction={t.direction} status={t.status} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-(--color-text-soft)">{t.name}</span>
          <span className="shrink-0 font-mono text-(--color-muted)">
            {t.status === "running" && (
              <>
                {pct}% • {formatRate(t.bytesPerSec)}
              </>
            )}
            {t.status === "done" && <span className="text-(--color-success)">OK</span>}
            {t.status === "error" && <span className="text-red-400">échec</span>}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-(--color-border)">
          <div
            className={cn(
              "h-full transition-all",
              t.status === "error" ? "bg-red-500" : "bg-(--color-accent)",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {t.error && <span className="mt-0.5 truncate text-red-400">{t.error}</span>}
      </div>
    </li>
  );
}

function DirectionIcon({
  direction,
  status,
}: {
  direction: TransferDirection;
  status: TransferState["status"];
}) {
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-(--color-accent)" />;
  }
  const cls = "h-3.5 w-3.5 text-(--color-muted)";
  return direction === "upload" ? (
    <ArrowUpFromLine className={cls} />
  ) : (
    <ArrowDownToLine className={cls} />
  );
}

function formatRate(bps: number): string {
  if (bps <= 0) return "—";
  if (bps < 1024) return `${bps} B/s`;
  const units = ["KB/s", "MB/s", "GB/s"];
  let v = bps / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}
