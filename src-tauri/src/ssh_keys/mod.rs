//! Business logic for SSH key generation, import, and on-disk storage.
//!
//! Layout of the keystore directory (resolved by the caller from the Tauri
//! `app_data_dir`):
//!
//! ```text
//! <app_data_dir>/
//!   keys/
//!     <key-id>           ← OpenSSH-format private key (perms 0600 on Unix)
//!     <key-id>.pub       ← OpenSSH-format public key (single-line)
//! ```
//!
//! The DB row in `ssh_keys` stores everything needed to display + use the key
//! without parsing the file: name, type, public key string, fingerprint,
//! path, `has_passphrase`. The passphrase itself (if any) lives in the OS
//! keychain under `ssh-key-{id}`.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use rand_core::OsRng;
use rsa::RsaPrivateKey;
use ssh_key::{Algorithm, HashAlg, LineEnding, PrivateKey};
use uuid::Uuid;

use crate::keyvault;
use crate::models::{SshKey, SshKeyAlgorithm};

const KEYS_DIR: &str = "keys";
const RSA_BITS_4096: usize = 4096;

/// Resolve `<app_data_dir>/keys/`, creating it if missing.
pub fn keystore_dir(app_data_dir: &Path) -> Result<PathBuf> {
    let dir = app_data_dir.join(KEYS_DIR);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("create keystore dir {}", dir.display()))?;
    Ok(dir)
}

/// Account namespace used when storing the passphrase in the OS keychain.
pub fn passphrase_account(key_id: &str) -> String {
    format!("ssh-key-{key_id}")
}

/// Generate a fresh private key in memory.
fn generate_private_key(algorithm: SshKeyAlgorithm) -> Result<PrivateKey> {
    match algorithm {
        SshKeyAlgorithm::Ed25519 => {
            PrivateKey::random(&mut OsRng, Algorithm::Ed25519).context("generate ed25519 key")
        }
        SshKeyAlgorithm::Rsa4096 => {
            // ssh-key::PrivateKey::random hardcodes RSA at 3072 bits. We go
            // through the `rsa` crate to get 4096, then wrap it.
            let rsa = RsaPrivateKey::new(&mut OsRng, RSA_BITS_4096).context("generate RSA 4096")?;
            let key_data = ssh_key::private::RsaKeypair::try_from(rsa)
                .map_err(|e| anyhow!("convert RSA: {e}"))?;
            Ok(PrivateKey::from(key_data))
        }
    }
}

/// Build a human-readable key_type label stored in the DB.
fn type_label(key: &PrivateKey) -> String {
    match key.algorithm() {
        Algorithm::Ed25519 => "ed25519".into(),
        Algorithm::Rsa {
            hash: Some(HashAlg::Sha256),
        } => "rsa-sha256".into(),
        Algorithm::Rsa {
            hash: Some(HashAlg::Sha512),
        } => "rsa-sha512".into(),
        Algorithm::Rsa { hash: None } => {
            // Best-effort: report bit length when we can.
            if let ssh_key::private::KeypairData::Rsa(rsa) = key.key_data() {
                let bytes = rsa.public.n.as_bytes();
                format!("rsa-{}", bytes.len() * 8)
            } else {
                "rsa".into()
            }
        }
        other => other.as_str().to_string(),
    }
}

/// Write a key (optionally encrypted) to `path` with restrictive permissions
/// on Unix-like systems. On Windows we rely on the user profile ACLs.
fn write_private_key(key: &PrivateKey, path: &Path, passphrase: Option<&str>) -> Result<()> {
    let pem = if let Some(pw) = passphrase {
        key.encrypt(&mut OsRng, pw)
            .map_err(|e| anyhow!("encrypt private key: {e}"))?
            .to_openssh(LineEnding::LF)
            .map_err(|e| anyhow!("serialise encrypted key: {e}"))?
    } else {
        key.to_openssh(LineEnding::LF)
            .map_err(|e| anyhow!("serialise plain key: {e}"))?
    };
    std::fs::write(path, pem.as_bytes())
        .with_context(|| format!("write private key {}", path.display()))?;
    set_private_perms(path)?;
    Ok(())
}

#[cfg(unix)]
fn set_private_perms(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_private_perms(_path: &Path) -> Result<()> {
    // Windows: rely on user-profile ACLs. A future ticket can tighten this
    // with `icacls` if needed.
    Ok(())
}

/// Generate a new key, persist it on disk + in the keychain (passphrase),
/// and return the metadata struct ready to be inserted in DB.
pub fn generate(
    keystore: &Path,
    name: &str,
    algorithm: SshKeyAlgorithm,
    passphrase: Option<&str>,
) -> Result<SshKey> {
    let id = Uuid::new_v4().to_string();
    let key = generate_private_key(algorithm)?;
    let private_path = keystore.join(&id);
    let public_path = keystore.join(format!("{id}.pub"));

    write_private_key(&key, &private_path, passphrase)?;

    let public = key
        .public_key()
        .to_openssh()
        .map_err(|e| anyhow!("serialise public key: {e}"))?;
    std::fs::write(&public_path, format!("{public}\n"))
        .with_context(|| format!("write public key {}", public_path.display()))?;

    let fingerprint = key
        .public_key()
        .fingerprint(ssh_key::HashAlg::Sha256)
        .to_string();

    if let Some(pw) = passphrase {
        keyvault::set_secret(&passphrase_account(&id), pw)
            .context("store passphrase in keychain")?;
    }

    Ok(SshKey {
        id,
        name: name.into(),
        key_type: type_label(&key),
        public_key: public,
        fingerprint,
        private_key_path: private_path.to_string_lossy().to_string(),
        has_passphrase: passphrase.is_some(),
        created_at: String::new(),
    })
}

/// Import an existing private key file. The original file is copied into the
/// keystore so the user can move/delete the source without breaking us.
pub fn import(
    keystore: &Path,
    source_path: &Path,
    name: &str,
    passphrase: Option<&str>,
) -> Result<SshKey> {
    let bytes = std::fs::read(source_path)
        .with_context(|| format!("read source key {}", source_path.display()))?;
    let text = std::str::from_utf8(&bytes).context("source key is not valid utf-8")?;

    // Parse + validate: if the key is encrypted and we don't have the passphrase
    // (or it's wrong) we surface a clear error here.
    let key = PrivateKey::from_openssh(text).map_err(|e| anyhow!("parse private key: {e}"))?;
    let decrypted = if key.is_encrypted() {
        let pw =
            passphrase.ok_or_else(|| anyhow!("private key is encrypted, passphrase required"))?;
        key.decrypt(pw)
            .map_err(|e| anyhow!("decrypt private key: {e}"))?
    } else {
        key.clone()
    };

    let id = Uuid::new_v4().to_string();
    let private_path = keystore.join(&id);
    let public_path = keystore.join(format!("{id}.pub"));

    std::fs::write(&private_path, &bytes)
        .with_context(|| format!("copy private key to {}", private_path.display()))?;
    set_private_perms(&private_path)?;

    let public = decrypted
        .public_key()
        .to_openssh()
        .map_err(|e| anyhow!("serialise public key: {e}"))?;
    std::fs::write(&public_path, format!("{public}\n"))
        .with_context(|| format!("write public key {}", public_path.display()))?;

    let fingerprint = decrypted
        .public_key()
        .fingerprint(ssh_key::HashAlg::Sha256)
        .to_string();

    let has_passphrase = key.is_encrypted();
    if has_passphrase {
        if let Some(pw) = passphrase {
            keyvault::set_secret(&passphrase_account(&id), pw)
                .context("store passphrase in keychain")?;
        }
    }

    Ok(SshKey {
        id,
        name: name.into(),
        key_type: type_label(&decrypted),
        public_key: public,
        fingerprint,
        private_key_path: private_path.to_string_lossy().to_string(),
        has_passphrase,
        created_at: String::new(),
    })
}

/// Remove the on-disk key files + the keychain entry. Errors on individual
/// pieces are logged but do not stop the cleanup — we want the row deletion
/// in DB to be the source of truth.
pub fn delete_files(key: &SshKey) -> Result<()> {
    let private = PathBuf::from(&key.private_key_path);
    let public = private.with_extension("pub");
    if let Err(e) = std::fs::remove_file(&private) {
        tracing::warn!("remove private key {}: {e}", private.display());
    }
    if public.exists() {
        if let Err(e) = std::fs::remove_file(&public) {
            tracing::warn!("remove public key {}: {e}", public.display());
        }
    }
    let _ = keyvault::delete_secret(&passphrase_account(&key.id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("tempdir")
    }

    #[test]
    fn generate_ed25519_round_trip() {
        let tmp = fresh_dir();
        let keystore = keystore_dir(tmp.path()).expect("keystore dir");
        let key = generate(&keystore, "test", SshKeyAlgorithm::Ed25519, None).expect("generate");
        assert_eq!(key.key_type, "ed25519");
        assert!(key.public_key.starts_with("ssh-ed25519 "));
        assert!(key.fingerprint.starts_with("SHA256:"));
        assert!(!key.has_passphrase);
        assert!(std::path::Path::new(&key.private_key_path).exists());
    }

    #[test]
    fn generate_with_passphrase_writes_encrypted_key() {
        let tmp = fresh_dir();
        let keystore = keystore_dir(tmp.path()).expect("keystore dir");
        let key = generate(&keystore, "k", SshKeyAlgorithm::Ed25519, Some("secret"))
            .expect("generate encrypted");
        assert!(key.has_passphrase);

        // Re-parse the file we wrote: it should be encrypted, requiring the
        // passphrase to decrypt.
        let content = std::fs::read_to_string(&key.private_key_path).expect("read");
        let parsed = PrivateKey::from_openssh(&content).expect("parse");
        assert!(parsed.is_encrypted(), "key file should be encrypted");
        let bad = parsed.decrypt("wrong");
        assert!(bad.is_err(), "decryption with wrong passphrase should fail");
        let good = parsed.decrypt("secret");
        assert!(
            good.is_ok(),
            "decryption with right passphrase should succeed"
        );

        // Cleanup the keychain entry so we don't leak across test runs.
        let _ = keyvault::delete_secret(&passphrase_account(&key.id));
    }

    #[test]
    fn import_existing_key() {
        let tmp = fresh_dir();
        let keystore = keystore_dir(tmp.path()).expect("keystore dir");

        // First, generate a key on disk to act as the "existing" source.
        let src_key = generate(&keystore, "src", SshKeyAlgorithm::Ed25519, None).expect("seed");
        let src_path = PathBuf::from(&src_key.private_key_path);

        // Now import it under a new name into the same keystore. The two
        // entries should coexist on disk.
        let imported = import(&keystore, &src_path, "imported", None).expect("import");
        assert_eq!(imported.key_type, "ed25519");
        assert_eq!(imported.fingerprint, src_key.fingerprint);
        assert_ne!(imported.id, src_key.id);
        assert!(std::path::Path::new(&imported.private_key_path).exists());
    }
}
