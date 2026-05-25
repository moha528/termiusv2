import { Loader2, Server } from "lucide-react";
import { useEffect, useState } from "react";

import type { SessionTab } from "@/stores/useSessionsStore";

/**
 * Loader rendered while a tab's session is still establishing.
 *
 * We deliberately don't try to expose granular SSH stages (DNS / TCP / auth /
 * PTY) yet — the backend currently does the whole handshake in one IPC call.
 * Instead we tick a small message every ~1.5s so the user knows we're still
 * working ("still negotiating…", "almost there…"). For local terminals the
 * spinner shows for ~250 ms which is fine — it cushions the transition
 * instead of flashing an empty terminal.
 */
export function Connecting({ tab }: { tab: SessionTab }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const it = setInterval(() => setTick((t) => t + 1), 1500);
    return () => clearInterval(it);
  }, []);

  const messages =
    tab.type === "local"
      ? ["Démarrage du shell local…"]
      : tab.type === "sftp"
        ? [
            "Connexion SSH…",
            "Authentification…",
            "Ouverture du canal SFTP…",
            "Toujours en cours, ça peut prendre quelques secondes…",
          ]
        : [
            "Connexion SSH…",
            "Authentification…",
            "Allocation du PTY…",
            "Toujours en cours, ça peut prendre quelques secondes…",
          ];
  const message = messages[Math.min(tick, messages.length - 1)];

  return (
    <div className="flex h-full w-full items-center justify-center bg-(--color-bg)">
      <div className="flex w-80 flex-col items-center gap-5 rounded-xl border border-(--color-border) bg-(--color-panel) p-8 shadow-2xl shadow-black/30">
        <div className="relative grid h-12 w-12 place-items-center rounded-full bg-(--color-elevated) text-(--color-accent)">
          <Server className="h-5 w-5" />
          <Loader2 className="absolute -bottom-1 -right-1 h-5 w-5 animate-spin text-(--color-accent)" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-(--color-text)">{tab.host.label}</p>
          <p className="mt-1 font-mono text-[11px] text-(--color-muted)">
            {tab.host.username}@{tab.host.hostname}
            {tab.host.port !== 22 && tab.host.port !== 0 ? `:${tab.host.port}` : ""}
          </p>
        </div>
        <p className="text-xs text-(--color-muted-soft)">{message}</p>
      </div>
    </div>
  );
}
