import { ArrowDown, ArrowUp, GripVertical, Key, Lock, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useSshKeysStore } from "@/stores/useSshKeysStore";

type Props = {
  selectedKeyIds: string[];
  onChange: (keyIds: string[]) => void;
};

/**
 * Multi-select for SSH keys with an explicit priority order. The position
 * in the list IS the priority — index 0 will be tried first at SSH auth time.
 * Up/Down buttons let the user shuffle priorities without dragging.
 *
 * Mirrors `TagPicker` visually (badges + add popover), but selected entries
 * stay stacked vertically so the order is obvious.
 */
export function KeyPicker({ selectedKeyIds, onChange }: Props) {
  const keys = useSshKeysStore((s) => s.keys);
  const refresh = useSshKeysStore((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const keyById = useMemo(() => new Map(keys.map((k) => [k.id, k])), [keys]);
  const selectedSet = useMemo(() => new Set(selectedKeyIds), [selectedKeyIds]);
  const available = useMemo(() => keys.filter((k) => !selectedSet.has(k.id)), [keys, selectedSet]);

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= selectedKeyIds.length) return;
    const next = [...selectedKeyIds];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const remove = (id: string) => onChange(selectedKeyIds.filter((k) => k !== id));

  const add = (id: string) => {
    onChange([...selectedKeyIds, id]);
    if (available.length <= 1) setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-col gap-1 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-1.5">
        {selectedKeyIds.length === 0 && (
          <p className="px-1.5 py-0.5 text-[10px] text-(--color-muted-soft)">
            Aucune clé. L'auth se rabattra sur le mot de passe.
          </p>
        )}
        {selectedKeyIds.map((id, idx) => {
          const key = keyById.get(id);
          if (!key) return null;
          return (
            <div
              key={id}
              className="flex items-center gap-1.5 rounded-md bg-(--color-panel) px-1.5 py-1 text-[11px]"
            >
              <GripVertical className="h-3 w-3 shrink-0 text-(--color-muted-soft)" />
              <span className="grid h-4 w-4 shrink-0 place-items-center text-(--color-accent)">
                {key.has_passphrase ? <Lock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-(--color-text)">
                {key.name}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-(--color-muted-soft)">
                #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                aria-label="Monter"
                className="rounded p-0.5 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text) disabled:opacity-30"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === selectedKeyIds.length - 1}
                aria-label="Descendre"
                className="rounded p-0.5 text-(--color-muted) transition-colors hover:bg-(--color-panel-hover) hover:text-(--color-text) disabled:opacity-30"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label="Retirer la clé"
                className="rounded p-0.5 text-(--color-muted) transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={available.length === 0}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-(--color-border) px-2 py-1 text-[11px]",
            "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
          )}
        >
          {available.length === 0 && keys.length > 0
            ? "Toutes les clés sont sélectionnées"
            : keys.length === 0
              ? "Aucune clé enregistrée — Réglages › Clés SSH"
              : "Ajouter une clé"}
        </button>
      </div>

      {open && available.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-(--color-border-strong) bg-(--color-elevated) shadow-2xl shadow-black/40">
          <ul className="max-h-48 overflow-y-auto py-1">
            {available.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => add(k.id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-(--color-panel-hover)"
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center text-(--color-accent)">
                    {k.has_passphrase ? <Lock className="h-3 w-3" /> : <Key className="h-3 w-3" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-(--color-text)">{k.name}</span>
                    <span className="truncate font-mono text-[10px] text-(--color-muted-soft)">
                      {k.key_type} · {k.fingerprint}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
