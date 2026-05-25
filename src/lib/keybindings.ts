/**
 * Keyboard shortcut registry (P4-T07).
 *
 * Actions are identified by string ids and bound to a single user-editable
 * accelerator. Bindings persist via the existing settings KV
 * (`useSettingsStore` writes a `keybindings` JSON blob). At runtime,
 * [`useKeybindings`] registers a `keydown` listener that resolves each event
 * to a binding and fires the matching handler.
 *
 * Accelerator syntax: `Ctrl+Shift+S`, `Cmd+K`, `Alt+Enter`, `Ctrl+/`. The
 * parser is case-insensitive on modifier names. The key name is the
 * `KeyboardEvent.key` value (1-char keys uppercased, special keys verbatim).
 * We deliberately use `Ctrl` even on macOS — on Apple keyboards `Cmd` is
 * exposed as `metaKey`, but the user-facing label stays "Ctrl" for
 * simplicity; both modifiers fire the same actions.
 */

export type ActionId =
  | "open-command-palette"
  | "open-snippets"
  | "open-command-history"
  | "new-tab"
  | "close-tab"
  | "next-tab"
  | "prev-tab"
  | "reopen-closed-tab"
  | "open-settings"
  | "open-search-buffer";

export type ActionDefinition = {
  id: ActionId;
  label: string;
  category: "Navigation" | "Onglets" | "Terminal" | "Productivité";
  defaultAccel: string;
};

export const ACTIONS: ActionDefinition[] = [
  {
    id: "open-command-palette",
    label: "Palette de commandes",
    category: "Navigation",
    defaultAccel: "Ctrl+K",
  },
  {
    id: "open-snippets",
    label: "Panneau Snippets",
    category: "Productivité",
    defaultAccel: "Ctrl+Shift+S",
  },
  {
    id: "open-command-history",
    label: "Historique des commandes",
    category: "Productivité",
    defaultAccel: "Ctrl+R",
  },
  {
    id: "new-tab",
    label: "Nouvel onglet",
    category: "Onglets",
    defaultAccel: "Ctrl+T",
  },
  {
    id: "close-tab",
    label: "Fermer l'onglet",
    category: "Onglets",
    defaultAccel: "Ctrl+W",
  },
  {
    id: "next-tab",
    label: "Onglet suivant",
    category: "Onglets",
    defaultAccel: "Ctrl+Tab",
  },
  {
    id: "prev-tab",
    label: "Onglet précédent",
    category: "Onglets",
    defaultAccel: "Ctrl+Shift+Tab",
  },
  {
    id: "reopen-closed-tab",
    label: "Rouvrir le dernier onglet fermé",
    category: "Onglets",
    defaultAccel: "Ctrl+Shift+T",
  },
  {
    id: "open-settings",
    label: "Ouvrir les réglages",
    category: "Navigation",
    defaultAccel: "Ctrl+,",
  },
  {
    id: "open-search-buffer",
    label: "Rechercher dans le buffer du terminal",
    category: "Terminal",
    defaultAccel: "Ctrl+Shift+F",
  },
];

export const DEFAULT_BINDINGS: Record<ActionId, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a.defaultAccel]),
) as Record<ActionId, string>;

export type Bindings = Record<ActionId, string>;

/**
 * Resolve a `KeyboardEvent` to its canonical accelerator string —
 * `"Ctrl+Shift+S"`, `"Alt+F4"`, etc. Used both to match against the registry
 * and to record a new binding from the recorder UI. Returns `null` when
 * `event.key` is a bare modifier (no real key pressed yet).
 */
export function eventToAccel(e: KeyboardEvent): string | null {
  const key = normalizeKey(e.key);
  if (key === null) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

function normalizeKey(key: string): string | null {
  // Skip bare modifiers — wait for the next key.
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return null;
  if (key.length === 1) return key.toUpperCase();
  // Map a few common names so the label matches typical conventions.
  if (key === " ") return "Space";
  return key; // Tab, Escape, Enter, F1, ArrowUp, ...
}

/**
 * Normalize a user-supplied accelerator string to the canonical
 * `Ctrl+Shift+Key` ordering, so two strings that differ only in modifier
 * order compare equal.
 */
export function normalizeAccel(accel: string): string {
  const parts = accel.split("+").map((p) => p.trim());
  if (parts.length === 0) return "";
  const last = parts.pop() ?? "";
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const out: string[] = [];
  if (mods.has("ctrl") || mods.has("cmd") || mods.has("meta")) out.push("Ctrl");
  if (mods.has("alt") || mods.has("option")) out.push("Alt");
  if (mods.has("shift")) out.push("Shift");
  out.push(last.length === 1 ? last.toUpperCase() : last);
  return out.join("+");
}

/**
 * Return the list of `(actionId, accel)` pairs that conflict on the same
 * accelerator. Used by the Settings UI to warn the user.
 */
export function findConflicts(bindings: Bindings): Array<{
  accel: string;
  actions: ActionId[];
}> {
  const byAccel = new Map<string, ActionId[]>();
  for (const [id, accel] of Object.entries(bindings) as [ActionId, string][]) {
    if (!accel) continue;
    const norm = normalizeAccel(accel);
    if (!byAccel.has(norm)) byAccel.set(norm, []);
    byAccel.get(norm)?.push(id);
  }
  const out: Array<{ accel: string; actions: ActionId[] }> = [];
  for (const [accel, actions] of byAccel) {
    if (actions.length > 1) out.push({ accel, actions });
  }
  return out;
}
