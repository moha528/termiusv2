-- Stores accepted server fingerprints for the Trust-On-First-Use policy.
-- (hostname, port) is unique: the second time we connect to the same endpoint,
-- the stored fingerprint must match or we refuse the connection.
CREATE TABLE IF NOT EXISTS known_hosts (
    hostname     TEXT NOT NULL,
    port         INTEGER NOT NULL,
    fingerprint  TEXT NOT NULL,
    key_type     TEXT NOT NULL,
    accepted_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (hostname, port)
);
