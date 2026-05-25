import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Copy, Download, Key, KeyRound, Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { SshKey } from "@/lib/bindings/SshKey";
import type { SshKeyAlgorithm } from "@/lib/bindings/SshKeyAlgorithm";
import { withToast } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useSshKeysStore } from "@/stores/useSshKeysStore";

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

/**
 * Settings section: list of SSH keys + actions (generate, import, copy, delete).
 *
 * The actual keystore lives on disk; this UI only manipulates DB rows and
 * triggers the backend commands. The keychain stores any passphrase, so we
 * never display or hold passphrases on the front beyond the moment of entry.
 */
export function KeysSection() {
  const keys = useSshKeysStore((s) => s.keys);
  const refresh = useSshKeysStore((s) => s.refresh);
  const remove = useSshKeysStore((s) => s.remove);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SshKey | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            onClick={() => setGenerateOpen(true)}
            className="h-7 px-2 text-[11px]"
          >
            <Plus className="h-3 w-3" />
            Générer
          </Button>
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="h-7 px-2 text-[11px]"
          >
            <Download className="h-3 w-3" />
            Importer
          </Button>
        </div>
        {keys.length === 0 ? (
          <div className="rounded-md border border-dashed border-(--color-border) bg-(--color-bg-soft) px-3 py-4 text-center text-[11px] text-(--color-muted)">
            Aucune clé. Générez-en une ou importez votre clé existante.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {keys.map((k) => (
              <KeyRow key={k.id} keyData={k} onDelete={() => setConfirmDelete(k)} />
            ))}
          </ul>
        )}
      </div>

      <GenerateKeyDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <ImportKeyDialog open={importOpen} onOpenChange={setImportOpen} />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer cette clé ?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDelete
              ? `« ${confirmDelete.name} » sera supprimée localement (fichier + entrée keychain). Les serveurs distants utilisant la partie publique ne sont pas affectés.`
              : ""}
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
                  if (!confirmDelete) return;
                  await withToast(remove(confirmDelete.id), {
                    loading: `Suppression de « ${confirmDelete.name} »`,
                    success: "Clé supprimée",
                  });
                  setConfirmDelete(null);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              >
                Supprimer
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function KeyRow({ keyData, onDelete }: { keyData: SshKey; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keyData.public_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn("clipboard:", e);
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 py-1.5">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-(--color-panel) text-(--color-accent)">
        {keyData.has_passphrase ? <Lock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-xs font-medium text-(--color-text)">{keyData.name}</span>
        <span className="truncate font-mono text-[10px] text-(--color-muted-soft)">
          {keyData.key_type} · {keyData.fingerprint}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        title="Copier la clé publique"
        aria-label="Copier la clé publique"
        className={cn(
          "rounded p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)",
          copied && "text-(--color-success)",
        )}
      >
        <Copy className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Supprimer la clé"
        aria-label="Supprimer la clé"
        className="rounded p-1 text-(--color-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

function GenerateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const generate = useSshKeysStore((s) => s.generate);
  const [name, setName] = useState("");
  const [algorithm, setAlgorithm] = useState<SshKeyAlgorithm>("ed25519");
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setAlgorithm("ed25519");
      setPassphrase("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await withToast(generate(name.trim(), algorithm, passphrase ? passphrase : null), {
        loading: `Génération de « ${name.trim()} »…`,
        success: "Clé générée",
      });
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Générer une clé SSH</DialogTitle>
          <DialogDescription>
            La clé privée est écrite dans le dossier des données de l'app (permissions 0600 sur
            Unix). La passphrase, si fournie, est stockée dans le keychain de l'OS.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <Field label="Nom">
            <Input
              autoFocus
              placeholder="ex. work-laptop"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Algorithme">
            <div className="grid grid-cols-2 gap-1.5">
              <AlgorithmCard
                selected={algorithm === "ed25519"}
                onClick={() => setAlgorithm("ed25519")}
                title="Ed25519"
                description="Recommandé. Rapide, court, sécurisé."
                icon={<KeyRound className="h-3.5 w-3.5" />}
              />
              <AlgorithmCard
                selected={algorithm === "rsa4096"}
                onClick={() => setAlgorithm("rsa4096")}
                title="RSA 4096"
                description="Compatible legacy. Long à générer."
                icon={<Key className="h-3.5 w-3.5" />}
              />
            </div>
          </Field>
          <Field
            label="Passphrase (optionnel)"
            hint="Chiffre la clé privée sur disque. Vide = clé non chiffrée."
          >
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.currentTarget.value)}
              disabled={submitting}
            />
          </Field>
          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Génération…" : "Générer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const importKey = useSshKeysStore((s) => s.import);
  const [filePath, setFilePath] = useState("");
  const [name, setName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilePath("");
      setName("");
      setPassphrase("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const pickFile = async () => {
    try {
      const picked = await openFileDialog({ multiple: false, directory: false });
      if (typeof picked === "string") {
        setFilePath(picked);
        // Suggest the file name as default key name.
        if (!name) {
          const parts = picked.split(/[\\/]/);
          const filename = parts[parts.length - 1] ?? "";
          setName(filename.replace(/\.pub$/i, "") || "imported");
        }
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await withToast(importKey(filePath, name.trim(), passphrase ? passphrase : null), {
        loading: `Import de « ${name.trim()} »…`,
        success: "Clé importée",
      });
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer une clé SSH</DialogTitle>
          <DialogDescription>
            Choisissez le fichier de la clé privée (format OpenSSH ou PEM). La passphrase, si la clé
            est chiffrée, est requise pour la validation et sera mémorisée dans le keychain.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
          <Field label="Fichier">
            <div className="flex gap-1.5">
              <Input
                value={filePath}
                onChange={(e) => setFilePath(e.currentTarget.value)}
                placeholder="~/.ssh/id_ed25519"
                spellCheck={false}
                disabled={submitting}
                className="flex-1 font-mono text-[11px]"
              />
              <Button type="button" variant="outline" onClick={pickFile} disabled={submitting}>
                Parcourir…
              </Button>
            </div>
          </Field>
          <Field label="Nom">
            <Input
              placeholder="ex. id_ed25519"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="Passphrase (si chiffrée)">
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.currentTarget.value)}
              disabled={submitting}
            />
          </Field>
          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !filePath || !name.trim()}>
              {submitting ? "Import…" : "Importer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="font-medium text-(--color-muted)">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-(--color-muted-soft)">{hint}</span>}
    </div>
  );
}

function AlgorithmCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-md border p-2 text-left transition-colors",
        selected
          ? "border-(--color-accent) bg-(--color-accent-bg)/30"
          : "border-(--color-border) bg-(--color-bg-soft) hover:bg-(--color-panel-hover)",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md",
          selected
            ? "bg-(--color-accent) text-(--color-bg)"
            : "bg-(--color-panel) text-(--color-accent)",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-semibold text-(--color-text)">{title}</span>
        <span className="text-[10px] text-(--color-muted)">{description}</span>
      </span>
    </button>
  );
}
