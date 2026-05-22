import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { Host } from "@/lib/bindings/Host";
import type { HostInput } from "@/lib/bindings/HostInput";
import { withToast } from "@/lib/feedback";
import { useServersStore } from "@/stores/useServersStore";

import { Button } from "./ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
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

export function HostFormDialog({ open, onOpenChange, host }: Props) {
  const create = useServersStore((s) => s.create);
  const update = useServersStore((s) => s.update);
  const isEdit = Boolean(host);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(host),
  });

  useEffect(() => {
    if (open) form.reset(defaultsFor(host));
  }, [open, host, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const input: HostInput = {
      label: values.label.trim(),
      hostname: values.hostname.trim(),
      port: values.port,
      username: values.username.trim(),
      group_id: host?.group_id ?? null,
    };
    if (host) {
      await withToast(update(host.id, input), {
        loading: `Mise à jour de « ${input.label} »`,
        success: "Serveur mis à jour",
      });
    } else {
      await withToast(create(input), {
        loading: `Création de « ${input.label} »`,
        success: "Serveur créé",
      });
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le serveur" : "Nouveau serveur"}</DialogTitle>
          <DialogDescription>
            Les mots de passe seront stockés dans le keychain de l'OS (P3-T06).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3">
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

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 text-xs">
      <span className="font-medium text-(--color-muted)">{label}</span>
      {children}
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
