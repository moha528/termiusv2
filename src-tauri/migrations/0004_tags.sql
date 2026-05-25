-- Tags: labels colorés attachables aux hosts (many-to-many via host_tags).

CREATE TABLE IF NOT EXISTS tags (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#94a3b8',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

CREATE TABLE IF NOT EXISTS host_tags (
    host_id     TEXT NOT NULL REFERENCES hosts (id) ON DELETE CASCADE,
    tag_id      TEXT NOT NULL REFERENCES tags  (id) ON DELETE CASCADE,
    PRIMARY KEY (host_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_host_tags_host ON host_tags (host_id);
CREATE INDEX IF NOT EXISTS idx_host_tags_tag  ON host_tags (tag_id);
