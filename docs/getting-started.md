# Getting Started

## 1. Installer Lynk Client

Télécharge l'installeur pour ton OS depuis la
[page des releases](https://github.com/moha528/lynk/releases/latest) :

| OS | Fichier |
| --- | --- |
| Windows | `Lynk Client_x64-setup.exe` (NSIS) ou `.msi` |
| macOS | `Lynk Client_universal.dmg` |
| Linux | `.AppImage` (portable) ou `.deb` (Debian/Ubuntu) |

> **Avertissement à l'installation ?** Les installeurs ne sont pas encore
> signés. Voir la [FAQ](./faq.md#avertissements-dinstallation) pour les deux
> clics de contournement (c'est sûr, c'est juste l'absence de certificat
> payant).

## 2. Ajouter ton premier serveur

1. Clique **＋ Ajouter un serveur** dans la sidebar (ou `Ctrl+K` → « Ajouter un serveur »)
2. Renseigne **Label**, **Hostname**, **Username**, **Port** (22 par défaut)
3. (Optionnel) onglet **Authentification** : associe une clé SSH ou une identity
4. **Créer**

## 3. Se connecter

- Double-clic sur le serveur dans la sidebar, **ou**
- `Ctrl+K` puis tape le nom du serveur → Entrée

À la première connexion, l'empreinte du serveur est mémorisée
(Trust-On-First-Use). Si elle change ensuite, Lynk t'avertit.

## 4. Les bases au quotidien

- **Nouveau terminal local** : `Ctrl+K` → « Ouvrir un terminal local »
- **Split d'un pane** : bouton split en haut à droite d'un terminal
- **SFTP** : `Ctrl+K` → ligne « SFTP » d'un serveur → vue dual-pane local/distant
- **Palette de commandes** : `Ctrl+K` (le hub de tout)
- **Snippets** : `Ctrl+Shift+S` — commandes réutilisables avec variables
- **Historique** : `Ctrl+R` — recherche fzf dans tout ce que tu as tapé

Étape suivante : [configurer la sync](./sync-setup.md) pour retrouver ta
config sur toutes tes machines.
