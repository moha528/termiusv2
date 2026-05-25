import { ArrowLeftRight, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { ForwardType } from "@/lib/bindings/ForwardType";
import type { Host } from "@/lib/bindings/Host";
import type { PortForward } from "@/lib/bindings/PortForward";
import { withToast } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useForwardsStore } from "@/stores/useForwardsStore";

import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";

type Props = {
  open: boolean;
  host: Host | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Port forwards manager attached to a single host. Lists existing forwards,
 * lets the user create/edit/delete and start/stop them. Active forwards
 * (those whose listener is currently bound) get a pulsing green dot.
 *
 * Currently only the local (`-L`) variant is wired through the backend;
 * remote and dynamic options are exposed in the UI but disabled until
 * P3-T12 / P3-T13 ship.
 */
export function PortForwardsDialog({ open, host, onOpenChange }: Props) {
  const byHost = useForwardsStore((s) => s.byHost);
  const active = useForwardsStore((s) => s.active);
  const refresh = useForwardsStore((s) => s.refresh);
  const refreshActive = useForwardsStore((s) => s.refreshActive);
  const create = useForwardsStore((s) => s.create);
  const remove = useForwardsStore((s) => s.remove);
  const start = useForwardsStore((s) => s.start);
  const stop = useForwardsStore((s) => s.stop);

  const [showForm, setShowForm] = useState(false);
  const [forwardType, setForwardType] = useState<ForwardType>("local");
  const [localPort, setLocalPort] = useState("8080");
  const [remoteHost, setRemoteHost] = useState("localhost");
  const [remotePort, setRemotePort] = useState("80");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (open && host) {
      refresh(host.id);
      refreshActive();
      setShowForm(false);
    }
  }, [open, host, refresh, refreshActive]);

  if (!host) return null;
  const forwards = byHost[host.id] ?? [];

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const lp = Number(localPort);
    if (!Number.isInteger(lp) || lp < 1 || lp > 65535) return;
    // Dynamic (SOCKS5) only needs the listening port. Local + Remote both
    // need a target (host:port) — they differ only in *which side* listens.
    let rh = remoteHost.trim();
    let rp = Number(remotePort);
    if (forwardType === "dynamic") {
      rh = "";
      rp = 0;
    } else {
      if (!Number.isInteger(rp) || rp < 1 || rp > 65535) return;
      if (!rh) return;
    }
    await withToast(
      create({
        host_id: host.id,
        forward_type: forwardType,
        label: label.trim(),
        local_port: lp,
        remote_host: rh,
        remote_port: rp,
        auto_start: false,
      }),
      { loading: "Création…", success: "Forward créé" },
    );
    setShowForm(false);
    setForwardType("local");
    setLocalPort("8080");
    setRemoteHost("localhost");
    setRemotePort("80");
    setLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-(--color-accent-bg) text-(--color-accent)">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>Port forwards · {host.label}</DialogTitle>
              <DialogDescription>
                {host.username}@{host.hostname}
                {host.port !== 22 ? `:${host.port}` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {forwards.length === 0 && !showForm && (
            <div className="rounded-md border border-dashed border-(--color-border) bg-(--color-bg-soft) px-3 py-4 text-center text-[11px] text-(--color-muted)">
              Aucun port forward pour cet hôte.
            </div>
          )}

          {forwards.map((f) => (
            <ForwardRow
              key={f.id}
              forward={f}
              running={active.has(f.id)}
              onStart={() =>
                withToast(start(f.id), {
                  loading: "Démarrage…",
                  success:
                    f.forward_type === "remote"
                      ? `Serveur écoute sur :${f.local_port}`
                      : `Forward sur 127.0.0.1:${f.local_port}`,
                })
              }
              onStop={() => withToast(stop(f.id), { loading: "Arrêt…", success: "Forward arrêté" })}
              onDelete={() =>
                withToast(remove(f.id, host.id), {
                  loading: "Suppression…",
                  success: "Forward supprimé",
                })
              }
            />
          ))}

          {showForm ? (
            <form
              onSubmit={onCreate}
              className="flex flex-col gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-2"
            >
              <div className="flex flex-wrap items-center gap-1">
                <TypeChip
                  selected={forwardType === "local"}
                  onClick={() => setForwardType("local")}
                  label="Local (-L)"
                />
                <TypeChip
                  selected={forwardType === "remote"}
                  onClick={() => setForwardType("remote")}
                  label="Remote (-R)"
                />
                <TypeChip
                  selected={forwardType === "dynamic"}
                  onClick={() => setForwardType("dynamic")}
                  label="Dynamic SOCKS (-D)"
                />
              </div>
              <Input
                value={label}
                onChange={(e) => setLabel(e.currentTarget.value)}
                placeholder="Label (optionnel — ex. db)"
                className="h-8 text-[11px]"
              />
              {forwardType === "local" && (
                <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(e.currentTarget.value)}
                    placeholder="Port local"
                    className="h-8 text-[11px]"
                  />
                  <span className="text-[11px] text-(--color-muted)">→</span>
                  <Input
                    value={remoteHost}
                    onChange={(e) => setRemoteHost(e.currentTarget.value)}
                    placeholder="remote.host"
                    className="h-8 text-[11px]"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.currentTarget.value)}
                    placeholder="Port distant"
                    className="h-8 text-[11px]"
                  />
                </div>
              )}
              {forwardType === "remote" && (
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={localPort}
                      onChange={(e) => setLocalPort(e.currentTarget.value)}
                      placeholder="Port distant (serveur)"
                      className="h-8 text-[11px]"
                    />
                    <span className="text-[11px] text-(--color-muted)">→</span>
                    <Input
                      value={remoteHost}
                      onChange={(e) => setRemoteHost(e.currentTarget.value)}
                      placeholder="local.host"
                      className="h-8 text-[11px]"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={remotePort}
                      onChange={(e) => setRemotePort(e.currentTarget.value)}
                      placeholder="Port local"
                      className="h-8 text-[11px]"
                    />
                  </div>
                  <p className="text-[10px] text-(--color-muted-soft)">
                    Le serveur écoute sur le premier port. Toute connexion entrante côté serveur est
                    tunnelée vers la cible locale.
                  </p>
                </div>
              )}
              {forwardType === "dynamic" && (
                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={localPort}
                    onChange={(e) => setLocalPort(e.currentTarget.value)}
                    placeholder="Port local d'écoute SOCKS5"
                    className="h-8 text-[11px]"
                  />
                  <p className="text-[10px] text-(--color-muted-soft)">
                    Configure ton navigateur en SOCKS5 sur 127.0.0.1:{localPort || "?"} pour
                    naviguer via ce serveur.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-1.5">
                <Button
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="h-7 px-2 text-[11px]"
                >
                  Annuler
                </Button>
                <Button type="submit" className="h-7 px-2 text-[11px]">
                  Créer
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="h-7 self-start px-2 text-[11px]"
            >
              <Plus className="h-3 w-3" />
              Nouveau forward
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TypeChip({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
        selected
          ? "border-(--color-accent) bg-(--color-accent-bg)/40 text-(--color-text)"
          : "border-(--color-border) bg-(--color-panel) text-(--color-muted) hover:text-(--color-text)",
      )}
    >
      {label}
    </button>
  );
}

function ForwardRow({
  forward,
  running,
  onStart,
  onStop,
  onDelete,
}: {
  forward: PortForward;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 py-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          running
            ? "bg-(--color-success) shadow-[0_0_6px_var(--color-success)]"
            : "bg-(--color-muted-soft)",
        )}
        title={running ? "Actif" : "Arrêté"}
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        {forward.label && (
          <span className="truncate text-[11px] font-medium text-(--color-text)">
            {forward.label}
          </span>
        )}
        <span className="truncate font-mono text-[10px] text-(--color-muted)">
          {forward.forward_type === "dynamic" && `SOCKS5 · 127.0.0.1:${forward.local_port}`}
          {forward.forward_type === "local" &&
            `127.0.0.1:${forward.local_port} → ${forward.remote_host}:${forward.remote_port}`}
          {forward.forward_type === "remote" &&
            `serveur:${forward.local_port} ⇠ ${forward.remote_host}:${forward.remote_port}`}
        </span>
      </div>
      <span className="shrink-0 rounded bg-(--color-panel) px-1.5 py-0.5 font-mono text-[9px] uppercase text-(--color-muted)">
        {forward.forward_type}
      </span>
      {running ? (
        <button
          type="button"
          onClick={onStop}
          title="Arrêter"
          aria-label="Arrêter"
          className="rounded p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text)"
        >
          <Square className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          title="Démarrer"
          aria-label="Démarrer"
          className="rounded p-1 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-success)"
        >
          <Play className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        title="Supprimer"
        aria-label="Supprimer"
        className="rounded p-1 text-(--color-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
