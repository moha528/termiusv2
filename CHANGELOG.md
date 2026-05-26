# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/), versionnement [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.3] - 2026-05-26

### Ajouté
- **Icône de zone de notification (tray)** : menu Ouvrir / Quitter, clic gauche pour rouvrir la fenêtre.
- **Comportement à la fermeture configurable** (Réglages › Apparence) : réduire dans la zone de notification, réduire, quitter, ou « toujours demander » avec option « se souvenir de mon choix ».

## [1.0.2] - 2026-05-25

### Corrigé
- **Plus de crash au lancement après une mise à jour** : les checksums de migration sqlx sont auto-réalignés au démarrage (on se fie au numéro de version, pas aux octets du fichier `.sql` qui varient selon le build/plateforme).
- **Plus de fermeture silencieuse** : toute erreur de démarrage affiche désormais un message natif clair ; si la base de données est en cause, une réinitialisation (non destructive pour les clés SSH / le keychain) est proposée.

### Ajouté
- **« Quoi de neuf »** : une fenêtre dismissible récapitule les nouveautés après chaque mise à jour.

## [1.0.1] - 2026-05-25

### Corrigé
- **Checksums de migration déterministes** : `.gitattributes` force les fichiers `.sql` (et tout le texte) en LF. Sans ça, la variation CRLF/LF entre builds/plateformes faisait échouer sqlx (« migration has been modified ») au lancement après une mise à jour. Les installs à froid n'étaient pas affectées.

## [1.0.0] - 2026-05-25

Première release publique de **Lynk Client** — client SSH/SFTP desktop libre, local-first et chiffré.

### Phase 4 — UX power user (passe 2)

- **P4-T04** Broadcast input multi-pane :
  - Champ `broadcastGroups: Record<tabId, sessionId[]>` dans `useSessionsStore`
  - Bouton « Sync » (icône Radio) ajouté à `PaneToolbar` quand la tab a ≥ 2 leaves
  - Premier clic : tous les panes de la tab rentrent dans le groupe ; clic suivant retire/ajoute le pane individuellement ; tomber sous 2 désactive le groupe
  - `TerminalView.onData` mirroir vers les peers en utilisant `sessionsApi.sendInput` puis fallback `localTermApi.sendInput` (les groupes mélangés SSH+local marchent)
  - Indicateur visuel : `box-shadow inset 2px accent` + badge `sync` en haut à droite + toolbar visible en permanence pendant la sync (sortie d'évidence)
- **P4-T05** Identities SSH (profils réutilisables) :
  - Migration `0013_identities.sql` (tables `identities` + `identity_keys` + colonne `hosts.identity_id` avec `ON DELETE SET NULL`)
  - Modèles `Identity / IdentityInput / IdentityKeyLink`, DAO `store::identities` (CRUD + `set_identity_keys` + `list_keys_for_identity`), 6 commands Tauri
  - À la connexion (`open_chain`) : si `host.identity_id` est défini, override de `username`, `agent_forward` et liste de clés depuis l'identity ; sinon valeurs propres du host
  - Section Settings « Identities » avec éditeur (name + username + agent forward + KeyPicker réordonnable)
  - Dropdown « Identity » ajouté au tab Auth de `HostFormDialog`, hint indiquant l'override sur les autres champs
- **P4-T06** Pré/post connect scripts :
  - Colonnes `hosts.pre_connect_script` + `hosts.post_connect_script` (TEXT NOT NULL DEFAULT '')
  - Pre : exécuté localement via `tokio::process::Command` (`cmd /C` Windows, `sh -c` ailleurs), 30 s timeout par ligne, `#` = commentaire, failures loggées non bloquantes
  - Post : envoyé au PTY 300 ms après ouverture (laisse le temps au motd) avec normalisation `\r\n|\n → \r` et `\r` final garanti
  - 2 textareas dans le tab Avancé de `HostFormDialog`
- **P4-T08** URLs cliquables :
  - `WebLinksAddon` configuré avec handler custom qui appelle `@tauri-apps/plugin-opener.openUrl()` sur Ctrl/Cmd+clic (`window.open` ne marche pas en webview Tauri)
- **P4-T09** Recherche dans le buffer :
  - `useTerminalSearchStore` (`openFor: sessionId | null`)
  - Composant `TerminalSearchBar` flottant (Entrée → next, Shift+Entrée → prev, Esc → close, toggles `Aa` case-sensitive et `.*` regex, indicateur rouge si pas de match)
  - Wiring sur l'action `open-search-buffer` (raccourci `Ctrl+Shift+F` par défaut) qui cible le pane focus
- **P4-T10** Notifications terminal bell :
  - Détection du byte `0x07` dans le stream PTY côté front (xterm.js consomme le BEL avant qu'on puisse l'observer via `term.onBell`)
  - Setting `bellNotifications` (`off` | `focus-only` | `all`), défaut `focus-only` (notification uniquement quand l'app n'est pas visible)
  - Browser `Notification` API avec permission auto-demandée à la 1re BEL, debounce 800 ms par pane

### Phase 4 — UX power user (passe 1, partielle)

- **P4-T01** Snippets : table `snippets` (folder + tags_csv + variables_schema_json), modèle `Snippet`, DAO `store::snippets`, commands `list_snippets / create_snippet / update_snippet / delete_snippet / extract_snippet_variables / render_snippet`. Substitution variables `{{var}}` via mini-scanner sans dépendance regex (tolère espaces internes `{{ var }}`)
- **P4-T02** Panneau snippets latéral droit (Radix Dialog en `slide-in-from-right`) :
  - Recherche fuzzy sur `name + folder + tags + content`
  - Liste groupée par dossier avec sections pliables
  - Édition / suppression inline (modal confirm)
  - Modal de saisie pour variables custom (built-ins `{{host}} {{user}} {{date}}` auto-substituées depuis le terminal actif)
  - Insertion auto-exécutée vers le pane focus (résolu via `lib/activeTerminal.ts` qui suit `useSessionsStore.focusedSessionId` mis à jour sur `mousedown` / `focusin` / `onData`)
- **P4-T03** Historique de commandes :
  - Module `command_capture` (per-session buffer flush sur `\r` / `\n`, gère BS/DEL, Ctrl-C reset, ignore CSI/`\x1b…`)
  - Table `command_history` (`id, host_id NULL→cascade, command, used_at` avec précision sub-seconde via `strftime '%Y-%m-%d %H:%M:%f'`)
  - Capture branchée dans `send_terminal_input` + `local_send_input` (insertion non-bloquante via `tokio::spawn`)
  - Setting `commandHistoryScope` (`host` par défaut — inclut global ; ou `global`)
  - UI `CommandHistoryDialog` Ctrl+R, dedup `GROUP BY command ORDER BY MAX(used_at) DESC, MAX(id) DESC`, `Enter` insère sans `\r` (édition avant exécution)
- **P4-T07** Raccourcis clavier configurables :
  - Registry `lib/keybindings` avec 10 actions (palette, snippets, history, new/close/next/prev/reopen tab, settings, search buffer)
  - `useKeybindingsStore` persiste les overrides dans le setting `keybindings`
  - Hook `useShortcuts` dispatche les events à la volée et bypass les inputs (sauf palette/snippets/history/settings)
  - Section Settings « Raccourcis » avec recorder live (clic sur un accel → capture la prochaine combinaison non-modifier), détection de conflits avec bannière, bouton « Restaurer » par ligne et global
- Ajout des actions « Snippets » + « Historique des commandes » dans la palette `Ctrl+K`
- Nouvelle section Settings « Productivité » avec choix de scope d'historique

### Phase 3 — Sécurité & SSH avancé (livrée)

- **P3-T01 → T04** Modèle `SshKey` + table + DAO + génération ed25519/RSA 4096 (crate `ssh-key` + `rsa` pour 4096) + import OpenSSH/PEM avec validation passphrase + UI Keys dans Settings (cards algo, file picker, copier publique, supprimer)
- **P3-T05** Association clés ↔ hosts : table `host_keys` (priority), `KeyPicker` multi-select avec réordonnement ↑↓, auth SSH essaie les clés en priorité puis password (auto-skip prompt si keys configurées)
- **P3-T06** Keychain OS (anticipé en Phase 1) — passwords + passphrases via `keyring` (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- **P3-T07** PIN d'accès (renommé depuis "master password") : Argon2id (m=19 MiB, t=2), validation 4–12 chiffres, fonctions set/change/disable/verify, stockage encoded hash dans `settings` KV
- **P3-T08** Auto-lock après inactivité : settings 0/5/15/30/60 min, tracker keydown/mousedown/mousemove/scroll dans MainLayout, lock ferme sessions ET port forwards (sécurité)
- **P3-T09** UI known_hosts : section dans Settings avec fingerprints listés (hostname, port, key_type, accepted_at), bouton "Oublier" avec confirmation
- **P3-T10** ProxyJump (bastion) : colonne `proxy_jump_host_id` sur hosts, support multi-niveau récursif avec détection de cycles, `Session::connect_via_bastion` ouvre un channel `direct-tcpip` sur le bastion comme transport
- **P3-T11** Port forward local (-L) : table `port_forwards` + `ForwardRegistry`, `TcpListener` qui ouvre des `direct-tcpip` channels par connexion, dialog dédié avec start/stop/delete + dot vert pulsant si actif
- **P3-T12** Port forward remote (-R) : `Handler::server_channel_open_forwarded_tcpip` accepte les channels poussés par le serveur, `Session::request_remote_forward` enregistre les routes, garde-fou anti-channels-arbitraires côté handler
- **P3-T13** SOCKS5 dynamic (-D) : sous-module `socks5.rs` minimal (RFC 1928 — no-auth + CONNECT, IPv4/IPv6/domain atyp), 3 chips dans le picker (Local / Remote / Dynamic)
- **P3-T14** SSH agent forwarding : `Handler::server_channel_open_agent_forward` qui bridge la channel vers le local SSH agent (UnixStream sur Unix, NamedPipeClient OpenSSH-Agent sur Windows), `channel.agent_forward()` sur la PTY
- **P3-T15** Audit log local : tee le flux PTY dans `app_data_dir/logs/<host_id>/<YYYY-MM-DD_HH-MM-SS>.log` quand le toggle est actif sur le host

### Phase 3 — UX additions (au fil)

- **Refonte SettingsView** : fullscreen modal centré avec navigation latérale (Apparence / Terminal / Fichiers / Sécurité / Clés / Empreintes), scroll indépendant, Esc pour fermer
- **Refonte HostFormDialog** : tabs Général / Authentification / Avancé avec header + footer sticky, body scrollable en `max-h-[60vh]`, indicateur d'erreur sur le tab concerné
- **PIN UX++** : machine à 4 états (idle / verifying / success / error) avec animations `pin-pop` (digit tapé), `pin-caret` (next slot), `pin-verify` (rangée pulsante), shake + reset auto sur erreur, success vert + icône Check avant fermeture, status line "X chiffres · Entrée pour valider"
- **Filtre Git dans importer SSH** : `git@github.com` / `git@gitlab.com` / `git@bitbucket.org` / Azure DevOps / VisualStudio filtrés en amont (pas de shell interactif possible)

### Phase 2 — Multi-tabs & SFTP (livrée)

- **P2-T01** Groupes : sidebar arborescente, CRUD via context menu, bouton + New Group, DnD host → groupe avec « Sans groupe » comme drop zone
- **P2-T02** Tags : tables `tags` + `host_tags` (m2m), TagBadge coloré, TagPicker combobox dans HostFormDialog (création à la volée)
- **P2-T03** Filtrage par tag : pills cliquables au-dessus de la liste, multi-sélection OR, bouton Effacer
- **P2-T04 / T05** Parser `~/.ssh/config` (12 tests unitaires) + assistant d'import avec détection de doublons
- **P2-T06** Backend SFTP (`russh-sftp`) — list_dir / stat / mkdir / create_file / remove / rename
- **P2-T07** Upload / download streamés avec progression (buffer 64 KiB, debounce 100 ms)
- **P2-T08 / T09** Vue dual-pane Local | Remote + type d'onglet SFTP avec menu contextuel host
- **P2-T10** Actions FilePane : rename / delete / mkdir / new file / properties + AlertDialog confirmations
- **P2-T11** Drag & drop bidirectionnel + multi-sélection (Ctrl/Shift+click)
- **P2-T12** File de transferts globale avec ETA, vitesse, cancel coopératif (AtomicBool entre chunks)
- **P2-T13** Édition fichier remote dans l'éditeur OS par défaut + watcher poll-based 500ms + re-upload auto
- **P2-T14** Toggle affichage fichiers cachés (icône Eye dans toolbar pane + setting)
- **P2-T15** Split panes terminal récursifs (style tmux) avec resize drag
- **P2-T16** Renommer un onglet par double-clic
- **P2-T17** Sessions persistantes au démarrage avec dialog Restore + "Mémoriser ce choix"
- **P2-T18** Tests E2E Playwright — *reporté* (tests manuels validés)

### Extras hors-roadmap

- **Terminal local** : onglet type `local` spawné via `portable-pty` (pwsh/powershell/cmd sur Windows, `$SHELL` ailleurs). Réutilise les events `terminal-data-{id}` pour rester compatible avec TerminalView et xterm.js.
- **Custom window chrome** : `decorations: true` + Mica (Win 11) ou caption color DWM (Win 10)
- **Command palette** (`Ctrl+K`) avec fuzzy search + navigation clavier
- **Workspace homepage** : grille de hosts cards
- **Toasts globaux** (`sonner`) sur toutes les actions backend
- **Thèmes app et terminal indépendants** avec preview live
- **Catppuccin Mocha/Latte** ajoutés (default = Mocha)
- **Padding interne** terminal (xterm.js wrapper)
- **Copy/Cut/Paste SFTP** cross-pane + menu contextuel zone vide
- **Keychain** OS pour mémoriser les mots de passe (anticipe P3-T06)
- **Auto-refresh post-transfer** des panes destinataires
- **Context menu webview natif désactivé** sauf inputs

### Phase 1 — Fondations & SSH minimal (livrée)

- **P1-T01 → T03** Scaffold Tauri 2 + React + Tailwind v4 + Biome + CI GitHub Actions
- **P1-T04 → T05** Modèle Host + migrations SQLite + commandes CRUD avec tests
- **P1-T06 → T08** UI sidebar (liste, ajout, édition, suppression) avec dialogs Radix
- **P1-T09 → T13** Connexion russh + TOFU known_hosts + PTY + SessionManager + commandes IPC
- **P1-T14 → T16** xterm.js + onglets + reconnexion
- **P1-T17 → T20** Persistance préférences UI + 5 thèmes terminal + recherche fuzzy + README/CONTRIBUTING

### Phase 5 — Sync & release (passe 3)

- **P5-T06** Tauri updater :
  - Plugins `tauri-plugin-updater` + `tauri-plugin-process` (relaunch)
  - Config `tauri.conf.json` : `createUpdaterArtifacts: true`, endpoint `latest.json` sur GitHub Releases, pubkey minisign (placeholder à remplacer à la génération de clé)
  - Permissions capabilities : `updater:default`, `process:default`, `process:allow-restart`
  - `lib/updater.ts` : `checkForUpdate()` + `installUpdate()` avec progression
  - **Check silencieux au démarrage** (MainLayout) → toast non-intrusif `sonner` avec action « Installer » si version dispo, erreurs swallowed (dev/offline)
- **P5-T07** Packaging multi-OS :
  - Workflow `.github/workflows/release.yml` activé (retrait du `if: false`)
  - `tauri-action` build macOS universal + Linux deb/AppImage + Windows msi/nsis sur tag `v*.*.*`
  - Signature des artefacts updater via secrets `TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`
  - Release draft auto avec installeurs + `latest.json`
  - Code signing OS volontairement non configuré (ship non-signé pour le lancement)
- **P5-T08** About + crash opt-in :
  - `AboutSection` dans Settings : version (via `getVersion()`), liens GitHub (code/releases/issues), bouton « Vérifier les mises à jour » manuel, note sur les avertissements d'install non-signée
  - Setting `crashReportingOptIn` (défaut OFF, honnête sur « pas encore branché backend »)
- **P5-T09** Documentation utilisateur :
  - `docs/` Markdown prêt pour Astro Starlight (Phase 6) : Getting Started, Importing ssh config, Sync setup (local + Git), Keyboard Shortcuts, FAQ (warnings signature + sécurité + dépannage)
  - `docs/RELEASING.md` mainteneur : génération clé minisign, câblage secrets, procédure de tag/release, vérification updater
- **P5-T10** Release prep : CHANGELOG structuré, README mis à jour. Le tag v1.0.0 lui-même reste une étape manuelle (cf. RELEASING.md)

### Phase 5 — Sync & release (passe 2)

- **P5-T03** Sync Git : config + test connection :
  - Migration `0015_sync_state.sql` table singleton avec `CHECK (id = 1)` (URL, branche, auth_method, enabled, last_remote_sha, last_pushed_at, last_pulled_at, last_error)
  - Modèle `SyncState` + `SyncConfigInput`, DAO `store::sync_state`
  - Module Rust `sync_git` qui **shell-out vers `git` CLI** (plutôt que d'embarquer libgit2 — plus simple, plus stable cross-platform, l'utilisateur power-user a déjà git)
  - 3 méthodes d'auth : `none` (public), `https-pat` (token stocké keychain, URL réécrite en `https://x-access-token:<TOKEN>@…`), `ssh` (utilise la config SSH système)
  - PAT et password de chiffrement stockés dans le keychain OS via `keyvault` (clés `lynk-sync-pat` + `lynk-sync-password`)
  - `test_connection` = `git ls-remote --exit-code --heads` avant d'enregistrer
  - Commands `sync_get_state`, `sync_test_connection`, `sync_configure`, `sync_disable`, `sync_forget_pat`, `sync_set_password`, `sync_has_password`
- **P5-T04** Push automatique debouncé :
  - `push_now` snapshot la DB → encrypt AES-GCM → écrit `vault.enc` dans workdir → `git add` (skip si rien staged) → commit avec message `lynk sync <ISO>` → push
  - Workdir `app_data_dir/sync-repo/` cloné à la première op, re-cloné si l'URL change (comparaison ignorant les creds dans l'URL)
  - PAT auto-injecté dans l'URL au moment de l'op, jamais persisté sur disque
  - Front : `useSyncStore` avec status `idle/busy/error`, `schedulePush()` debounce 30 s, branché aux mutations de tous les stores (servers/groups/tags/identities/snippets) via `subscribe` dans MainLayout
- **P5-T05** Pull au démarrage :
  - `pull_now` = `git fetch` → compare `FETCH_HEAD` à `last_remote_sha` → si changé, `git reset --hard FETCH_HEAD` + déchiffre + `apply_bundle` en mode replace
  - Pull automatique au launch si sync activée et password disponible, suivi d'une re-hydratation de tous les stores si `changed`
  - Stratégie remote-wins documentée dans le module
- **UI** :
  - Section Settings « Sync » refactorée en 2 sous-sections : « Sauvegarde locale » (export/import .tmv) + « Sync Git (auto) »
  - `GitSyncCard` : formulaire de config si désactivée (URL, branche, auth dropdown, PAT field si https-pat, password de chiffrement, bouton « Tester la connexion ») ; sinon état actif avec status badge + boutons Push/Pull manuels + meta (dates, dernier résultat) + « Désactiver la sync »
  - `PasswordPrompt` jaune si le password de chiffrement n'est plus dans le keychain (post-restoration ou première install)
  - Indicateur compact `SyncIndicator` dans le Header : pill verte/orange/rouge selon le statut, tooltip avec le dernier résultat, click → ouvre Settings
- Sanitisation des messages d'erreur Git : le PAT est remplacé par `***` avant de remonter à l'UI
- 2 tests Rust ajoutés : `same_repo_ignores_creds` + `build_authed_url_ssh_passthrough` + tests CRUD du DAO `sync_state`

### Phase 5 — Sync & release (passe 1, partielle)

- **P5-T01** Export chiffré du vault :
  - Crate `aes-gcm` ajouté, module `vault_export` Rust
  - Format binaire `[magic "TMV2"][version=1][16 octets salt Argon2id][12 octets nonce GCM][ciphertext+tag]`
  - Clé AES-256 dérivée du password en Argon2id (params OWASP par défaut, m=19 MiB)
  - Snapshot exporté = hosts + groups + tags + host_tags + identities + snippets + port_forwards
  - Exclus : `ssh_keys` (fichiers disque), passwords (keychain OS), `known_hosts` (TOFU per-machine), `command_history`, `settings`
  - Commande Tauri `export_vault(password, path)` retourne la taille en octets
- **P5-T02** Import chiffré + merge :
  - Commande Tauri `import_vault(password, path, mode)` avec `mode = "merge" | "replace"`
  - **Merge** : insère uniquement les entrées dont la clé business (label/name) n'existe pas déjà, remap les IDs (group_id, identity_id, proxy_jump_host_id) entre l'export et la DB locale, deuxième passe pour les forward refs ProxyJump
  - **Replace** : `DELETE FROM` toutes les tables concernées puis ré-insertion (ssh_keys et known_hosts épargnés)
  - Stats de retour : `hosts_added`, `groups_added`, `tags_added`, `identities_added`, `snippets_added`, `port_forwards_added`, `hosts_replaced`
- **UI** :
  - Nouvelle section Settings « Sync » avec 2 cards Export/Import
  - `ExportDialog` : mot de passe + confirmation, file save dialog avec extension `.tmv` par défaut, toast avec la taille du fichier produit
  - `ImportDialog` : password + 2 chips Merge/Replace, file picker `.tmv`, confirmation `AlertDialog` rouge si mode Replace
  - Re-hydratation automatique de tous les stores après import
- 4 tests Rust ajoutés : roundtrip encrypt/decrypt, wrong password, bad magic, truncated input

## Phase 4 — UX power user (livrée intégralement)

- ✅ P4-T01 → T03 Snippets + palette + historique commandes
- ✅ P4-T04 Broadcast input multi-pane
- ✅ P4-T05 → T06 Identities + pré/post connect scripts
- ✅ P4-T07 Raccourcis configurables
- ✅ P4-T08 → T10 URLs cliquables, recherche buffer, notifications BEL
- ✅ P4-T11 Settings page complète (modal fullscreen, 9 sections)
- ✅ P4-T12 Quick Connect (Command Palette `Ctrl+K`)

## Phase 5 — Sync & release (livrée)

- ✅ P5-T01 → T02 Export/import chiffré
- ✅ P5-T03 → T05 Sync Git (config + push auto debounced + pull au démarrage)
- ✅ P5-T06 → T08 Updater Tauri + packaging multi-OS + about
- ✅ P5-T09 Doc utilisateur · ⏳ P5-T10 release v1.0.0 = étape manuelle (RELEASING.md)

## [À venir] Phase 6 — Site, monétisation & business

- P6-T01 → T03 Landing page + docs en ligne + autodetect OS download
- P6-T04 → T07 Tier free/pro/enterprise + backend SaaS + Stripe + activation côté app
- P6-T08 → T11 Sécurisation backend + RGPD + email transactionnel + analytics privacy
- P6-T12 → T14 Support/community + sponsorship + mesure & itération
