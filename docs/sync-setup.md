# Configurer la sync

Lynk propose deux façons de transporter ta config entre machines, **sans
serveur propriétaire** et **tout chiffré côté client**.

> **Ce qui est synchronisé** : hosts, groupes, tags, identities, snippets,
> port forwards.
> **Ce qui ne l'est jamais** : tes clés SSH privées (fichiers sur disque),
> tes mots de passe (keychain OS), les empreintes known_hosts, l'historique
> de commandes, les réglages d'apparence.

Le chiffrement utilise **AES-256-GCM** avec une clé dérivée de ton mot de
passe via **Argon2id**. Sans le mot de passe, le contenu exporté est
illisible — y compris pour nous, vu qu'il n'y a pas de "nous" (pas de serveur).

---

## Option A — Sauvegarde locale (fichier `.lynk`)

Idéal pour : une sauvegarde ponctuelle, ou un transfert manuel via clé USB /
cloud perso.

### Exporter

1. Réglages → **Sync** → section « Sauvegarde locale » → **Exporter**
2. Choisis un mot de passe (note-le : irrécupérable si oublié)
3. Choisis où enregistrer le fichier `lynk-AAAA-MM-JJ.lynk`

### Importer

1. Réglages → **Sync** → **Importer**
2. Choisis le fichier `.lynk` et entre le mot de passe
3. Choisis le mode :
   - **Merge** : ajoute ce qui manque, garde l'existant (rien n'est supprimé)
   - **Replace** : remplace TOUT par la sauvegarde (confirmation requise)

---

## Option B — Sync Git automatique

Idéal pour : avoir ta config à jour en permanence sur 2+ machines, sans y
penser.

### Pré-requis

- `git` installé (`git --version` doit répondre)
- Un repo Git **privé** que tu contrôles (GitHub, GitLab, Gitea, self-hosted…)

### Mise en place

1. **Crée un repo privé vide** (ex. `lynk-vault`).
2. **Génère un token d'accès** :
   - GitHub : Settings → Developer settings → **Fine-grained tokens** →
     accès au seul repo vault, permission *Contents: Read and write*.
   - GitLab : Personal Access Token, scope `write_repository`.
3. Dans Lynk : Réglages → **Sync** → section « Sync Git » :
   - **URL du repo** : `https://github.com/<toi>/lynk-vault.git`
   - **Authentification** : `HTTPS + Token` et colle le token
   - **Mot de passe de chiffrement** : choisis-en un — **le même sur toutes
     tes machines**
   - **Tester la connexion** puis **Activer la sync**

### Au quotidien

- **Push auto** : 30 s après chaque modification, le vault chiffré est poussé
  (`vault.enc` dans le repo). L'indicateur « Sync » du header vire au vert.
- **Pull au démarrage** : au lancement, Lynk récupère les changements faits
  ailleurs (stratégie *remote-wins*).
- **Manuel** : boutons **Push** / **Pull** dans la section Sync.

### Authentification par clé SSH (alternative au token)

Choisis `SSH (clé système)` et utilise une URL `git@github.com:<toi>/<repo>.git`.
Lynk s'appuie alors sur ta configuration SSH système (clé chargée dans
l'agent ou présente dans `~/.ssh/`).

### Bon à savoir

- La stratégie actuelle est **remote-wins** : si tu modifies en parallèle sur
  deux machines sans pousser, la dernière à pousser gagne. Pour du multi-machine
  serein, pousse (ou attends les 30 s) avant de passer sur l'autre poste.
- Le token et le mot de passe de chiffrement sont stockés dans le **keychain
  de l'OS**, jamais dans le repo ni en clair sur disque.
