import { useCallback, useEffect, useState } from "react";

import { withToast } from "@/lib/feedback";
import { keyvaultApi } from "@/lib/keyvault";
import { useSessionsStore } from "@/stores/useSessionsStore";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { SettingsView } from "@/views/SettingsView";

import { CommandPalette } from "./CommandPalette";
import { ConnectDialog, type ConnectTarget } from "./ConnectDialog";
import { Header } from "./Header";
import { HostFormDialog } from "./HostFormDialog";
import { ImportSshConfigDialog } from "./ImportSshConfigDialog";
import { SessionPane } from "./SessionPane";
import { Sidebar } from "./Sidebar";
import { SidebarResizer } from "./SidebarResizer";
import { TabsBar } from "./TabsBar";
import { TransferPanel } from "./TransferPanel";
import { Workspace } from "./Workspace";

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSetting("lastActiveTabId", activeTabId);
  }, [activeTabId, setSetting]);

  // Global Ctrl+K opens the command palette from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleOpenSession = useCallback(
    async (host: Host, type: SessionTabType = "ssh") => {
      const saved = await keyvaultApi.get(host.id);
      if (!saved) {
        setConnectFor({ host, type });
        return;
      }
      try {
        await withToast(openTab(host, saved, type), {
          loading: `Connexion à ${host.label}…`,
          success: type === "sftp" ? "SFTP ouvert" : "Connecté",
        });
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
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          width={sidebarWidth}
          onOpenSession={handleOpenSession}
          onOpenImport={() => setImportOpen(true)}
          onOpenNewHost={() => setNewHostOpen(true)}
        />
        <SidebarResizer onResize={(w) => setSetting("sidebarWidth", w)} />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabsBar onNewTab={() => setPaletteOpen(true)} />
          <section className="min-h-0 flex-1 bg-(--color-bg)">
            {activeTab ? (
              <SessionPane tab={activeTab} />
            ) : (
              <Workspace
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenSession={handleOpenSession}
                onNewHost={() => setNewHostOpen(true)}
                onImport={() => setImportOpen(true)}
              />
            )}
          </section>
          <TransferPanel />
        </main>
      </div>

      <ConnectDialog target={connectFor} onOpenChange={(o) => !o && setConnectFor(null)} />
      <SettingsView open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenHost={handleOpenSession}
        onNewHost={() => setNewHostOpen(true)}
        onImport={() => setImportOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <HostFormDialog open={newHostOpen} onOpenChange={setNewHostOpen} host={null} />
      <ImportSshConfigDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
