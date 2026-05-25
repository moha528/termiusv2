import { ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { KnownHost } from "@/lib/bindings/KnownHost";
import { withToast } from "@/lib/feedback";
import { knownHostsApi } from "@/lib/ipc";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/AlertDialog";

/**
 * Settings section: stored server fingerprints (TOFU). Each row corresponds
 * to a `(hostname, port)` pair the user has previously connected to. Forget
 * one to make the next connection re-prompt + record whatever fingerprint
 * the server presents.
 *
 * We don't allow editing the fingerprint by hand — that would defeat the
 * purpose of TOFU. The only mutation is deletion.
 */
export function KnownHostsSection() {
  const [hosts, setHosts] = useState<KnownHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState<KnownHost | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await knownHostsApi.list();
      setHosts(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is a stable closure scoped to the component
  useEffect(() => {
    refresh();
  }, []);

  if (loading && hosts.length === 0) {
    return <p className="text-[11px] text-(--color-muted-soft)">Chargement…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-red-900/40 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-400">
        {error}
      </p>
    );
  }
  if (hosts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-(--color-border) bg-(--color-bg-soft) px-3 py-4 text-center text-[11px] text-(--color-muted)">
        Aucune empreinte enregistrée. La première connexion à un serveur l'inscrit ici
        automatiquement (Trust-On-First-Use).
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-1">
        {hosts.map((h) => (
          <li
            key={`${h.hostname}:${h.port}`}
            className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 py-1.5"
          >
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-(--color-panel) text-(--color-success)">
              <ShieldCheck className="h-3 w-3" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-mono text-[11px] font-medium text-(--color-text)">
                {h.hostname}
                {h.port !== 22 ? `:${h.port}` : ""}
              </span>
              <span className="truncate font-mono text-[9px] text-(--color-muted-soft)">
                {h.key_type} · {h.fingerprint}
              </span>
              <span className="text-[9px] text-(--color-muted-soft)">
                accepté le {h.accepted_at}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setConfirmForget(h)}
              title="Oublier cette empreinte"
              aria-label="Oublier cette empreinte"
              className="rounded p-1 text-(--color-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      <AlertDialog open={confirmForget !== null} onOpenChange={(o) => !o && setConfirmForget(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Oublier cette empreinte ?</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmForget
              ? `La prochaine connexion à « ${confirmForget.hostname}:${confirmForget.port} » acceptera la nouvelle empreinte du serveur, quelle qu'elle soit. À utiliser après une rotation légitime de la clé du serveur.`
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
                  if (!confirmForget) return;
                  await withToast(
                    knownHostsApi
                      .forget(confirmForget.hostname, confirmForget.port)
                      .then(() => refresh()),
                    {
                      loading: "Suppression…",
                      success: "Empreinte oubliée",
                    },
                  );
                  setConfirmForget(null);
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              >
                Oublier
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
