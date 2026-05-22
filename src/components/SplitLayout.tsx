import { SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { useCallback, useRef } from "react";

import { keyvaultApi } from "@/lib/keyvault";
import { cn } from "@/lib/utils";
import type { LayoutNode, SessionTab, SplitDirection, SplitPath } from "@/stores/useSessionsStore";
import { useSessionsStore } from "@/stores/useSessionsStore";

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
  if (!tab.layout) {
    if (tab.status.kind !== "open") return null;
    return (
      <PaneShell tabId={tab.id} sessionId={tab.status.sessionId}>
        <TerminalView sessionId={tab.status.sessionId} onClosed={onClosed} />
      </PaneShell>
    );
  }
  return <LayoutTreeView tab={tab} node={tab.layout} path={[]} onClosed={onClosed} />;
}

function LayoutTreeView({
  tab,
  node,
  path,
  onClosed,
}: {
  tab: SessionTab;
  node: LayoutNode;
  path: SplitPath;
  onClosed: (reason: string) => void;
}) {
  if (node.kind === "leaf") {
    return (
      <PaneShell tabId={tab.id} sessionId={node.sessionId}>
        <TerminalView sessionId={node.sessionId} onClosed={onClosed} />
      </PaneShell>
    );
  }
  return <SplitView tab={tab} node={node} path={path} onClosed={onClosed} />;
}

function SplitView({
  tab,
  node,
  path,
  onClosed,
}: {
  tab: SessionTab;
  node: Extract<LayoutNode, { kind: "split" }>;
  path: SplitPath;
  onClosed: (reason: string) => void;
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
        <LayoutTreeView tab={tab} node={node.first} path={[...path, "first"]} onClosed={onClosed} />
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
        />
      </div>
    </div>
  );
}

function PaneShell({
  tabId,
  sessionId,
  children,
}: {
  tabId: string;
  sessionId: string;
  children: React.ReactNode;
}) {
  const splitPane = useSessionsStore((s) => s.splitPane);
  const closePane = useSessionsStore((s) => s.closePane);
  const tab = useSessionsStore((s) => s.tabs.find((t) => t.id === tabId));

  const doSplit = useCallback(
    async (direction: SplitDirection) => {
      if (!tab) return;
      const pwd = await keyvaultApi.get(tab.host.id);
      if (!pwd) {
        // No saved password — surface a tiny inline hint and bail.
        // (Could pop the ConnectDialog later but a saved password is the common path.)
        console.warn("split needs a saved password");
        return;
      }
      try {
        await splitPane(tabId, sessionId, direction, pwd);
      } catch (e) {
        console.warn("splitPane:", e);
      }
    },
    [splitPane, tab, tabId, sessionId],
  );

  return (
    <div className="group relative flex h-full w-full flex-col">
      <PaneToolbar
        onSplitH={() => doSplit("horizontal")}
        onSplitV={() => doSplit("vertical")}
        onClose={() => closePane(tabId, sessionId)}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function PaneToolbar({
  onSplitH,
  onSplitV,
  onClose,
}: {
  onSplitH: () => void;
  onSplitV: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-2 top-1 z-10 flex items-center gap-0.5 rounded-md bg-(--color-bg-soft)/80 p-0.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
      <ToolbarBtn label="Split horizontal" onClick={onSplitH}>
        <SplitSquareHorizontal className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn label="Split vertical" onClick={onSplitV}>
        <SplitSquareVertical className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn label="Close pane" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
    >
      {children}
    </button>
  );
}
