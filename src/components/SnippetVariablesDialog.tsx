import { useEffect, useRef, useState } from "react";

import type { Snippet } from "@/lib/bindings/Snippet";

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

type Props = {
  request: { snippet: Snippet; variables: string[] } | null;
  onClose: () => void;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
};

/**
 * Modal that asks the user for one value per `{{var}}` detected in a snippet,
 * after built-ins ({{host}}, {{user}}, {{date}}) have been auto-filled.
 * Pressing Enter on the last field submits.
 */
export function SnippetVariablesDialog({ request, onClose, onConfirm }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!request) return;
    const init: Record<string, string> = {};
    for (const v of request.variables) init[v] = "";
    setValues(init);
    // Focus the first input on next tick.
    queueMicrotask(() => firstRef.current?.focus());
  }, [request]);

  const open = request !== null;
  const variables = request?.variables ?? [];

  const handleConfirm = async () => {
    await onConfirm(values);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            const inputs = Array.from(
              (e.currentTarget as HTMLElement).querySelectorAll<HTMLInputElement>(
                "input[data-snippet-var]",
              ),
            );
            const idx = inputs.indexOf(e.target as HTMLInputElement);
            if (idx >= 0 && idx === inputs.length - 1) {
              e.preventDefault();
              void handleConfirm();
            }
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{request?.snippet.name ?? ""}</DialogTitle>
          <DialogDescription>
            Renseigne les valeurs avant d'envoyer la commande au terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {variables.map((v, idx) => (
            <div key={v} className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-(--color-muted)">{`{{${v}}}`}</span>
              <Input
                ref={idx === 0 ? firstRef : undefined}
                data-snippet-var
                value={values[v] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.currentTarget.value }))}
                placeholder="…"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleConfirm}>Insérer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
