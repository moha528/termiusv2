# FAQ

## Avertissements d'installation

### Windows : « Windows a protégé votre PC »

L'installeur n'est pas encore signé avec un certificat de code (payant).
SmartScreen affiche donc un avertissement. Pour installer :

1. Clique **Informations complémentaires**
2. Clique **Exécuter quand même**

C'est sans risque : le binaire vient de la
[release GitHub officielle](https://github.com/moha528/termiusv2/releases).
La signature de code sera ajoutée dans une version ultérieure.

### macOS : « Application non vérifiée »

Même raison (pas de notarization Apple, qui requiert un compte payant).

1. **Clic droit** sur l'app → **Ouvrir**
2. Dans la boîte de dialogue, confirme **Ouvrir**

(Une seule fois ; ensuite elle s'ouvre normalement.)

Alternative en ligne de commande :
```bash
xattr -d com.apple.quarantine "/Applications/Lynk Client.app"
```

### Linux

Aucun avertissement. Rends l'AppImage exécutable (`chmod +x`) ou installe le
`.deb` avec `sudo apt install ./lynk*.deb`.

---

## Mises à jour

L'app vérifie discrètement à chaque démarrage s'il existe une version plus
récente. Si oui, un petit toast propose de l'installer. Tu peux aussi
vérifier manuellement : Réglages → **À propos** → **Vérifier les mises à jour**.

Les mises à jour sont **vérifiées par signature cryptographique** avant
installation : l'app refuse tout binaire qui n'a pas été signé par la clé
officielle du projet, même en l'absence de signature de code OS.

---

## Sécurité & vie privée

- **Où sont stockés mes mots de passe ?** Dans le keychain natif de ton OS
  (Windows Credential Manager / macOS Keychain / Linux Secret Service),
  jamais en clair sur disque.
- **La sync voit-elle mes données ?** Non. Il n'y a pas de serveur Lynk.
  La sync Git pousse un blob chiffré AES-256-GCM dans **ton** repo. Sans ton
  mot de passe de chiffrement, c'est illisible.
- **Les rapports de crash ?** Désactivés par défaut, opt-in explicite, et même
  activés ils ne sont pas encore branchés à un backend (préférence enregistrée
  pour une future version).

---

## Dépannage

### « git introuvable » lors de la config de sync

Installe Git depuis [git-scm.com](https://git-scm.com) et relance l'app.

### Le terminal local est vide au démarrage

Rare, lié au timing de l'init du shell. Tape une touche ou rouvre l'onglet.

### J'ai oublié mon mot de passe de chiffrement de sync

Irrécupérable par conception (chiffrement côté client). Désactive la sync,
supprime le `vault.enc` du repo, et reconfigure avec un nouveau mot de passe
en poussant ta config locale actuelle.
