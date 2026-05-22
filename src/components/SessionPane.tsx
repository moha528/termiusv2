import { Plug } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { SessionTab } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

import { TerminalView } from "./TerminalView";

type Props = {
  tab: SessionTab;
};

/**
 * Renders the content of a single session tab.
 *
 * Tabs only exist after a successful authentication, so we only render two
 * states here:
 * - `open` → live xterm.js terminal
 * - `closed` → disconnected screen with Reconnect form
 */
export function SessionPane({ tab }: Props) {
  const markClosed = useSessionsStore((s) => s.markClosed);
  const reconnect = useSessionsStore((s) => s.reconnect);

  const onClosed = useCallback(
    (reason: string) => {
      markClosed(tab.id, reason);
    },
    [markClosed, tab.id],
  );

  if (tab.status.kind === "open") {
    return (
      <TerminalView
        key={tab.status.sessionId}
        sessionId={tab.status.sessionId}
        onClosed={onClosed}
      />
    );
  }

  return <Disconnected tab={tab} onReconnect={(pw) => reconnect(tab.id, pw)} />;
}

function Disconnected({
  tab,
  onReconnect,
}: {
  tab: SessionTab;
  onReconnect: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = tab.status.kind === "closed" ? tab.status.reason : "";

  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <div className="flex w-80 flex-col items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
          <Plug className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-100">Session déconnectée</p>
          <p className="mt-1 text-xs text-zinc-500">
            {tab.host.username}@{tab.host.hostname} — {reason}
          </p>
        </div>
        <form
          className="flex w-full flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await onReconnect(password);
              setPassword("");
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
          <Button type="submit" disabled={submitting || !password}>
            {submitting ? "Connexion…" : "Reconnecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
