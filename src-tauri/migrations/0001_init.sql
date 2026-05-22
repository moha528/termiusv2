-- Initial schema: groups + hosts
-- Groups form a tree (parent_id nullable), used to organize hosts in the sidebar.
CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    parent_id   TEXT REFERENCES groups (id) ON DELETE SET NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups (parent_id);

-- Hosts: a single remote target (one SSH endpoint).
CREATE TABLE IF NOT EXISTS hosts (
    id          TEXT PRIMARY KEY NOT NULL,
    label       TEXT NOT NULL,
    hostname    TEXT NOT NULL,
    port        INTEGER NOT NULL DEFAULT 22,
    username    TEXT NOT NULL,
    group_id    TEXT REFERENCES groups (id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hosts_group ON hosts (group_id);
CREATE INDEX IF NOT EXISTS idx_hosts_label ON hosts (label);
