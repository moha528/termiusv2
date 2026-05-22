import { Check, X } from "lucide-react";

import { TERMINAL_THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsView({ open, onClose }: Props) {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const terminalTheme = useSettingsStore((s) => s.terminalTheme);
  const showHidden = useSettingsStore((s) => s.showHiddenFiles);
  const setSetting = useSettingsStore((s) => s.set);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex bg-black/50 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-[400px] flex-col border-l border-(--color-border-strong) bg-(--color-panel) shadow-2xl shadow-black/40">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-(--color-border) px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
            Réglages
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          <Section title="Apparence" subtitle="Sidebar, dialogs, zone principale">
            <ThemeGrid
              selectedId={appTheme}
              onSelect={(id) => setSetting("appTheme", id)}
              renderPreview={(t) => <AppPreview palette={t.app} />}
            />
          </Section>

          <Section title="Terminal" subtitle="Sessions SSH — indépendant de l'app">
            <ThemeGrid
              selectedId={terminalTheme}
              onSelect={(id) => setSetting("terminalTheme", id)}
              renderPreview={(t) => <TerminalPreview theme={t.terminal} />}
            />
          </Section>

          <Section title="Fichiers">
            <Toggle
              label="Afficher les fichiers cachés"
              description="Inclut les entrées « .xxx »"
              checked={showHidden}
              onChange={(v) => setSetting("showHiddenFiles", v)}
            />
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--color-muted)">
          {title}
        </h3>
        {subtitle && <span className="text-[10px] text-(--color-muted-soft)">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function ThemeGrid({
  selectedId,
  onSelect,
  renderPreview,
}: {
  selectedId: ThemeId;
  onSelect: (id: ThemeId) => void;
  renderPreview: (theme: (typeof TERMINAL_THEMES)[ThemeId]) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(Object.entries(TERMINAL_THEMES) as [ThemeId, (typeof TERMINAL_THEMES)[ThemeId]][]).map(
        ([id, t]) => {
          const selected = selectedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={t.name}
              className={cn(
                "group relative flex items-center gap-2 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-all",
                selected
                  ? "border-(--color-accent) bg-(--color-accent-bg)/30 ring-1 ring-(--color-accent)/30"
                  : "border-(--color-border) bg-(--color-bg-soft) hover:border-(--color-border-strong) hover:bg-(--color-panel-hover)",
              )}
            >
              {renderPreview(t)}
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
              {selected && <Check className="h-3 w-3 shrink-0 text-(--color-accent)" />}
            </button>
          );
        },
      )}
    </div>
  );
}

function TerminalPreview({
  theme,
}: {
  theme: {
    background?: string;
    foreground?: string;
    cursor?: string;
    blue?: string;
    magenta?: string;
    green?: string;
  };
}) {
  // Compact 24×24 swatch made of 4 quadrants to hint at the palette.
  return (
    <div
      className="grid h-6 w-6 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-sm border border-black/20"
      style={{ background: theme.background }}
      aria-hidden
    >
      <span style={{ background: theme.foreground, opacity: 0.85 }} />
      <span style={{ background: theme.blue ?? theme.cursor }} />
      <span style={{ background: theme.magenta ?? theme.cursor }} />
      <span style={{ background: theme.green ?? theme.foreground }} />
    </div>
  );
}

function AppPreview({ palette }: { palette: Record<string, string> }) {
  return (
    <div
      className="flex h-6 w-6 shrink-0 overflow-hidden rounded-sm border"
      style={{
        borderColor: palette["--color-border-strong"],
        background: palette["--color-bg"],
      }}
      aria-hidden
    >
      <div className="w-1/3" style={{ background: palette["--color-bg-soft"] }} />
      <div className="flex flex-1 items-end justify-end p-0.5">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: palette["--color-accent"] }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-left hover:bg-(--color-panel-hover)"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        {description && <span className="text-[10px] text-(--color-muted)">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-(--color-accent)" : "bg-(--color-elevated)",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
