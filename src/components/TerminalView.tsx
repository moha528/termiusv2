import type { UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef } from "react";

import { localTermApi, onSessionClosed, onTerminalData, sessionsApi } from "@/lib/sessions";
import { getTheme } from "@/lib/themes";
import { useSessionsStore } from "@/stores/useSessionsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTerminalSearchStore } from "@/stores/useTerminalSearchStore";

import { TerminalSearchBar } from "./TerminalSearchBar";

export type TerminalKind = "ssh" | "local";

type Props = {
  sessionId: string;
  /** Whether to route IPC through the SSH or the local-shell backend. */
  kind?: TerminalKind;
  /** Host id for SSH sessions, used to scope per-host settings (e.g. bell). */
  hostId?: string;
  /** Human-readable host label for system notifications. */
  hostLabel?: string;
  /** Notified when the backend confirms the session has closed (peer or local). */
  onClosed?: (reason: string) => void;
  /**
   * When set, this pane is part of a broadcast group. Every keystroke is also
   * mirrored to every entry of `peerSessionIds` (excluding this pane). The
   * border is highlighted to make it visible.
   */
  broadcast?: { peerSessionIds: string[] };
};

/**
 * A live xterm.js terminal wired to a backend SSH session through Tauri IPC.
 *
 * Lifecycle:
 * - On mount: build the Terminal, attach addons, subscribe to data + close
 *   events, register input/resize handlers.
 * - On theme change: update the existing terminal's options in-place so the
 *   buffer (and its scrollback) survives. *Do not* tear the terminal down for
 *   a theme swap — that would clear the user's shell history.
 * - On unmount: dispose the terminal and unlisten.
 */
export function TerminalView({
  sessionId,
  kind = "ssh",
  hostId,
  hostLabel,
  onClosed,
  broadcast,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;
  const themeId = useSettingsStore((s) => s.terminalTheme);
  const fontSize = useSettingsStore((s) => s.terminalFontSize);
  const fontFamily = useSettingsStore((s) => s.terminalFontFamily);
  const api = kind === "local" ? localTermApi : sessionsApi;
  const searchOpen = useTerminalSearchStore((s) => s.openFor === sessionId);
  const closeSearch = useTerminalSearchStore((s) => s.close);

  const findNext = useCallback((q: string, opts: { caseSensitive: boolean; regex: boolean }) => {
    return (
      searchAddonRef.current?.findNext(q, {
        caseSensitive: opts.caseSensitive,
        regex: opts.regex,
      }) ?? false
    );
  }, []);
  const findPrev = useCallback((q: string, opts: { caseSensitive: boolean; regex: boolean }) => {
    return (
      searchAddonRef.current?.findPrevious(q, {
        caseSensitive: opts.caseSensitive,
        regex: opts.regex,
      }) ?? false
    );
  }, []);

  // Mount: create terminal once per session id. Theme is *not* a dependency.
  // biome-ignore lint/correctness/useExhaustiveDependencies: api is derived from kind, no need to list
  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily: useSettingsStore.getState().terminalFontFamily,
      fontSize: useSettingsStore.getState().terminalFontSize,
      fontWeight: 400,
      fontWeightBold: 600,
      letterSpacing: 0,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 10_000,
      allowTransparency: false,
      // Small padding inside the viewport so text doesn't touch the edges
      // (xterm.js has no native padding option — we wrap the host div).
      theme: getTheme(useSettingsStore.getState().terminalTheme),
    });
    termRef.current = term;

    const fit = new FitAddon();
    term.loadAddon(fit);
    fitAddonRef.current = fit;
    const search = new SearchAddon();
    term.loadAddon(search);
    searchAddonRef.current = search;
    // Ctrl/Cmd+click on a link → ask the OS to open it via tauri-plugin-opener.
    // The default WebLinksAddon handler calls `window.open` which doesn't work
    // inside a Tauri webview (popups are blocked by default).
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        const wantsOpen = event.ctrlKey || event.metaKey;
        if (!wantsOpen) return;
        openUrl(uri).catch((e) => console.warn("openUrl:", e));
      }),
    );
    try {
      term.loadAddon(new WebglAddon());
    } catch (e) {
      console.warn("WebGL addon disabled:", e);
    }

    term.open(hostRef.current);
    fit.fit();

    const decoder = new TextDecoder();
    const unlisteners: UnlistenFn[] = [];

    // BEL detection (P4-T10). xterm.js consumes 0x07 internally, so we scan
    // the raw bytes ourselves and emit a notification per occurrence. The
    // setting gates everything: `off` skips entirely; `on` notifies for every
    // BEL; `focused-only` only notifies when the document is hidden.
    let lastBellAt = 0;
    const dataPromise = onTerminalData(sessionId, (bytes) => {
      const setting = useSettingsStore.getState().bellNotifications;
      if (setting !== "off") {
        const hasBell = bytes.includes(0x07);
        const now = Date.now();
        // Debounce 800 ms — `echo -e '\a\a\a'` is one user intent.
        if (hasBell && now - lastBellAt > 800) {
          lastBellAt = now;
          maybeNotify(setting, hostLabel ?? "Terminal", hostId);
        }
      }
      term.write(decoder.decode(bytes));
    });
    const closePromise = onSessionClosed(sessionId, (ev) => {
      onClosed?.(ev.reason);
    });
    dataPromise.then((u) => unlisteners.push(u));
    closePromise.then((u) => unlisteners.push(u));

    const writeSub = term.onData((data) => {
      // Typing in a pane implicitly focuses it — handy for split layouts
      // where the visual focus ring might be hidden.
      useSessionsStore.getState().setFocusedSession(sessionId);
      api.sendInput(sessionId, data).catch((e) => {
        console.warn("send input:", e);
      });
      // P4-T04 broadcast: mirror to peers, but avoid feedback loops by
      // skipping peers whose own onData will fire when they receive the
      // bytes from their server (that's purely display, not input).
      const bcast = broadcastRef.current;
      if (bcast && bcast.peerSessionIds.length > 0) {
        for (const peer of bcast.peerSessionIds) {
          if (peer === sessionId) continue;
          // We don't know each peer's kind here (ssh vs local). The SSH and
          // local input commands have the same shape; try ssh first then
          // local. In practice broadcast groups are homogeneous (split panes
          // of one tab share a kind) so the first call almost always works.
          sessionsApi.sendInput(peer, data).catch(() => {
            localTermApi.sendInput(peer, data).catch((e) => {
              console.warn("broadcast peer:", e);
            });
          });
        }
      }
    });

    // Mouse / textarea-focus path: same effect, no input required.
    const onFocus = () => {
      useSessionsStore.getState().setFocusedSession(sessionId);
    };
    hostRef.current.addEventListener("focusin", onFocus, true);
    hostRef.current.addEventListener("mousedown", onFocus, true);

    // Clic droit : copie la sélection si présente, sinon colle le presse-papiers.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {});
        term.clearSelection();
      } else {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) api.sendInput(sessionId, text).catch((err) => console.warn("paste:", err));
          })
          .catch(() => {});
      }
    };
    hostRef.current.addEventListener("contextmenu", onContextMenu);

    const ro = new ResizeObserver(() => {
      fit.fit();
      const { cols, rows } = term;
      api.resize(sessionId, cols, rows).catch((e) => {
        console.warn("resize:", e);
      });
    });
    ro.observe(hostRef.current);

    const host = hostRef.current;
    return () => {
      ro.disconnect();
      writeSub.dispose();
      if (host) {
        host.removeEventListener("focusin", onFocus, true);
        host.removeEventListener("mousedown", onFocus, true);
        host.removeEventListener("contextmenu", onContextMenu);
      }
      for (const un of unlisteners) un();
      term.dispose();
      termRef.current = null;
      searchAddonRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, onClosed, hostId, hostLabel]);

  // Apply theme changes in place — preserves the scrollback buffer.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTheme(themeId);
    }
  }, [themeId]);

  // Apply font size / family in place + refit (preserves scrollback).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = fontFamily;
    fitAddonRef.current?.fit();
    api.resize(sessionId, term.cols, term.rows).catch(() => {});
  }, [fontSize, fontFamily, sessionId, api]);

  const bg = getTheme(themeId).background ?? "transparent";

  const broadcasting = broadcast !== undefined;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: bg,
        // Inset padding: 12 px on top/bottom, 14 on sides for comfortable reading.
        padding: "10px 14px",
        boxShadow: broadcasting
          ? "inset 0 0 0 2px var(--color-accent), inset 0 0 12px rgba(245, 158, 11, 0.15)"
          : undefined,
      }}
    >
      <div ref={hostRef} className="h-full w-full" />
      {broadcasting && (
        <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-(--color-accent) px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-950 shadow">
          sync
        </span>
      )}
      {searchOpen && (
        <TerminalSearchBar onClose={closeSearch} onFindNext={findNext} onFindPrev={findPrev} />
      )}
    </div>
  );
}

/**
 * Fire a system notification when the embedded shell sends a BEL byte
 * (`\a`). Falls back gracefully when Notification permission is denied —
 * the toast inside `useSettingsStore.toggle` will guide the user.
 */
function maybeNotify(setting: "off" | "all" | "focus-only", title: string, hostId?: string) {
  void hostId;
  if (typeof Notification === "undefined") return;
  if (setting === "focus-only" && document.visibilityState === "visible") return;
  const fire = () =>
    new Notification(title, {
      body: "BEL",
      silent: false,
    });
  if (Notification.permission === "granted") {
    fire();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") fire();
    });
  }
}
