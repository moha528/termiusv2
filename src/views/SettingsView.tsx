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
    <div className="fixed inset-0 z-40 flex bg-black/60 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="flex-1 cursor-default"
      />
      <aside className="flex h-full w-[460px] flex-col border-l border-(--color-border-strong) bg-(--color-panel) shadow-2xl shadow-black/40">
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
          <Section
            title="Apparence de l'application"
            description="Couleurs de la barre latérale, des dialogs et de la zone principale."
          >
            <ThemeGrid
              selectedId={appTheme}
              onSelect={(id) => setSetting("appTheme", id)}
              renderPreview={(t) => <AppPreview palette={t.app} />}
            />
          </Section>

          <Section
            title="Thème du terminal"
            description="Indépendant de l'apparence de l'app — applique uniquement aux sessions SSH."
          >
            <ThemeGrid
              selectedId={terminalTheme}
              onSelect={(id) => setSetting("terminalTheme", id)}
              renderPreview={(t) => <TerminalPreview theme={t.terminal} />}
            />
          </Section>

          <Section
            title="Explorateur de fichiers"
            description="Affichage des fichiers SFTP / local."
          >
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-(--color-border) bg-(--color-bg-soft) p-3">
              <span className="flex flex-col text-sm">
                <span className="font-medium">Afficher les fichiers cachés</span>
                <span className="text-xs text-(--color-muted)">
                  Inclut les entrées commençant par « . »
                </span>
              </span>
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setSetting("showHiddenFiles", e.currentTarget.checked)}
                className="h-4 w-4 cursor-pointer"
              />
            </label>
          </Section>

          <p className="mt-6 text-[11px] italic text-(--color-muted-soft)">
            La page Settings complète arrive en P4-T11 (kbd, sécurité, sync, etc.).
          </p>
        </div>
      </aside>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 grid gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-(--color-muted-soft)">{description}</p>}
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
    <div className="grid gap-2">
      {(Object.entries(TERMINAL_THEMES) as [ThemeId, (typeof TERMINAL_THEMES)[ThemeId]][]).map(
        ([id, t]) => {
          const selected = selectedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-(--color-accent) bg-(--color-accent-bg)/40"
                  : "border-(--color-border) bg-(--color-bg-soft) hover:bg-(--color-panel-hover)",
              )}
            >
              {renderPreview(t)}
              <span className="flex-1 text-sm">{t.name}</span>
              {selected && <Check className="h-4 w-4 shrink-0 text-(--color-accent)" />}
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
  theme: { background?: string; foreground?: string; cursor?: string };
}) {
  return (
    <div
      className="grid h-10 w-14 grid-cols-3 overflow-hidden rounded-md border border-(--color-border)"
      style={{ background: theme.background }}
      aria-hidden
    >
      <span className="border-r" style={{ borderColor: theme.foreground, opacity: 0.3 }} />
      <span className="border-r" style={{ borderColor: theme.cursor, opacity: 0.5 }} />
      <span />
    </div>
  );
}

function AppPreview({ palette }: { palette: Record<string, string> }) {
  // Mini representation: window bg + sidebar bg + accent dot
  return (
    <div
      className="flex h-10 w-14 overflow-hidden rounded-md border"
      style={{
        borderColor: palette["--color-border-strong"],
        background: palette["--color-bg"],
      }}
      aria-hidden
    >
      <div
        className="w-1/3 border-r"
        style={{
          background: palette["--color-bg-soft"],
          borderColor: palette["--color-border"],
        }}
      />
      <div className="flex flex-1 items-end justify-end p-1">
        <span
          className="block h-2 w-2 rounded-full"
          style={{ background: palette["--color-accent"] }}
        />
      </div>
    </div>
  );
}
