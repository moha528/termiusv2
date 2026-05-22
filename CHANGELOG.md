# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/), versionnement [SemVer](https://semver.org/).

## [Unreleased]

### Phase 2 — Multi-tabs & SFTP (livrée)

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

## [À venir] Phase 3 — Sécurité & SSH avancé

- P3-T01 → T04 Modèle SshKey + génération/import/UI keys
- P3-T05 Association clés ↔ hosts
- ✅ P3-T06 Keychain (déjà livré)
- P3-T07 Master password + chiffrement DB
- P3-T08 Auto-lock inactivité
- P3-T09 UI known hosts (la table existe déjà)
- P3-T10 → T14 ProxyJump, port forwarding -L/-R/-D, agent forwarding
- P3-T15 Audit log local

## [À venir] Phase 4 — UX power user

- P4-T01 → T03 Snippets + palette de snippets + historique commandes
- P4-T04 Broadcast input multi-pane
- P4-T05 → T06 Identities + pré/post connect scripts
- P4-T07 → T10 Raccourcis configurables, URLs cliquables, recherche buffer, notifications
- ✅ P4-T11 Settings page complète (partiellement livrée)
- ✅ P4-T12 Quick Connect (Command Palette livrée)

## [À venir] Phase 5 — Sync & release

- P5-T01 → T05 Export/import chiffré + sync Git
- P5-T06 → T08 Updater Tauri + packaging multi-OS + about
- P5-T09 → T10 Doc utilisateur + release v1.0.0
