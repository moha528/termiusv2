# Publier une release (mainteneur)

Procédure pour couper une version et la distribuer via GitHub Releases +
updater Tauri. Destiné aux mainteneurs, pas aux utilisateurs finaux.

## Pré-requis (une seule fois)

### 1. Générer la paire de clés de l'updater

L'updater Tauri vérifie chaque mise à jour avec une signature **minisign**.
Elle est **indépendante** de la signature de code OS — elle est obligatoire
même si on ship non-signé.

```bash
pnpm tauri signer generate -w ~/.lynk-updater.key
```

La commande affiche :
- une **clé privée** (le fichier `~/.lynk-updater.key`) + son mot de passe
- une **clé publique** (chaîne base64)

### 2. Câbler les clés

- **Clé publique** → dans `src-tauri/tauri.conf.json`, remplace
  `"pubkey": "REMPLACER_PAR_LA_CLE_PUBLIQUE_MINISIGN"` par la vraie valeur.
- **Clé privée + mot de passe** → secrets GitHub
  (Settings → Secrets and variables → Actions) :
  - `TAURI_SIGNING_PRIVATE_KEY` = contenu du fichier `.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = le mot de passe (vide si aucun)

> ⚠️ Ne committe JAMAIS la clé privée. Sauvegarde-la hors du repo (gestionnaire
> de mots de passe). La perdre = ne plus pouvoir publier d'update que les
> apps déjà installées accepteront.

### 3. (Plus tard) Signature de code OS

Non configurée pour le lancement (on ship non-signé, cf.
[FAQ](./faq.md#avertissements-dinstallation)). Pour l'ajouter ensuite, sans
toucher au reste : ajouter les secrets Windows (cert + mdp) et macOS
(Apple ID, team id, certificat, mdp) au workflow `release.yml`.

## Couper une release

1. Mets à jour la version aux **trois** endroits (ils doivent correspondre) :
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
2. Mets à jour `CHANGELOG.md` (déplace la section `[Unreleased]` sous le numéro de version).
3. Commit + tag :
   ```bash
   git commit -am "release: v1.0.0"
   git tag v1.0.0
   git push origin main --tags
   ```
4. Le workflow `Release` se déclenche : il build Windows / macOS (universal) /
   Linux, signe les artefacts updater, et crée une **Release draft** avec tous
   les installeurs + `latest.json`.
5. Vérifie les artefacts, édite les notes, puis **publie** la draft.
6. L'endpoint updater pointe sur la Release `latest` : les apps installées la
   détecteront au prochain démarrage.

## Vérifier que l'updater marche

1. Installe la version N.
2. Publie une version N+1.
3. Lance la version N → un toast « Mise à jour disponible » doit apparaître
   sous quelques secondes. Clique « Installer » → l'app télécharge, vérifie la
   signature, installe et redémarre en N+1.
