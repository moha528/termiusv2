import { create } from "zustand";

type TerminalSearchState = {
  /** Session id of the pane whose search bar is currently visible. `null` → none. */
  openFor: string | null;
  open: (sessionId: string) => void;
  close: () => void;
};

/**
 * Coordinates the floating search overlay between the global `Ctrl+Shift+F`
 * shortcut and the per-pane `TerminalView`. Storing `openFor` instead of a
 * boolean lets multiple split-panes coexist with at most one search bar
 * visible at a time.
 */
export const useTerminalSearchStore = create<TerminalSearchState>((set) => ({
  openFor: null,
  open(sessionId) {
    set({ openFor: sessionId });
  },
  close() {
    set({ openFor: null });
  },
}));
