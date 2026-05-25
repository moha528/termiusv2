import { Loader2, Radio, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { withToast } from "@/lib/feedback";
import { keyvaultApi } from "@/lib/keyvault";
import { cn } from "@/lib/utils";
import type { LayoutNode, SessionTab, SplitDirection, SplitPath } from "@/stores/useSessionsStore";
import { isPendingSession, useSessionsStore } from "@/stores/useSessionsStore";

import { TerminalView } from "./TerminalView";

type Props = {
  tab: SessionTab;
  onClosed: (reason: string) => void;
};

/**
 * Render the recursive layout tree of an SSH tab. When `tab.layout` is
 * undefined we fall through to a single TerminalView, which is the
 * single-pane fast path.
 */
export function SplitLayout({ tab, onClosed }: Props) {
  const kind = tab.type === "local" ? "local" : "ssh";
  // Both SSH and local panes can be split. SFTP can't (single-pane file view).
  const canSplit = tab.type === "ssh" || tab.type === "local";

  // Resolve the broadcast group from the store. Only panes inside this set
  // exchange keystrokes; we filter unknown leaves so closing a peer
  // automatically removes it from the active broadcast.
  const broadcastGroup = useSessionsStore((s) => s.broadcastGroups[tab.id] ?? null);
  const allLeaves = useMemo(
    () =>
      tab.layout
        ? collectLeaves(tab.layout)
        : tab.status.kind === "open"
          ? [tab.status.sessionId]
          : [],
    [tab.layout, tab.status],
  );
  const activeGroup = useMemo(
    () => (broadcastGroup ? broadcastGroup.filter((id) => allLeaves.includes(id)) : null),
    [broadcastGroup, allLeaves],
  );

  if (!tab.layout) {
    if (tab.status.kind !== "open") return null;
    return (
      <PaneShell
        tabId={tab.id}
        sessionId={tab.status.sessionId}
        canSplit={canSplit}
        canBroadcast={false}
        broadcasting={false}
      >
        <TerminalView
          sessionId={tab.status.sessionId}
          kind={kind}
          hostId={tab.host.id}
          hostLabel={tab.host.label}
          onClosed={onClosed}
        />
      </PaneShell>
    );
  }
  return (
    <LayoutTreeView
      tab={tab}
      node={tab.layout}
      path={[]}
      onClosed={onClosed}
      activeGroup={activeGroup}
      allLeaves={allLeaves}
    />
  );
}

function collectLeaves(node: LayoutNode): string[] {
  return node.kind === "leaf"
    ? [node.sessionId]
    : [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

function LayoutTreeView({
  tab,
  node,
  path,
  onClosed,
  activeGroup,
  allLeaves,
}: {
  tab: SessionTab;
  node: LayoutNode;
  path: SplitPath;
  onClosed: (reason: string) => void;
  activeGroup: string[] | null;
  allLeaves: string[];
}) {
  const kind = tab.type === "local" ? "local" : "ssh";
  const canSplit = tab.type === "ssh" || tab.type === "local";
  const canBroadcast = allLeaves.length >= 2;
  if (node.kind === "leaf") {
    // A "pending-*" sessionId is a placeholder while the backend session is
    // still being opened (cf. useSessionsStore.splitPane). We render a local
    // spinner here so the user sees the new pane appear in the right place
    // straight away instead of waiting for the IPC.
    if (isPendingSession(node.sessionId)) {
      return (
        <PaneShell
          tabId={tab.id}
          sessionId={node.sessionId}
          canSplit={false}
          canBroadcast={false}
          broadcasting={false}
        >
          <PaneSpinner label={tab.type === "local" ? "Démarrage du shell…" : "Connexion…"} />
        </PaneShell>
      );
    }
    const inGroup = activeGroup?.includes(node.sessionId) ?? false;
    const peers = inGroup && activeGroup ? activeGroup.filter((id) => id !== node.sessionId) : [];
    const broadcast = inGroup && peers.length > 0 ? { peerSessionIds: peers } : undefined;
    return (
      <PaneShell
        tabId={tab.id}
        sessionId={node.sessionId}
        canSplit={canSplit}
        canBroadcast={canBroadcast}
        broadcasting={inGroup}
      >
        <TerminalView
          sessionId={node.sessionId}
          kind={kind}
          hostId={tab.host.id}
          hostLabel={tab.host.label}
          onClosed={onClosed}
          broadcast={broadcast}
        />
      </PaneShell>
    );
  }
  return (
    <SplitView
      tab={tab}
      node={node}
      path={path}
      onClosed={onClosed}
      activeGroup={activeGroup}
      allLeaves={allLeaves}
    />
  );
}

function PaneSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-(--color-bg) text-(--color-muted)">
      <Loader2 className="h-5 w-5 animate-spin text-(--color-accent)" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

function SplitView({
  tab,
  node,
  path,
  onClosed,
  activeGroup,
  allLeaves,
}: {
  tab: SessionTab;
  node: Extract<LayoutNode, { kind: "split" }>;
  path: SplitPath;
  onClosed: (reason: string) => void;
  activeGroup: string[] | null;
  allLeaves: string[];
}) {
  const setSplitRatio = useSessionsStore((s) => s.setSplitRatio);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isHorizontal = node.direction === "horizontal";

  const onDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const onMove = (ev: MouseEvent) => {
        const pos = isHorizontal
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
        setSplitRatio(tab.id, path, pos);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isHorizontal, setSplitRatio, tab.id, path],
  );

  const pctFirst = `${Math.round(node.ratio * 100)}%`;
  const pctSecond = `${Math.round((1 - node.ratio) * 100)}%`;

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full w-full", isHorizontal ? "flex-row" : "flex-col")}
    >
      <div
        style={isHorizontal ? { width: pctFirst } : { height: pctFirst }}
        className="min-w-0 min-h-0"
      >
        <LayoutTreeView
          tab={tab}
          node={node.first}
          path={[...path, "first"]}
          onClosed={onClosed}
          activeGroup={activeGroup}
          allLeaves={allLeaves}
        />
      </div>
      <div
        onMouseDown={onDrag}
        aria-label="Resize split"
        className={cn(
          "shrink-0 bg-(--color-border) hover:bg-(--color-accent)/60 transition-colors",
          isHorizontal ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
        )}
      >
        <div className={cn("h-full w-full", isHorizontal ? "-ml-1.5 w-3" : "-mt-1.5 h-3")} />
      </div>
      <div
        style={isHorizontal ? { width: pctSecond } : { height: pctSecond }}
        className="min-w-0 min-h-0"
      >
        <LayoutTreeView
          tab={tab}
          node={node.second}
          path={[...path, "second"]}
          onClosed={onClosed}
          activeGroup={activeGroup}
          allLeaves={allLeaves}
        />
      </div>
    </div>
  );
}

function PaneShell({
  tabId,
  sessionId,
  canSplit,
  canBroadcast,
  broadcasting,
  children,
}: {
  tabId: string;
  sessionId: string;
  /** Disabled for SFTP tabs or while a pane is in `pending` state. */
  canSplit: boolean;
  /** True when the tab has at least 2 leaves, so a broadcast group makes sense. */
  canBroadcast: boolean;
  /** True when this pane is currently part of the tab's broadcast group. */
  broadcasting: boolean;
  children: React.ReactNode;
}) {
  const splitPane = useSessionsStore((s) => s.splitPane);
  const closePane = useSessionsStore((s) => s.closePane);
  const setBroadcastGroup = useSessionsStore((s) => s.setBroadcastGroup);
  const tab = useSessionsStore((s) => s.tabs.find((t) => t.id === tabId));
  const existingGroup = useSessionsStore((s) => s.broadcastGroups[tabId]);
  // Local guard against rapid clicks creating multiple splits. The optimistic
  // layout placeholder means the user already sees the new pane right away;
  // we just block the toolbar buttons until that pane is fully ready.
  const [busy, setBusy] = useState(false);

  const doSplit = useCallback(
    async (direction: SplitDirection) => {
      if (!tab || busy) return;
      setBusy(true);
      try {
        if (tab.type === "local") {
          await withToast(splitPane(tabId, sessionId, direction), {
            loading: "Ouverture d'un nouveau pane…",
            success: "Pane ouvert",
          });
          return;
        }
        // SSH split: reuse the keychain password silently if available.
        const pwd = await keyvaultApi.get(tab.host.id);
        if (!pwd) {
          console.warn("split needs a saved password");
          return;
        }
        await withToast(splitPane(tabId, sessionId, direction, pwd), {
          loading: `Connexion d'un nouveau pane à ${tab.host.label}…`,
          success: "Pane connecté",
        });
      } catch (e) {
        console.warn("splitPane:", e);
      } finally {
        setBusy(false);
      }
    },
    [splitPane, tab, tabId, sessionId, busy],
  );

  const toggleBroadcast = useCallback(() => {
    if (!tab) return;
    const layoutLeaves = tab.layout
      ? collectLeaves(tab.layout)
      : tab.status.kind === "open"
        ? [tab.status.sessionId]
        : [];
    const current = existingGroup ?? [];
    if (current.includes(sessionId)) {
      // Remove this pane. If the group falls below 2 members, clear it
      // entirely — a one-pane group has no broadcast effect anyway.
      const next = current.filter((id) => id !== sessionId);
      setBroadcastGroup(tabId, next.length >= 2 ? next : []);
    } else if (current.length === 0) {
      // Bootstrap: opt every leaf in. This matches the "Sync all" mental
      // model where toggling broadcast on a split syncs the whole tab
      // unless the user later unchecks panes.
      setBroadcastGroup(tabId, layoutLeaves);
    } else {
      setBroadcastGroup(tabId, [...current, sessionId]);
    }
  }, [tab, existingGroup, sessionId, tabId, setBroadcastGroup]);

  return (
    <div className="group relative flex h-full w-full flex-col">
      <PaneToolbar
        canSplit={canSplit}
        canBroadcast={canBroadcast}
        broadcasting={broadcasting}
        busy={busy}
        onSplitH={() => doSplit("horizontal")}
        onSplitV={() => doSplit("vertical")}
        onToggleBroadcast={toggleBroadcast}
        onClose={() => closePane(tabId, sessionId)}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function PaneToolbar({
  canSplit,
  canBroadcast,
  broadcasting,
  busy,
  onSplitH,
  onSplitV,
  onToggleBroadcast,
  onClose,
}: {
  canSplit: boolean;
  canBroadcast: boolean;
  broadcasting: boolean;
  busy: boolean;
  onSplitH: () => void;
  onSplitV: () => void;
  onToggleBroadcast: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute right-2 top-1 z-10 flex items-center gap-0.5 rounded-md bg-(--color-bg-soft)/80 p-0.5 backdrop-blur transition-opacity",
        // When a pane is broadcasting we keep the toolbar visible so the
        // user has an obvious "leave the group" button without having to
        // hover-hunt.
        broadcasting ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
    >
      {canSplit && busy && (
        <span
          title="Ouverture d'un pane…"
          className="grid h-6 w-6 place-items-center text-(--color-accent)"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      )}
      {canSplit && !busy && (
        <>
          <ToolbarBtn label="Split horizontal" onClick={onSplitH}>
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn label="Split vertical" onClick={onSplitV}>
            <SplitSquareVertical className="h-3.5 w-3.5" />
          </ToolbarBtn>
        </>
      )}
      {canBroadcast && (
        <ToolbarBtn
          label={
            broadcasting
              ? "Désactiver la synchro d'input"
              : "Synchroniser l'input avec les autres panes"
          }
          onClick={onToggleBroadcast}
          active={broadcasting}
        >
          <Radio className="h-3.5 w-3.5" />
        </ToolbarBtn>
      )}
      <ToolbarBtn label="Close pane" onClick={onClose} disabled={busy}>
        <X className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded p-1 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed",
        active
          ? "bg-(--color-accent-bg)/50 text-(--color-accent)"
          : "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)",
      )}
    >
      {children}
    </button>
  );
}
