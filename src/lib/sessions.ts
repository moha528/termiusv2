import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";

export const sessionsApi = {
  open: (hostId: string, password: string) =>
    invoke<string>("open_ssh_session", { hostId, password }),
  sendInput: (sessionId: string, data: string) =>
    invoke<void>("send_terminal_input", { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),
  close: (sessionId: string) => invoke<void>("close_session", { sessionId }),
};

/**
 * Subscribe to the byte stream of a live session. The backend emits raw
 * `Uint8Array` payloads — we decode them as UTF-8 for xterm.js consumption.
 */
export function onTerminalData(
  sessionId: string,
  handler: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<number[] | Uint8Array>(`terminal-data-${sessionId}`, (event) => {
    const payload = event.payload;
    const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    handler(bytes);
  });
}

export type SessionClosedEvent = {
  session_id: string;
  reason: string;
};

export function onSessionClosed(
  sessionId: string,
  handler: (ev: SessionClosedEvent) => void,
): Promise<UnlistenFn> {
  return listen<SessionClosedEvent>(`session-closed-${sessionId}`, (event) => {
    handler(event.payload);
  });
}
