import { useCallback, useEffect, useState } from "react";

import { withToast } from "@/lib/feedback";
import { keyvaultApi } from "@/lib/keyvault";
import { useServersStore } from "@/stores/useServersStore";
import { useSessionsStore } from "@/stores/useSessionsStore";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { RestorableTab } from "@/stores/useSettingsStore";
import { SettingsView } from "@/views/SettingsView";

import { CommandPalette } from "./CommandPalette";
import { ConnectDialog, type ConnectTarget } from "./ConnectDialog";
import { Header } from "./Header";
import { HostFormDialog } from "./HostFormDialog";
import { ImportSshConfigDialog } from "./ImportSshConfigDialog";
import { RestoreSessionsDialog } from "./RestoreSessionsDialog";
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
  const hydrated = useSettingsStore((s) => s.hydrated);
  const restorableTabs = useSettingsStore((s) => s.restorableTabs);
  const autoRestore = useSettingsStore((s) => s.autoRestoreSessions);
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const openTab = useSessionsStore((s) => s.openTab);
  const restoreClosedTab = useSessionsStore((s) => s.restoreClosedTab);
  const refreshHosts = useServersStore((s) => s.refresh);
  const hosts = useServersStore((s) => s.hosts);

  const [connectFor, setConnectFor] = useState<ConnectTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreEvaluated, setRestoreEvaluated] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSetting("lastActiveTabId", activeTabId);
  }, [activeTabId, setSetting]);

  // Persist the list of open tabs every time it changes so we can offer to
  // restore them on next launch. The snapshot keeps only what we can recreate
  // safely: the host id (for lookup), tab type, and the custom title.
  useEffect(() => {
    if (!hydrated) return;
    const snapshot: RestorableTab[] = tabs.map((t) => ({
      hostId: t.host.id,
      type: t.type,
      title: t.title,
    }));
    void setSetting("restorableTabs", snapshot);
  }, [tabs, hydrated, setSetting]);

  // Once settings finish hydrating, decide what to do with the previous tab
  // snapshot. Run hosts refresh first so we can match by host id.
  // biome-ignore lint/correctness/useExhaustiveDependencies: must fire exactly once when hydrated flips true
  useEffect(() => {
    if (!hydrated || restoreEvaluated) return;
    if (restorableTabs.length === 0) {
      setRestoreEvaluated(true);
      return;
    }
    void refreshHosts().then(() => {
      if (autoRestore === true) {
        applyRestore();
        setRestoreEvaluated(true);
      } else if (autoRestore === false) {
        void setSetting("restorableTabs", []);
        setRestoreEvaluated(true);
      } else {
        setRestoreOpen(true);
      }
    });
  }, [hydrated]);

  const applyRestore = useCallback(() => {
    const known = new Map(hosts.map((h) => [h.id, h]));
    let restored = 0;
    for (const t of restorableTabs) {
      const host = known.get(t.hostId);
      if (host) {
        restoreClosedTab(host, t.type, t.title);
        restored += 1;
      }
    }
    return restored;
  }, [hosts, restorableTabs, restoreClosedTab]);

  const onRestoreConfirm = (remember: boolean) => {
    applyRestore();
    setRestoreOpen(false);
    setRestoreEvaluated(true);
    if (remember) void setSetting("autoRestoreSessions", true);
  };

  const onRestoreSkip = (remember: boolean) => {
    setRestoreOpen(false);
    setRestoreEvaluated(true);
    void setSetting("restorableTabs", []);
    if (remember) void setSetting("autoRestoreSessions", false);
  };

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
      <RestoreSessionsDialog
        open={restoreOpen}
        tabs={restorableTabs}
        onRestore={onRestoreConfirm}
        onSkip={onRestoreSkip}
      />
    </div>
  );
}
