import { Pencil, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";

import type { Identity } from "@/lib/bindings/Identity";
import type { IdentityInput } from "@/lib/bindings/IdentityInput";
import { withToast } from "@/lib/feedback";
import { useIdentitiesStore } from "@/stores/useIdentitiesStore";
import { useSshKeysStore } from "@/stores/useSshKeysStore";

import { KeyPicker } from "./KeyPicker";
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
 * Settings section listing reusable SSH identities (P4-T05). Each identity
 * holds a username, an agent-forwarding flag, and an ordered list of keys.
 * Hosts that reference the identity inherit all three at connect time.
 *
 * Deleting an identity uses `ON DELETE SET NULL` server-side, so hosts that
 * referenced it keep their own (now visible-again) username/agent_forward
 * fields. The dialog warns the user before doing so.
 */
export function IdentitiesSection() {
  const identities = useIdentitiesStore((s) => s.identities);
  const loaded = useIdentitiesStore((s) => s.loaded);
  const refresh = useIdentitiesStore((s) => s.refresh);
  const remove = useIdentitiesStore((s) => s.remove);

  const [editor, setEditor] = useState<Identity | null | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState<Identity | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
    void useSshKeysStore.getState().refresh();
  }, [loaded, refresh]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-(--color-muted)">
            Profils SSH réutilisables (username + agent + clés). Un host référence une identity et
            hérite de ses valeurs à la connexion.
          </p>
          <Button
            variant="outline"
            onClick={() => setEditor(null)}
            className="h-7 px-2 text-[11px]"
          >
            <Plus className="h-3 w-3" />
            Nouvelle
          </Button>
        </div>
        {identities.length === 0 ? (
          <div className="rounded-md border border-dashed border-(--color-border) bg-(--color-bg-soft) px-3 py-4 text-center text-[11px] text-(--color-muted)">
            Aucune identity. Crée une identity « deploy » puis assigne-la à plusieurs hosts.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {identities.map((i) => (
              <IdentityRow
                key={i.id}
                identity={i}
                onEdit={() => setEditor(i)}
                onDelete={() => setConfirmDel(i)}
              />
            ))}
          </ul>
        )}
      </div>

      <IdentityEditorDialog identity={editor} onClose={() => setEditor(undefined)} />

      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer cette identity ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les hosts qui la référencent garderont leurs propres valeurs (username, agent forward,
            clés). Aucune connexion existante ne sera coupée.
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
                  if (!confirmDel) return;
                  await withToast(remove(confirmDel.id), {
                    loading: "Suppression…",
                    success: "Identity supprimée",
                  });
                  setConfirmDel(null);
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

function IdentityRow({
  identity,
  onEdit,
  onDelete,
}: {
  identity: Identity;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const keyCount = useIdentitiesStore((s) => s.keyLinks[identity.id]?.length ?? 0);
  return (
    <li className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 py-1.5">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-(--color-panel) text-(--color-accent)">
        <User className="h-3 w-3" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-xs font-medium text-(--color-text)">{identity.name}</span>
        <span className="truncate font-mono text-[10px] text-(--color-muted-soft)">
          {identity.username} · {keyCount} clé{keyCount > 1 ? "s" : ""}
          {identity.agent_forward ? " · agent" : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        title="Modifier"
        aria-label="Modifier"
        className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        aria-label="Supprimer"
        className="rounded p-1 text-(--color-muted) hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

function IdentityEditorDialog({
  identity,
  onClose,
}: {
  identity: Identity | null | undefined;
  onClose: () => void;
}) {
  const create = useIdentitiesStore((s) => s.create);
  const update = useIdentitiesStore((s) => s.update);
  const setKeys = useIdentitiesStore((s) => s.setKeys);
  // Return `undefined` when no identity is selected — `?? []` would create
  // a fresh array each render, making this selector unstable and looping
  // the useEffect below indefinitely (React's "Maximum update depth" crash).
  const initialKeys = useIdentitiesStore((s) => (identity ? s.keyLinks[identity.id] : undefined));

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [agentForward, setAgentForward] = useState(false);
  const [keyIds, setKeyIds] = useState<string[]>([]);

  useEffect(() => {
    if (identity === undefined) return;
    if (identity === null) {
      setName("");
      setUsername("");
      setAgentForward(false);
      setKeyIds([]);
    } else {
      setName(identity.name);
      setUsername(identity.username);
      setAgentForward(identity.agent_forward);
      setKeyIds(initialKeys ?? []);
    }
  }, [identity, initialKeys]);

  const isOpen = identity !== undefined;
  const isEdit = identity !== null && identity !== undefined;
  const canSave = name.trim().length > 0 && username.trim().length > 0;

  const handleSave = async () => {
    const input: IdentityInput = {
      name: name.trim(),
      username: username.trim(),
      agent_forward: agentForward,
    };
    if (isEdit && identity) {
      await withToast(
        update(identity.id, input).then(() => setKeys(identity.id, keyIds)),
        { loading: "Enregistrement…", success: "Identity mise à jour" },
      );
    } else {
      await withToast(
        create(input).then((i) => setKeys(i.id, keyIds)),
        { loading: "Création…", success: "Identity créée" },
      );
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'identity" : "Nouvelle identity"}</DialogTitle>
          <DialogDescription>
            Username + agent forwarding + clés SSH, partagés par tous les hosts qui référencent ce
            profil.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Nom</span>
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="ex. deploy"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Username</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              placeholder="root"
            />
          </div>
          <button
            type="button"
            onClick={() => setAgentForward((v) => !v)}
            className="flex items-center justify-between gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2"
          >
            <span className="flex min-w-0 flex-col text-left">
              <span className="text-xs font-medium text-(--color-text)">Agent forwarding</span>
              <span className="text-[10px] text-(--color-muted)">
                Transmet l'agent SSH local au serveur (équivalent ssh -A).
              </span>
            </span>
            <span
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                agentForward ? "bg-(--color-accent)" : "bg-(--color-elevated)"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
                  agentForward ? "left-3.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Clés SSH</span>
            <KeyPicker selectedKeyIds={keyIds} onChange={setKeyIds} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
