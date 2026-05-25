-- P4-T03 hotfix — `used_at` avait une précision seconde dans la migration
-- 0011, ce qui rendait l'ordre `GROUP BY command ORDER BY MAX(used_at) DESC`
-- non déterministe quand l'utilisateur tape deux fois la même commande dans
-- la même seconde. On recrée la table avec une précision sub-seconde via
-- `strftime('%Y-%m-%d %H:%M:%f', 'now')`.
--
-- Comme 0011 a déjà pu être appliquée localement (donc la table existe avec
-- l'ancien default), on recrée la table par copie : SQLite ne sait pas
-- modifier le DEFAULT d'une colonne in-place.

CREATE TABLE command_history_new (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id   TEXT REFERENCES hosts (id) ON DELETE CASCADE,
    command   TEXT NOT NULL,
    used_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

INSERT INTO command_history_new (id, host_id, command, used_at)
SELECT id, host_id, command, used_at FROM command_history;

DROP TABLE command_history;
ALTER TABLE command_history_new RENAME TO command_history;

CREATE INDEX IF NOT EXISTS idx_cmd_history_host    ON command_history (host_id);
CREATE INDEX IF NOT EXISTS idx_cmd_history_used_at ON command_history (used_at DESC);
