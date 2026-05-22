import { useEffect, useState } from "react";

import type { Host } from "@/lib/bindings/Host";
import { useSessionsStore } from "@/stores/useSessionsStore";

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

type Props = {
  host: Host | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Prompts for the SSH password and opens a new tab on submit.
 *
 * The password is intentionally NOT persisted at this stage — credential
 * storage in the OS keychain ships in ticket P3-T06.
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

  const open = Boolean(host);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connexion SSH</DialogTitle>
          <DialogDescription>
            {host
              ? `${host.username}@${host.hostname}${host.port !== 22 ? `:${host.port}` : ""}`
              : ""}
          </DialogDescription>
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
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoFocus
          />
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
