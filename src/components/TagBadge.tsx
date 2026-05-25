import { X } from "lucide-react";

import type { Tag } from "@/lib/bindings/Tag";
import { cn } from "@/lib/utils";

type Props = {
  tag: Tag;
  size?: "xs" | "sm";
  /** When true, render a filled pill in the tag's color (used by the filter bar). */
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
};

/**
 * Discreet tag chip: a small colored dot followed by the tag name.
 *
 * Two visual states:
 *   - default (selected = false): subtle neutral background, colored dot,
 *     name in soft text. Used as a passive label under hosts.
 *   - selected (filter bar, active): filled background in the tag color
 *     with readable text. Inverts the role of the dot/name.
 *
 * Why a dot instead of an outlined border: borders + colored text on a dark
 * theme read as "warning chips" rather than passive metadata. A dot keeps
 * the color signal without screaming for attention.
 */
export function TagBadge({ tag, size = "xs", selected, onClick, onRemove, className }: Props) {
  const dims = size === "xs" ? "h-5 px-1.5 text-[10px] gap-1" : "h-6 px-2 text-[11px] gap-1.5";
  const dotSize = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
  const interactive = onClick !== undefined;

  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "inline-flex items-center rounded-md font-medium leading-none select-none",
        "transition-colors",
        dims,
        // Selected: solid fill of the tag color, text contrast computed below.
        selected && "shadow-sm",
        // Default: neutral panel background, hover slightly lifts.
        !selected && "bg-(--color-panel) hover:bg-(--color-panel-hover)",
        interactive && "cursor-pointer",
        className,
      )}
      style={
        selected
          ? {
              backgroundColor: tag.color,
              color: readableTextOn(tag.color),
            }
          : { color: "var(--color-text-soft)" }
      }
      title={tag.name}
    >
      <span
        className={cn("inline-block rounded-full", dotSize)}
        style={{ backgroundColor: selected ? readableTextOn(tag.color) : tag.color }}
      />
      <span className="truncate max-w-28">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Retirer ${tag.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 grid h-3 w-3 place-items-center rounded-full opacity-60 hover:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** Pick black or white text depending on the perceived brightness of `hex`. */
function readableTextOn(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#000";
  const r = Number.parseInt(m.slice(0, 2), 16);
  const g = Number.parseInt(m.slice(2, 4), 16);
  const b = Number.parseInt(m.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55 ? "#0f172a" : "#f8fafc";
}
