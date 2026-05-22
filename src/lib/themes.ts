import type { ITheme } from "@xterm/xterm";

/**
 * Built-in xterm.js themes. Each entry maps the canonical theme id used in the
 * settings store to the xterm `ITheme` object.
 */
export type ThemeId =
  | "dracula"
  | "solarized-dark"
  | "solarized-light"
  | "tokyo-night"
  | "gruvbox-dark";

export const TERMINAL_THEMES: Record<ThemeId, { name: string; theme: ITheme }> = {
  dracula: {
    name: "Dracula",
    theme: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
  "solarized-dark": {
    name: "Solarized Dark",
    theme: {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#93a1a1",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  "solarized-light": {
    name: "Solarized Light",
    theme: {
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#586e75",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  "tokyo-night": {
    name: "Tokyo Night",
    theme: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
  },
  "gruvbox-dark": {
    name: "Gruvbox Dark",
    theme: {
      background: "#282828",
      foreground: "#ebdbb2",
      cursor: "#ebdbb2",
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
  },
};

export const DEFAULT_THEME: ThemeId = "tokyo-night";

export function getTheme(id: string | undefined): ITheme {
  if (id && id in TERMINAL_THEMES) {
    return TERMINAL_THEMES[id as ThemeId].theme;
  }
  return TERMINAL_THEMES[DEFAULT_THEME].theme;
}
