# Termius v2

Client SSH/SFTP desktop libre, multiplateforme, alternative à [Termius](https://termius.com).
Construit avec [Tauri 2](https://tauri.app), React 19 et Rust.

> Voir [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md) pour la vision complète,
> la roadmap (Phases 1 à 5) et le découpage en tickets.

## Stack

- **Desktop shell** : Tauri 2 (IPC, updater, packaging)
- **Frontend** : React 19 + TypeScript strict + Vite + Tailwind v4 + shadcn-style components (Radix UI)
- **Terminal** : [xterm.js](https://xtermjs.org) + addons `fit` / `web-links` / `search` / `webgl`
- **Backend Rust** : [russh](https://crates.io/crates/russh) (SSH client), [sqlx](https://crates.io/crates/sqlx) (SQLite), [ts-rs](https://crates.io/crates/ts-rs) (types partagés), [tokio](https://tokio.rs)
- **State** : Zustand
- **Lint / format** : Biome (front) + rustfmt + clippy (back)

## Prérequis

- **Node.js >= 20** et **pnpm >= 9**
- **Rust stable** (via [rustup](https://www.rust-lang.org/learn/get-started))
- **Dépendances système Tauri** pour votre OS — voir https://tauri.app/start/prerequisites/
  - macOS : Xcode CLT
  - Linux : `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`
  - Windows : Visual Studio Build Tools avec workload C++ + Windows SDK

## Démarrage rapide

```bash
git clone https://github.com/moha528/termiusv2.git
cd termiusv2
pnpm install
pnpm tauri dev
```

La première compilation Rust prend plusieurs minutes (russh + tauri + ses dépendances).
Les builds suivantes utilisent le cache et sont rapides.

## Fonctionnalités

**Phase 1 — Fondations & SSH** ✅
- Gestion CRUD des serveurs (label, hostname, port, username, group, recherche)
- Connexion SSH par mot de passe via `russh`, fingerprints TOFU strict
- PTY interactif rendu via xterm.js, onglets multi-sessions avec resize automatique
- Reconnexion sans perdre l'onglet
- Thèmes terminal : Catppuccin Mocha/Latte, Dracula, Solarized Dark/Light, Tokyo Night, Gruvbox Dark
- Persistance des préférences UI (sidebar width, thème, dernier onglet actif)

**Phase 2 — Multi-tabs & SFTP** ✅
- Groupes / tags / filtres (à câbler en UI Phase 2 bis)
- Parser `~/.ssh/config` + assistant d'import
- SFTP complet : list/stat/mkdir/remove/rename/upload/download streamés, transferts cancellables
- Vue dual-pane Local | Remote, drag & drop bidirectionnel, multi-sélection
- File de transferts globale avec progression, vitesse, ETA, cancel
- Édition fichier remote dans l'éditeur OS par défaut avec re-upload auto (watch mtime)
- Split panes terminal récursifs (style tmux) avec resize au drag
- Renommer un onglet par double-clic
- Sessions persistantes au démarrage avec dialog Restore

**Extras hors-roadmap** ✅
- Custom window chrome (Mica sur Win 11, caption color fallback Win 10)
- Keychain OS pour mémoriser les mots de passe (anticipe P3-T06)
- Command palette globale (Ctrl+K) avec fuzzy search sur hosts + actions
- Workspace homepage (grille de hosts) quand pas d'onglet ouvert
- Toasts globaux (sonner) sur toutes les actions backend
- Thèmes app et terminal indépendants

À venir (voir [cahier des charges](./CAHIER_DES_CHARGES.md)) :
- **Phase 3** — clés SSH (génération/import/passphrase), master password + auto-lock, known_hosts UI, ProxyJump, port forwarding (-L/-R/-D), agent forwarding, audit log
- **Phase 4** — snippets + palette, historique commandes, broadcast multi-pane, identities, pré/post connect scripts, raccourcis configurables, URLs cliquables, recherche dans buffer, notifications, Quick Connect
- **Phase 5** — export/import chiffré, sync Git, updater Tauri, packaging multi-OS, release v1.0

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

MIT — voir [LICENSE](./LICENSE) (à ajouter).
