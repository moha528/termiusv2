import { Check, X } from "lucide-react";

import { TERMINAL_THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsView({ open, onClose }: Props) {
  const theme = useSettingsStore((s) => s.terminalTheme);
  const setSetting = useSettingsStore((s) => s.set);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-[420px] flex-col border-l border-(--color-border-strong) bg-(--color-panel) shadow-2xl shadow-black/40">
        <header className="flex h-11 items-center justify-between border-b border-(--color-border) px-4">
          <h2 className="text-sm font-semibold tracking-tight">Réglages</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <section className="grid gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
                Thème du terminal
              </h3>
              <p className="mt-0.5 text-xs text-(--color-muted-soft)">
                Appliqué immédiatement aux sessions ouvertes.
              </p>
            </div>

            <div className="grid gap-2">
              {(
                Object.entries(TERMINAL_THEMES) as [ThemeId, (typeof TERMINAL_THEMES)[ThemeId]][]
              ).map(([id, { name, theme: t }]) => {
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSetting("terminalTheme", id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      selected
                        ? "border-(--color-accent) bg-(--color-accent-bg)/40"
                        : "border-(--color-border) bg-(--color-bg-soft) hover:bg-(--color-panel-hover)",
                    )}
                  >
                    <ThemePreview theme={t} />
                    <span className="flex-1 text-sm">{name}</span>
                    {selected && <Check className="h-4 w-4 text-(--color-accent)" />}
                  </button>
                );
              })}
            </div>
          </section>

          <p className="mt-6 text-[11px] italic text-(--color-muted-soft)">
            La page Settings complète arrive en P4-T11 (kbd, sécurité, sync, etc.).
          </p>
        </div>
      </aside>
    </div>
  );
}

function ThemePreview({
  theme,
}: { theme: { background?: string; foreground?: string; cursor?: string } }) {
  return (
    <div
      className="grid h-9 w-12 grid-cols-3 overflow-hidden rounded-md border border-(--color-border)"
      style={{ background: theme.background }}
      aria-hidden
    >
      <span className="border-r" style={{ borderColor: theme.foreground, opacity: 0.3 }} />
      <span className="border-r" style={{ borderColor: theme.cursor, opacity: 0.5 }} />
      <span />
    </div>
  );
}
