import { Server } from "lucide-react";
import { useEffect, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { useSessionsStore } from "@/stores/useSessionsStore";

import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";

type Props = {
  host: Host | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Prompts for the SSH password and opens a new tab on submit.
 *
 * Password storage in the OS keychain ships in P3-T06; until then we keep it
 * in memory only for the duration of the connect call.
 */
export function ConnectDialog({ host, onOpenChange }: Props) {
  const openTab = useSessionsStore((s) => s.openTab);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (host) {
      setPassword("");
      setError(null);
      setSubmitting(false);
    }
  }, [host]);

  return (
    <Dialog open={Boolean(host)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-(--color-accent-bg) text-(--color-accent)">
              <Server className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>{host?.label ?? "Connexion SSH"}</DialogTitle>
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
              await openTab(host, password);
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
