import { FolderTree, History, Terminal as TerminalIcon } from "lucide-react";
import { useState } from "react";

import type { RestorableTab } from "@/stores/useSettingsStore";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";

type Props = {
  open: boolean;
  tabs: RestorableTab[];
  onRestore: (remember: boolean) => void;
  onSkip: (remember: boolean) => void;
};

/**
 * Prompted at startup when the previous session ended with open tabs.
 * Lists what would be restored so the user can decide; "Mémoriser ce choix"
 * sets `autoRestoreSessions` so subsequent launches skip the dialog.
 */
export function RestoreSessionsDialog({ open, tabs, onRestore, onSkip }: Props) {
  const [remember, setRemember] = useState(false);

  if (!open || tabs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={() => onSkip(remember)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-(--color-accent-bg) text-(--color-accent)">
              <History className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>Restaurer la session précédente ?</DialogTitle>
              <DialogDescription>
                {tabs.length} onglet{tabs.length > 1 ? "s" : ""} ouvert
                {tabs.length > 1 ? "s" : ""} la dernière fois.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="max-h-64 overflow-y-auto rounded-md border border-(--color-border) bg-(--color-bg-soft)">
          {tabs.map((t, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: list is replaced atomically
              key={`${t.hostId}-${i}`}
              className="flex items-center gap-2 border-b border-(--color-border) px-3 py-2 last:border-b-0"
            >
              {t.type === "sftp" ? (
                <FolderTree className="h-3.5 w-3.5 text-(--color-accent)" />
              ) : (
                <TerminalIcon className="h-3.5 w-3.5 text-(--color-accent)" />
              )}
              <span className="flex-1 truncate text-sm">{t.title}</span>
              <span className="rounded bg-(--color-panel) px-1.5 py-0.5 font-mono text-[10px] text-(--color-muted)">
                {t.type.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>

        <Checkbox checked={remember} onCheckedChange={setRemember} label="Mémoriser ce choix" />

        <DialogFooter>
          <Button variant="outline" onClick={() => onSkip(remember)}>
            Ignorer
          </Button>
          <Button onClick={() => onRestore(remember)}>Restaurer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
