import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Custom OS-window chrome. Tauri is configured with `decorations: false`
 * so we own the entire chrome: title bar, drag region, window controls.
 *
 * Right-side controls match common conventions (Windows order: min, max, close).
 * On macOS, the "traffic lights" remain the platform's natural position
 * (left side) — we still render a draggable empty band on the left so the
 * native controls sit on top.
 */
type Props = {
  children: React.ReactNode;
};

export function Titlebar({ children }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});
    const unlistenPromise = win.onResized(async () => {
      try {
        setMaximized(await win.isMaximized());
      } catch {
        // ignore
      }
    });
    return () => {
      unlistenPromise.then((un) => un()).catch(() => {});
    };
  }, []);

  const onMinimize = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch(() => {});
  }, []);
  const onMaximize = useCallback(() => {
    getCurrentWindow()
      .toggleMaximize()
      .catch(() => {});
  }, []);
  const onClose = useCallback(() => {
    getCurrentWindow()
      .close()
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-11 shrink-0 items-stretch border-b border-(--color-border) bg-(--color-panel)">
      {/* Drag region wraps everything that is NOT a button */}
      <div data-tauri-drag-region className="flex flex-1 items-center px-3">
        {children}
      </div>

      <div className="flex items-stretch">
        <ControlButton onClick={onMinimize} label="Minimize">
          <Minus className="h-3.5 w-3.5" />
        </ControlButton>
        <ControlButton onClick={onMaximize} label={maximized ? "Restore" : "Maximize"}>
          <Square className="h-3 w-3" />
        </ControlButton>
        <ControlButton onClick={onClose} label="Close" variant="danger">
          <X className="h-3.5 w-3.5" />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
  variant = "default",
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-full w-11 items-center justify-center text-(--color-muted) transition-colors",
        variant === "danger"
          ? "hover:bg-red-600 hover:text-white"
          : "hover:bg-(--color-panel-hover) hover:text-(--color-text)",
      )}
    >
      {children}
    </button>
  );
}
