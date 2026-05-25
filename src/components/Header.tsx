import {
  AlertCircle,
  CheckCircle2,
  Command,
  Loader2,
  Settings as SettingsIcon,
} from "lucide-react";

import { useSyncStore } from "@/stores/useSyncStore";

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
            Lynk Client
          </span>
          <span className="text-[10px] uppercase tracking-wider text-(--color-muted)">
            SSH client
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <SyncIndicator onOpenSettings={onOpenSettings} />
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

/**
 * Compact sync status pill in the header. Clicking it opens Settings on
 * the Sync section, which is the most useful "I want to look at this"
 * action. Hidden entirely when sync isn't configured to avoid cluttering
 * the chrome for users who don't care.
 */
function SyncIndicator({ onOpenSettings }: { onOpenSettings: () => void }) {
  const config = useSyncStore((s) => s.config);
  const status = useSyncStore((s) => s.status);
  const lastResult = useSyncStore((s) => s.lastResult);
  if (!config?.enabled) return null;

  const isBusy = status === "busy";
  const isErr = status === "error" || Boolean(config.last_error);

  const lastTime = config.last_pushed_at ?? config.last_pulled_at;
  const title = isErr
    ? `Sync en erreur : ${config.last_error ?? "voir les réglages"}`
    : isBusy
      ? "Sync en cours…"
      : lastResult
        ? `Dernier : ${lastResult.summary}`
        : lastTime
          ? `Dernière sync : ${lastTime}`
          : "Sync configurée, en attente";

  return (
    <button
      type="button"
      onClick={onOpenSettings}
      title={title}
      className={
        isErr
          ? "inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20"
          : isBusy
            ? "inline-flex items-center gap-1 rounded-md bg-(--color-accent-bg)/30 px-2 py-1 text-[10px] text-(--color-accent)"
            : "inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/20"
      }
    >
      {isBusy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isErr ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <CheckCircle2 className="h-3 w-3" />
      )}
      <span>Sync</span>
    </button>
  );
}

function Logo() {
  return (
    <img src="/logo-mark.png" alt="Lynk Client" className="h-7 w-7 select-none" draggable={false} />
  );
}
