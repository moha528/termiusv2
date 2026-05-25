import {
  Command,
  Download,
  FolderTree,
  Plus,
  Server,
  Terminal as TerminalIcon,
} from "lucide-react";

import type { Host } from "@/lib/bindings/Host";
import { cn } from "@/lib/utils";
import { useServersStore } from "@/stores/useServersStore";
import type { SessionTabType } from "@/stores/useSessionsStore";

type Props = {
  onOpenPalette: () => void;
  onOpenSession: (host: Host, type?: SessionTabType) => void;
  onNewHost: () => void;
  onImport: () => void;
  onOpenLocal: () => void;
};

/**
 * Home screen rendered when no session tab is open.
 *
 * Three blocks, in order of value:
 *   1. Quick actions row (Palette / New host / Import) — keeps the most common
 *      onboarding actions one click away.
 *   2. Recent hosts grid — cards for every saved host, single click opens SSH
 *      and there's a small SFTP shortcut on hover.
 *   3. Footer hint about Ctrl+K so users discover the palette.
 */
export function Workspace({
  onOpenPalette,
  onOpenSession,
  onNewHost,
  onImport,
  onOpenLocal,
}: Props) {
  const hosts = useServersStore((s) => s.hosts);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8">
        <header className="flex items-start gap-3">
          <img
            src="/logo-mark.png"
            alt=""
            className="mt-0.5 h-10 w-10 shrink-0 select-none"
            draggable={false}
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-(--color-text)">
              Lynk Client
            </h1>
            <p className="mt-1 text-sm text-(--color-muted)">
              {hosts.length === 0
                ? "Bienvenue. Ajoutez un serveur ou importez votre fichier ~/.ssh/config pour commencer."
                : "Choisissez un serveur ou ouvrez la palette de commandes pour vous connecter."}
            </p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            icon={<Command className="h-5 w-5" />}
            title="Palette"
            description="Recherche rapide, lancer une session, exécuter une action."
            badge="Ctrl+K"
            onClick={onOpenPalette}
            primary
          />
          <QuickAction
            icon={<TerminalIcon className="h-5 w-5" />}
            title="Terminal local"
            description="Ouvrir un shell sur la machine locale (PowerShell, bash, zsh…)."
            onClick={onOpenLocal}
          />
          <QuickAction
            icon={<Plus className="h-5 w-5" />}
            title="Nouveau serveur"
            description="Saisir manuellement un host SSH (label, hostname, user, port)."
            onClick={onNewHost}
          />
          <QuickAction
            icon={<Download className="h-5 w-5" />}
            title="Importer ~/.ssh/config"
            description="Parse votre config OpenSSH et crée un host par alias."
            onClick={onImport}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
              Vos serveurs
            </h2>
            {hosts.length > 0 && (
              <span className="text-[11px] text-(--color-muted-soft)">
                {hosts.length} serveur{hosts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {hosts.length === 0 ? (
            <EmptyHosts onNewHost={onNewHost} onImport={onImport} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hosts.map((host) => (
                <li key={host.id}>
                  <HostCard host={host} onOpenSession={onOpenSession} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  badge,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        "hover:-translate-y-px hover:shadow-lg",
        primary
          ? "border-(--color-accent) bg-(--color-accent-bg)/40 hover:border-(--color-accent)"
          : "border-(--color-border) bg-(--color-bg-soft) hover:border-(--color-border-strong) hover:bg-(--color-panel-hover)",
      )}
    >
      <div
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          primary
            ? "bg-(--color-accent) text-(--color-bg)"
            : "bg-(--color-panel) text-(--color-accent)",
        )}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-(--color-text)">{title}</span>
          {badge && (
            <span className="rounded border border-(--color-border) bg-(--color-panel) px-1.5 py-0.5 font-mono text-[10px] text-(--color-muted)">
              {badge}
            </span>
          )}
        </div>
        <span className="mt-0.5 text-xs text-(--color-muted)">{description}</span>
      </div>
    </button>
  );
}

function HostCard({
  host,
  onOpenSession,
}: {
  host: Host;
  onOpenSession: (host: Host, type?: SessionTabType) => void;
}) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-(--color-border) bg-(--color-bg-soft) p-3 transition-all hover:-translate-y-px hover:border-(--color-accent-soft) hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpenSession(host, "ssh")}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-(--color-panel) text-(--color-accent) transition-colors group-hover:bg-(--color-accent-bg)">
          <Server className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-(--color-text)">{host.label}</span>
          <span className="mt-0.5 truncate font-mono text-[11px] text-(--color-muted)">
            {host.username}@{host.hostname}
            {host.port !== 22 ? `:${host.port}` : ""}
          </span>
        </div>
      </button>
      <div className="mt-3 flex items-center gap-1.5 border-t border-(--color-border) pt-2 text-[11px]">
        <ActionPill
          icon={<TerminalIcon className="h-3 w-3" />}
          label="SSH"
          onClick={() => onOpenSession(host, "ssh")}
        />
        <ActionPill
          icon={<FolderTree className="h-3 w-3" />}
          label="SFTP"
          onClick={() => onOpenSession(host, "sftp")}
        />
      </div>
    </div>
  );
}

function ActionPill({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyHosts({
  onNewHost,
  onImport,
}: {
  onNewHost: () => void;
  onImport: () => void;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-(--color-border-strong) bg-(--color-bg-soft) p-10 text-center">
      <Server className="h-7 w-7 text-(--color-muted-soft)" />
      <div>
        <p className="text-sm font-medium text-(--color-text-soft)">Aucun serveur</p>
        <p className="mt-1 text-xs text-(--color-muted)">
          Ajoutez votre premier host pour démarrer une session.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNewHost}
          className="inline-flex items-center gap-1.5 rounded-md bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-(--color-bg) hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouveau serveur
        </button>
        <button
          type="button"
          onClick={onImport}
          className="inline-flex items-center gap-1.5 rounded-md border border-(--color-border-strong) bg-(--color-bg) px-3 py-1.5 text-xs font-medium text-(--color-text-soft) hover:bg-(--color-panel-hover)"
        >
          <Download className="h-3.5 w-3.5" />
          Importer ~/.ssh/config
        </button>
      </div>
    </div>
  );
}
