type SidebarProps = {
  width: number;
};

export function Sidebar({ width }: SidebarProps) {
  return (
    <aside
      className="flex shrink-0 flex-col border-r border-(--color-border) bg-(--color-panel)"
      style={{ width }}
    >
      <div className="flex h-10 items-center justify-between border-b border-(--color-border) px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
          Servers
        </h2>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-(--color-muted) hover:bg-white/5 hover:text-(--color-text)"
          title="Add server (à venir — P1-T07)"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 text-sm text-(--color-muted)">
        <p className="px-2 py-1 text-xs italic">
          Aucun serveur. Cliquez sur « + Add » pour en créer un.
        </p>
      </div>
    </aside>
  );
}
