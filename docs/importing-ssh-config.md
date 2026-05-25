# Importer votre `~/.ssh/config`

Si tu utilises déjà OpenSSH, tu as probablement un fichier `~/.ssh/config`
plein d'alias. Lynk sait le lire et créer les hosts correspondants.

## Comment faire

1. `Ctrl+K` → « Importer ~/.ssh/config » (ou le bouton dans la sidebar)
2. Lynk parse le fichier et liste les entrées détectées
3. Coche celles à importer (les doublons d'un host existant sont signalés et
   pré-décochés)
4. **Importer**

## Ce qui est repris

Pour chaque `Host` du config :

- `HostName` → hostname
- `User` → username
- `Port` → port
- `Host` (l'alias) → label

## Ce qui est filtré

Les entrées qui pointent vers des **services Git** (`git@github.com`,
`git@gitlab.com`, `git@bitbucket.org`, Azure DevOps, Visual Studio) sont
masquées : ce ne sont pas des shells interactifs, les importer n'aurait pas
de sens.

## Ce qui n'est PAS importé automatiquement

- Les **clés SSH** : importe-les séparément via Réglages → Clés SSH, puis
  associe-les à tes hosts.
- Les directives avancées (`ProxyJump`, `ForwardAgent`, etc.) : à
  reconfigurer dans l'onglet **Avancé** du host si besoin.
