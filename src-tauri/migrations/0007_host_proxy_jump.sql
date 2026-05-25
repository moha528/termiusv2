-- ProxyJump: each host can optionally tunnel through another host (bastion).
-- Reference is by host id rather than by hostname/port so renaming the
-- bastion entry doesn't break the chain.
--
-- ON DELETE SET NULL keeps the target host alive when the bastion is
-- removed (the user can re-pick a bastion or accept direct connection).

ALTER TABLE hosts
    ADD COLUMN proxy_jump_host_id TEXT REFERENCES hosts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hosts_proxy_jump ON hosts (proxy_jump_host_id);
