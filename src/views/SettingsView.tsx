import {
  Check,
  Cloud,
  FileText,
  Info,
  Key,
  Keyboard,
  Monitor,
  Palette,
  ShieldCheck,
  Sparkles,
  Terminal as TerminalIcon,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AboutSection } from "@/components/AboutSection";
import { IdentitiesSection } from "@/components/IdentitiesSection";
import { KeybindingsSection } from "@/components/KeybindingsSection";
import { KeysSection } from "@/components/KeysSection";
import { KnownHostsSection } from "@/components/KnownHostsSection";
import { SecuritySection } from "@/components/SecuritySection";
import { SyncSection } from "@/components/SyncSection";
import { TERMINAL_THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

type SectionId =
  | "appearance"
  | "terminal"
  | "files"
  | "productivity"
  | "keybindings"
  | "security"
  | "identities"
  | "keys"
  | "known-hosts"
  | "sync"
  | "about";

type NavEntry = {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
  hint?: string;
};

const NAV: NavEntry[] = [
  { id: "appearance", label: "Apparence", icon: <Palette className="h-3.5 w-3.5" /> },
  { id: "terminal", label: "Terminal", icon: <TerminalIcon className="h-3.5 w-3.5" /> },
  { id: "files", label: "Fichiers", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "productivity", label: "Productivité", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "keybindings", label: "Raccourcis", icon: <Keyboard className="h-3.5 w-3.5" /> },
  { id: "security", label: "Sécurité", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: "identities", label: "Identities", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "keys", label: "Clés SSH", icon: <Key className="h-3.5 w-3.5" /> },
  {
    id: "known-hosts",
    label: "Empreintes",
    icon: <Monitor className="h-3.5 w-3.5" />,
  },
  { id: "sync", label: "Sync", icon: <Cloud className="h-3.5 w-3.5" /> },
  { id: "about", label: "À propos", icon: <Info className="h-3.5 w-3.5" /> },
];

/**
 * Centered fullscreen settings modal with left navigation and scrollable
 * content pane. The previous drawer overflowed as the feature surface grew;
 * a two-pane layout scales much further without making the user scroll
 * through everything at once.
 */
export function SettingsView({ open, onClose }: Props) {
  const [section, setSection] = useState<SectionId>("appearance");

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Fermer les réglages"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        className={cn(
          "relative flex h-[80vh] max-h-[700px] w-[90vw] max-w-4xl",
          "overflow-hidden rounded-xl border border-(--color-border-strong) bg-(--color-panel)",
          "shadow-2xl shadow-black/40",
        )}
      >
        {/* Left nav */}
        <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg-soft)">
          <header className="flex h-10 shrink-0 items-center px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
              Réglages
            </span>
          </header>
          <ul className="flex-1 overflow-y-auto px-2 pb-2">
            {NAV.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSection(entry.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    section === entry.id
                      ? "bg-(--color-panel) text-(--color-text)"
                      : "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text-soft)",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded text-(--color-muted)",
                      section === entry.id && "text-(--color-accent)",
                    )}
                  >
                    {entry.icon}
                  </span>
                  <span className="flex-1 truncate font-medium">{entry.label}</span>
                  {section === entry.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right content */}
        <main className="relative flex h-full min-w-0 flex-1 flex-col">
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-(--color-border) px-4">
            <h2 className="text-sm font-semibold text-(--color-text)">
              {NAV.find((n) => n.id === section)?.label}
            </h2>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="rounded-md p-1 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <SectionContent section={section} />
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionContent({ section }: { section: SectionId }) {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const terminalTheme = useSettingsStore((s) => s.terminalTheme);
  const showHidden = useSettingsStore((s) => s.showHiddenFiles);
  const autoRestore = useSettingsStore((s) => s.autoRestoreSessions);
  const historyScope = useSettingsStore((s) => s.commandHistoryScope);
  const bellNotifications = useSettingsStore((s) => s.bellNotifications);
  const closeBehavior = useSettingsStore((s) => s.closeBehavior);
  const setSetting = useSettingsStore((s) => s.set);

  switch (section) {
    case "appearance":
      return (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-(--color-muted)">
              Palette utilisée par la sidebar, les dialogs et la zone principale.
            </p>
            <ThemeGrid
              selectedId={appTheme}
              onSelect={(id) => setSetting("appTheme", id)}
              renderPreview={(t) => <AppPreview palette={t.app} />}
            />
          </div>
          <Choice
            label="À la fermeture de la fenêtre"
            description="Que faire quand tu cliques sur la croix. La zone de notification garde l'app en arrière-plan."
            value={closeBehavior}
            options={[
              { value: "ask", label: "Demander", hint: "défaut" },
              { value: "tray", label: "Zone de notif." },
              { value: "minimize", label: "Réduire" },
              { value: "quit", label: "Quitter" },
            ]}
            onChange={(v) => setSetting("closeBehavior", v as "ask" | "tray" | "minimize" | "quit")}
          />
        </div>
      );
    case "terminal":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-(--color-muted)">
            Palette des terminaux xterm.js — indépendante de l'apparence générale.
          </p>
          <ThemeGrid
            selectedId={terminalTheme}
            onSelect={(id) => setSetting("terminalTheme", id)}
            renderPreview={(t) => <TerminalPreview theme={t.terminal} />}
          />
        </div>
      );
    case "files":
      return (
        <div className="flex flex-col gap-2">
          <Toggle
            label="Afficher les fichiers cachés"
            description="Inclut les entrées « .xxx » dans les panneaux SFTP et locaux."
            checked={showHidden}
            onChange={(v) => setSetting("showHiddenFiles", v)}
          />
          <Toggle
            label="Restaurer automatiquement les sessions"
            description="Au démarrage, rouvrir les onglets de la session précédente sans demander."
            checked={autoRestore === true}
            onChange={(v) => setSetting("autoRestoreSessions", v ? true : null)}
          />
        </div>
      );
    case "productivity":
      return (
        <div className="flex flex-col gap-3">
          <Choice
            label="Portée de l'historique de commandes"
            description="Filtre appliqué quand tu ouvres l'historique avec Ctrl+R."
            value={historyScope}
            options={[
              { value: "host", label: "Host actif + global", hint: "recommandé" },
              { value: "global", label: "Toutes sessions" },
            ]}
            onChange={(v) => setSetting("commandHistoryScope", v as "host" | "global")}
          />
          <Choice
            label="Notifications terminal bell (\\a)"
            description="Une notification système est émise quand le shell envoie un BEL."
            value={bellNotifications}
            options={[
              { value: "focus-only", label: "App en arrière-plan", hint: "défaut" },
              { value: "all", label: "Toujours" },
              { value: "off", label: "Désactivé" },
            ]}
            onChange={(v) => setSetting("bellNotifications", v as "off" | "focus-only" | "all")}
          />
        </div>
      );
    case "keybindings":
      return <KeybindingsSection />;
    case "security":
      return <SecuritySection />;
    case "identities":
      return <IdentitiesSection />;
    case "keys":
      return <KeysSection />;
    case "known-hosts":
      return <KnownHostsSection />;
    case "sync":
      return <SyncSection />;
    case "about":
      return <AboutSection />;
  }
}

function Choice({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-3">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        {description && <span className="text-[10px] text-(--color-muted)">{description}</span>}
      </div>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
              value === o.value
                ? "border-(--color-accent) bg-(--color-accent-bg)/30 text-(--color-text)"
                : "border-(--color-border) bg-(--color-panel) text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)",
            )}
          >
            {o.label}
            {o.hint && <span className="text-[10px] text-(--color-muted-soft)">· {o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeGrid({
  selectedId,
  onSelect,
  renderPreview,
}: {
  selectedId: ThemeId;
  onSelect: (id: ThemeId) => void;
  renderPreview: (theme: (typeof TERMINAL_THEMES)[ThemeId]) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(Object.entries(TERMINAL_THEMES) as [ThemeId, (typeof TERMINAL_THEMES)[ThemeId]][]).map(
        ([id, t]) => {
          const selected = selectedId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              title={t.name}
              className={cn(
                "group relative flex items-center gap-2 overflow-hidden rounded-md border px-2 py-2 text-left transition-all",
                selected
                  ? "border-(--color-accent) bg-(--color-accent-bg)/30 ring-1 ring-(--color-accent)/30"
                  : "border-(--color-border) bg-(--color-bg-soft) hover:border-(--color-border-strong) hover:bg-(--color-panel-hover)",
              )}
            >
              {renderPreview(t)}
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.name}</span>
              {selected && <Check className="h-3 w-3 shrink-0 text-(--color-accent)" />}
            </button>
          );
        },
      )}
    </div>
  );
}

function TerminalPreview({
  theme,
}: {
  theme: {
    background?: string;
    foreground?: string;
    cursor?: string;
    blue?: string;
    magenta?: string;
    green?: string;
  };
}) {
  return (
    <div
      className="grid h-6 w-6 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-sm border border-black/20"
      style={{ background: theme.background }}
      aria-hidden
    >
      <span style={{ background: theme.foreground, opacity: 0.85 }} />
      <span style={{ background: theme.blue ?? theme.cursor }} />
      <span style={{ background: theme.magenta ?? theme.cursor }} />
      <span style={{ background: theme.green ?? theme.foreground }} />
    </div>
  );
}

function AppPreview({ palette }: { palette: Record<string, string> }) {
  return (
    <div
      className="flex h-6 w-6 shrink-0 overflow-hidden rounded-sm border"
      style={{
        borderColor: palette["--color-border-strong"],
        background: palette["--color-bg"],
      }}
      aria-hidden
    >
      <div className="w-1/3" style={{ background: palette["--color-bg-soft"] }} />
      <div className="flex flex-1 items-end justify-end p-0.5">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{ background: palette["--color-accent"] }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-3 py-2 text-left hover:bg-(--color-panel-hover)"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-medium text-(--color-text)">{label}</span>
        {description && <span className="text-[10px] text-(--color-muted)">{description}</span>}
      </span>
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-(--color-accent)" : "bg-(--color-elevated)",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
