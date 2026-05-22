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
 * Renders the content of a single session tab depending on its status:
 * - connecting → loading screen
 * - open → live xterm.js terminal
 * - closed → disconnected screen with Reconnect
 * - error → error screen with Retry
 */
export function SessionPane({ tab }: Props) {
  const markClosed = useSessionsStore((s) => s.markClosed);
  const reconnect = useSessionsStore((s) => s.reconnect);
  const [password, setPassword] = useState("");

  const onClosed = useCallback(
    (reason: string) => {
      markClosed(tab.id, reason);
    },
    [markClosed, tab.id],
  );

  switch (tab.status.kind) {
    case "connecting":
      return (
        <Empty>
          <p>Connexion à {tab.host.label}…</p>
        </Empty>
      );

    case "open":
      return (
        <TerminalView
          key={tab.status.sessionId}
          sessionId={tab.status.sessionId}
          onClosed={onClosed}
        />
      );

    case "closed":
      return (
        <Empty>
          <p className="text-sm">
            Session déconnectée — <span className="text-(--color-muted)">{tab.status.reason}</span>
          </p>
          <ReconnectForm
            password={password}
            setPassword={setPassword}
            onSubmit={() => reconnect(tab.id, password)}
          />
        </Empty>
      );

    case "error":
      return (
        <Empty>
          <p className="text-sm text-red-400">Échec : {tab.status.message}</p>
          <ReconnectForm
            password={password}
            setPassword={setPassword}
            onSubmit={() => reconnect(tab.id, password)}
          />
        </Empty>
      );
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-(--color-text)">
      {children}
    </div>
  );
}

function ReconnectForm({
  password,
  setPassword,
  onSubmit,
}: {
  password: string;
  setPassword: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex w-72 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        autoFocus
      />
      <Button type="submit">Reconnecter</Button>
    </form>
  );
}
