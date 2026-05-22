import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { DEFAULT_THEME, type ThemeId } from "@/lib/themes";

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
};

const DEFAULTS: Settings = {
  sidebarWidth: 260,
  appTheme: DEFAULT_THEME,
  terminalTheme: DEFAULT_THEME,
  lastActiveTabId: null,
  windowWidth: null,
  windowHeight: null,
  showHiddenFiles: false,
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
