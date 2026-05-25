-- Per-host security/diagnostic toggles.
--   agent_forward : request SSH agent forwarding on the channel (P3-T14).
--   log_to_file   : tee every PTY byte to app_data_dir/logs/<host_id>/<date>.log (P3-T15).
ALTER TABLE hosts ADD COLUMN agent_forward INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hosts ADD COLUMN log_to_file   INTEGER NOT NULL DEFAULT 0;
