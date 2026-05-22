import { create } from "zustand";

import {
  TRANSFER_CANCELLED_MESSAGE,
  onTransferDone,
  onTransferProgress,
  sftpApi,
} from "@/lib/sftp";

export type TransferDirection = "upload" | "download";

export type TransferStatus = "running" | "done" | "error" | "cancelled";

export type Transfer = {
  transferId: string;
  /** Backend SSH session this transfer belongs to (so the UI can group). */
  sessionId: string;
  direction: TransferDirection;
  /** Display name (the file basename, not the full path). */
  name: string;
  /** Source path on the originating side (for display / retry). */
  sourcePath: string;
  /** Destination path on the other side. */
  destPath: string;
  status: TransferStatus;
  bytesDone: number;
  totalBytes: number;
  bytesPerSec: number;
  /** Wall-clock start time (ms epoch) for ETA computation. */
  startedAt: number;
  error?: string;
};

type TransfersState = {
  /** Insertion order is preserved (latest at the end). */
  transfers: Transfer[];
  /** When `true`, the bottom drawer is expanded. */
  panelOpen: boolean;
  /**
   * Monotonic counter incremented every time a transfer transitions to a
   * terminal state (`done` / `error` / `cancelled`). FilePane components use
   * it as a refresh trigger without having to subscribe to the whole list.
   */
  completionTick: number;
  /** Last completed transfer; consumed by panes to know what changed where. */
  lastCompleted: Transfer | null;

  register: (
    init: Omit<Transfer, "status" | "bytesDone" | "totalBytes" | "bytesPerSec" | "startedAt">,
  ) => void;
  cancel: (transferId: string) => Promise<void>;
  clearCompleted: () => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
};

export const useTransfersStore = create<TransfersState>((set, get) => ({
  transfers: [],
  panelOpen: false,
  completionTick: 0,
  lastCompleted: null,

  register(init) {
    const transfer: Transfer = {
      ...init,
      status: "running",
      bytesDone: 0,
      totalBytes: 0,
      bytesPerSec: 0,
      startedAt: Date.now(),
    };
    set({ transfers: [...get().transfers, transfer], panelOpen: true });

    onTransferProgress(init.transferId, (p) => {
      set({
        transfers: get().transfers.map((t) =>
          t.transferId === init.transferId
            ? {
                ...t,
                bytesDone: p.bytesDone,
                totalBytes: p.totalBytes,
                bytesPerSec: p.bytesPerSec,
              }
            : t,
        ),
      });
    });

    onTransferDone(init.transferId, (d) => {
      const updated = get().transfers.map((t) =>
        t.transferId === init.transferId
          ? {
              ...t,
              bytesDone: d.bytesTransferred || t.bytesDone,
              status: (d.error
                ? d.error.includes(TRANSFER_CANCELLED_MESSAGE)
                  ? "cancelled"
                  : "error"
                : "done") as TransferStatus,
              error: d.error ?? undefined,
            }
          : t,
      );
      const lastCompleted = updated.find((t) => t.transferId === init.transferId) ?? null;
      set({
        transfers: updated,
        completionTick: get().completionTick + 1,
        lastCompleted,
      });
    });
  },

  async cancel(transferId) {
    try {
      await sftpApi.cancelTransfer(transferId);
    } catch (e) {
      console.warn("cancel_transfer:", e);
    }
  },

  clearCompleted() {
    set({
      transfers: get().transfers.filter((t) => t.status === "running"),
    });
  },

  setPanelOpen(open) {
    set({ panelOpen: open });
  },

  togglePanel() {
    set({ panelOpen: !get().panelOpen });
  },
}));
