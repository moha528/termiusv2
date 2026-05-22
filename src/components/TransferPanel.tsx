import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Transfer, TransferStatus } from "@/stores/useTransfersStore";
import { useTransfersStore } from "@/stores/useTransfersStore";

/**
 * Global bottom drawer listing every in-flight or completed file transfer.
 *
 * The whole component lives at the MainLayout level so transfers survive
 * tab/session switches: a user can navigate away from the SFTP pane and still
 * see the upload they kicked off complete (or fail) here.
 */
export function TransferPanel() {
  const transfers = useTransfersStore((s) => s.transfers);
  const panelOpen = useTransfersStore((s) => s.panelOpen);
  const togglePanel = useTransfersStore((s) => s.togglePanel);
  const cancel = useTransfersStore((s) => s.cancel);
  const clearCompleted = useTransfersStore((s) => s.clearCompleted);

  if (transfers.length === 0) return null;

  const running = transfers.filter((t) => t.status === "running");
  const completed = transfers.filter((t) => t.status !== "running");

  return (
    <aside
      className={cn(
        "shrink-0 border-t border-(--color-border) bg-(--color-panel) text-xs transition-[height]",
      )}
    >
      <div className="flex w-full items-center justify-between px-3 py-1.5 text-(--color-muted)">
        <button
          type="button"
          onClick={togglePanel}
          className="flex flex-1 items-center gap-2 text-left font-semibold hover:text-(--color-text)"
        >
          {running.length > 0 ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-(--color-accent)" />
              {running.length} en cours
            </>
          ) : (
            <>
              <CircleCheck className="h-3.5 w-3.5 text-(--color-success)" />
              {completed.length} terminés
            </>
          )}
          <span className="font-normal text-(--color-muted-soft)">
            · {transfers.length} au total
          </span>
        </button>
        <div className="flex items-center gap-2">
          {completed.length > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-(--color-panel-hover) hover:text-(--color-text)"
            >
              <Trash2 className="h-3 w-3" />
              Effacer terminés
            </button>
          )}
          <button
            type="button"
            onClick={togglePanel}
            aria-label={panelOpen ? "Réduire" : "Développer"}
            className="rounded p-1 hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            {panelOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {panelOpen && (
        <ul className="max-h-64 divide-y divide-(--color-border) overflow-y-auto">
          {transfers.map((t) => (
            <TransferRow key={t.transferId} transfer={t} onCancel={() => cancel(t.transferId)} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function TransferRow({
  transfer,
  onCancel,
}: {
  transfer: Transfer;
  onCancel: () => void;
}) {
  const ratio = transfer.totalBytes > 0 ? transfer.bytesDone / transfer.totalBytes : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const eta = computeEta(transfer);

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <DirectionIcon direction={transfer.direction} status={transfer.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-(--color-text)">{transfer.name}</span>
          <span className="shrink-0 font-mono text-(--color-muted)">
            <StatusBadge
              status={transfer.status}
              pct={pct}
              speed={transfer.bytesPerSec}
              eta={eta}
            />
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-(--color-border)">
          <div
            className={cn(
              "h-full transition-all",
              transfer.status === "error" && "bg-red-500",
              transfer.status === "cancelled" && "bg-yellow-500",
              (transfer.status === "running" || transfer.status === "done") &&
                "bg-(--color-accent)",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="truncate font-mono text-[10px] text-(--color-muted-soft)">
          {transfer.sourcePath} → {transfer.destPath}
        </div>
        {transfer.error && transfer.status === "error" && (
          <div className="truncate text-[10px] text-red-400">{transfer.error}</div>
        )}
      </div>
      {transfer.status === "running" && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler"
          title="Annuler"
          className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-red-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

function StatusBadge({
  status,
  pct,
  speed,
  eta,
}: {
  status: TransferStatus;
  pct: number;
  speed: number;
  eta: string;
}) {
  if (status === "running")
    return (
      <>
        {pct}% • {formatRate(speed)} • {eta}
      </>
    );
  if (status === "done") return <span className="text-(--color-success)">OK</span>;
  if (status === "cancelled") return <span className="text-yellow-400">annulé</span>;
  return <span className="text-red-400">échec</span>;
}

function DirectionIcon({
  direction,
  status,
}: {
  direction: Transfer["direction"];
  status: TransferStatus;
}) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-(--color-accent)" />;
  }
  if (status === "error") {
    return <CircleX className="h-4 w-4 shrink-0 text-red-400" />;
  }
  if (status === "cancelled") {
    return <CircleX className="h-4 w-4 shrink-0 text-yellow-400" />;
  }
  if (status === "done") {
    return <CircleCheck className="h-4 w-4 shrink-0 text-(--color-success)" />;
  }
  return direction === "upload" ? (
    <ArrowUpFromLine className="h-4 w-4 shrink-0 text-(--color-muted)" />
  ) : (
    <ArrowDownToLine className="h-4 w-4 shrink-0 text-(--color-muted)" />
  );
}

function computeEta(t: Transfer): string {
  if (t.status !== "running" || t.bytesPerSec <= 0 || t.totalBytes <= 0) return "—";
  const remaining = Math.max(0, t.totalBytes - t.bytesDone);
  const secs = Math.round(remaining / t.bytesPerSec);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
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
