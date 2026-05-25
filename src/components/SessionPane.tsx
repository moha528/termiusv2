import { Plug, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { keyvaultApi } from "@/lib/keyvault";
import type { SessionTab } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

import { Connecting } from "./Connecting";
import { SftpView } from "./SftpView";
import { SplitLayout } from "./SplitLayout";

type Props = {
  tab: SessionTab;
};

/**
 * Renders the content of a single session tab.
 *
 * Tabs only exist after a successful authentication, so we only render two
 * states here:
 * - `open` → live xterm.js terminal
 * - `closed` → disconnected screen; the Reconnect form uses the cached
 *   keychain password first and only prompts if it's missing or stale.
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

  // Shared "connecting" loader — used for SSH/SFTP/local while the open IPC
  // hasn't resolved yet. We show this BEFORE branching by type because the
  // experience is the same regardless.
  if (tab.status.kind === "connecting") {
    return <Connecting tab={tab} />;
  }

  // SFTP tab — keep the simple single-pane flow.
  if (tab.type === "sftp") {
    if (tab.status.kind === "open") {
      return <SftpView key={tab.status.sessionId} sessionId={tab.status.sessionId} />;
    }
    return <Disconnected tab={tab} onReconnect={(pw) => reconnect(tab.id, pw)} />;
  }

  // Local terminal tab — no SSH reconnect flow; offer a "Spawn new shell"
  // button instead when the previous shell has exited.
  if (tab.type === "local") {
    if (tab.status.kind === "open" || tab.layout) {
      return <SplitLayout tab={tab} onClosed={onClosed} />;
    }
    return (
      <LocalExited
        reason={tab.status.kind === "closed" ? tab.status.reason : ""}
        onRespawn={() => reconnect(tab.id, "")}
      />
    );
  }

  // SSH tab — either single pane (status) or recursive split layout.
  if (tab.layout || tab.status.kind === "open") {
    return <SplitLayout tab={tab} onClosed={onClosed} />;
  }
  return <Disconnected tab={tab} onReconnect={(pw) => reconnect(tab.id, pw)} />;
}

function LocalExited({ reason, onRespawn }: { reason: string; onRespawn: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="flex h-full w-full items-center justify-center bg-(--color-bg)">
      <div className="flex w-80 flex-col items-center gap-5 rounded-xl border border-(--color-border) bg-(--color-panel) p-8 shadow-2xl shadow-black/30">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-(--color-elevated) text-(--color-muted)">
          <Plug className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-(--color-text)">Shell terminé</p>
          {reason && <p className="mt-1 text-[11px] text-(--color-muted-soft)">{reason}</p>}
        </div>
        <Button
          onClick={async () => {
            setSubmitting(true);
            try {
              await onRespawn();
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="w-full"
        >
          <RotateCw className="h-3.5 w-3.5" />
          {submitting ? "Démarrage…" : "Nouveau shell"}
        </Button>
      </div>
    </div>
  );
}

function Disconnected({
  tab,
  onReconnect,
}: {
  tab: SessionTab;
  onReconnect: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [hasSaved, setHasSaved] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check on mount whether we already have a saved password to drive the UX.
  useEffect(() => {
    keyvaultApi.has(tab.host.id).then(setHasSaved);
  }, [tab.host.id]);

  const reason = tab.status.kind === "closed" ? tab.status.reason : "";

  const submit = useCallback(
    async (pw: string) => {
      setSubmitting(true);
      setError(null);
      try {
        await onReconnect(pw);
        setPassword("");
      } catch (err) {
        setError(String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [onReconnect],
  );

  const useSaved = useCallback(async () => {
    const saved = await keyvaultApi.get(tab.host.id);
    if (!saved) {
      setHasSaved(false);
      return;
    }
    await submit(saved);
  }, [tab.host.id, submit]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-(--color-bg)">
      <div className="flex w-80 flex-col items-center gap-5 rounded-xl border border-(--color-border-strong) bg-(--color-panel) p-8 shadow-2xl shadow-black/30">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-(--color-elevated) text-(--color-muted)">
          <Plug className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-(--color-text)">Session déconnectée</p>
          <p className="mt-1 font-mono text-[11px] text-(--color-muted)">
            {tab.host.username}@{tab.host.hostname}
          </p>
          {reason && <p className="mt-1 text-[11px] text-(--color-muted-soft)">{reason}</p>}
        </div>

        {hasSaved && (
          <Button onClick={useSaved} disabled={submitting} className="w-full">
            <RotateCw className="h-3.5 w-3.5" />
            {submitting ? "Connexion…" : "Reconnecter"}
          </Button>
        )}

        {!hasSaved && (
          <form
            className="flex w-full flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(password);
            }}
          >
            <Input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoFocus
            />
            <Button type="submit" disabled={submitting || !password}>
              {submitting ? "Connexion…" : "Reconnecter"}
            </Button>
          </form>
        )}

        {error && (
          <div className="w-full rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
