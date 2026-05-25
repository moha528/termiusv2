-- P5-T03 — État de la sync Git. Une seule ligne logique (id=1 forcée par
-- CHECK), c'est une "table de singleton" plus pratique qu'un setting JSON
-- car on l'interroge et on la met à jour souvent.
--
-- `auth_method` :
--   - `none` : URL publique (clone read-only sans creds)
--   - `https-pat` : token stocké dans le keychain OS (clé `termius-sync-pat`)
--   - `ssh` : utilise la config SSH du système (~/.ssh/id_*, agent)
--
-- `last_remote_sha` permet à `pull_now` de détecter si le distant a bougé
-- depuis le dernier fetch — sinon on évite de tout déchiffrer pour rien.

CREATE TABLE IF NOT EXISTS sync_state (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    repo_url          TEXT NOT NULL,
    branch            TEXT NOT NULL DEFAULT 'main',
    auth_method       TEXT NOT NULL DEFAULT 'none',
    enabled           INTEGER NOT NULL DEFAULT 0,
    -- État runtime :
    last_remote_sha   TEXT,
    last_pushed_at    TEXT,
    last_pulled_at    TEXT,
    last_error        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
