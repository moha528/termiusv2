<p align="center">
  <img src="public/logo-mark.png" alt="Lynk Client" width="120" />
</p>

# Lynk Client

**Client SSH/SFTP desktop libre — local-first, chiffré, sans cloud.**

Terminal multi-onglets, SFTP, snippets, identities, port forwarding… et une
sync chiffrée qui passe par **ton propre dépôt Git**. Pas de compte, pas
d'abonnement, pas de télémétrie : tes serveurs, tes clés et tes notes ne
quittent jamais ton contrôle.

Construit avec [Tauri 2](https://tauri.app), React 19 et Rust.

<!-- TODO(launch): GIF de démo ici (connexion → terminal → sync) -->

## L'idée

Un client SSH moderne ne devrait pas t'obliger à confier tes accès à un
service tiers pour les retrouver sur tes autres machines.

- 🔒 **Local-first** — tout reste sur ta machine. Mots de passe et passphrases
  dans le keychain de l'OS ; vault chiffré Argon2id + AES-256-GCM.
- 🔁 **Une sync que tu possèdes** — le vault chiffré est poussé dans **ton**
  repo Git privé (GitHub, GitLab, Gitea, self-hosted). Auto-push après chaque
  modif, pull au démarrage. Le contenu est illisible sans ta clé — y compris
  pour l'hébergeur du repo.
- 🆓 **Gratuit et ouvert** — les fonctions essentielles ne sont pas derrière un
  paywall.
- 🚫 **Zéro télémétrie** — rien ne quitte la machine sans que tu le décides.

## Télécharger

Installeurs pour Windows, macOS (Intel + Apple Silicon) et Linux sur la
[**page des releases**](https://github.com/moha528/lynk/releases/latest).

> Les installeurs ne sont pas encore signés (certificats payants) : ton OS
> peut afficher un avertissement à l'installation. Deux clics pour le
> contourner — voir la [FAQ](./docs/faq.md#avertissements-dinstallation).

## Fonctionnalités

**Phase 1 — Fondations & SSH** ✅
- Gestion CRUD des serveurs (label, hostname, port, username, group, recherche)
- Connexion SSH par mot de passe via `russh`, fingerprints TOFU strict
- PTY interactif rendu via xterm.js, onglets multi-sessions avec resize automatique
- Reconnexion sans perdre l'onglet
- Thèmes terminal : Catppuccin Mocha/Latte, Dracula, Solarized Dark/Light, Tokyo Night, Gruvbox Dark
- Persistance des préférences UI (sidebar width, thème, dernier onglet actif)

**Phase 2 — Multi-tabs & SFTP** ✅
- Groupes : sidebar arborescente pliable, DnD host → groupe, context menu (rename/delete)
- Tags : multi-tag par host, TagPicker avec création à la volée, badges colorés dans la liste
- Filtre par tag : pills cliquables au-dessus de la liste avec sémantique OR
- Parser `~/.ssh/config` + assistant d'import
- SFTP complet : list/stat/mkdir/remove/rename/upload/download streamés, transferts cancellables
- Vue dual-pane Local | Remote, drag & drop bidirectionnel, multi-sélection
- File de transferts globale avec progression, vitesse, ETA, cancel
- Édition fichier remote dans l'éditeur OS par défaut avec re-upload auto (watch mtime)
- Split panes terminal récursifs (style tmux) avec resize au drag
- Renommer un onglet par double-clic
- Sessions persistantes au démarrage avec dialog Restore

**Extras hors-roadmap** ✅
- Terminal local : onglet « Local » qui spawn un shell sur la machine via `portable-pty`
- Custom window chrome (Mica sur Win 11, caption color fallback Win 10)
- Keychain OS pour mémoriser les mots de passe (anticipe P3-T06)
- Command palette globale (Ctrl+K) avec fuzzy search sur hosts + actions
- Workspace homepage (grille de hosts) quand pas d'onglet ouvert
- Toasts globaux (sonner) sur toutes les actions backend
- Thèmes app et terminal indépendants

**Phase 3 — Sécurité & SSH avancé** ✅
- Clés SSH ed25519 / RSA 4096 : génération, import OpenSSH/PEM, association multi-clés par host avec priorité
- PIN d'accès (Argon2id) + auto-lock après inactivité (5/15/30/60 min) — ferme sessions ET port forwards
- UI known_hosts (TOFU) avec oubli individuel
- ProxyJump multi-niveau (détection de cycles)
- Port forwarding `-L` / `-R` / `-D` SOCKS5 avec UI dédiée
- Agent forwarding (Unix socket / Windows OpenSSH-Agent named pipe)
- Audit log local par host

**Phase 4 — UX power user** ✅
- Snippets : commandes réutilisables avec variables `{{host}}` / `{{user}}` / `{{date}}` / custom, panneau latéral `Ctrl+Shift+S`, modal de saisie
- Historique de commandes inter-sessions (Ctrl+R), capture per-session, scope host ou global
- Raccourcis clavier configurables avec recorder live et détection de conflits
- Broadcast input multi-pane sur splits avec indicateur visuel
- Identities SSH (username + agent + clés réutilisables) partagés entre hosts
- Pré/post connect scripts (local shell avant SSH, lignes envoyées au PTY après ouverture)
- URLs cliquables (Ctrl+clic → navigateur via tauri-plugin-opener)
- Recherche dans le buffer (`Ctrl+Shift+F`, case-sensitive + regex)
- Notifications système sur terminal bell `\a`
- Palette `Ctrl+K` étendue : actions Snippets / Historique

**Phase 5 — Sync & release** ✅ (release v1.0.0 = étape manuelle, cf. [docs/RELEASING.md](./docs/RELEASING.md))
- Export chiffré du vault (`.tmv` AES-256-GCM, clé dérivée Argon2id) → hosts/groupes/tags/identities/snippets/forwards
- Import avec deux modes : merge (ajoute sans destruction) ou replace (wipe + re-insert)
- Sync Git : auto-push debouncé 30 s du `vault.enc` chiffré dans un repo Git privé que tu contrôles, pull au démarrage avec remote-wins, auth `https-pat` ou `ssh`
- Indicateur de sync dans le Header (pill verte/orange/rouge)
- Updater Tauri (check silencieux au démarrage + toast, vérif de signature minisign)
- Workflow GitHub Actions de packaging multi-OS (msi/nsis · dmg universal · deb/AppImage)
- Page About (version, liens, check manuel) + opt-in crash reporting
- Documentation utilisateur dans [`docs/`](./docs/)

À venir (voir [cahier des charges](./CAHIER_DES_CHARGES.md)) :
- **Phase 6 — Launch** : landing page, docs en ligne, GitHub Sponsors. Léger, post-v1.0.
- **Phase 7 — Monétisation** *(conditionnelle)* : tier Pro managé, team sync, SSO.
  Débloquée **uniquement si la demande le justifie** — le cœur reste gratuit et ouvert.

## Construire depuis les sources

Pour contribuer ou builder toi-même :

**Prérequis** — Node.js ≥ 20, pnpm ≥ 9, Rust stable ([rustup](https://www.rust-lang.org/learn/get-started)),
et les [dépendances système Tauri](https://tauri.app/start/prerequisites/) de ton OS :
- macOS : Xcode CLT
- Linux : `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`
- Windows : Visual Studio Build Tools (workload C++ + Windows SDK)

```bash
git clone https://github.com/moha528/lynk.git
cd lynk
pnpm install
pnpm tauri dev
```

La première compilation Rust prend quelques minutes ; les suivantes sont mises en cache.

## Scripts utiles

| Commande              | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `pnpm dev`            | Lance Vite seul (sans la fenêtre Tauri)                    |
| `pnpm tauri dev`      | Lance l'app desktop en dev                                 |
| `pnpm build`          | Build front (typecheck + Vite build)                       |
| `pnpm lint`           | Vérifie le code front avec Biome                           |
| `pnpm lint:fix`       | Applique les fixes Biome auto                              |
| `cargo test`          | Tests backend (depuis `src-tauri/`)                        |
| `cargo clippy`        | Lint Rust strict (depuis `src-tauri/`)                     |
| `cargo fmt --all`     | Formate le code Rust (depuis `src-tauri/`)                 |

## Architecture (overview)

```
┌──────────────────────────────────────────────────────────────────┐
│                     Frontend React (Webview)                     │
│  Sidebar  │  TabsBar + SessionPane (xterm.js / SftpView / split) │
│           │  CommandPalette • Workspace • SettingsView           │
│           │  ConnectDialog • ImportSshConfigDialog • Transfers   │
└────────────────────────────┬─────────────────────────────────────┘
                             │ Tauri IPC : invoke + events + Toasts
┌────────────────────────────▼─────────────────────────────────────┐
│                         Backend Rust                              │
│  SessionManager   │  Store (sqlx + SQLite)                       │
│  ssh::Session     │    hosts, known_hosts, settings              │
│  ssh::PtyChannel  │  KeyVault (keyring crate, OS native)         │
│  sftp::SftpClient │  TransferRegistry (cancellable transfers)    │
│  edit::EditReg.   │  import::ssh_config (OpenSSH parser)         │
└──────────────────────────────────────────────────────────────────┘
```

Voir [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le détail de la structure des dossiers.

## Tests

```bash
# Tests backend (unitaires + tests DB)
cd src-tauri && cargo test

# Tests d'intégration SSH (ignored par défaut — nécessitent un conteneur Docker)
docker run --rm -d -p 2222:2222 \
  -e USER_NAME=test -e USER_PASSWORD=test -e PASSWORD_ACCESS=true \
  linuxserver/openssh-server
cd src-tauri && cargo test --all-features -- --ignored ssh
```

## Licence

**[Functional Source License 1.1 (FSL-1.1-MIT)](./LICENSE.md)** — *source-available*.

Concrètement :
- ✅ Tu peux **lire, utiliser, modifier, redistribuer** le code librement, à
  titre perso, en interne, pour l'éducation, la recherche.
- ❌ Tu **ne peux pas** en faire un produit/service commercial concurrent (le
  revendre tel quel comme une alternative payante).
- 🔓 Chaque version **bascule automatiquement en licence MIT** au bout de 2 ans.

C'est le modèle de Sentry : transparence totale de l'open source, sans laisser
quiconque commercialiser le projet à la place de ses auteurs. Si un jour le
projet est abandonné, la clause MIT-après-2-ans garantit qu'il reste libre.

## Soutenir

Lynk Client est gratuit et le restera. Si l'app t'est utile, tu peux m'offrir
un café ☕ — ça soutient le développement, sans pression.

[![Offrir un café](https://img.shields.io/badge/Offrir%20un%20caf%C3%A9-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/mtseckdev)
