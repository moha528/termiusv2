-- P4-T03 — Historique de commandes inter-sessions.
--
-- Le backend détecte les commandes terminées par `\n` envoyées via
-- `send_terminal_input` / `local_send_input` et insère ici. `host_id` est
-- NULL pour les sessions locales (terminal Local).

CREATE TABLE IF NOT EXISTS command_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id   TEXT REFERENCES hosts (id) ON DELETE CASCADE,
    command   TEXT NOT NULL,
    used_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cmd_history_host    ON command_history (host_id);
CREATE INDEX IF NOT EXISTS idx_cmd_history_used_at ON command_history (used_at DESC);
