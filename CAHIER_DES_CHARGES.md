# Cahier des charges — Client SSH/SFTP Desktop

> **Document de référence** pour le développement d'une application desktop de gestion de serveurs SSH/SFTP, alternative libre à Termius.
> Destiné à l'exécution par des agents autonomes. Chaque ticket est conçu pour être atomique (1–4 heures de dev).

---

## Table des matières

1. [Contexte & objectifs](#1-contexte--objectifs)
2. [Stack technique](#2-stack-technique)
3. [Architecture générale](#3-architecture-générale)
4. [Conventions & qualité](#4-conventions--qualité)
5. [Phase 1 — Fondations & SSH minimal](#phase-1--fondations--ssh-minimal)
6. [Phase 2 — Multi-tabs & SFTP](#phase-2--multi-tabs--sftp)
7. [Phase 3 — Sécurité & SSH avancé](#phase-3--sécurité--ssh-avancé)
8. [Phase 4 — UX power user](#phase-4--ux-power-user)
9. [Phase 5 — Sync, polish, release](#phase-5--sync-polish-release)
10. [Hors scope explicite](#10-hors-scope-explicite)
11. [Glossaire](#11-glossaire)

---

## 1. Contexte & objectifs

### Vision
Un client SSH/SFTP desktop **léger, rapide, multiplateforme**, qui couvre le quotidien d'un dev/ops sans demander d'abonnement. Cible de qualité : **rivaliser avec Termius Free**, et dépasser sur quelques points-clés (intégration `~/.ssh/config`, sync auto-hébergeable).

### Objectifs fonctionnels (v1.0)
- Gérer une liste de serveurs (groupes, tags, recherche)
- Se connecter en SSH (mot de passe ou clé), avec onglets multiples
- Naviguer/transférer des fichiers en SFTP (vue dual-pane)
- Gérer les clés SSH (génération, import, passphrases)
- Stocker les secrets dans le keychain de l'OS
- Supporter ProxyJump, port forwarding, agent forwarding
- Productivité : snippets, broadcast, split panes
- Sync optionnelle via Git (zéro infra à maintenir)

### Objectifs non-fonctionnels
- **Binaire < 30 Mo** (objectif Tauri natif)
- **Démarrage < 500 ms** sur machine moderne
- **Cross-platform** : macOS, Linux, Windows (priorité dans cet ordre)
- **Sans télémétrie** par défaut
- **Open source** (licence MIT ou Apache-2.0)

### Public cible
- Développeurs et sysadmins qui gèrent 5 à 100 serveurs
- Utilisateurs actuels de Termius / Royal TSX / MobaXterm cherchant une alternative gratuite
- Power users du terminal qui veulent une GUI sans perdre la flexibilité

---

## 2. Stack technique

### Couche desktop
- **Tauri 2.x** — shell desktop, IPC, updater, packaging
- Cible : macOS (universal), Linux (x86_64 + arm64), Windows (x86_64)

### Frontend
- **React 18** + **TypeScript** strict
- **Vite** comme bundler
- **xterm.js** + addons (`fit`, `web-links`, `search`, `webgl`)
- **TailwindCSS** + **shadcn/ui** pour les composants
- **Zustand** pour le state global (léger, idiomatique)
- **React Router** pour la navigation interne (settings, etc.)
- **react-dnd** ou **dnd-kit** pour drag & drop

### Backend Rust
- **russh** — client SSH pur Rust, async (tokio)
- **russh-sftp** — implémentation SFTP au-dessus de russh
- **russh-keys** — gestion des clés (ed25519, RSA, ECDSA)
- **tokio** — runtime async
- **sqlx** — accès SQLite avec migrations
- **keyring** — accès au keychain de l'OS
- **argon2** — KDF pour le master password
- **aes-gcm** — chiffrement symétrique de la DB
- **serde** + **serde_json** — sérialisation
- **tracing** + **tracing-subscriber** — logs structurés
- **anyhow** + **thiserror** — gestion d'erreurs

### Stockage
- **SQLite** (fichier local) pour la config et les métadonnées
- **OS Keychain** (via crate `keyring`) pour les secrets (mots de passe, passphrases)
- Optionnel : **fichier chiffré** pour la sync Git

### Outils dev
- **rustfmt** + **clippy** + `cargo deny`
- **biome** ou **eslint** + **prettier** côté front
- **vitest** pour les tests front
- **cargo test** + **cargo-nextest** pour le back
- **GitHub Actions** pour CI/CD

---

## 3. Architecture générale

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend (Webview)                   │
│  ┌──────────────┬──────────────────────────────────────────┐ │
│  │   Sidebar    │            Onglets actifs               │ │
│  │              │  ┌────────────────────────────────────┐ │ │
│  │ - Groupes    │  │  Tab 1 : SSH (xterm.js)           │ │ │
│  │ - Hosts      │  ├────────────────────────────────────┤ │ │
│  │ - Tags       │  │  Tab 2 : SFTP (dual-pane)         │ │ │
│  │ - Recherche  │  ├────────────────────────────────────┤ │ │
│  │              │  │  Tab 3 : SSH (split horizontal)   │ │ │
│  └──────────────┴──────────────────────────────────────────┘ │
└────────────────────────────┬─────────────────────────────────┘
                             │ Tauri IPC
                             │ (invoke + events)
┌────────────────────────────▼─────────────────────────────────┐
│                       Backend Rust                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐  │
│  │  SessionManager  │  │   StoreService   │  │  KeyVault  │  │
│  │  (HashMap<UUID>) │  │   (SQLite/sqlx)  │  │ (keyring)  │  │
│  └────────┬─────────┘  └──────────────────┘  └────────────┘  │
│           │                                                   │
│  ┌────────▼─────────────────────────────────────────────┐    │
│  │  Session = russh client + channels (PTY, SFTP, ...) │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Modèle de session
Une **Session** = une connexion SSH active. Identifiée par un UUID v4. Contient :
- Le `russh::client::Handle`
- Un ou plusieurs `Channel` (PTY pour terminal, SFTP, port forwards)
- Métadonnées : host config, état (connecting/open/closed/error)

### Pattern IPC
- **`invoke`** (frontend → backend) : actions commandées (`open_ssh`, `send_input`, `list_dir`, …)
- **`event.emit`** (backend → frontend) : flux asynchrone (`terminal-data-{id}`, `transfer-progress-{id}`, `session-closed-{id}`)
- Chaque session a un `session_id` utilisé comme namespace pour les events

### State management front
- **Zustand stores** :
  - `useServersStore` — liste des hosts/groupes/tags
  - `useSessionsStore` — sessions actives (onglets ouverts)
  - `useSettingsStore` — préférences utilisateur
  - `useTransfersStore` — file de transferts SFTP

---

## 4. Conventions & qualité

### Git
- Branche principale : `main` (protégée)
- Branches feature : `feat/<ticket-id>-<slug>`
- Branches fix : `fix/<ticket-id>-<slug>`
- Commits : Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)

### Definition of Done (DoD) globale
Un ticket est "Done" si **tous** les critères suivants sont remplis :
1. Le code compile sans warnings (`cargo build` et `pnpm build`)
2. `clippy` et `rustfmt` passent (`cargo clippy -- -D warnings`)
3. `biome check` (ou eslint) passe côté front
4. Au moins un test unitaire couvre la logique métier ajoutée
5. La feature est manuellement testable via l'UI (si applicable)
6. Pas de `console.log` / `dbg!` / `todo!` oubliés
7. Documentation inline (`///`) sur les fonctions publiques Rust

### Structure des dossiers
```
/
├── src-tauri/              # Backend Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # Commandes Tauri (1 fichier par domaine)
│   │   ├── ssh/            # Wrapper russh
│   │   ├── sftp/           # Wrapper russh-sftp
│   │   ├── store/          # Persistance SQLite
│   │   ├── keyvault/       # Keychain abstraction
│   │   └── models/         # Types partagés (Host, Session, …)
│   ├── migrations/         # SQL sqlx
│   └── Cargo.toml
├── src/                    # Frontend React
│   ├── components/
│   ├── stores/             # Zustand
│   ├── lib/                # Helpers (ipc wrappers, etc.)
│   ├── views/              # Pages (Servers, Settings, …)
│   └── App.tsx
├── docs/
└── package.json
```

### Types partagés
Utiliser **`ts-rs`** côté Rust pour générer automatiquement les types TypeScript correspondant aux structs Rust exposées via IPC. Évite la double maintenance.

---

# Phase 1 — Fondations & SSH minimal

**Objectif** : avoir une app qui se lance, dans laquelle on peut ajouter un serveur, s'y connecter en SSH, et obtenir un shell utilisable dans un onglet.

**Estimation globale** : 15–20 tickets, ~3–5 jours d'agent

### User stories
- En tant qu'utilisateur, je peux lancer l'app et voir une fenêtre principale avec sidebar et zone d'onglets
- Je peux ajouter manuellement un serveur (host, port, user, password)
- Je peux double-cliquer sur un serveur pour ouvrir un onglet SSH
- Je peux taper des commandes et voir la sortie correctement (couleurs, curseur, redimensionnement)
- Je peux fermer l'onglet et la session se ferme proprement

### Tickets

#### P1-T01 — Init projet Tauri + React + TypeScript
- Bootstrap avec `pnpm create tauri-app` (template React-TS)
- Configurer Tailwind + shadcn/ui (`npx shadcn@latest init`)
- Configurer Biome ou ESLint + Prettier
- Ajouter `.editorconfig`, `.gitignore`, `README.md` initial
- **DoD** : `pnpm tauri dev` lance une fenêtre vide avec un titre custom

#### P1-T02 — Configuration CI GitHub Actions
- Workflow `ci.yml` : lint + build front + `cargo check` + `cargo clippy` + tests
- Workflow `release.yml` (squelette, désactivé) pour builds tagués
- Cache Rust et pnpm
- **DoD** : un PR déclenche les checks et ils passent en vert

#### P1-T03 — Layout principal (sidebar + tabs area)
- Composant `MainLayout` avec sidebar gauche (largeur ajustable) et zone principale
- Sidebar : header "Servers" + zone vide pour la liste + bouton "+ Add Server"
- Zone principale : barre d'onglets vide + zone de contenu
- Pas de logique encore, juste la coquille
- **DoD** : la fenêtre affiche le layout correctement, le drag de la sidebar fonctionne

#### P1-T04 — Modèle de données `Host` + migration SQLite
- Migration SQL initiale : table `hosts` (id, label, hostname, port, username, group_id, created_at, updated_at)
- Table `groups` (id, name, parent_id, position)
- Struct Rust `Host` avec `ts-rs` derive
- Connexion à la DB au démarrage de l'app (`~/.local/share/<app>/db.sqlite` selon OS)
- **DoD** : les tables sont créées au premier lancement, la DB est accessible

#### P1-T05 — Commandes Tauri CRUD Host
- `list_hosts() -> Vec<Host>`
- `create_host(input: HostInput) -> Host`
- `update_host(id: String, input: HostInput) -> Host`
- `delete_host(id: String) -> ()`
- Tests unitaires sur le store avec une DB en mémoire
- **DoD** : les 4 commandes fonctionnent et sont testées

#### P1-T06 — UI : liste des serveurs dans la sidebar
- Composant `ServerList` qui appelle `list_hosts` au mount
- Affichage simple : icône + label + hostname en sous-titre
- Click → sélectionne (état visuel)
- Double-click → émet une action "open session" (handler vide pour l'instant)
- **DoD** : la liste s'affiche, le clic et double-clic sont fonctionnels

#### P1-T07 — UI : dialog "Add Server"
- Modal shadcn/ui avec form react-hook-form + zod
- Champs : label, hostname, port (default 22), username, password (optionnel)
- Validation : hostname requis, port 1–65535
- Soumission → appelle `create_host` puis ferme et rafraîchit la liste
- **DoD** : on peut ajouter un serveur depuis l'UI et il apparaît dans la liste

#### P1-T08 — UI : édition et suppression de Host
- Menu contextuel sur clic droit : Edit / Delete
- Edit ouvre le même dialog pré-rempli
- Delete demande confirmation
- **DoD** : on peut éditer et supprimer un host depuis la sidebar

#### P1-T09 — SSH : connexion basique avec russh
- Module `ssh::client` : fonction `connect(host: &Host, password: &str) -> Result<Session>`
- Auth password uniquement à ce stade
- Vérification known_hosts (mode TOFU strict)
- Tests d'intégration avec un conteneur Docker `linuxserver/openssh-server`
- **DoD** : un test unitaire ouvre une connexion vers un SSH server local et la ferme proprement

#### P1-T10 — SSH : ouverture d'un channel PTY
- Méthode `Session::open_pty(cols: u16, rows: u16) -> PtyChannel`
- Méthode `PtyChannel::write(data: &[u8])`
- Méthode `PtyChannel::resize(cols: u16, rows: u16)`
- Stream de sortie via un `tokio::sync::mpsc::Receiver<Vec<u8>>`
- **DoD** : un test envoie `echo hello\n` et reçoit `hello` en retour

#### P1-T11 — SessionManager (état global Rust)
- Struct `SessionManager` : `Arc<Mutex<HashMap<Uuid, Arc<Session>>>>`
- Méthodes : `create`, `get`, `remove`, `list`
- Géré via Tauri State (`tauri::State<SessionManager>`)
- **DoD** : on peut créer une session, la récupérer, la supprimer via les méthodes du manager

#### P1-T12 — Commande Tauri `open_ssh_session`
- Input : `host_id`, `password` (récupéré du keychain si non fourni)
- Crée la session, ouvre le PTY (taille par défaut 80×24)
- Spawn une tâche async qui forward les bytes du PTY vers `emit("terminal-data-{session_id}", bytes)`
- Retourne le `session_id` au front
- **DoD** : commande appelée depuis le front, les events sont émis

#### P1-T13 — Commandes Tauri auxiliaires session
- `send_terminal_input(session_id: String, data: String)`
- `resize_terminal(session_id: String, cols: u16, rows: u16)`
- `close_session(session_id: String)`
- **DoD** : les 3 commandes fonctionnent et sont testées

#### P1-T14 — Intégration xterm.js dans React
- Composant `TerminalView` qui reçoit un `sessionId` en prop
- Initialise un `Terminal` xterm.js avec addons : `fit`, `web-links`, `webgl` (fallback canvas)
- Écoute `terminal-data-{sessionId}` et écrit dans le terminal
- Écoute les frappes locales et appelle `send_terminal_input`
- Resize observer → appelle `resize_terminal`
- **DoD** : un terminal s'affiche dans un onglet et est interactif

#### P1-T15 — Système d'onglets de base
- Store Zustand `useSessionsStore` : array de `{ id, label, type: 'ssh', sessionId }`
- Barre d'onglets cliquables + bouton "x" pour fermer
- Switch d'onglet = change le composant rendu dans la zone principale
- Double-clic sur un host → crée une session + ouvre un onglet
- **DoD** : on peut ouvrir plusieurs onglets SSH, les switcher, les fermer

#### P1-T16 — Gestion propre de la déconnexion
- Si la session ferme (côté serveur), event `session-closed-{id}` au front
- L'onglet affiche un état "Disconnected" avec bouton "Reconnect"
- Cleanup correct côté Rust (suppression du HashMap, drop des channels)
- **DoD** : tuer le SSH côté serveur ferme l'onglet proprement, pas de fuite de ressources

#### P1-T17 — Persistance des préférences UI
- Largeur de la sidebar, dernière taille de fenêtre, dernier onglet actif
- Store dans la DB ou un fichier `settings.json`
- Restauration au démarrage
- **DoD** : on ferme l'app, on la rouvre, la taille de la fenêtre et de la sidebar sont restaurées

#### P1-T18 — Thèmes terminal (5 built-in)
- Dracula, Solarized Dark, Solarized Light, Tokyo Night, Gruvbox Dark
- Setting dans `useSettingsStore`
- Page Settings basique (juste un dropdown pour le thème pour l'instant)
- **DoD** : changer de thème change immédiatement l'apparence du terminal

#### P1-T19 — Recherche dans la liste des hosts
- Input de recherche au-dessus de la sidebar
- Filtre fuzzy sur label, hostname, username (utiliser `fuse.js` ou logique simple)
- **DoD** : taper "prod" filtre la liste en temps réel

#### P1-T20 — Documentation : README + CONTRIBUTING
- README : description, screenshots placeholder, install, build
- CONTRIBUTING : workflow git, conventions, comment lancer en dev
- **DoD** : un nouveau dev peut cloner et lancer l'app en suivant le README

---

# Phase 2 — Multi-tabs & SFTP

**Objectif** : transferts de fichiers complets, gestion des groupes/tags, import `~/.ssh/config`.

**Estimation** : 15–18 tickets, ~3 jours

### Tickets

#### P2-T01 — Modèle `Group` + UI groupes dans la sidebar
- Migration : la table `groups` est déjà là, on l'utilise
- UI arborescente (groupes pliables) avec hosts dedans
- Drag & drop pour déplacer un host vers un groupe
- Bouton "+ New Group" dans la sidebar
- **DoD** : on peut créer des groupes et y ranger des hosts

#### P2-T02 — Modèle `Tag` + assignation aux hosts
- Tables `tags` et `host_tags` (many-to-many)
- UI : input multi-tag dans le dialog d'édition du host
- Affichage : petits badges colorés à côté du label dans la sidebar
- **DoD** : on peut tagger un host avec plusieurs tags et les voir

#### P2-T03 — Filtrage par tag dans la sidebar
- Au-dessus de la liste, une zone de pills cliquables (tous les tags utilisés)
- Cliquer un tag filtre la liste pour ne montrer que les hosts taggés
- Multi-sélection (AND ou OR, choix UX à arbitrer — partir sur OR par défaut)
- **DoD** : on peut filtrer par un ou plusieurs tags

#### P2-T04 — Parser `~/.ssh/config`
- Crate `ssh2-config` ou parser maison
- Module Rust `import::ssh_config::parse(path: &Path) -> Vec<HostEntry>`
- Gérer : `Host`, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`, wildcards basiques
- Tests avec plusieurs fichiers d'exemple
- **DoD** : un fichier `~/.ssh/config` typique est parsé correctement

#### P2-T05 — UI : assistant d'import `~/.ssh/config`
- Bouton "Import from ~/.ssh/config" dans Settings ou menu Servers
- Dialog : liste des hosts détectés avec checkbox de sélection
- Bouton "Import selected" → crée les hosts en base
- Gestion des doublons (proposer skip/replace)
- **DoD** : on peut importer en 3 clics tous ses hosts existants

#### P2-T06 — SFTP : commandes backend de base
- `sftp_list_dir(session_id: String, path: String) -> Vec<FileEntry>`
- `sftp_stat(session_id: String, path: String) -> FileEntry`
- `sftp_mkdir(session_id: String, path: String)`
- `sftp_remove(session_id: String, path: String)`
- `sftp_rename(session_id: String, from: String, to: String)`
- Tests d'intégration avec serveur SSH Docker
- **DoD** : les 5 commandes fonctionnent

#### P2-T07 — SFTP : upload / download de fichiers
- `sftp_upload(session_id: String, local_path: String, remote_path: String) -> TransferId`
- `sftp_download(session_id: String, remote_path: String, local_path: String) -> TransferId`
- Events : `transfer-progress-{id}` avec bytes transférés / total / vitesse
- Buffer de 64 Ko, calcul de débit
- **DoD** : on peut upload/download un fichier de 100 Mo avec progression visible

#### P2-T08 — UI : vue SFTP dual-pane
- Composant `SftpView` qui prend un `sessionId`
- Deux panneaux côte à côte : Local (filesystem local) et Remote (via SFTP)
- Chaque panneau : breadcrumb + liste de fichiers (icône, nom, taille, date, perms)
- Double-clic sur dossier → entre dedans
- **DoD** : on peut naviguer dans les deux côtés

#### P2-T09 — Type d'onglet "SFTP" + intégration
- Étendre `useSessionsStore` pour supporter `type: 'sftp'`
- Menu contextuel sur un host : "Open Terminal" / "Open SFTP"
- Possibilité d'ouvrir un onglet SFTP en plus d'un terminal sur le même host (réutiliser la même session SSH)
- **DoD** : on peut avoir un terminal et un SFTP ouverts simultanément sur un host

#### P2-T10 — SFTP : actions clic droit
- Renommer, supprimer (avec confirmation), créer dossier, créer fichier, télécharger, propriétés
- Modal de propriétés affiche : taille, permissions (rwx), owner/group, dates
- **DoD** : toutes les actions fonctionnent depuis l'UI

#### P2-T11 — SFTP : drag & drop entre les deux panneaux
- Drag d'un fichier local vers le panneau remote → upload
- Drag d'un fichier remote vers le panneau local → download
- Multi-sélection supportée
- **DoD** : DnD bidirectionnel fonctionnel

#### P2-T12 — UI : file de transferts
- Bandeau inférieur ou panneau latéral repliable
- Liste : nom fichier, sens (↑/↓), progression, vitesse, ETA, statut
- Boutons : pause, resume (best effort), cancel, clear completed
- **DoD** : on voit les transferts en cours et terminés

#### P2-T13 — SFTP : édition de fichier remote dans l'éditeur local
- Clic droit "Edit" → télécharge dans `tmp/`, ouvre avec l'éditeur configuré (`$EDITOR`, VS Code, etc.)
- Watcher sur le fichier local : à chaque sauvegarde → réupload auto
- Indicateur visuel "Editing… (last sync 5s ago)"
- Setting : éditeur à utiliser (defaults raisonnables par OS)
- **DoD** : on édite un fichier remote dans VS Code et il est synchronisé

#### P2-T14 — SFTP : affichage des fichiers cachés togglable
- Bouton ou raccourci `Ctrl+H`
- Setting persisté par défaut (off)
- **DoD** : toggle visible des `.fichiers`

#### P2-T15 — Split panes dans un onglet
- Un onglet peut contenir un split horizontal ou vertical
- Chaque pane peut être un terminal indépendant (potentiellement vers le même host ou différents)
- Drag du séparateur pour redimensionner
- Bouton de close par pane (si le dernier ferme, l'onglet ferme)
- **DoD** : on peut split un onglet et avoir 2 terminaux côte à côte

#### P2-T16 — Renommer un onglet
- Double-clic sur le label de l'onglet → input éditable
- Persisté tant que l'onglet existe (pas en DB)
- **DoD** : renommer fonctionne

#### P2-T17 — Sessions persistantes au démarrage
- À la fermeture, sauvegarder la liste des onglets ouverts (host_id, type, custom_name)
- Au démarrage, proposer dans une modal : "Restore previous session?" (Yes / No / Always / Never)
- **DoD** : on retrouve ses onglets après un restart

#### P2-T18 — Tests E2E basiques (Playwright ou WebdriverIO)
- Test : ajouter un host, l'ouvrir en SSH, taper une commande, fermer
- Test : ouvrir SFTP, créer un dossier, supprimer
- Lancés en CI sur Linux uniquement (gain de temps)
- **DoD** : 2 tests E2E verts en CI

---

# Phase 3 — Sécurité & SSH avancé

**Objectif** : passer à un niveau "production" sur l'auth et les fonctionnalités SSH avancées.

**Estimation** : 12–15 tickets, ~2–3 jours

### Tickets

#### P3-T01 — Modèle `SshKey` + table en DB
- Table `ssh_keys` (id, name, key_type, public_key, private_key_path_or_ref, has_passphrase, created_at)
- Note : la clé privée elle-même n'est PAS en DB, on stocke un chemin ou une référence keychain
- Struct Rust avec `ts-rs`
- **DoD** : table créée, CRUD basique commandé

#### P3-T02 — Génération de clés SSH
- Commande `generate_ssh_key(name: String, key_type: 'ed25519'|'rsa4096', passphrase: Option<String>)`
- Utilise `russh-keys` ou `osshkeys`
- Écrit la clé privée sur disque (`~/.local/share/<app>/keys/<name>`), permissions 0600
- Si passphrase fournie → chiffrement de la clé + stockage de la passphrase dans le keychain
- **DoD** : on génère une clé ed25519, le fichier est valide (`ssh -i` fonctionne avec)

#### P3-T03 — Import de clés SSH existantes
- Commande `import_ssh_key(file_path: String, name: String, passphrase: Option<String>)`
- Détection auto du format (OpenSSH, PEM)
- Validation : la clé peut être déchiffrée si passphrase fournie
- **DoD** : import d'une clé existante fonctionne

#### P3-T04 — UI : page "Keys" dans Settings
- Liste des clés enregistrées
- Boutons : Generate, Import, Export public key, Copy public key, Delete
- Affichage : nom, type, fingerprint, "has passphrase ✓"
- **DoD** : on peut gérer ses clés depuis l'UI

#### P3-T05 — Association clés ↔ hosts
- Table `host_keys` (host_id, key_id, priority)
- UI : dans le dialog d'édition du host, multi-select des clés à essayer
- Auth SSH essaie les clés dans l'ordre de priorité, puis password si configuré
- **DoD** : un host peut avoir N clés, l'auth les essaie toutes

#### P3-T06 — Intégration OS Keychain pour secrets
- Module `keyvault` avec abstraction multiplateforme (crate `keyring`)
- `store_password(host_id: String, password: String)`
- `get_password(host_id: String) -> Option<String>`
- `store_passphrase(key_id: String, passphrase: String)`
- `delete_*` correspondants
- **DoD** : les passwords ne sont jamais en clair sur disque, le keychain est utilisé

#### P3-T07 — Master password (optionnel, désactivé par défaut)
- Setting "Enable master password" → définit un mot de passe maître
- Dérivation Argon2id → clé AES-GCM
- Chiffrement du blob SQLite (ou des champs sensibles uniquement) avec cette clé
- Demande à l'unlock au démarrage
- **DoD** : activer le master password ferme l'app, redemande au lancement

#### P3-T08 — Auto-lock après inactivité
- Setting : "Lock after X minutes of inactivity" (off / 5 / 15 / 30 / 60)
- Détection d'inactivité (pas de frappe / pas de scroll / pas de click)
- Au lock : ferme toutes les sessions, demande le master password (ou bloque l'UI si pas de master)
- **DoD** : avec lock à 1 min en test, l'app se verrouille bien

#### P3-T09 — Known hosts management
- Table `known_hosts` (hostname, port, fingerprint, key_type, accepted_at)
- À la première connexion : modal "Accept fingerprint XYZ for host.example.com?"
- Si fingerprint change : modal warning rouge, refuser ou accepter explicitement
- Page Settings : voir et supprimer des entrées
- **DoD** : changement de fingerprint déclenche bien l'alerte

#### P3-T10 — SSH ProxyJump (bastion)
- Champ `proxy_jump` dans le modèle Host (référence à un autre host, ou string `user@host:port`)
- Support multi-niveau (jump1 → jump2 → cible)
- Côté russh : ouvrir un channel `direct-tcpip` sur la session bastion, l'utiliser comme transport
- UI : champ dans l'édition du host avec dropdown des hosts existants
- **DoD** : on peut se connecter à un host via un bastion configuré

#### P3-T11 — Port forwarding local (-L)
- Modèle `PortForward` (id, host_id, type: 'local'|'remote'|'dynamic', local_port, remote_host, remote_port, auto_start)
- Commande `start_local_forward` / `stop_local_forward`
- UI : panneau "Port Forwards" attaché à chaque host avec table editable
- Indicateur d'état (actif / inactif / erreur)
- **DoD** : un forward local fonctionne, vérifiable avec `curl localhost:XXXX`

#### P3-T12 — Port forwarding remote (-R)
- Même structure, type 'remote'
- **DoD** : un forward remote fonctionne

#### P3-T13 — SOCKS dynamic (-D)
- Type 'dynamic', un seul port local, fait office de proxy SOCKS5
- **DoD** : configurer un navigateur sur le port SOCKS permet de naviguer via le serveur

#### P3-T14 — SSH agent forwarding (toggle par host)
- Checkbox "Forward SSH agent" dans l'édition du host
- Implémentation : channel `auth-agent@openssh.com`
- Tests : `ssh-add -L` côté distant doit lister les clés locales
- **DoD** : l'agent forwarding fonctionne quand activé

#### P3-T15 — Audit log local (optionnel par host)
- Setting par host : "Log session to file"
- Si activé : tous les bytes du PTY sont écrits dans `~/.local/share/<app>/logs/<host>/<date>.log`
- Rotation manuelle (pas urgent)
- **DoD** : les logs sont écrits si activé, pas écrits sinon

---

# Phase 4 — UX power user

**Objectif** : transformer l'app d'un bon client SSH en un outil que les power users préfèrent à leur terminal.

**Estimation** : 10–12 tickets, ~2 jours

### Tickets

#### P4-T01 — Snippets : modèle et stockage
- Table `snippets` (id, name, content, tags, folder_id, variables_schema_json)
- Support variables : `{{host}}`, `{{user}}`, `{{date}}`, `{{custom}}`
- **DoD** : CRUD complet

#### P4-T02 — UI : palette de snippets
- Panneau latéral droit toggleable (raccourci `Ctrl+Shift+S`)
- Liste des snippets groupés par dossier, recherche fuzzy
- Click → insère dans le terminal actif (avec substitution des variables)
- Si variables custom : modal de saisie avant insertion
- **DoD** : utiliser un snippet `tail -f /var/log/{{service}}.log` demande `service` puis l'envoie au terminal

#### P4-T03 — Historique de commandes inter-sessions
- Hook sur le PTY : détection des commandes envoyées (sur `\n`)
- Stockage en DB (table `command_history`)
- Recherche via `Ctrl+R` style fzf
- Setting : per-host ou global
- **DoD** : `Ctrl+R` affiche un fuzzy finder fonctionnel

#### P4-T04 — Broadcast input multi-pane
- Bouton "Sync input" sur un onglet split → marque les panes comme groupe
- Toute frappe est envoyée à tous les panes du groupe
- Indicateur visuel (bordure colorée)
- **DoD** : taper dans un pane synchronisé envoie à 3 serveurs simultanément

#### P4-T05 — Identités SSH (profils réutilisables)
- Modèle `Identity` (id, name, username, ssh_key_id, agent_forwarding, …)
- Un host peut référencer une Identity au lieu de tout redéfinir
- UI : page "Identities" dans Settings
- **DoD** : créer une identity, l'assigner à 5 hosts, changer l'identity met à jour les 5

#### P4-T06 — Pré/post connect scripts
- Champs `pre_connect_script` et `post_connect_script` sur Host (texte multi-ligne)
- `pre` : exécuté en local avant la co (rarement utile mais permet `mosh-server` etc.)
- `post` : envoyé au PTY juste après ouverture du shell
- **DoD** : un `post_connect` qui fait `cd /var/www && ls` fonctionne

#### P4-T07 — Raccourcis clavier configurables
- Setting "Keyboard shortcuts" avec toutes les actions et leur shortcut
- Conflits détectés et signalés
- Defaults raisonnables : `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` next tab, `Ctrl+Shift+T` reopen closed, etc.
- **DoD** : modifier un raccourci le rend effectif immédiatement

#### P4-T08 — Détection d'URLs cliquables + ouverture
- Addon `web-links` de xterm.js déjà ajouté → s'assurer que Ctrl+clic ouvre dans le navigateur via Tauri
- **DoD** : un `https://example.com` dans le terminal est cliquable et ouvre le navigateur

#### P4-T09 — Recherche dans le buffer du terminal
- Addon `search` de xterm.js, raccourci `Ctrl+Shift+F`
- Barre de recherche flottante avec next/prev, case-sensitive, regex
- **DoD** : on peut rechercher dans la sortie d'un long log

#### P4-T10 — Notifications système (terminal bell, fin de commande longue)
- Si le shell envoie un BEL (`\a`) → notification système
- Setting : enable / per-host
- Bonus : "notify when command finishes" → marqueur sur une commande qui notifie quand le prompt revient (détection naïve)
- **DoD** : `echo -e '\a'` génère une notification

#### P4-T11 — Settings : page complète et organisée
- Sections : General, Appearance, Terminal, Keyboard, Security, Sync, About
- Composant `SettingsPage` avec sidebar interne
- Toutes les settings précédentes regroupées ici
- **DoD** : on peut accéder à toutes les settings de l'app depuis une seule page

#### P4-T12 — Quick Connect
- `Ctrl+K` ouvre une palette type Spotlight
- Tape `user@host:port` → ouvre une session non sauvegardée
- Historique des quick connects récents (pour reproposition)
- **DoD** : taper `Ctrl+K root@1.2.3.4` ouvre une session SSH

---

# Phase 5 — Sync, polish, release

**Objectif** : passer en v1.0 publiable, multi-machine, mise à jour automatique.

**Estimation** : 8–10 tickets, ~2 jours

### Tickets

#### P5-T01 — Export chiffré de la config
- Commande `export_config(password: String, path: String)`
- Sérialise hosts/groupes/tags/identities/snippets en JSON
- Chiffre avec AES-GCM (clé dérivée du password en Argon2id)
- N'inclut PAS les clés SSH privées (séparées) ni les passwords
- **DoD** : on génère un fichier `.enc`, on l'importe sur une autre machine, tout est restauré

#### P5-T02 — Import chiffré + merge
- Commande `import_config(password: String, path: String, mode: 'merge'|'replace')`
- Merge : ajoute les nouveaux, ignore les doublons (par label)
- Replace : remplace tout (avec confirmation)
- **DoD** : import fonctionnel dans les deux modes

#### P5-T03 — Sync Git : configuration
- Settings → section Sync : URL du repo Git (SSH ou HTTPS), branche, fréquence
- Stockage des credentials Git (token PAT ou clé SSH dédiée) dans le keychain
- Bouton "Test connection"
- **DoD** : on peut configurer un repo et tester la connexion

#### P5-T04 — Sync Git : push automatique
- À chaque modification (debounced 30s) : commit + push de la config chiffrée
- Format : un seul fichier `vault.enc` dans le repo
- Indicateur dans la status bar : "Synced 2 min ago" / "Syncing…" / "Out of sync"
- **DoD** : modifier un host pousse automatiquement sur le repo

#### P5-T05 — Sync Git : pull au démarrage
- Au lancement : pull du repo, merge avec la config locale
- Stratégie de résolution de conflit : "remote wins" par défaut, demander à l'utilisateur si modification locale non poussée
- **DoD** : modifier sur machine A, lancer sur machine B → les changements sont là

#### P5-T06 — Tauri updater
- Configuration du updater Tauri (clé de signature, endpoint)
- Vérification au démarrage + manuellement depuis About
- Téléchargement et installation guidés
- **DoD** : on peut publier une release et l'app la détecte et propose la mise à jour

#### P5-T07 — Packaging multi-OS
- Workflow GitHub Actions `release.yml` activé : build pour macOS (universal), Linux (deb/AppImage), Windows (msi/nsis)
- Signature : Apple notarization (si certificat), Windows code signing (si certificat), GPG sur Linux
- Upload des artefacts sur la release GitHub
- **DoD** : tag `v1.0.0` produit 5–6 binaires installables

#### P5-T08 — Page About + crash reporting opt-in
- About : version, lien GitHub, licence, crédits
- Toggle "Send anonymous crash reports" (default OFF) — Sentry ou équivalent self-host
- **DoD** : page accessible, toggle fonctionne

#### P5-T09 — Documentation utilisateur
- `docs/` avec : Getting Started, Importing your ~/.ssh/config, Setting up Sync, Keyboard Shortcuts, FAQ
- Hébergement : GitHub Pages ou dossier `docs/` simple
- **DoD** : la doc couvre les usages courants

#### P5-T10 — Release v1.0.0
- CHANGELOG.md propre
- Screenshots / GIF pour le README
- Annonce (HN, Reddit r/programming, r/selfhosted, Mastodon)
- **DoD** : la v1.0.0 est publiée et installable par n'importe qui

---

## 10. Hors scope explicite

Pour cadrer le projet et éviter le scope creep, les éléments suivants sont **explicitement exclus** de la v1.0 :

- **Telnet, rlogin** : protocoles obsolètes
- **FTP non sécurisé** : seul SFTP est supporté
- **Mosh** : intéressant mais protocole complexe
- **X11 forwarding** : niche, ajoutable en v1.1 si demande
- **Collaboration temps réel** (style Termius Pro Team) : énorme scope produit
- **Mobile companion app** : non, c'est un projet desktop
- **AI inline (suggestions de commandes)** : non, focus sur les bases solides
- **Plugins / extensions tierces** : pas avant que l'app soit stable
- **Tunnelling VPN-like** : sortir du scope SSH pur
- **Sync cloud propriétaire** : on offre Git, c'est suffisant

---

## 11. Glossaire

- **PTY** : Pseudo-terminal. Interface qui simule un terminal physique pour les programmes interactifs.
- **TOFU** : Trust On First Use. Modèle de confiance où la première clé reçue est acceptée et mémorisée.
- **ProxyJump** : Fonctionnalité SSH permettant de traverser un ou plusieurs serveurs intermédiaires (bastions) pour atteindre la cible.
- **SOCKS** : Protocole de proxy générique. SSH peut créer un proxy SOCKS dynamique avec `-D`.
- **PAT** : Personal Access Token, utilisé pour s'authentifier sur Git via HTTPS.
- **IPC** : Inter-Process Communication. Dans Tauri, mécanisme d'échange entre le webview frontend et le backend Rust.
- **KDF** : Key Derivation Function. Fonction qui dérive une clé cryptographique à partir d'un mot de passe (ex : Argon2id, PBKDF2).
- **DoD** : Definition of Done. Liste de critères qu'un ticket doit remplir pour être considéré terminé.

---

## Annexe — Récap des phases

| Phase | Objectif | Tickets | Estim. | Statut |
|-------|----------|---------|--------|--------|
| 1 | Fondations + SSH minimal | 20 | 3–5 j | ✅ |
| 2 | Multi-tabs + SFTP + import config | 18 | 3 j | ✅ (T18 E2E reporté, tests manuels OK) |
| 3 | Sécurité + SSH avancé | 15 | 2–3 j | 🟡 P3-T06 (keychain) déjà fait |
| 4 | UX power user | 12 | 2 j | 🟡 P4-T11 (Settings) partiellement fait |
| 5 | Sync + release | 10 | 2 j | ⏳ |
| **Total** | **v1.0** | **~75** | **~12–15 j** | |

Note : ces estimations supposent un travail à plein temps. Avec des agents parallèles, beaucoup de tickets indépendants au sein d'une même phase peuvent être exécutés en parallèle (notamment dans les phases 1, 3 et 4).

### Hors-roadmap implémenté

Au cours du dev, plusieurs ajouts UX non listés dans la roadmap initiale ont été livrés :

- **Custom window chrome** : Mica sur Windows 11 21H2+, fallback DwmSetWindowAttribute caption color sur Win 10
- **Command palette** (`Ctrl+K`) avec fuzzy search sur hosts + actions globales — équivalent simplifié du P4-T12 (Quick Connect)
- **Workspace homepage** : grille de hosts cards quand pas d'onglet — équivalent du Termius "Hosts overview"
- **Toasts globaux** via `sonner` sur toutes les actions backend (loading → success/error) avec theme dark/light auto
- **Thèmes app vs terminal séparés** : preview live, padding interne, Catppuccin Mocha/Latte ajoutés
- **Copy/Cut/Paste SFTP** : clipboard partagé entre les deux panes avec menu contextuel sur zone vide
- **Sélection multiple aware** : right-click sur sélection applique l'action au lot ; clic hors sélection narrow
- **Auto-refresh post-transfer** : le pane destinataire recharge tout seul à la fin d'un upload/download
- **Menu contextuel webview désactivé** sauf inputs : finis les "Inspect Element" parasites
- **Sessions persistantes** au démarrage avec dialog "Restaurer ?" + option "Mémoriser ce choix"
- **dragDropEnabled: false** sur la fenêtre pour ne pas court-circuiter notre DnD HTML5 interne
