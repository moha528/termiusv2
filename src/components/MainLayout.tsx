import { Plus, Server, Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
              <EmptyState onOpenPalette={() => setPaletteOpen(true)} />
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

function EmptyState({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-(--color-panel) text-(--color-accent)">
        <TerminalIcon className="h-7 w-7" />
      </div>
      <div className="max-w-md">
        <p className="text-base font-semibold text-(--color-text)">Aucune session active</p>
        <p className="mt-1 text-sm text-(--color-muted)">
          Ouvrez la palette pour démarrer une session, ou cliquez sur un serveur dans la barre
          latérale.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        className="inline-flex items-center gap-2 rounded-lg border border-(--color-border-strong) bg-(--color-panel) px-4 py-2 text-sm font-medium text-(--color-text) shadow-sm transition-colors hover:bg-(--color-panel-hover)"
      >
        <Plus className="h-4 w-4" />
        Nouvelle session
        <span className="flex items-center gap-1 text-[10px] text-(--color-muted)">
          <kbd className="rounded border border-(--color-border) bg-(--color-bg) px-1 font-mono">
            Ctrl
          </kbd>
          <kbd className="rounded border border-(--color-border) bg-(--color-bg) px-1 font-mono">
            K
          </kbd>
        </span>
      </button>
      <FeaturedShortcuts />
    </div>
  );
}

function FeaturedShortcuts() {
  return (
    <div className="mt-4 grid w-full max-w-md grid-cols-2 gap-2 text-left text-xs">
      <div className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2">
        <Server className="h-3.5 w-3.5 text-(--color-accent)" />
        <span className="flex-1 text-(--color-muted)">Cliquez sur un serveur</span>
        <span className="text-(--color-text-soft)">→ SSH</span>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2">
        <Server className="h-3.5 w-3.5 text-(--color-accent-soft)" />
        <span className="flex-1 text-(--color-muted)">Clic droit</span>
        <span className="text-(--color-text-soft)">→ SFTP</span>
      </div>
    </div>
  );
}
