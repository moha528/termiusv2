import { useEffect, useState } from "react";

import { useSessionsStore } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { SettingsView } from "@/views/SettingsView";

import { ConnectDialog } from "./ConnectDialog";
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

  const [connectFor, setConnectFor] = useState<Host | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Persist the currently active tab id whenever it changes (debounced is
  // unnecessary — set_setting is one row write).
  useEffect(() => {
    setSetting("lastActiveTabId", activeTabId);
  }, [activeTabId, setSetting]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-bg) text-(--color-text)">
      <header className="flex h-10 shrink-0 items-center border-b border-(--color-border) bg-(--color-panel) px-3 text-sm font-medium">
        <span className="text-(--color-accent)">●</span>
        <span className="ml-2">Termius v2</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          width={sidebarWidth}
          onOpenSession={setConnectFor}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SidebarResizer
          onResize={(w) => {
            setSetting("sidebarWidth", w);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabsBar />
          <section className="min-h-0 flex-1">
            {activeTab ? (
              <SessionPane tab={activeTab} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm italic text-(--color-muted)">
                Double-cliquez sur un serveur pour démarrer une session.
              </div>
            )}
          </section>
        </main>
      </div>

      <ConnectDialog host={connectFor} onOpenChange={(o) => !o && setConnectFor(null)} />
      <SettingsView open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
