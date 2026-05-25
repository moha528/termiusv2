import { localTermApi, sessionsApi } from "@/lib/sessions";
import {
  type LayoutNode,
  type SessionTab,
  type SessionTabType,
  useSessionsStore,
} from "@/stores/useSessionsStore";

function leafSessionIds(node: LayoutNode): string[] {
  return node.kind === "leaf"
    ? [node.sessionId]
    : [...leafSessionIds(node.first), ...leafSessionIds(node.second)];
}

export type ActiveTerminal = {
  sessionId: string;
  type: Exclude<SessionTabType, "sftp">;
  hostId: string;
  hostLabel: string;
  hostUsername: string;
};

/**
 * Best-effort resolution of "the terminal the user currently sees" for
 * features like snippet insertion and history replay:
 *
 *   1. If the focused pane (last clicked / typed in) is still alive in the
 *      active tab, target it.
 *   2. Else fall back to the active tab's main session id (single-pane fast
 *      path) or the first leaf of its layout.
 *
 * Returns `null` when no SSH/local tab is open or its session is not yet
 * established (still in `connecting` or `closed`).
 */
export function resolveActiveTerminal(): ActiveTerminal | null {
  const { tabs, activeTabId, focusedSessionId } = useSessionsStore.getState();
  const tab = tabs.find((t): t is SessionTab => t.id === activeTabId);
  if (!tab || tab.type === "sftp") return null;

  const candidates = tab.layout
    ? leafSessionIds(tab.layout)
    : tab.status.kind === "open"
      ? [tab.status.sessionId]
      : [];
  if (candidates.length === 0) return null;

  const sessionId =
    focusedSessionId && candidates.includes(focusedSessionId) ? focusedSessionId : candidates[0];
  return {
    sessionId,
    type: tab.type === "local" ? "local" : "ssh",
    hostId: tab.host.id,
    hostLabel: tab.host.label,
    hostUsername: tab.host.username,
  };
}

/**
 * Push a textual payload to whichever terminal `resolveActiveTerminal`
 * resolves to. The string is sent as-is — callers append a trailing newline
 * themselves when they want the shell to actually execute the command.
 *
 * Returns `false` when no eligible terminal was open.
 */
export async function sendToActiveTerminal(payload: string): Promise<boolean> {
  const target = resolveActiveTerminal();
  if (!target) return false;
  const api = target.type === "local" ? localTermApi : sessionsApi;
  await api.sendInput(target.sessionId, payload);
  return true;
}
