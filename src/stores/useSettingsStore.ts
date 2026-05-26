import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";
import type { SessionTabType } from "@/stores/useSessionsStore";

export type RestorableTab = {
  hostId: string;
  type: SessionTabType;
  title: string;
};

type Settings = {
  sidebarWidth: number;
  /** Theme of the app chrome (sidebar, dialogs, tabs, panels). */
  appTheme: ThemeId;
  /** Theme of the embedded xterm.js terminals. Independent from `appTheme`. */
  terminalTheme: ThemeId;
  lastActiveTabId: string | null;
  windowWidth: number | null;
  windowHeight: number | null;
  /** Show dotfiles in SFTP/local panes. */
  showHiddenFiles: boolean;
  /** Snapshot of the last open tabs, used to offer a "restore" prompt on next launch. */
  restorableTabs: RestorableTab[];
  /**
   * `null` → ask each time. `true` / `false` → user committed a preference and
   * we skip the prompt.
   */
  autoRestoreSessions: boolean | null;
  /**
   * Auto-lock the vault after this many minutes of inactivity (P3-T08).
   * `0` disables the timer. The lock only fires if a master password is
   * configured — otherwise there's nothing to unlock with.
   */
  autoLockMinutes: number;
  /**
   * Scope for the Ctrl+R command-history finder (P4-T03):
   *  - `"host"`: only commands typed in the currently-active host (+ global)
   *  - `"global"`: every recorded command across all hosts
   */
  commandHistoryScope: "host" | "global";
  /**
   * Bell (`\a`) notification behavior (P4-T10):
   *  - `"off"`: ignore BEL bytes
   *  - `"focus-only"`: only notify when the app is hidden / unfocused
   *  - `"all"`: always notify
   */
  bellNotifications: "off" | "focus-only" | "all";
  /**
   * Opt-in anonymous crash reporting (P5-T08). Default OFF. Currently a
   * stored preference only — no telemetry backend is wired yet, so toggling
   * it on does nothing observable until a future release ships the reporter.
   */
  crashReportingOptIn: boolean;
  /**
   * Dernière version de l'app vue par l'utilisateur. Sert à déclencher la
   * modale « Quoi de neuf » après une mise à jour. `null` = jamais enregistré
   * (première exécution avec cette fonctionnalité → on enregistre en silence).
   */
  lastSeenVersion: string | null;
};

const DEFAULTS: Settings = {
  sidebarWidth: 260,
  appTheme: DEFAULT_THEME,
  terminalTheme: DEFAULT_THEME,
  lastActiveTabId: null,
  windowWidth: null,
  windowHeight: null,
  showHiddenFiles: false,
  restorableTabs: [],
  autoRestoreSessions: null,
  autoLockMinutes: 0,
  commandHistoryScope: "host",
  bellNotifications: "focus-only",
  crashReportingOptIn: false,
  lastSeenVersion: null,
};

type SettingsState = Settings & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
};

const KEY_MAP: Record<keyof Settings, string> = {
  sidebarWidth: "sidebar_width",
  appTheme: "app_theme",
  terminalTheme: "terminal_theme",
  lastActiveTabId: "last_active_tab_id",
  windowWidth: "window_width",
  windowHeight: "window_height",
  showHiddenFiles: "show_hidden_files",
  restorableTabs: "restorable_tabs",
  autoRestoreSessions: "auto_restore_sessions",
  autoLockMinutes: "auto_lock_minutes",
  commandHistoryScope: "command_history_scope",
  bellNotifications: "bell_notifications",
  crashReportingOptIn: "crash_reporting_opt_in",
  lastSeenVersion: "last_seen_version",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  hydrated: false,

  async hydrate() {
    try {
      const raw = await invoke<Record<string, unknown>>("get_all_settings");
      const patch: Record<string, unknown> = {};
      for (const [field, key] of Object.entries(KEY_MAP)) {
        if (key in raw) {
          patch[field] = raw[key];
        }
      }
      // Backwards-compat: existing installs only have `terminal_theme` —
      // mirror it into `appTheme` so the app doesn't look unstyled.
      if (patch.appTheme == null && patch.terminalTheme != null) {
        patch.appTheme = patch.terminalTheme;
      }
      set({ ...(patch as Partial<Settings>), hydrated: true });
    } catch (e) {
      console.warn("settings hydrate:", e);
      set({ hydrated: true });
    }
  },

  async set(field, value) {
    set({ [field]: value } as Partial<SettingsState>);
    try {
      await invoke("set_setting", { key: KEY_MAP[field], value });
    } catch (e) {
      console.warn("set_setting:", e);
    }
  },
}));
