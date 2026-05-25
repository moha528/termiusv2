import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { withToast } from "@/lib/feedback";
import { keyvaultApi } from "@/lib/keyvault";
import { checkForUpdate, installUpdate } from "@/lib/updater";
import { useShortcuts } from "@/lib/useShortcuts";
import { useGroupsStore } from "@/stores/useGroupsStore";
import { useIdentitiesStore } from "@/stores/useIdentitiesStore";
import { useKeybindingsStore } from "@/stores/useKeybindingsStore";
import { useServersStore } from "@/stores/useServersStore";
import { useSessionsStore } from "@/stores/useSessionsStore";
import type { SessionTabType } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { RestorableTab } from "@/stores/useSettingsStore";
import { useSnippetsStore } from "@/stores/useSnippetsStore";
import { useSshKeysStore } from "@/stores/useSshKeysStore";
import { schedulePush, useSyncStore } from "@/stores/useSyncStore";
import { useTagsStore } from "@/stores/useTagsStore";
import { useTerminalSearchStore } from "@/stores/useTerminalSearchStore";
import { useVaultStore } from "@/stores/useVaultStore";
import { SettingsView } from "@/views/SettingsView";

import { cn } from "@/lib/utils";

import { CommandHistoryDialog } from "./CommandHistoryDialog";
import { CommandPalette } from "./CommandPalette";
import { ConnectDialog, type ConnectTarget } from "./ConnectDialog";
import { Header } from "./Header";
import { HostFormDialog } from "./HostFormDialog";
import { ImportSshConfigDialog } from "./ImportSshConfigDialog";
import { PortForwardsDialog } from "./PortForwardsDialog";
import { RestoreSessionsDialog } from "./RestoreSessionsDialog";
import { SessionPane } from "./SessionPane";
import { Sidebar } from "./Sidebar";
import { SidebarResizer } from "./SidebarResizer";
import { SnippetsPanel } from "./SnippetsPanel";
import { TabsBar } from "./TabsBar";
import { TransferPanel } from "./TransferPanel";
import { UnlockOverlay } from "./UnlockOverlay";
import { Workspace } from "./Workspace";

import type { Host } from "@/lib/bindings/Host";

export function MainLayout() {
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth);
  const autoLockMinutes = useSettingsStore((s) => s.autoLockMinutes);
  const setSetting = useSettingsStore((s) => s.set);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const restorableTabs = useSettingsStore((s) => s.restorableTabs);
  const autoRestore = useSettingsStore((s) => s.autoRestoreSessions);
  const tabs = useSessionsStore((s) => s.tabs);
  const activeTabId = useSessionsStore((s) => s.activeTabId);
  const openTab = useSessionsStore((s) => s.openTab);
  const openLocalTab = useSessionsStore((s) => s.openLocalTab);
  const restoreClosedTab = useSessionsStore((s) => s.restoreClosedTab);
  const closeTab = useSessionsStore((s) => s.closeTab);
  const setActive = useSessionsStore((s) => s.setActive);
  const refreshHosts = useServersStore((s) => s.refresh);
  const hosts = useServersStore((s) => s.hosts);
  const hydrateKb = useKeybindingsStore((s) => s.hydrate);

  const [connectFor, setConnectFor] = useState<ConnectTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreEvaluated, setRestoreEvaluated] = useState(false);
  const [forwardsForHost, setForwardsForHost] = useState<Host | null>(null);

  useEffect(() => {
    hydrate();
    void hydrateKb();
    // Preload the SSH key host-link map so handleOpenSession knows whether
    // to skip the password prompt for hosts that have keys configured.
    void useSshKeysStore.getState().refresh();
    // Hydrate the vault: if a master password is configured the app starts
    // locked, the UnlockOverlay below renders on top of everything.
    void useVaultStore.getState().hydrate();
    // Hydrate sync state and, if a remote vault is configured + a password
    // is available, pull at startup (remote-wins). Failure is non-fatal —
    // we just keep the local config as-is.
    void useSyncStore
      .getState()
      .hydrate()
      .then(async () => {
        const s = useSyncStore.getState();
        if (s.config?.enabled && s.hasPassword) {
          try {
            const r = await s.pullNow();
            if (r?.changed) {
              // Re-fetch everything that may have moved server-side.
              await Promise.all([
                useServersStore.getState().refresh(),
                useGroupsStore.getState().refresh(),
                useTagsStore.getState().refresh(),
                useIdentitiesStore.getState().refresh(),
                useSnippetsStore.getState().refresh(),
              ]);
            }
          } catch (e) {
            console.warn("startup pull:", e);
          }
        }
      });

    // P5-T06 — silent update check at startup. If a newer version is
    // published, surface a non-intrusive toast with an "Installer" action.
    // Errors (dev mode, offline, missing pubkey) are swallowed — the user
    // can always check manually from the About panel.
    void checkForUpdate()
      .then((info) => {
        if (!info) return;
        toast(`Mise à jour disponible — v${info.version}`, {
          description: "Une nouvelle version de Lynk Client est prête.",
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: "Installer",
            onClick: () => {
              void withToast(installUpdate(info), {
                loading: "Téléchargement et installation…",
                success: "Mise à jour installée — redémarrage…",
              });
            },
          },
        });
      })
      .catch((e) => console.debug("update check (silencieux):", e));

    // P5-T04 — debounced auto-push : tout changement persisté côté front
    // déclenche un push 30 s plus tard. On s'abonne aux stores qui mutent
    // les données exportées, en filtrant pour ne pas trigger sur les
    // hydratations initiales (la première update suit le refresh, on
    // accepte ce coût — un push de plus au launch est trivial).
    const unsubs = [
      useServersStore.subscribe((s, prev) => s.hosts !== prev.hosts && schedulePush()),
      useGroupsStore.subscribe((s, prev) => s.groups !== prev.groups && schedulePush()),
      useTagsStore.subscribe((s, prev) => {
        if (s.tags !== prev.tags || s.links !== prev.links) schedulePush();
      }),
      useIdentitiesStore.subscribe(
        (s, prev) =>
          (s.identities !== prev.identities || s.keyLinks !== prev.keyLinks) && schedulePush(),
      ),
      useSnippetsStore.subscribe((s, prev) => s.snippets !== prev.snippets && schedulePush()),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [hydrate, hydrateKb]);

  useEffect(() => {
    setSetting("lastActiveTabId", activeTabId);
  }, [activeTabId, setSetting]);

  // Persist the list of open tabs every time it changes so we can offer to
  // restore them on next launch. The snapshot keeps only what we can recreate
  // safely: the host id (for lookup), tab type, and the custom title.
  useEffect(() => {
    if (!hydrated) return;
    // Local terminals are ephemeral — don't include them in the restore list,
    // they can't be looked up by host id and a "restore" would just spawn a
    // brand-new shell, which the user can do from the workspace anyway.
    const snapshot: RestorableTab[] = tabs
      .filter((t) => t.type !== "local")
      .map((t) => ({
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

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      const { tabs: list, activeTabId: aid } = useSessionsStore.getState();
      if (list.length === 0) return;
      const idx = list.findIndex((t) => t.id === aid);
      const base = idx < 0 ? 0 : idx;
      const next = (base + delta + list.length) % list.length;
      setActive(list[next].id);
    },
    [setActive],
  );

  // Configurable shortcut dispatch (P4-T07). The handler set is wired into
  // the registry so re-binding from Settings takes effect immediately.
  const shortcutHandlers = useMemo(
    () => ({
      "open-command-palette": () => setPaletteOpen((v) => !v),
      "open-snippets": () => setSnippetsOpen((v) => !v),
      "open-command-history": () => setHistoryOpen((v) => !v),
      "open-settings": () => setSettingsOpen((v) => !v),
      "new-tab": () => setPaletteOpen(true),
      "close-tab": () => {
        const id = useSessionsStore.getState().activeTabId;
        if (id) void closeTab(id);
      },
      "next-tab": () => cycleTab(1),
      "prev-tab": () => cycleTab(-1),
      "reopen-closed-tab": () => {
        const list = useSettingsStore.getState().restorableTabs;
        const last = list.at(-1);
        const known = new Map(useServersStore.getState().hosts.map((h) => [h.id, h]));
        const host = last ? known.get(last.hostId) : undefined;
        if (last && host) restoreClosedTab(host, last.type, last.title);
      },
      "open-search-buffer": () => {
        const focused = useSessionsStore.getState().focusedSessionId;
        if (focused) useTerminalSearchStore.getState().open(focused);
      },
    }),
    [closeTab, cycleTab, restoreClosedTab],
  );
  useShortcuts(shortcutHandlers);

  // Auto-lock after inactivity (P3-T08). We track keyboard/mouse activity
  // on document and reset a timer; when it fires past `autoLockMinutes`
  // we ask the vault to lock (which also closes every open session).
  // The effect is a no-op when `autoLockMinutes === 0` or no master
  // password is configured.
  useEffect(() => {
    if (autoLockMinutes <= 0) return;
    let lastActivity = Date.now();
    const onActivity = () => {
      lastActivity = Date.now();
    };
    const events: (keyof DocumentEventMap)[] = ["keydown", "mousedown", "mousemove", "scroll"];
    for (const e of events) document.addEventListener(e, onActivity, { passive: true });
    // Check every 30 s — coarse-grained enough to be cheap, fine enough for the
    // user-visible "5/15/30/60 min" granularity we offer.
    const id = window.setInterval(() => {
      const v = useVaultStore.getState();
      if (!v.hasMaster || v.locked) return;
      const elapsedMs = Date.now() - lastActivity;
      if (elapsedMs >= autoLockMinutes * 60_000) {
        void v.lock();
      }
    }, 30_000);
    return () => {
      window.clearInterval(id);
      for (const e of events) document.removeEventListener(e, onActivity);
    };
  }, [autoLockMinutes]);

  const handleOpenSession = useCallback(
    async (host: Host, type: SessionTabType = "ssh") => {
      // The backend tries key auth before password (P3-T05). If at least one
      // SSH key is associated to the host, we can attempt the connection
      // without prompting — keys may succeed even without a stored password.
      const hostKeys = useSshKeysStore.getState().hostLinks[host.id] ?? [];
      const saved = await keyvaultApi.get(host.id);
      if (!saved && hostKeys.length === 0) {
        // No saved password AND no keys configured — fall back to the prompt.
        setConnectFor({ host, type });
        return;
      }
      try {
        await withToast(openTab(host, saved ?? "", type), {
          loading: `Connexion à ${host.label}…`,
          success: type === "sftp" ? "SFTP ouvert" : "Connecté",
        });
      } catch (e) {
        console.warn("auto-connect failed, prompting:", e);
        if (saved) await keyvaultApi.delete(host.id);
        setConnectFor({ host, type });
      }
    },
    [openTab],
  );

  const handleOpenLocal = useCallback(async () => {
    await withToast(openLocalTab(), {
      loading: "Ouverture du shell local…",
      success: "Terminal local prêt",
    });
  }, [openLocalTab]);

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
          onOpenForwards={(host) => setForwardsForHost(host)}
        />
        <SidebarResizer onResize={(w) => setSetting("sidebarWidth", w)} />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabsBar onNewTab={() => setPaletteOpen(true)} />
          <section className="relative min-h-0 flex-1 bg-(--color-bg)">
            {tabs.length === 0 ? (
              <Workspace
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenSession={handleOpenSession}
                onNewHost={() => setNewHostOpen(true)}
                onImport={() => setImportOpen(true)}
                onOpenLocal={handleOpenLocal}
              />
            ) : (
              // Keep every session pane mounted so the underlying xterm.js
              // buffers (scrollback, current line, cursor pos) survive tab
              // switches.
              //
              // We use `visibility: hidden` + `pointer-events: none` rather
              // than `display: none` on purpose: display:none would collapse
              // the container to 0×0, then ResizeObserver would fire when we
              // come back, trigger fit.fit(), and term.resize() would send a
              // SIGWINCH to the remote shell — which redraws its prompt and
              // wipes the visible buffer (the bug the user kept hitting).
              // `visibility: hidden` keeps the layout intact, so dimensions
              // never change across tab switches.
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 h-full w-full",
                    tab.id === activeTabId ? "z-10" : "invisible pointer-events-none",
                  )}
                  aria-hidden={tab.id !== activeTabId}
                >
                  <SessionPane tab={tab} />
                </div>
              ))
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
        onOpenLocal={handleOpenLocal}
        onOpenSnippets={() => setSnippetsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />
      <HostFormDialog open={newHostOpen} onOpenChange={setNewHostOpen} host={null} />
      <ImportSshConfigDialog open={importOpen} onOpenChange={setImportOpen} />
      <PortForwardsDialog
        open={forwardsForHost !== null}
        host={forwardsForHost}
        onOpenChange={(o) => !o && setForwardsForHost(null)}
      />
      <RestoreSessionsDialog
        open={restoreOpen}
        tabs={restorableTabs}
        onRestore={onRestoreConfirm}
        onSkip={onRestoreSkip}
      />

      <SnippetsPanel open={snippetsOpen} onOpenChange={setSnippetsOpen} />
      <CommandHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

      <UnlockOverlay />
    </div>
  );
}
