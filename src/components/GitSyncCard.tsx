import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PowerOff,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { SyncConfigInput } from "@/lib/bindings/SyncConfigInput";
import type { SyncState } from "@/lib/bindings/SyncState";
import { withToast } from "@/lib/feedback";
import { syncGitApi } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useSyncStore } from "@/stores/useSyncStore";

import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

type AuthMethod = "none" | "https-pat" | "ssh";

/**
 * Settings card : configuration et opérations Git sync (P5-T03/T04/T05).
 *
 * Le composant gère trois sous-états :
 *   - `disabled` : aucune sync configurée → formulaire de config
 *   - `enabled` : sync active → boutons push/pull + statut
 *   - `enabled & error` : surface du dernier message d'erreur, le reste
 *     du panneau reste fonctionnel pour permettre de réessayer.
 *
 * Le PAT n'est jamais relu côté front une fois enregistré dans le keychain.
 * Pour rotation, l'utilisateur entre un nouveau token et clique "Save".
 */
export function GitSyncCard() {
  const config = useSyncStore((s) => s.config);
  const status = useSyncStore((s) => s.status);
  const hasPassword = useSyncStore((s) => s.hasPassword);
  const lastResult = useSyncStore((s) => s.lastResult);
  const hydrate = useSyncStore((s) => s.hydrate);
  const pushNow = useSyncStore((s) => s.pushNow);
  const pullNow = useSyncStore((s) => s.pullNow);
  const refreshPassword = useSyncStore((s) => s.refreshPassword);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!config) {
    return <ConfigureForm onSaved={hydrate} />;
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium text-(--color-text)">Sync Git active</span>
          <code className="truncate font-mono text-[10px] text-(--color-muted-soft)">
            {config.repo_url} · {config.branch}
          </code>
        </div>
        <StatusBadge status={status} config={config} />
      </header>

      {!hasPassword && <PasswordPrompt onSaved={refreshPassword} />}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          disabled={status === "busy" || !hasPassword}
          onClick={() =>
            void withToast(
              pushNow().then((r) => r ?? Promise.reject(new Error("non démarré"))),
              {
                loading: "Push…",
                success: (r) => `Push : ${r.summary}`,
              },
            )
          }
        >
          <ArrowUpToLine className="h-3.5 w-3.5" />
          Push
        </Button>
        <Button
          variant="outline"
          disabled={status === "busy" || !hasPassword}
          onClick={() =>
            void withToast(
              pullNow().then((r) => r ?? Promise.reject(new Error("non démarré"))),
              {
                loading: "Pull…",
                success: (r) => `Pull : ${r.summary}`,
              },
            )
          }
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Pull
        </Button>
      </div>

      <Meta config={config} lastResult={lastResult} />

      <div className="flex items-center justify-between gap-2 border-t border-(--color-border) pt-2">
        <Button
          variant="ghost"
          className="text-[11px] text-(--color-muted)"
          onClick={async () => {
            await withToast(syncGitApi.disable().then(hydrate), {
              loading: "Désactivation…",
              success: "Sync désactivée",
            });
          }}
        >
          <PowerOff className="h-3 w-3" />
          Désactiver la sync
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status, config }: { status: string; config: SyncState }) {
  if (status === "busy") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-(--color-accent-bg)/30 px-2 py-0.5 text-[10px] text-(--color-accent)">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sync…
      </span>
    );
  }
  if (status === "error" || config.last_error) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
        title={config.last_error ?? undefined}
      >
        <AlertCircle className="h-3 w-3" />
        Erreur
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
      <CheckCircle2 className="h-3 w-3" />
      Prêt
    </span>
  );
}

function Meta({
  config,
  lastResult,
}: {
  config: SyncState;
  lastResult: { summary: string } | null;
}) {
  return (
    <ul className="flex flex-col gap-0.5 text-[10px] text-(--color-muted)">
      <li>
        Dernier push :{" "}
        <span className="text-(--color-text-soft)">{config.last_pushed_at ?? "—"}</span>
      </li>
      <li>
        Dernier pull :{" "}
        <span className="text-(--color-text-soft)">{config.last_pulled_at ?? "—"}</span>
      </li>
      {lastResult && (
        <li>
          Dernière opération :{" "}
          <span className="text-(--color-text-soft)">{lastResult.summary}</span>
        </li>
      )}
      {config.last_error && <li className="text-red-400">Erreur : {config.last_error}</li>}
    </ul>
  );
}

// ---------- Configure ----------

function ConfigureForm({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("https-pat");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  const input: SyncConfigInput = {
    repo_url: repoUrl.trim(),
    branch: branch.trim() || "main",
    auth_method: authMethod,
    enabled: true,
  };

  const canSubmit =
    repoUrl.trim().length > 0 &&
    password.length > 0 &&
    (authMethod !== "https-pat" || pat.length > 0);

  const handleTest = async () => {
    setTesting(true);
    setTested(false);
    try {
      await withToast(syncGitApi.testConnection(input, pat || null), {
        loading: "Test de connexion…",
        success: "Connexion OK",
      });
      setTested(true);
    } catch (e) {
      console.warn("test connection:", e);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    await withToast(
      (async () => {
        await syncGitApi.setPassword(password);
        await syncGitApi.configure(input, authMethod === "https-pat" ? pat : null);
      })(),
      { loading: "Enregistrement…", success: "Sync configurée" },
    );
    await onSaved();
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--color-border) bg-(--color-bg-soft) p-3">
      <header className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-(--color-text)">Configurer la sync Git</span>
        <span className="text-[10px] text-(--color-muted)">
          Le vault chiffré sera poussé dans un repo Git (de préférence privé) que tu contrôles.
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-(--color-muted)">URL du repo</span>
        <Input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.currentTarget.value)}
          placeholder="https://github.com/<user>/<repo>.git ou git@github.com:<user>/<repo>.git"
          spellCheck={false}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-(--color-muted)">Branche</span>
          <Input
            value={branch}
            onChange={(e) => setBranch(e.currentTarget.value)}
            placeholder="main"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-(--color-muted)">Authentification</span>
          <select
            value={authMethod}
            onChange={(e) => setAuthMethod(e.currentTarget.value as AuthMethod)}
            className="h-9 rounded-md border border-(--color-border) bg-(--color-bg) px-2 text-xs outline-none focus:border-(--color-accent)"
          >
            <option value="https-pat">HTTPS + Token (PAT)</option>
            <option value="ssh">SSH (clé système)</option>
            <option value="none">Aucune (repo public)</option>
          </select>
        </div>
      </div>

      {authMethod === "https-pat" && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-(--color-muted)">
            Personal Access Token (jamais réaffiché — rotation = re-saisir un nouveau)
          </span>
          <div className="flex items-center gap-1">
            <Input
              type={showPat ? "text" : "password"}
              value={pat}
              onChange={(e) => setPat(e.currentTarget.value)}
              placeholder="ghp_… (GitHub) · glpat-… (GitLab) · …"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowPat((v) => !v)}
              title={showPat ? "Masquer" : "Afficher"}
              aria-label="Toggle visibility"
              className="rounded p-2 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
            >
              {showPat ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-(--color-muted)">
          Mot de passe de chiffrement du vault
        </span>
        <div className="flex items-center gap-1">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="Stocké dans le keychain OS, jamais sur le repo"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Masquer" : "Afficher"}
            aria-label="Toggle visibility"
            className="rounded p-2 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <span className="text-[10px] text-(--color-muted-soft)">
          Doit être identique sur toutes tes machines — sans lui, le contenu du repo est illisible
          (AES-256-GCM).
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-(--color-border) pt-2">
        <Button variant="outline" onClick={handleTest} disabled={!repoUrl.trim() || testing}>
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : tested ? (
            <Check className={cn("h-3.5 w-3.5 text-(--color-success)")} />
          ) : null}
          Tester la connexion
        </Button>
        <Button onClick={handleSave} disabled={!canSubmit}>
          Activer la sync
        </Button>
      </div>
    </div>
  );
}

function PasswordPrompt({ onSaved }: { onSaved: () => void | Promise<void> }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  return (
    <div className="flex items-end gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] text-amber-200">
          Mot de passe de chiffrement non disponible — ré-entre-le pour continuer à push/pull.
        </span>
        <div className="flex items-center gap-1">
          <Input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.currentTarget.value)}
            placeholder="Mot de passe de chiffrement"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label="Toggle visibility"
            className="rounded p-2 text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          if (!pw) return;
          await withToast(syncGitApi.setPassword(pw).then(onSaved), {
            loading: "Enregistrement…",
            success: "Mot de passe enregistré",
          });
          setPw("");
        }}
        disabled={!pw}
      >
        Enregistrer
      </Button>
    </div>
  );
}
