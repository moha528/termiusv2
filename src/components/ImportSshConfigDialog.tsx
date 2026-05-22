import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { SshConfigImportEntry } from "@/lib/bindings/SshConfigImportEntry";
import { withToast } from "@/lib/feedback";
import { importApi } from "@/lib/import";
import { cn } from "@/lib/utils";
import { useServersStore } from "@/stores/useServersStore";

import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ImportState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; path: string; entries: SshConfigImportEntry[] }
  | { kind: "error"; message: string };

/**
 * Two-step import flow:
 * 1. Read the user's `~/.ssh/config` and show the parsed entries with check
 *    boxes. Duplicates (same label as an existing host) are pre-unchecked and
 *    flagged so the user has to opt-in to override them (which we skip anyway
 *    in the backend, but the UI surfaces the conflict).
 * 2. The user picks a subset and confirms. The backend imports them and the
 *    servers store is refreshed.
 */
export function ImportSshConfigDialog({ open, onOpenChange }: Props) {
  const refresh = useServersStore((s) => s.refresh);
  const [state, setState] = useState<ImportState>({ kind: "idle" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setState({ kind: "loading" });
    importApi
      .readSshConfig()
      .then((res) => {
        setState({ kind: "loaded", path: res.path, entries: res.entries });
        // Pre-select all non-duplicate entries that have a hostname.
        setSelected(
          new Set(res.entries.filter((e) => !e.duplicate && e.hostname).map((e) => e.alias)),
        );
      })
      .catch((e) => setState({ kind: "error", message: String(e) }));
  }, [open]);

  const toggle = (alias: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  };

  const onSubmit = async () => {
    if (state.kind !== "loaded") return;
    setSubmitting(true);
    try {
      const created = await withToast(importApi.importSshConfig(Array.from(selected)), {
        loading: `Import de ${selected.size} entrée${selected.size > 1 ? "s" : ""}…`,
        success: (hosts) =>
          hosts.length === 0
            ? "Rien à importer"
            : `${hosts.length} serveur${hosts.length > 1 ? "s" : ""} importé${hosts.length > 1 ? "s" : ""}`,
      });
      await refresh();
      if (created.length > 0) onOpenChange(false);
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-(--color-accent-bg) text-(--color-accent)">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>Importer depuis ~/.ssh/config</DialogTitle>
              <DialogDescription>
                {state.kind === "loaded" ? (
                  <span className="font-mono">{state.path}</span>
                ) : (
                  "Parse votre fichier OpenSSH et crée un host par alias détecté."
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Body state={state} selected={selected} onToggle={toggle} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || state.kind !== "loaded" || selected.size === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Importer ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Body({
  state,
  selected,
  onToggle,
}: {
  state: ImportState;
  selected: Set<string>;
  onToggle: (alias: string) => void;
}) {
  if (state.kind === "loading") {
    return (
      <div className="flex h-40 items-center justify-center text-(--color-muted)">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-400">
        <AlertCircle className="h-4 w-4" />
        {state.message}
      </div>
    );
  }

  if (state.kind !== "loaded") return null;

  if (state.entries.length === 0) {
    return (
      <div className="grid place-items-center py-8 text-center">
        <FileText className="h-8 w-8 text-(--color-muted-soft)" />
        <p className="mt-2 text-sm text-(--color-text-soft)">Aucun host détecté</p>
        <p className="mt-1 text-xs text-(--color-muted)">
          Le fichier est vide ou ne contient que des wildcards / Match blocks.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-(--color-border)">
      <ul className="divide-y divide-(--color-border)">
        {state.entries.map((e) => {
          const checked = selected.has(e.alias);
          const disabled = !e.hostname;
          return (
            <li
              key={e.alias}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                e.duplicate && "bg-yellow-950/20",
                disabled && "opacity-50",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => !disabled && onToggle(e.alias)}
                disabled={disabled}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{e.alias}</span>
                  {e.duplicate && (
                    <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-medium text-yellow-300">
                      déjà importé
                    </span>
                  )}
                  {!e.hostname && (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                      sans HostName
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-[11px] text-(--color-muted)">
                  {e.user ?? "?"}@{e.hostname ?? "?"}
                  {e.port && e.port !== 22 ? `:${e.port}` : ""}
                  {e.proxy_jump ? ` (proxy ${e.proxy_jump})` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
