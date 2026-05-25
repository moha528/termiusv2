import { CaseSensitive, ChevronDown, ChevronUp, Regex, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  onClose: () => void;
  onFindNext: (q: string, opts: { caseSensitive: boolean; regex: boolean }) => boolean;
  onFindPrev: (q: string, opts: { caseSensitive: boolean; regex: boolean }) => boolean;
};

/**
 * Floating search bar overlaid on top of an xterm.js pane. Drives
 * `SearchAddon.findNext / findPrevious`. Tracks whether the last query had a
 * match so we can show a "no result" hint instead of letting the user
 * wonder why nothing happened.
 *
 * Shortcuts inside the bar: Enter → next, Shift+Enter → previous, Esc → close.
 */
export function TerminalSearchBar({ onClose, onFindNext, onFindPrev }: Props) {
  const [q, setQ] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [hasMatch, setHasMatch] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const opts = { caseSensitive, regex };

  const runNext = () => {
    if (!q) return;
    setHasMatch(onFindNext(q, opts));
  };
  const runPrev = () => {
    if (!q) return;
    setHasMatch(onFindPrev(q, opts));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) runPrev();
      else runNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="pointer-events-auto absolute right-4 top-3 z-10 flex items-center gap-1 rounded-md border border-(--color-border-strong) bg-(--color-panel) px-2 py-1 shadow-lg shadow-black/40"
      onKeyDown={handleKey}
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          setHasMatch(null);
        }}
        placeholder="Rechercher…"
        className={cn(
          "h-7 w-56 bg-transparent px-1 text-xs outline-none placeholder:text-(--color-muted-soft)",
          hasMatch === false && q && "text-red-400",
        )}
      />
      <ToggleIcon
        active={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
        title="Sensible à la casse"
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </ToggleIcon>
      <ToggleIcon active={regex} onClick={() => setRegex((v) => !v)} title="Expression régulière">
        <Regex className="h-3.5 w-3.5" />
      </ToggleIcon>
      <span className="mx-0.5 h-4 w-px bg-(--color-border)" />
      <button
        type="button"
        onClick={runPrev}
        title="Précédent (Shift+Entrée)"
        aria-label="Précédent"
        className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={runNext}
        title="Suivant (Entrée)"
        aria-label="Suivant"
        className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Fermer (Esc)"
        aria-label="Fermer"
        className="rounded p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToggleIcon({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "rounded p-1 transition-colors",
        active
          ? "bg-(--color-accent-bg)/40 text-(--color-accent)"
          : "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)",
      )}
    >
      {children}
    </button>
  );
}
