# Termius v2

Client SSH/SFTP desktop libre, multiplateforme, alternative à Termius.

> Voir [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md) pour la vision complète et le découpage en tickets.

## Stack

- **Tauri 2** (shell desktop, IPC, packaging)
- **React 19 + TypeScript** (Vite, Tailwind v4)
- **Rust** (russh / russh-sftp / sqlx / keyring)

## Prérequis

- Node.js >= 20 et `pnpm` >= 9
- Rust stable (via [rustup](https://www.rust-lang.org/learn/get-started))
- Les [dépendances système Tauri](https://tauri.app/start/prerequisites/) pour votre OS

## Démarrer en dev

```bash
pnpm install
pnpm tauri dev
```

## Scripts utiles

| Commande         | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Lance Vite seul (sans la fenêtre Tauri)  |
| `pnpm tauri dev` | Lance l'app desktop en dev               |
| `pnpm build`     | Build front (typecheck + Vite build)     |
| `pnpm lint`      | Vérifie le code avec Biome               |
| `pnpm lint:fix`  | Applique les fixes Biome auto            |

## Statut

En cours de développement — Phase 1 (fondations & SSH minimal). Voir le cahier des charges
pour la roadmap détaillée.
