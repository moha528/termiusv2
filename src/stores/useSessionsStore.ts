import type { Host } from "@/lib/bindings/Host";
import { sessionsApi } from "@/lib/sessions";
import { create } from "zustand";

/**
 * State of an individual session tab.
 *
 * - `connecting`: backend command in flight, no session id yet.
 * - `open`: PTY running, terminal rendered.
 * - `closed`: peer-initiated or local close; the tab survives so the user can reconnect.
 * - `error`: the open command failed (auth, network, TOFU mismatch). `message` carries the cause.
 */
export type SessionStatus =
  | { kind: "connecting" }
  | { kind: "open"; sessionId: string }
  | { kind: "closed"; sessionId: string | null; reason: string }
  | { kind: "error"; message: string };

export type SessionTab = {
  /** Stable tab id (separate from the backend sessionId so reconnects keep the tab). */
  id: string;
  host: Host;
  /** Customizable title; defaults to host.label. */
  title: string;
  type: "ssh";
  status: SessionStatus;
};

type SessionsState = {
  tabs: SessionTab[];
  activeTabId: string | null;

  openTab: (host: Host, password: string) => Promise<string>;
  reconnect: (tabId: string, password: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActive: (tabId: string) => void;
  setTitle: (tabId: string, title: string) => void;
  /** Called by TerminalView when the backend emits `session-closed-{id}`. */
  markClosed: (tabId: string, reason: string) => void;
};

function tabId(): string {
  return `tab-${Math.random().toString(36).slice(2, 10)}`;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  async openTab(host, password) {
    const id = tabId();
    const tab: SessionTab = {
      id,
      host,
      title: host.label,
      type: "ssh",
      status: { kind: "connecting" },
    };
    set({ tabs: [...get().tabs, tab], activeTabId: id });

    try {
      const sessionId = await sessionsApi.open(host.id, password);
      patch(set, get, id, { status: { kind: "open", sessionId } });
      return id;
    } catch (e) {
      patch(set, get, id, { status: { kind: "error", message: String(e) } });
      throw e;
    }
  },

  async reconnect(id, password) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    patch(set, get, id, { status: { kind: "connecting" } });
    try {
      const sessionId = await sessionsApi.open(tab.host.id, password);
      patch(set, get, id, { status: { kind: "open", sessionId } });
    } catch (e) {
      patch(set, get, id, { status: { kind: "error", message: String(e) } });
    }
  },

  async closeTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab?.status.kind === "open") {
      try {
        await sessionsApi.close(tab.status.sessionId);
      } catch (e) {
        console.warn("close_session:", e);
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
