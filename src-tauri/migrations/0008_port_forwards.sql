-- Port forwards: persistable definitions attached to a host. Each row
-- describes ONE forward (local/remote/dynamic). The active runtime state
-- (listening socket, child tasks) lives in memory in ForwardRegistry and
-- is rebuilt on app restart for rows with `auto_start = 1`.

CREATE TABLE IF NOT EXISTS port_forwards (
    id            TEXT PRIMARY KEY NOT NULL,
    host_id       TEXT NOT NULL REFERENCES hosts (id) ON DELETE CASCADE,
    -- 'local'   : -L  local_port  -> remote_host:remote_port
    -- 'remote'  : -R  remote_port -> local_host:local_port (P3-T12)
    -- 'dynamic' : -D  local_port  -> SOCKS5 proxy        (P3-T13)
    forward_type  TEXT NOT NULL,
    label         TEXT NOT NULL DEFAULT '',
    local_port    INTEGER NOT NULL,
    remote_host   TEXT NOT NULL DEFAULT 'localhost',
    remote_port   INTEGER NOT NULL DEFAULT 0,
    auto_start    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_port_forwards_host ON port_forwards (host_id);
