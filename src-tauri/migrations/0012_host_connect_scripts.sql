-- P4-T06 — Pré/post connect scripts attachés à un host.
--
-- `pre_connect_script` est exécuté côté local par notre process avant
-- d'ouvrir la session SSH (typique : `wake-on-lan`, `mosh-server`…). Il est
-- traité comme une suite de lignes, chaque ligne étant un argv via la shell
-- de l'OS (cmd.exe sur Windows, /bin/sh ailleurs). Vide → rien à faire.
--
-- `post_connect_script` est *écrit dans le PTY* juste après l'ouverture du
-- shell (typique : `cd /var/www && tail -f log`). Il devient donc l'input
-- du shell distant — pas besoin d'API SSH `exec` séparée.

ALTER TABLE hosts ADD COLUMN pre_connect_script  TEXT NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN post_connect_script TEXT NOT NULL DEFAULT '';
