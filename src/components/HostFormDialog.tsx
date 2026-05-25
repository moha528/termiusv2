import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { Host } from "@/lib/bindings/Host";
import type { HostInput } from "@/lib/bindings/HostInput";
import { withToast } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGroupsStore } from "@/stores/useGroupsStore";
import { useIdentitiesStore } from "@/stores/useIdentitiesStore";
import { useServersStore } from "@/stores/useServersStore";
import { useSshKeysStore } from "@/stores/useSshKeysStore";
import { useTagsStore } from "@/stores/useTagsStore";

import { KeyPicker } from "./KeyPicker";
import { TagPicker } from "./TagPicker";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";

const schema = z.object({
  label: z.string().min(1, "Label requis"),
  hostname: z.string().min(1, "Hostname requis"),
  port: z.number({ message: "Port requis" }).int().min(1, "Port >= 1").max(65535, "Port <= 65535"),
  username: z.string().min(1, "Username requis"),
  password: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host?: Host | null;
};

type Tab = "general" | "auth" | "advanced";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "Général" },
  { id: "auth", label: "Authentification" },
  { id: "advanced", label: "Avancé" },
];

/**
 * Host create/edit dialog laid out as three tabs to keep the visible height
 * bounded — the previous single-column form scrolled off-screen as the
 * feature surface grew. Header and tab bar are sticky; the active tab's
 * content scrolls inside a max-h container so we never overflow the viewport.
 */
export function HostFormDialog({ open, onOpenChange, host }: Props) {
  const create = useServersStore((s) => s.create);
  const update = useServersStore((s) => s.update);
  const groups = useGroupsStore((s) => s.groups);
  const refreshGroups = useGroupsStore((s) => s.refresh);
  const refreshTags = useTagsStore((s) => s.refresh);
  const setHostTags = useTagsStore((s) => s.setHostTags);
  const refreshKeys = useSshKeysStore((s) => s.refresh);
  const setHostKeys = useSshKeysStore((s) => s.setHostKeys);
  const refreshIdentities = useIdentitiesStore((s) => s.refresh);
  const identities = useIdentitiesStore((s) => s.identities);
  const isEdit = Boolean(host);

  const allHosts = useServersStore((s) => s.hosts);

  const [tab, setTab] = useState<Tab>("general");
  const [groupId, setGroupId] = useState<string | null>(host?.group_id ?? null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [keyIds, setKeyIds] = useState<string[]>([]);
  const [proxyJumpHostId, setProxyJumpHostId] = useState<string | null>(
    host?.proxy_jump_host_id ?? null,
  );
  const [identityId, setIdentityId] = useState<string | null>(host?.identity_id ?? null);
  const [agentForward, setAgentForward] = useState(host?.agent_forward ?? false);
  const [logToFile, setLogToFile] = useState(host?.log_to_file ?? false);
  const [preConnect, setPreConnect] = useState(host?.pre_connect_script ?? "");
  const [postConnect, setPostConnect] = useState(host?.post_connect_script ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(host),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: open + host id only
  useEffect(() => {
    if (!open) return;
    setTab("general");
    form.reset(defaultsFor(host));
    setGroupId(host?.group_id ?? null);
    setProxyJumpHostId(host?.proxy_jump_host_id ?? null);
    setIdentityId(host?.identity_id ?? null);
    setAgentForward(host?.agent_forward ?? false);
    setLogToFile(host?.log_to_file ?? false);
    setPreConnect(host?.pre_connect_script ?? "");
    setPostConnect(host?.post_connect_script ?? "");
    refreshGroups();
    void refreshIdentities();
    refreshTags().then(() => {
      const fresh = useTagsStore.getState().links;
      setTagIds(host ? (fresh[host.id] ?? []) : []);
    });
    refreshKeys().then(() => {
      const fresh = useSshKeysStore.getState().hostLinks;
      setKeyIds(host ? (fresh[host.id] ?? []) : []);
    });
  }, [open, host?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    const input: HostInput = {
      label: values.label.trim(),
      hostname: values.hostname.trim(),
      port: values.port,
      username: values.username.trim(),
      group_id: groupId,
      proxy_jump_host_id: proxyJumpHostId,
      identity_id: identityId,
      agent_forward: agentForward,
      log_to_file: logToFile,
      pre_connect_script: preConnect,
      post_connect_script: postConnect,
    };
    if (host) {
      const updated = await withToast(update(host.id, input), {
        loading: `Mise à jour de « ${input.label} »`,
        success: "Serveur mis à jour",
      });
      await setHostTags(updated.id, tagIds);
      await setHostKeys(updated.id, keyIds);
    } else {
      const created = await withToast(create(input), {
        loading: `Création de « ${input.label} »`,
        success: "Serveur créé",
      });
      await setHostTags(created.id, tagIds);
      await setHostKeys(created.id, keyIds);
    }
    onOpenChange(false);
  });

  // The "Général" tab is the only one with required zod-validated fields,
  // so we surface the badge there when the form is invalid.
  const generalHasErrors =
    Boolean(form.formState.errors.label) ||
    Boolean(form.formState.errors.hostname) ||
    Boolean(form.formState.errors.username) ||
    Boolean(form.formState.errors.port);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="border-b border-(--color-border) p-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier le serveur" : "Nouveau serveur"}</DialogTitle>
            <DialogDescription>
              Les mots de passe sont stockés dans le keychain de l'OS.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex items-center gap-1 border-b border-(--color-border) px-3 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-(--color-panel-hover) text-(--color-text)"
                  : "text-(--color-muted) hover:bg-(--color-panel-hover) hover:text-(--color-text)",
              )}
            >
              {t.label}
              {t.id === "general" && generalHasErrors && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col">
          <div className="max-h-[60vh] overflow-y-auto p-5">
            {tab === "general" && (
              <div className="grid gap-3">
                <Field label="Label" error={form.formState.errors.label?.message}>
                  <Input placeholder="prod-1" autoFocus {...form.register("label")} />
                </Field>
                <Field label="Hostname" error={form.formState.errors.hostname?.message}>
                  <Input
                    placeholder="prod1.example.com"
                    spellCheck={false}
                    {...form.register("hostname")}
                  />
                </Field>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <Field label="Username" error={form.formState.errors.username?.message}>
                    <Input placeholder="root" spellCheck={false} {...form.register("username")} />
                  </Field>
                  <Field label="Port" error={form.formState.errors.port?.message}>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      {...form.register("port", { valueAsNumber: true })}
                    />
                  </Field>
                </div>
                <Field label="Groupe">
                  <select
                    value={groupId ?? ""}
                    onChange={(e) => setGroupId(e.currentTarget.value || null)}
                    className="h-9 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 text-xs outline-none focus:border-(--color-accent)"
                  >
                    <option value="">Aucun</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tags">
                  <TagPicker selectedTagIds={tagIds} onChange={setTagIds} />
                </Field>
              </div>
            )}

            {tab === "auth" && (
              <div className="grid gap-3">
                <Field
                  label="Identity (profil partagé)"
                  hint="Quand une identity est sélectionnée, son username + agent forward + clés sont utilisés à la place des champs ci-dessous."
                >
                  <select
                    value={identityId ?? ""}
                    onChange={(e) => setIdentityId(e.currentTarget.value || null)}
                    className="h-9 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 text-xs outline-none focus:border-(--color-accent)"
                  >
                    <option value="">Aucune (utiliser les champs du host)</option>
                    {identities.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.username})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Clés SSH"
                  hint={
                    identityId
                      ? "Inutilisé tant qu'une identity est sélectionnée."
                      : "L'auth essaie les clés dans l'ordre, puis le mot de passe en dernier."
                  }
                >
                  <KeyPicker selectedKeyIds={keyIds} onChange={setKeyIds} />
                </Field>
              </div>
            )}

            {tab === "advanced" && (
              <div className="grid gap-3">
                <Field
                  label="ProxyJump (bastion)"
                  hint="La connexion sera tunnelée à travers ce serveur."
                >
                  <select
                    value={proxyJumpHostId ?? ""}
                    onChange={(e) => setProxyJumpHostId(e.currentTarget.value || null)}
                    className="h-9 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2 text-xs outline-none focus:border-(--color-accent)"
                  >
                    <option value="">Aucun (connexion directe)</option>
                    {allHosts
                      .filter((h) => h.id !== host?.id)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.label} ({h.username}@{h.hostname}
                          {h.port !== 22 ? `:${h.port}` : ""})
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-(--color-muted)">Options</span>
                  <ToggleRow
                    checked={agentForward}
                    onChange={setAgentForward}
                    label="SSH agent forwarding"
                    description={
                      identityId
                        ? "Hérité de l'identity sélectionnée."
                        : "Permet d'utiliser tes clés locales depuis le serveur distant."
                    }
                  />
                  <ToggleRow
                    checked={logToFile}
                    onChange={setLogToFile}
                    label="Journaliser la session"
                    description="Écrit le flux PTY dans un .log côté app."
                  />
                </div>
                <Field
                  label="Pre-connect script (local)"
                  hint="Lignes shell exécutées localement avant la connexion SSH (#commentaire OK)."
                >
                  <textarea
                    value={preConnect}
                    onChange={(e) => setPreConnect(e.currentTarget.value)}
                    rows={3}
                    placeholder="# wake-on-lan ab:cd:ef:01:02:03"
                    spellCheck={false}
                    className="resize-none rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-[11px] text-(--color-text) shadow-inner focus-visible:border-(--color-accent) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent)"
                  />
                </Field>
                <Field
                  label="Post-connect script (remote)"
                  hint="Lignes envoyées directement au shell distant après ouverture."
                >
                  <textarea
                    value={postConnect}
                    onChange={(e) => setPostConnect(e.currentTarget.value)}
                    rows={3}
                    placeholder="cd /var/www && tail -f log"
                    spellCheck={false}
                    className="resize-none rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-[11px] text-(--color-text) shadow-inner focus-visible:border-(--color-accent) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent)"
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-(--color-border) bg-(--color-bg-soft)/50 px-5 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-2 rounded-md border border-(--color-border) bg-(--color-bg-soft) px-2.5 py-1.5 text-left hover:bg-(--color-panel-hover)"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium text-(--color-text)">{label}</span>
        {description && (
          <span className="text-[10px] text-(--color-muted-soft)">{description}</span>
        )}
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked ? "bg-(--color-accent)" : "bg-(--color-elevated)"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
            checked ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function defaultsFor(host: Host | null | undefined): FormValues {
  return {
    label: host?.label ?? "",
    hostname: host?.hostname ?? "",
    port: host?.port ?? 22,
    username: host?.username ?? "",
    password: "",
  };
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="font-medium text-(--color-muted)">{label}</span>
      {children}
      {hint && !error && <span className="text-[10px] text-(--color-muted-soft)">{hint}</span>}
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
