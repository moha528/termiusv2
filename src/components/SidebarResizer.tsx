import { useCallback, useEffect, useRef } from "react";

type SidebarResizerProps = {
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
};

export function SidebarResizer({ onResize, minWidth = 180, maxWidth = 480 }: SidebarResizerProps) {
  const dragging = useRef(false);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(maxWidth, Math.max(minWidth, e.clientX));
      onResize(next);
    },
    [onResize, minWidth, maxWidth],
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onMouseDown = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-(--color-accent)/30"
    />
  );
}
