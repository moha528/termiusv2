import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { SidebarResizer } from "./SidebarResizer";
import { TabsBar } from "./TabsBar";

export function MainLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(260);

  return (
    <div className="flex h-screen w-screen flex-col bg-(--color-bg) text-(--color-text)">
      <header className="flex h-10 shrink-0 items-center border-b border-(--color-border) bg-(--color-panel) px-3 text-sm font-medium">
        <span className="text-(--color-accent)">●</span>
        <span className="ml-2">Termius v2</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar width={sidebarWidth} />
        <SidebarResizer onResize={setSidebarWidth} />

        <main className="flex min-w-0 flex-1 flex-col">
          <TabsBar />
          <section className="flex flex-1 items-center justify-center text-(--color-muted)">
            <p className="text-sm italic">
              Ouvrez un serveur depuis la sidebar pour démarrer une session.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
