import { useEffect } from "react";

import type { WhatsNewEntry } from "@/lib/whatsNew";

/**
 * Fenêtre « Quoi de neuf » affichée après une mise à jour. Dismissible
 * (clic en dehors, Échap, ou le bouton). Le parent persiste la version vue.
 */
export function WhatsNewDialog({
  entries,
  onClose,
}: {
  entries: WhatsNewEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-panel) shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-(--color-border) bg-gradient-to-br from-(--color-accent-bg) to-transparent px-5 py-4">
          <img src="/logo-mark.png" alt="" className="h-8 w-8 select-none" draggable={false} />
          <div className="leading-tight">
            <h2 className="text-sm font-semibold text-(--color-text)">Quoi de neuf</h2>
            <p className="font-mono text-[11px] text-(--color-muted)">
              Lynk Client v{entries[0].version}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {entries.map((entry) => (
            <section key={entry.version} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-(--color-accent-bg) px-1.5 py-0.5 font-mono text-[10px] text-(--color-accent)">
                  v{entry.version}
                </span>
                <span className="text-xs font-semibold text-(--color-text)">{entry.title}</span>
              </div>
              <ul className="space-y-2">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-(--color-muted)">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-(--color-border) px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-(--color-accent) px-4 py-1.5 text-sm font-medium text-(--color-bg) transition hover:opacity-90"
          >
            Super, merci !
          </button>
        </div>
      </div>
    </div>
  );
}
