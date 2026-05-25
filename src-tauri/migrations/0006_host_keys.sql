-- host_keys: many-to-many between hosts and SSH keys, with an ordering hint.
-- At connect time the backend reads this table to know which keys to try
-- (in ascending `priority` order) before falling back to password auth.

CREATE TABLE IF NOT EXISTS host_keys (
    host_id   TEXT NOT NULL REFERENCES hosts    (id) ON DELETE CASCADE,
    key_id    TEXT NOT NULL REFERENCES ssh_keys (id) ON DELETE CASCADE,
    priority  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (host_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_host_keys_host ON host_keys (host_id);
CREATE INDEX IF NOT EXISTS idx_host_keys_key  ON host_keys (key_id);
