import { useEffect, useState } from "react";

import type { Snippet } from "@/lib/bindings/Snippet";
import { withToast } from "@/lib/feedback";
import { useSnippetsStore } from "@/stores/useSnippetsStore";

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
  /** `undefined` → dialog closed. `null` → create. `Snippet` → edit. */
  snippet: Snippet | null | undefined;
  onClose: () => void;
};

export function SnippetEditorDialog({ snippet, onClose }: Props) {
  const create = useSnippetsStore((s) => s.create);
  const update = useSnippetsStore((s) => s.update);

  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (snippet === undefined) return;
    if (snippet === null) {
      setName("");
      setFolder("");
      setTags("");
      setContent("");
    } else {
      setName(snippet.name);
      setFolder(snippet.folder ?? "");
      setTags(snippet.tags_csv);
      setContent(snippet.content);
    }
  }, [snippet]);

  const isOpen = snippet !== undefined;
  const isEdit = snippet !== null && snippet !== undefined;
  const canSave = name.trim().length > 0 && content.trim().length > 0;

  const handleSave = async () => {
    const input = {
      name: name.trim(),
      content,
      folder: folder.trim() ? folder.trim() : null,
      tags_csv: tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
        .join(","),
      variables_schema_json: "[]",
    };
    if (isEdit && snippet) {
      await withToast(update(snippet.id, input), {
        loading: "Enregistrement…",
        success: "Snippet mis à jour",
      });
    } else {
      await withToast(create(input), {
        loading: "Création…",
        success: "Snippet créé",
      });
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le snippet" : "Nouveau snippet"}</DialogTitle>
          <DialogDescription>
            Utilise <code>{"{{host}}"}</code>, <code>{"{{user}}"}</code>, <code>{"{{date}}"}</code>{" "}
            ou tes propres variables <code>{"{{nom}}"}</code> — elles te seront demandées avant
            insertion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Nom</span>
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="ex. tail nginx error log"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-(--color-muted)">Dossier (optionnel)</span>
              <Input
                value={folder}
                onChange={(e) => setFolder(e.currentTarget.value)}
                placeholder="infra"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-(--color-muted)">Tags (séparés par virgule)</span>
              <Input
                value={tags}
                onChange={(e) => setTags(e.currentTarget.value)}
                placeholder="ops, logs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-(--color-muted)">Commande</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.currentTarget.value)}
              rows={6}
              placeholder="tail -f /var/log/{{service}}.log"
              className="resize-none rounded-md border border-(--color-border) bg-(--color-bg) px-3 py-2 font-mono text-xs text-(--color-text) shadow-inner focus-visible:border-(--color-accent) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
