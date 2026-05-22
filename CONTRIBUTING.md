# Contribuer à Termius v2

Merci de vouloir contribuer ! Ce document décrit le workflow, les conventions
et la structure du projet pour que vous puissiez commencer rapidement.

## Workflow Git

- Branche principale : `main` (protégée)
- Branches feature : `feat/<ticket-id>-<slug>` (ex. `feat/P2-T07-sftp-upload`)
- Branches fix : `fix/<ticket-id>-<slug>`
- Commits : [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` pour une nouvelle feature
  - `fix:` pour un bugfix
  - `chore:` pour de la tuyauterie (deps, CI, configs)
  - `docs:` pour la doc
  - `refactor:` / `test:` / `style:` / `perf:`

Chaque ticket du [cahier des charges](./CAHIER_DES_CHARGES.md) est conçu pour
tenir dans une PR atomique (1–4 h de dev).

## Definition of Done

Un ticket est « Done » uniquement si **tous** les critères suivants sont remplis :

1. `pnpm build` compile sans erreur
2. `pnpm lint` passe (Biome)
3. `cargo build` compile sans warning
4. `cargo clippy -- -D warnings` passe
5. `cargo fmt --all -- --check` passe
6. `cargo test --all-features` passe
7. Au moins un test couvre la logique métier ajoutée
8. La feature est manuellement testable via l'UI (si applicable)
9. Pas de `console.log` / `dbg!` / `todo!` oubliés
10. Documentation inline (`///`) sur les fonctions publiques Rust

## Structure des dossiers

```
/
├── src/                          # Frontend React (TypeScript strict)
│   ├── components/               # Composants UI
│   │   └── ui/                   # Primitives shadcn-style (Button, Dialog, …)
│   ├── lib/
│   │   ├── bindings/             # Types générés par ts-rs — ne pas éditer
│   │   ├── ipc.ts                # Wrappers typés autour de invoke()
│   │   ├── sessions.ts           # Wrappers IPC sessions + events
│   │   ├── themes.ts             # Thèmes xterm.js
│   │   └── utils.ts              # cn() (clsx + twMerge)
│   ├── stores/                   # Zustand stores
│   ├── views/                    # Pages (Settings, …)
│   └── App.tsx
├── src-tauri/                    # Backend Rust
│   ├── src/
│   │   ├── main.rs               # Entry point binary
│   │   ├── lib.rs                # `run()` qui assemble Tauri + state
│   │   ├── commands/             # Commandes Tauri (un module par domaine)
│   │   ├── ssh/                  # Wrapper russh : Session, PtyChannel, SessionManager
│   │   ├── sftp/                 # (à venir Phase 2)
│   │   ├── store/                # Persistence SQLite (sqlx) + DAOs
│   │   │   ├── db.rs             # init_pool, migrations
│   │   │   ├── hosts.rs          # DAO hosts
│   │   │   ├── known_hosts.rs    # DAO TOFU known_hosts
│   │   │   └── settings.rs       # DAO key/value settings
│   │   ├── keyvault/             # (à venir Phase 3)
│   │   ├── models/               # Types partagés exposés via ts-rs
│   │   └── error.rs              # AppError sérialisable IPC
│   ├── migrations/               # Migrations SQL sqlx
│   ├── capabilities/             # Capabilities Tauri
│   └── Cargo.toml
├── .github/workflows/            # CI (ci.yml) + release squelette
├── biome.json                    # Config Biome
└── CAHIER_DES_CHARGES.md         # Roadmap complète
```

## Types partagés

Toutes les structs Rust exposées par IPC dérivent `ts_rs::TS` et sont exportées
en TypeScript vers `src/lib/bindings/`. La commande qui régénère les bindings est :

```bash
cd src-tauri && cargo test
```

Ne modifiez **pas** les fichiers de `src/lib/bindings/` à la main : ils seront
écrasés au prochain `cargo test`. Modifiez les structs Rust et regénérez.

## Tests

```bash
# Front
pnpm lint
pnpm build

# Back — unitaires (rapide)
cd src-tauri
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features

# Back — intégration SSH (Docker requis)
docker run --rm -d -p 2222:2222 \
  -e USER_NAME=test -e USER_PASSWORD=test -e PASSWORD_ACCESS=true \
  linuxserver/openssh-server
cargo test --all-features -- --ignored
```

## Conventions de code

### Rust

- `///` doc-comments sur toutes les fonctions publiques
- `anyhow::Result` pour les fonctions métier ; `thiserror` pour les erreurs typées exposées au front
- DAOs dans `store/` ; un fichier par table, fonctions libres (`pub async fn ...`)
- Commandes Tauri dans `commands/` ; one-liners qui appellent les DAOs
- `tracing` pour les logs (`info!`, `warn!`, …) — pas de `println!` en prod

### TypeScript / React

- Composants : `PascalCase`, fichiers `PascalCase.tsx`
- Hooks : `useXxx`, store Zustand : `useXxxStore`
- Pas de `any`, `unknown` est OK aux frontières
- Tailwind via `cn()` ; pas de `style={{ ... }}` sauf valeurs dynamiques (largeur en px, etc.)

## Démarrer un nouveau ticket

1. Choisissez un ticket dans le cahier des charges
2. Créez une branche `feat/<ticket-id>-<slug>` depuis `main` à jour
3. Implémentez la feature en suivant la DoD ci-dessus
4. Ouvrez une PR vers `main` — la CI vérifie tout automatiquement
5. Référencez le ticket dans le titre (`feat: P1-T09 — connexion SSH russh`)

## Questions, idées

Ouvrez une issue avec le label `discussion` avant de coder une refonte importante.
