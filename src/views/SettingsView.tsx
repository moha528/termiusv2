import { TERMINAL_THEMES, type ThemeId } from "@/lib/themes";
import { useSettingsStore } from "@/stores/useSettingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Minimal settings panel rendered as a sheet over the main UI.
 *
 * In Phase 4 (P4-T11) this becomes a multi-section page; for now it holds
 * the terminal theme dropdown wired to [`useSettingsStore`].
 */
export function SettingsView({ open, onClose }: Props) {
  const theme = useSettingsStore((s) => s.terminalTheme);
  const setSetting = useSettingsStore((s) => s.set);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex bg-black/40 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-96 flex-col gap-6 border-l border-(--color-border) bg-(--color-panel) p-6">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)"
          >
            Fermer
          </button>
        </header>

        <section className="grid gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-muted)">
            Terminal
          </span>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: select is wrapped */}
          <label className="grid gap-1 text-sm">
            <span className="text-(--color-muted)">Thème</span>
            <select
              value={theme}
              onChange={(e) => setSetting("terminalTheme", e.currentTarget.value as ThemeId)}
              className="h-9 rounded-md border border-(--color-border) bg-(--color-bg) px-2 text-sm"
            >
              {Object.entries(TERMINAL_THEMES).map(([id, { name }]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <p className="text-xs italic text-(--color-muted)">
          La page Settings complète arrive en P4-T11.
        </p>
      </aside>
    </div>
  );
}
