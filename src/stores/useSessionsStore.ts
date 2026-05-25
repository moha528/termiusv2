import { create } from "zustand";

import type { Host } from "@/lib/bindings/Host";
import { localTermApi, sessionsApi } from "@/lib/sessions";

/**
 * State of an individual session tab.
 *
 * - `connecting`: the open IPC was issued but hasn't resolved yet. We render
 *   a spinner so the user knows we're working on it (DNS, TCP, SSH handshake,
 *   PTY allocation can take several seconds).
 * - `open`: PTY (for ssh/local tabs) or SFTP subsystem is running.
 * - `closed`: peer-initiated or local close; the tab survives so the user can reconnect.
 */
export type SessionStatus =
  | { kind: "connecting" }
  | { kind: "open"; sessionId: string }
  | { kind: "closed"; sessionId: string | null; reason: string };

export type SessionTabType = "ssh" | "sftp" | "local";

/**
 * Synthetic Host placeholder used by local terminal tabs. The fields are
 * filled with values that make the rest of the UI render sensibly without
 * a special-case branch (no DB round-trip — local tabs are never persisted
 * to the hosts table).
 */
export const LOCAL_HOST: Host = {
  id: "__local__",
  label: "Local",
  hostname: "localhost",
  port: 0,
  username: "local",
  group_id: null,
  proxy_jump_host_id: null,
  identity_id: null,
  agent_forward: false,
  log_to_file: false,
  pre_connect_script: "",
  post_connect_script: "",
  created_at: "",
  updated_at: "",
};

export type SplitDirection = "horizontal" | "vertical";

/**
 * Recursive layout used by SSH tabs to support tmux-style splits.
 *
 * A `leaf` corresponds to a single terminal pane driven by a backend session.
 * A `split` recursively holds two children; `ratio` is the fraction (0..1) of
 * the available space allocated to `first`. We deliberately keep the tree
 * balanced as a binary tree — nested splits give the same flexibility as
 * tmux without juggling N-ary children.
 */
export type LayoutLeaf = { kind: "leaf"; sessionId: string };
export type LayoutSplit = {
  kind: "split";
  direction: SplitDirection;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};
export type LayoutNode = LayoutLeaf | LayoutSplit;

export type SessionTab = {
  /** Stable tab id (separate from backend sessionId so reconnects keep the tab). */
  id: string;
  host: Host;
  /** Customizable title; defaults to host.label (+ suffix for sftp). */
  title: string;
  type: SessionTabType;
  status: SessionStatus;
  /**
   * When set on an SSH tab, render this layout tree instead of the single-pane
   * status. SFTP tabs ignore it. A tab with only one pane keeps `layout`
   * undefined (the `status.sessionId` is enough).
   */
  layout?: LayoutNode;
};

type SessionsState = {
  tabs: SessionTab[];
  activeTabId: string | null;
  /**
   * Session id of the pane that last received user focus across the whole app.
   * Used by features like "send snippet to terminal" that need to target the
   * pane the user is actually looking at, not just the first leaf of the tab.
   * `null` when no pane has been focused yet (e.g. fresh app).
   */
  focusedSessionId: string | null;
  setFocusedSession: (sessionId: string | null) => void;

  /**
   * Per-tab "broadcast input" groups (P4-T04). Each tab id maps to a set of
   * session ids that share keystrokes. When typing in a pane that belongs
   * to the group, `TerminalView` mirrors the input to every peer. A tab
   * without an entry → no broadcast.
   */
  broadcastGroups: Record<string, string[]>;
  /** Replace the broadcast group for a tab; pass empty array to disable. */
  setBroadcastGroup: (tabId: string, sessionIds: string[]) => void;

  openTab: (host: Host, password: string, type?: SessionTabType) => Promise<string>;
  /** Spawn a fresh local-shell tab. Returns the new tab id. */
  openLocalTab: (shell?: string) => Promise<string>;
  reconnect: (tabId: string, password: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActive: (tabId: string) => void;
  setTitle: (tabId: string, title: string) => void;
  markClosed: (tabId: string, reason: string) => void;
  restoreClosedTab: (host: Host, type: SessionTabType, title: string) => string;

  /**
   * Split the pane identified by `sessionId` inside `tabId` along
   * `direction`. For SSH tabs a `password` is required (we open a new
   * SSH session to the same host). For local tabs we just spawn a fresh
   * shell, so `password` is ignored.
   */
  splitPane: (
    tabId: string,
    sessionId: string,
    direction: SplitDirection,
    password?: string,
  ) => Promise<void>;

  /** Close the pane identified by `sessionId`; collapses the layout. */
  closePane: (tabId: string, sessionId: string) => Promise<void>;

  /** Adjust the ratio of the split that has `sessionId` as a descendant. */
  setSplitRatio: (tabId: string, splitPath: SplitPath, ratio: number) => void;
};

/** Address a split node by the sequence of "first"/"second" turns to reach it. */
export type SplitPath = Array<"first" | "second">;

function tabId(): string {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}

function titleFor(host: Host, type: SessionTabType): string {
  if (type === "sftp") return `${host.label} · SFTP`;
  if (type === "local") return host.label;
  return host.label;
}

/** Walk the tree, return all leaf session ids in order. */
function leaves(node: LayoutNode): string[] {
  return node.kind === "leaf" ? [node.sessionId] : [...leaves(node.first), ...leaves(node.second)];
}

/** Build a split node replacing the leaf with sessionId by a fresh split. */
function splitAt(
  node: LayoutNode,
  target: string,
  direction: SplitDirection,
  newSessionId: string,
): LayoutNode {
  if (node.kind === "leaf") {
    if (node.sessionId !== target) return node;
    return {
      kind: "split",
      direction,
      ratio: 0.5,
      first: { kind: "leaf", sessionId: target },
      second: { kind: "leaf", sessionId: newSessionId },
    };
  }
  return {
    ...node,
    first: splitAt(node.first, target, direction, newSessionId),
    second: splitAt(node.second, target, direction, newSessionId),
  };
}

/** Replace every leaf whose sessionId matches `from` by `to`. */
function replaceLeafSessionId(node: LayoutNode, from: string, to: string): LayoutNode {
  if (node.kind === "leaf") {
    return node.sessionId === from ? { ...node, sessionId: to } : node;
  }
  return {
    ...node,
    first: replaceLeafSessionId(node.first, from, to),
    second: replaceLeafSessionId(node.second, from, to),
  };
}

/** Prefix marking a leaf whose backend session is still being established. */
export const PENDING_SESSION_PREFIX = "pending-";

export function isPendingSession(sessionId: string): boolean {
  return sessionId.startsWith(PENDING_SESSION_PREFIX);
}

/** Remove the leaf with `target`, returning the simplified tree or null when empty. */
function removeLeaf(node: LayoutNode, target: string): LayoutNode | null {
  if (node.kind === "leaf") {
    return node.sessionId === target ? null : node;
  }
  const first = removeLeaf(node.first, target);
  const second = removeLeaf(node.second, target);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

/** Apply a ratio change at `path`. Returns the original tree if path is invalid. */
function setRatioAt(node: LayoutNode, path: SplitPath, ratio: number): LayoutNode {
  if (path.length === 0) {
    if (node.kind === "split") {
      return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
    }
    return node;
  }
  if (node.kind !== "split") return node;
  const [head, ...rest] = path;
  if (head === "first") {
    return { ...node, first: setRatioAt(node.first, rest, ratio) };
  }
  return { ...node, second: setRatioAt(node.second, rest, ratio) };
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  focusedSessionId: null,
  broadcastGroups: {},

  setFocusedSession(sessionId) {
    set({ focusedSessionId: sessionId });
  },

  setBroadcastGroup(tabId, sessionIds) {
    const next = { ...get().broadcastGroups };
    if (sessionIds.length === 0) {
      delete next[tabId];
    } else {
      next[tabId] = sessionIds;
    }
    set({ broadcastGroups: next });
  },

  async openTab(host, password, type = "ssh") {
    // Create the tab synchronously in `connecting` state and switch to it so
    // the user gets immediate visual feedback — the spinner pane shows what
    // we're connecting to while the SSH handshake (DNS + TCP + auth + PTY)
    // happens in the background. The status flips to `open` or `closed`
    // once the IPC resolves.
    const id = tabId();
    const tab: SessionTab = {
      id,
      host,
      title: titleFor(host, type),
      type,
      status: { kind: "connecting" },
    };
    set({ tabs: [...get().tabs, tab], activeTabId: id });

    try {
      const sessionId = await sessionsApi.open(host.id, password);
      patch(set, get, id, { status: { kind: "open", sessionId } });
      return id;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      patch(set, get, id, {
        status: { kind: "closed", sessionId: null, reason },
      });
      throw e;
    }
  },

  async openLocalTab(shell) {
    const id = tabId();
    const existing = get().tabs.filter((t) => t.type === "local").length;
    const tab: SessionTab = {
      id,
      host: LOCAL_HOST,
      title: existing === 0 ? "Local" : `Local ${existing + 1}`,
      type: "local",
      status: { kind: "connecting" },
    };
    set({ tabs: [...get().tabs, tab], activeTabId: id });

    try {
      const sessionId = await localTermApi.open(shell);
      patch(set, get, id, { status: { kind: "open", sessionId } });
      return id;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      patch(set, get, id, {
        status: { kind: "closed", sessionId: null, reason },
      });
      throw e;
    }
  },

  async reconnect(id, password) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    patch(set, get, id, { status: { kind: "connecting" }, layout: undefined });
    try {
      const sessionId =
        tab.type === "local"
          ? await localTermApi.open()
          : await sessionsApi.open(tab.host.id, password);
      patch(set, get, id, { status: { kind: "open", sessionId } });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      patch(set, get, id, { status: { kind: "closed", sessionId: null, reason } });
      throw e;
    }
  },

  async closeTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab) {
      // Close every backend session held by this tab (single pane or every
      // leaf in the layout). Errors are swallowed — the tab disappears either way.
      const sessionIds = tab.layout
        ? leaves(tab.layout)
        : tab.status.kind === "open"
          ? [tab.status.sessionId]
          : [];
      const close = tab.type === "local" ? localTermApi.close : sessionsApi.close;
      for (const sid of sessionIds) {
        try {
          await close(sid);
        } catch (e) {
          console.warn("close session:", e);
        }
      }
    }
    const remaining = get().tabs.filter((t) => t.id !== id);
    const nextActive =
      get().activeTabId === id ? (remaining.at(-1)?.id ?? null) : get().activeTabId;
    set({ tabs: remaining, activeTabId: nextActive });
  },

  setActive(id) {
    set({ activeTabId: id });
  },

  setTitle(id, title) {
    patch(set, get, id, { title });
  },

  markClosed(id, reason) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const sessionId = tab.status.kind === "open" ? tab.status.sessionId : null;
    patch(set, get, id, { status: { kind: "closed", sessionId, reason } });
  },

  restoreClosedTab(host, type, title) {
    const id = tabId();
    const tab: SessionTab = {
      id,
      host,
      title: title || titleFor(host, type),
      type,
      status: { kind: "closed", sessionId: null, reason: "session précédente" },
    };
    set({ tabs: [...get().tabs, tab], activeTabId: get().activeTabId ?? id });
    return id;
  },

  async splitPane(tabId, sessionId, direction, password) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.type === "sftp") return; // sftp panes can't be split

    // Optimistic layout: insert a placeholder leaf with a pending sessionId
    // straight away so the user sees the split appear, with a loader in the
    // new pane. The real backend session id replaces the placeholder when
    // the IPC resolves; on failure we revert by removing the placeholder.
    const pendingId = `${PENDING_SESSION_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
    const currentLayout: LayoutNode = tab.layout ?? { kind: "leaf", sessionId };
    const optimisticLayout = splitAt(currentLayout, sessionId, direction, pendingId);
    patch(set, get, tabId, { layout: optimisticLayout });

    try {
      const newSessionId =
        tab.type === "local"
          ? await localTermApi.open()
          : await (async () => {
              if (!password) throw new Error("password required for SSH split");
              return sessionsApi.open(tab.host.id, password);
            })();
      const after = get().tabs.find((t) => t.id === tabId);
      if (!after?.layout) return;
      patch(set, get, tabId, {
        layout: replaceLeafSessionId(after.layout, pendingId, newSessionId),
      });
    } catch (e) {
      // Revert: drop the pending leaf, possibly collapsing the split back
      // to a single pane.
      const after = get().tabs.find((t) => t.id === tabId);
      if (after?.layout) {
        const reverted = removeLeaf(after.layout, pendingId);
        // If the layout collapses to a single leaf, drop it back to undefined
        // so the SSH single-pane fast path kicks in.
        patch(set, get, tabId, {
          layout: reverted && reverted.kind === "split" ? reverted : undefined,
        });
      }
      throw e;
    }
  },

  async closePane(tabId, sessionId) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const close = tab.type === "local" ? localTermApi.close : sessionsApi.close;
    try {
      await close(sessionId);
    } catch (e) {
      console.warn("close session:", e);
    }
    if (!tab.layout) {
      // Single-pane SSH tab — close the whole tab.
      await get().closeTab(tabId);
      return;
    }
    const next = removeLeaf(tab.layout, sessionId);
    if (!next) {
      await get().closeTab(tabId);
      return;
    }
    // Collapse a single-leaf layout back to undefined for simplicity.
    if (next.kind === "leaf") {
      patch(set, get, tabId, {
        layout: undefined,
        status: { kind: "open", sessionId: next.sessionId },
      });
    } else {
      patch(set, get, tabId, { layout: next });
    }
  },

  setSplitRatio(tabId, splitPath, ratio) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab?.layout) return;
    patch(set, get, tabId, { layout: setRatioAt(tab.layout, splitPath, ratio) });
  },
}));

function patch(
  set: (s: Partial<SessionsState>) => void,
  get: () => SessionsState,
  id: string,
  fields: Partial<SessionTab>,
) {
  set({
    tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...fields } : t)),
  });
}
