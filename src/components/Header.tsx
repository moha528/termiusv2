import { Command, Settings as SettingsIcon } from "lucide-react";

type Props = {
  onOpenSettings: () => void;
  onOpenPalette: () => void;
};

/**
 * App header rendered just below the native OS title bar.
 * Hosts the brand and the global actions (command palette, settings).
 */
export function Header({ onOpenSettings, onOpenPalette }: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-panel) px-3">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-(--color-text)">
            Termius v2
          </span>
          <span className="text-[10px] uppercase tracking-wider text-(--color-muted)">
            SSH client
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenPalette}
          title="Palette de commandes  ·  Ctrl+K"
          className="inline-flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2.5 py-1 text-xs text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <Command className="h-3.5 w-3.5" />
          <span>Rechercher</span>
          <span className="flex items-center gap-0.5 text-(--color-muted-soft)">
            <kbd className="rounded border border-(--color-border) bg-(--color-bg) px-1 font-mono text-[10px]">
              Ctrl
            </kbd>
            <kbd className="rounded border border-(--color-border) bg-(--color-bg) px-1 font-mono text-[10px]">
              K
            </kbd>
          </span>
        </button>
        <button
          type="button"
          aria-label="Settings"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="relative grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-(--color-accent) to-(--color-accent-soft) shadow-[0_0_12px_-2px_var(--color-accent)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-(--color-bg)"
        role="img"
        aria-label="Termius v2 logo"
      >
        <title>Termius v2</title>
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    </div>
  );
}
