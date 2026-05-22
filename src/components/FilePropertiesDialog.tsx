import type { FileEntry } from "@/lib/bindings/FileEntry";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/Dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  entry: FileEntry | null;
};

/**
 * Read-only properties popover.
 *
 * Editing perms / owner is out of scope here — Phase 4 will add a dedicated
 * permissions modal if the demand shows up.
 */
export function FilePropertiesDialog({ open, onOpenChange, path, entry }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propriétés</DialogTitle>
          <DialogDescription className="break-all font-mono">{path}</DialogDescription>
        </DialogHeader>
        {entry && (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-xs">
            <Row label="Type">
              {entry.is_dir ? "Dossier" : entry.is_symlink ? "Lien symbolique" : "Fichier"}
            </Row>
            <Row label="Nom">{entry.name}</Row>
            {!entry.is_dir && (
              <Row label="Taille">
                {entry.size != null
                  ? `${formatBytes(Number(entry.size))} (${Number(entry.size).toLocaleString()} octets)`
                  : "—"}
              </Row>
            )}
            <Row label="Permissions">
              {entry.permissions != null ? formatPerms(entry.permissions) : "—"}
            </Row>
            <Row label="Modifié">{entry.mtime ? new Date(entry.mtime).toLocaleString() : "—"}</Row>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-(--color-muted)">{label}</dt>
      <dd className="break-all text-(--color-text)">{children}</dd>
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatPerms(p: number): string {
  // Render Unix mode: e.g. 0o755 → "rwxr-xr-x (0o755)"
  const triplets = [(p >> 6) & 0o7, (p >> 3) & 0o7, p & 0o7];
  const r = triplets
    .map((t) => `${t & 4 ? "r" : "-"}${t & 2 ? "w" : "-"}${t & 1 ? "x" : "-"}`)
    .join("");
  return `${r} (0o${p.toString(8)})`;
}
