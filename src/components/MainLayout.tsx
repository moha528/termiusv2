import { Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { keyvaultApi } from "@/lib/keyvault";
import { useSessionsStore } from "@/stores/useSessionsStore";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { SettingsView } from "@/views/SettingsView";

import { ConnectDialog, type ConnectTarget } from "./ConnectDialog";
import { Header } from "./Header";
import { SessionPane } from "./SessionPane";
import { Sidebar } from "./Sidebar";
import { SidebarResizer } from "./SidebarResizer";
import { TabsBar } from "./TabsBar";

import type { Host } from "@/lib/bindings/Host";

export function MainLayout() {
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const setSetting = useSettingsStore((s) => s.set);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const openTab = useSessionsStore((s) => s.openTab);

  const [connectFor, setConnectFor] = useState<ConnectTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSetting("lastActiveTabId", activeTabId);
  }, [activeTabId, setSetting]);

  /**
   * Open a session of `type` against `host`. Tries the cached keychain
   * password first, falls back to the prompt dialog otherwise.
   */
  const handleOpenSession = useCallback(
    async (host: Host, type: SessionTabType = "ssh") => {
      const saved = await keyvaultApi.get(host.id);
      if (!saved) {
        setConnectFor({ host, type });
        return;
      }
      try {
        await openTab(host, saved, type);
      } catch (e) {
        console.warn("auto-connect failed, prompting:", e);
        await keyvaultApi.delete(host.id);
        setConnectFor({ host, type });
      }
    },
    [openTab],
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-bg) text-(--color-text)">
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <Sidebar width={sidebarWidth} onOpenSession={handleOpenSession} />
        <SidebarResizer onResize={(w) => setSetting("sidebarWidth", w)} />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabsBar />
          <section className="min-h-0 flex-1 bg-(--color-bg)">
            {activeTab ? <SessionPane tab={activeTab} /> : <EmptyState />}
          </section>
        </main>
      </div>

      <ConnectDialog target={connectFor} onOpenChange={(o) => !o && setConnectFor(null)} />
      <SettingsView open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-(--color-panel) text-(--color-muted-soft)">
        <TerminalIcon className="h-6 w-6" />
      </div>
      <div className="max-w-xs">
        <p className="text-sm font-medium text-(--color-text-soft)">Aucune session active</p>
        <p className="mt-1 text-xs text-(--color-muted)">
          Double-cliquez sur un serveur dans la barre latérale pour démarrer une session SSH.
        </p>
      </div>
    </div>
  );
}
