import type { UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

import { onSessionClosed, onTerminalData, sessionsApi } from "@/lib/sessions";
import { getTheme } from "@/lib/themes";
import { useSettingsStore } from "@/stores/useSettingsStore";

type Props = {
  sessionId: string;
  /** Notified when the backend confirms the session has closed (peer or local). */
  onClosed?: (reason: string) => void;
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
export function TerminalView({ sessionId, onClosed }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const themeId = useSettingsStore((s) => s.terminalTheme);

  // Mount: create terminal once per session id. Theme is *not* a dependency.
  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowTransparency: false,
      theme: getTheme(useSettingsStore.getState().terminalTheme),
    });
    termRef.current = term;

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new SearchAddon());
    term.loadAddon(new WebLinksAddon());
    try {
      term.loadAddon(new WebglAddon());
    } catch (e) {
      console.warn("WebGL addon disabled:", e);
    }

    term.open(hostRef.current);
    fit.fit();

    const decoder = new TextDecoder();
    const unlisteners: UnlistenFn[] = [];

    const dataPromise = onTerminalData(sessionId, (bytes) => {
      term.write(decoder.decode(bytes));
    });
    const closePromise = onSessionClosed(sessionId, (ev) => {
      onClosed?.(ev.reason);
    });
    dataPromise.then((u) => unlisteners.push(u));
    closePromise.then((u) => unlisteners.push(u));

    const writeSub = term.onData((data) => {
      sessionsApi.sendInput(sessionId, data).catch((e) => {
        console.warn("send_terminal_input:", e);
      });
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      const { cols, rows } = term;
      sessionsApi.resize(sessionId, cols, rows).catch((e) => {
        console.warn("resize_terminal:", e);
      });
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      writeSub.dispose();
      for (const un of unlisteners) un();
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId, onClosed]);

  // Apply theme changes in place — preserves the scrollback buffer.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTheme(themeId);
    }
  }, [themeId]);

  return <div ref={hostRef} className="h-full w-full" />;
}
