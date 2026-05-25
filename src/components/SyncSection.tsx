import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import { Download, Lock, Shield, Upload } from "lucide-react";
import { useState } from "react";

import { type ImportStats, vaultExportApi } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useGroupsStore } from "@/stores/useGroupsStore";
import { useIdentitiesStore } from "@/stores/useIdentitiesStore";
import { useServersStore } from "@/stores/useServersStore";
import { useSnippetsStore } from "@/stores/useSnippetsStore";
import { useTagsStore } from "@/stores/useTagsStore";

import { GitSyncCard } from "./GitSyncCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/AlertDialog";
import { Button } from "./ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { Input } from "./ui/Input";

import { withToast } from "@/lib/feedback";

/**
 * Settings section: encrypted export & import of the vault (P5-T01/T02).
 *
 * The actual crypto lives in the Rust backend (`vault_export` module). The
 * UI here is intentionally bare:
 *   - one "Export" button that prompts for a save path + password
 *   - one "Import" button that prompts for a file + password + merge/replace
 *
 * SSH keys, OS-keychain passwords, and TOFU fingerprints are **not** part of
 * the export. We surface that contract clearly so the user isn't surprised
 * when they restore on another machine.
 */
export function SyncSection() {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceConfirmFor, setReplaceConfirmFor] = useState<{
    password: string;
    path: string;
  } | null>(null);

  return (
    <>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">
            Sauvegarde locale
          </h3>
          <p className="text-xs text-(--color-muted)">
            Fichier <code className="font-mono text-[10px]">.tmv</code> chiffré en AES-256-GCM (clé
            dérivée Argon2id) — clé USB, Dropbox, GPG email…
          </p>

          <div className="grid grid-cols-2 gap-2">
            <ActionCard
              icon={<Download className="h-4 w-4" />}
              title="Exporter"
              description="Sauvegarde locale (clé USB, Dropbox, GPG-encrypted email…)"
              onClick={() => setExportOpen(true)}
            />
            <ActionCard
              icon={<Upload className="h-4 w-4" />}
              title="Importer"
              description="Restaure une sauvegarde sur cette machine."
              onClick={() => setImportOpen(true)}
            />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-[11px] text-(--color-muted)">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-accent)" />
            <div className="flex flex-col gap-0.5">
              <span className="text-(--color-text-soft)">Inclus :</span>
              <span>hosts, groupes, tags, identities, snippets, port forwards</span>
              <span className="mt-1 text-(--color-text-soft)">Exclus :</span>
              <span>
                clés SSH privées · mots de passe (keychain OS) · empreintes known_hosts · historique
                de commandes · réglages d'apparence
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-(--color-muted)">
            Sync Git (auto)
          </h3>
          <p className="text-xs text-(--color-muted)">
            Pousse le vault chiffré dans un repo Git privé que tu contrôles. Auto-push debouncé 30 s
            après chaque modif, pull au démarrage.
          </p>
          <GitSyncCard />
        </section>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onAskReplaceConfirm={(req) => {
          setImportOpen(false);
          setReplaceConfirmFor(req);
        }}
      />

      <AlertDialog
        open={replaceConfirmFor !== null}
        onOpenChange={(o) => !o && setReplaceConfirmFor(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remplacer toute la configuration ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le mode <strong>Replace</strong> supprime <em>tous</em> les hosts, groupes, tags,
            identities, snippets et port forwards actuels avant d'importer la sauvegarde. Les clés
            SSH et empreintes restent intactes. Cette action n'est pas réversible.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button
                type="button"
                className="rounded-md border border-(--color-border) px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Annuler
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="button"
                onClick={async () => {
                  if (!replaceConfirmFor) return;
                  await runImport(replaceConfirmFor.password, replaceConfirmFor.path, "replace");
                  setReplaceConfirmFor(null);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              >
                Tout remplacer
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-3 text-left transition-colors hover:border-(--color-border-strong) hover:bg-(--color-panel-hover)"
    >
      <span className="grid h-6 w-6 place-items-center rounded-md bg-(--color-panel) text-(--color-accent)">
        {icon}
      </span>
      <span className="text-xs font-medium text-(--color-text)">{title}</span>
      <span className="text-[10px] text-(--color-muted)">{description}</span>
    </button>
  );
}

// ---------- Export ----------

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPassword("");
    setConfirm("");
    setSubmitting(false);
  };

  const passwordsMatch = password.length > 0 && password === confirm;

  const handleExport = async () => {
    if (!passwordsMatch) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await saveFileDialog({
      defaultPath: `lynk-${stamp}.lynk`,
      filters: [{ name: "Lynk vault", extensions: ["lynk"] }],
    });
    if (!path) return;
    setSubmitting(true);
    try {
      const bytes = await withToast(vaultExportApi.export(password, path), {
        loading: "Chiffrement…",
        success: (n) => `Vault exporté (${formatBytes(n)})`,
      });
      // We `await` to keep the toast lifecycle visible, then close.
      void bytes;
      onClose();
      reset();
    } catch (e) {
      // withToast already surfaced the error toast.
      console.warn("export:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter le vault</DialogTitle>
          <DialogDescription>
            Choisis un mot de passe fort — il sera nécessaire pour ré-importer. Notes-le quelque
            part, on ne peut pas le récupérer si tu l'oublies.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Mot de passe</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="Au moins 12 caractères recommandés"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Confirmation</span>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              placeholder="Re-tape le mot de passe"
            />
            {confirm.length > 0 && !passwordsMatch && (
              <span className="text-[10px] text-red-400">
                Les mots de passe ne correspondent pas.
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={!passwordsMatch || submitting}>
            <Lock className="h-3.5 w-3.5" />
            {submitting ? "Chiffrement…" : "Chiffrer et exporter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Import ----------

function ImportDialog({
  open,
  onClose,
  onAskReplaceConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onAskReplaceConfirm: (req: { password: string; path: string }) => void;
}) {
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPassword("");
    setMode("merge");
    setSubmitting(false);
  };

  const handleImport = async () => {
    if (password.length === 0) return;
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: "Lynk vault", extensions: ["lynk"] }],
    });
    if (!picked) return;
    const path = Array.isArray(picked) ? picked[0] : picked;
    if (mode === "replace") {
      onAskReplaceConfirm({ password, path });
      reset();
      return;
    }
    setSubmitting(true);
    try {
      await runImport(password, path, "merge");
      onClose();
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importer un vault</DialogTitle>
          <DialogDescription>
            Sélectionne le fichier <code className="font-mono text-[10px]">.tmv</code> exporté
            depuis une autre machine et entre le mot de passe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Mot de passe</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="…"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-(--color-muted)">Mode</span>
            <div className="grid grid-cols-2 gap-1.5">
              <ModeBtn
                active={mode === "merge"}
                title="Merge"
                description="Ajoute les nouveautés, garde l'existant."
                onClick={() => setMode("merge")}
              />
              <ModeBtn
                active={mode === "replace"}
                title="Replace"
                description="Supprime tout puis réinjecte. Confirmation."
                onClick={() => setMode("replace")}
                danger
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={password.length === 0 || submitting}>
            <Upload className="h-3.5 w-3.5" />
            {submitting ? "Lecture…" : "Choisir un fichier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeBtn({
  active,
  title,
  description,
  onClick,
  danger,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-[11px] transition-colors",
        active && danger && "border-red-500/60 bg-red-500/10 text-red-200",
        active &&
          !danger &&
          "border-(--color-accent) bg-(--color-accent-bg)/30 text-(--color-text)",
        !active &&
          "border-(--color-border) bg-(--color-bg-soft) text-(--color-muted) hover:bg-(--color-panel-hover)",
      )}
    >
      <span className="font-medium">{title}</span>
      <span className="text-[10px]">{description}</span>
    </button>
  );
}

// ---------- Shared run + summary ----------

async function runImport(password: string, path: string, mode: "merge" | "replace") {
  try {
    const stats = await withToast(vaultExportApi.import(password, path, mode), {
      loading: mode === "replace" ? "Remplacement…" : "Fusion…",
      success: (s) => formatStats(s, mode),
    });
    // Re-hydrate every store so the UI reflects the new state.
    await Promise.all([
      useServersStore.getState().refresh(),
      useGroupsStore.getState().refresh(),
      useTagsStore.getState().refresh(),
      useIdentitiesStore.getState().refresh(),
      useSnippetsStore.getState().refresh(),
    ]);
    return stats;
  } catch (e) {
    console.warn("import:", e);
    return null;
  }
}

function formatStats(s: ImportStats, mode: "merge" | "replace"): string {
  const parts: string[] = [];
  if (s.hosts_added) parts.push(`${s.hosts_added} hosts`);
  if (s.groups_added) parts.push(`${s.groups_added} groupes`);
  if (s.tags_added) parts.push(`${s.tags_added} tags`);
  if (s.identities_added) parts.push(`${s.identities_added} identities`);
  if (s.snippets_added) parts.push(`${s.snippets_added} snippets`);
  if (s.port_forwards_added) parts.push(`${s.port_forwards_added} forwards`);
  const summary = parts.length > 0 ? `Importé : ${parts.join(", ")}` : "Rien à importer";
  if (mode === "replace" && s.hosts_replaced > 0) {
    return `${summary} (${s.hosts_replaced} hosts précédents supprimés)`;
  }
  return summary;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
