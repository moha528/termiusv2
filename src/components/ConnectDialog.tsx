import { Server } from "lucide-react";
import { useEffect, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { withToast } from "@/lib/feedback";
import { keyvaultApi } from "@/lib/keyvault";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";

type ConnectTarget = { host: Host; type: SessionTabType };

type Props = {
  target: ConnectTarget | null;
  onOpenChange: (open: boolean) => void;
};

export type { ConnectTarget };

/**
 * Prompts for the SSH password and opens a new tab on submit.
 *
 * When `Remember password` is checked, the password is persisted in the OS
 * keychain after a successful authentication. On next connect the host can
 * skip this dialog entirely (see `useTryConnect` in `Sidebar.tsx`).
 */
export function ConnectDialog({ target, onOpenChange }: Props) {
  const openTab = useSessionsStore((s) => s.openTab);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKnown, setSavedKnown] = useState(false);

  const host = target?.host ?? null;
  const tabType = target?.type ?? "ssh";

  useEffect(() => {
    if (!host) return;
    setPassword("");
    setError(null);
    setSubmitting(false);
    keyvaultApi.has(host.id).then((has) => {
      setSavedKnown(has);
      setRemember(true);
    });
  }, [host]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-(--color-accent-bg) text-(--color-accent)">
              <Server className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>
                {host?.label ?? "Connexion SSH"}
                {tabType === "sftp" && (
                  <span className="ml-2 text-xs font-normal text-(--color-muted)">SFTP</span>
                )}
              </DialogTitle>
              {host && (
                <span className="font-mono text-xs text-(--color-muted)">
                  {host.username}@{host.hostname}
                  {host.port !== 22 ? `:${host.port}` : ""}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!host) return;
            setSubmitting(true);
            setError(null);
            try {
              await withToast(openTab(host, password, tabType), {
                loading: `Connexion à ${host.label}…`,
                success: tabType === "sftp" ? "SFTP ouvert" : "Connecté",
              });
              if (remember) {
                await keyvaultApi.save(host.id, password);
              } else if (savedKnown) {
                await keyvaultApi.delete(host.id);
              }
              onOpenChange(false);
            } catch (err) {
              setError(String(err));
              setSubmitting(false);
            }
          }}
        >
          <div className="grid gap-1.5 text-xs">
            <span className="font-medium text-(--color-muted)">Mot de passe</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoFocus
              disabled={submitting}
            />
          </div>

          <Checkbox
            id="remember-password"
            checked={remember}
            onCheckedChange={setRemember}
            disabled={submitting}
            label={
              <span className="flex items-center gap-1.5">
                Mémoriser le mot de passe
                <span className="text-[10px] text-(--color-muted-soft)">(keychain de l'OS)</span>
              </span>
            }
          />

          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !password}>
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
