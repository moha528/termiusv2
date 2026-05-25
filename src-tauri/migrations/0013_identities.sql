-- P4-T05 — SSH Identities: profils réutilisables (username + clés + agent_forward)
-- qu'un host peut référencer plutôt que tout redéfinir à la main.
--
-- Sémantique runtime : si `hosts.identity_id` est non NULL, la session SSH
-- utilise les valeurs de l'identity à la place de `hosts.username` et
-- `hosts.agent_forward`, et la liste des clés SSH essayées est celle de
-- l'identity (table `identity_keys`). Les champs du host restent stockés
-- pour le cas où on détache l'identity (préserver les anciennes valeurs).
--
-- `ON DELETE SET NULL` : supprimer une identity ne détruit pas les hosts ;
-- ils redeviennent simplement « sans identity » avec leurs propres champs.

CREATE TABLE IF NOT EXISTS identities (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    username        TEXT NOT NULL,
    agent_forward   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identities_name ON identities (name COLLATE NOCASE);

-- Many-to-many: an identity can list several SSH keys in priority order
-- (same shape as `host_keys`). The lowest `priority` wins.
CREATE TABLE IF NOT EXISTS identity_keys (
    identity_id TEXT NOT NULL REFERENCES identities (id) ON DELETE CASCADE,
    key_id      TEXT NOT NULL REFERENCES ssh_keys   (id) ON DELETE CASCADE,
    priority    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (identity_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_keys_id ON identity_keys (identity_id, priority);

ALTER TABLE hosts ADD COLUMN identity_id TEXT REFERENCES identities (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hosts_identity ON hosts (identity_id);
