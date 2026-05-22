import { Settings as SettingsIcon } from "lucide-react";

import { Titlebar } from "./Titlebar";

type Props = {
  onOpenSettings: () => void;
};

export function Header({ onOpenSettings }: Props) {
  return (
    <Titlebar>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Termius v2</span>
            <span className="text-[10px] uppercase tracking-wider text-(--color-muted)">
              SSH client
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Settings"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </Titlebar>
  );
}

function Logo() {
  return (
    <div className="relative grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-(--color-accent) to-(--color-accent-soft) shadow-[0_0_12px_-2px_rgba(125,211,252,0.5)]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-zinc-950"
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
