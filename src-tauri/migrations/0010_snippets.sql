-- P4-T01 — Snippets: réutilisation de commandes paramétrables.
--
-- `variables_schema_json` est une chaîne JSON qui peut être vide ("[]") ou
-- décrire la liste des variables détectées (nom, label, default) — la
-- détection runtime via regex `{{var}}` reste la source de vérité, ce schéma
-- ne sert qu'à mémoriser des valeurs par défaut suggérées.

CREATE TABLE IF NOT EXISTS snippets (
    id                     TEXT PRIMARY KEY NOT NULL,
    name                   TEXT NOT NULL,
    content                TEXT NOT NULL,
    folder                 TEXT,
    tags_csv               TEXT NOT NULL DEFAULT '',
    variables_schema_json  TEXT NOT NULL DEFAULT '[]',
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snippets_folder ON snippets (folder);
CREATE INDEX IF NOT EXISTS idx_snippets_name   ON snippets (name);
