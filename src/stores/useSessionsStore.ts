import { create } from "zustand";

import type { Host } from "@/lib/bindings/Host";
import { sessionsApi } from "@/lib/sessions";

/**
 * State of an individual session tab.
 *
 * - `open`: PTY (for ssh tabs) or SFTP subsystem is running.
 * - `closed`: peer-initiated or local close; the tab survives so the user can reconnect.
 */
export type SessionStatus =
  | { kind: "open"; sessionId: string }
  | { kind: "closed"; sessionId: string | null; reason: string };

export type SessionTabType = "ssh" | "sftp";

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

  openTab: (host: Host, password: string, type?: SessionTabType) => Promise<string>;
  reconnect: (tabId: string, password: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActive: (tabId: string) => void;
  setTitle: (tabId: string, title: string) => void;
  markClosed: (tabId: string, reason: string) => void;
  restoreClosedTab: (host: Host, type: SessionTabType, title: string) => string;

  /**
   * Split the pane identified by `sessionId` inside `tabId` along
   * `direction`, opening a fresh SSH session to the same host with `password`.
   * Throws if auth fails.
   */
  splitPane: (
    tabId: string,
    sessionId: string,
    direction: SplitDirection,
    password: string,
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
  return type === "sftp" ? `${host.label} · SFTP` : host.label;
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

  async openTab(host, password, type = "ssh") {
    const sessionId = await sessionsApi.open(host.id, password);
    const id = tabId();
    const tab: SessionTab = {
      id,
      host,
      title: titleFor(host, type),
      type,
      status: { kind: "open", sessionId },
    };
    set({ tabs: [...get().tabs, tab], activeTabId: id });
    return id;
  },

  async reconnect(id, password) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const sessionId = await sessionsApi.open(tab.host.id, password);
    patch(set, get, id, { status: { kind: "open", sessionId }, layout: undefined });
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
      for (const sid of sessionIds) {
        try {
          await sessionsApi.close(sid);
        } catch (e) {
          console.warn("close_session:", e);
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
    if (!tab || tab.type !== "ssh") return;
    const newSessionId = await sessionsApi.open(tab.host.id, password);
    const currentLayout: LayoutNode = tab.layout ?? {
      kind: "leaf",
      sessionId,
    };
    const nextLayout = splitAt(currentLayout, sessionId, direction, newSessionId);
    patch(set, get, tabId, { layout: nextLayout });
  },

  async closePane(tabId, sessionId) {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    try {
      await sessionsApi.close(sessionId);
    } catch (e) {
      console.warn("close_session:", e);
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
