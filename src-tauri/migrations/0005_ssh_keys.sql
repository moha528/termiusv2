-- SSH keys: the private key file lives on disk (perms 0600), the row in
-- this table stores its metadata (name, type, public key, fingerprint, path).
-- The optional passphrase is stored in the OS keychain (key = "ssh-key-{id}").

CREATE TABLE IF NOT EXISTS ssh_keys (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL UNIQUE,
    key_type        TEXT NOT NULL,
    public_key      TEXT NOT NULL,
    fingerprint     TEXT NOT NULL,
    private_key_path TEXT NOT NULL,
    has_passphrase  INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ssh_keys_name ON ssh_keys (name);
CREATE INDEX IF NOT EXISTS idx_ssh_keys_fingerprint ON ssh_keys (fingerprint);
