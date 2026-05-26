//! Export & import du vault chiffré (P5-T01 / P5-T02).
//!
//! ## Format binaire
//!
//! ```text
//! [4 octets magic  : b"LYNK"]
//! [1 octet  version: 0x01]
//! [16 octets salt  : Argon2id]
//! [12 octets nonce : AES-GCM]
//! [N octets        : ciphertext + tag GCM 16o intégrés]
//! ```
//!
//! La clé AES-256 est dérivée du password via Argon2id (params OWASP par
//! défaut, m=19 MiB, t=2, p=1). Le sel est généré aléatoirement à chaque
//! export — réutiliser le sel cassse la sécurité du KDF.
//!
//! ## Ce qui est exporté
//!
//! Les **données de configuration** uniquement :
//!   - hosts (avec leurs scripts pre/post, leur identity_id, etc.)
//!   - groups, tags, host_tags
//!   - identities (sans les clés référencées)
//!   - snippets
//!   - port_forwards
//!
//! Ce qui **n'est pas** exporté :
//!   - `ssh_keys` : les clés privées sont des fichiers sur disque, on ne
//!     peut pas les ré-importer sans casser leurs chemins. L'utilisateur
//!     ré-importe manuellement après restauration.
//!   - `host_keys` / `identity_keys` : dépendent des ssh_keys, donc skip.
//!   - `known_hosts` : empreintes TOFU, valides uniquement sur la machine.
//!   - `command_history` : éphémère, n'a pas vocation à voyager.
//!   - `settings` : préférences par machine (thème, tailles, raccourcis).
//!   - **passwords / passphrases** : restent dans le keychain OS.
//!
//! ## Modes d'import
//!
//! - `Merge` : ajoute les entrées qui n'existent pas (par `label` pour
//!   hosts/groups/identities/snippets, par `name` pour tags), saute les
//!   doublons. Aucune destruction.
//! - `Replace` : `DELETE FROM …` puis insertion complète. Demande
//!   confirmation explicite côté UI.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{Context, Result};
use argon2::password_hash::rand_core::{OsRng, RngCore};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};

use crate::models::{
    ForwardType, Group, GroupInput, Host, HostInput, HostTagLink, Identity, IdentityInput,
    PortForward, PortForwardInput, Snippet, SnippetInput, Tag, TagInput,
};
use crate::store::{
    groups as groups_dao, hosts as hosts_dao, identities as identities_dao,
    port_forwards as forwards_dao, snippets as snippets_dao, tags as tags_dao, DbPool,
};

const MAGIC: &[u8; 4] = b"LYNK";
const VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = MAGIC.len() + 1 + SALT_LEN + NONCE_LEN;

/// JSON payload, version-tagged so future formats can refuse / migrate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultBundle {
    pub format_version: u32,
    pub exported_at: String,
    pub hosts: Vec<Host>,
    pub groups: Vec<Group>,
    pub tags: Vec<Tag>,
    pub host_tags: Vec<HostTagLink>,
    pub identities: Vec<Identity>,
    pub snippets: Vec<Snippet>,
    pub port_forwards: Vec<PortForward>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    Merge,
    Replace,
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct ImportStats {
    pub hosts_added: usize,
    pub groups_added: usize,
    pub tags_added: usize,
    pub identities_added: usize,
    pub snippets_added: usize,
    pub port_forwards_added: usize,
    pub hosts_replaced: usize,
}

// ---------- Snapshot DB → bundle ----------

pub async fn snapshot(pool: &DbPool) -> Result<VaultBundle> {
    Ok(VaultBundle {
        format_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        hosts: hosts_dao::list(pool).await?,
        groups: groups_dao::list(pool).await?,
        tags: tags_dao::list(pool).await?,
        host_tags: tags_dao::list_host_tag_links(pool).await?,
        identities: identities_dao::list(pool).await?,
        snippets: snippets_dao::list(pool).await?,
        port_forwards: forwards_dao::list_all(pool).await?,
    })
}

// ---------- Encrypt / decrypt ----------

/// Sérialise `bundle` en JSON, chiffre avec AES-GCM (clé dérivée du
/// `password` en Argon2id), et retourne le buffer complet (header + ct).
pub fn encrypt_bundle(bundle: &VaultBundle, password: &str) -> Result<Vec<u8>> {
    let json = serde_json::to_vec(bundle).context("serialize bundle")?;

    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), json.as_ref())
        .map_err(|e| anyhow::anyhow!("aes-gcm encrypt: {e}"))?;

    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Inverse de [`encrypt_bundle`]. Renvoie une erreur explicite si le magic
/// est faux, la version inconnue, ou le password incorrect.
pub fn decrypt_bundle(buf: &[u8], password: &str) -> Result<VaultBundle> {
    if buf.len() < HEADER_LEN + 16 {
        anyhow::bail!("fichier trop court pour être un vault chiffré");
    }
    if &buf[0..4] != MAGIC {
        anyhow::bail!("magic invalide — ce n'est pas un export Lynk");
    }
    let version = buf[4];
    if version != VERSION {
        anyhow::bail!("version d'export non supportée : {version}");
    }
    let salt = &buf[5..5 + SALT_LEN];
    let nonce = &buf[5 + SALT_LEN..HEADER_LEN];
    let ciphertext = &buf[HEADER_LEN..];

    let key = derive_key(password, salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| anyhow::anyhow!("mot de passe incorrect ou fichier corrompu"))?;

    let bundle: VaultBundle = serde_json::from_slice(&plaintext).context("parse bundle JSON")?;
    Ok(bundle)
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN]> {
    let mut out = [0u8; KEY_LEN];
    let params = Params::new(
        Params::DEFAULT_M_COST,
        Params::DEFAULT_T_COST,
        Params::DEFAULT_P_COST,
        Some(KEY_LEN),
    )
    .map_err(|e| anyhow::anyhow!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| anyhow::anyhow!("argon2 derive: {e}"))?;
    Ok(out)
}

// ---------- Apply bundle → DB ----------

/// Applique le bundle à la base. Selon `mode` :
///   - `Merge` : insertion uniquement quand l'entrée n'existe pas déjà
///     (clé business : label/name selon la table).
///   - `Replace` : suppression des tables concernées puis re-insertion
///     complète. Les `ssh_keys` et `known_hosts` ne sont pas touchées —
///     elles continuent d'exister hors du périmètre d'export.
pub async fn apply_bundle(
    pool: &DbPool,
    bundle: &VaultBundle,
    mode: ImportMode,
) -> Result<ImportStats> {
    let mut stats = ImportStats::default();

    if matches!(mode, ImportMode::Replace) {
        // Ordre : enfants → parents (FK).
        sqlx::query("DELETE FROM port_forwards")
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM host_tags").execute(pool).await?;
        sqlx::query("DELETE FROM snippets").execute(pool).await?;
        // hosts → identities : hosts.identity_id ON DELETE SET NULL, donc
        // on peut supprimer dans l'ordre hosts puis identities sans coup
        // dur sur les FK.
        let prev_hosts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hosts")
            .fetch_one(pool)
            .await?;
        stats.hosts_replaced = prev_hosts as usize;
        sqlx::query("DELETE FROM hosts").execute(pool).await?;
        sqlx::query("DELETE FROM identities").execute(pool).await?;
        sqlx::query("DELETE FROM tags").execute(pool).await?;
        sqlx::query("DELETE FROM groups").execute(pool).await?;
    }

    // Index existants → pour le mode merge on saute les entrées dont la
    // clé business est déjà prise.
    let existing_group_names =
        name_set(groups_dao::list(pool).await?.iter().map(|g| g.name.clone()));
    let existing_tag_names = name_set(tags_dao::list(pool).await?.iter().map(|t| t.name.clone()));
    let existing_identity_names = name_set(
        identities_dao::list(pool)
            .await?
            .iter()
            .map(|i| i.name.clone()),
    );
    let existing_host_labels =
        name_set(hosts_dao::list(pool).await?.iter().map(|h| h.label.clone()));
    let existing_snippet_names = name_set(
        snippets_dao::list(pool)
            .await?
            .iter()
            .map(|s| s.name.clone()),
    );

    // ---- Groups (parents) ----
    let mut group_remap: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for g in &bundle.groups {
        if matches!(mode, ImportMode::Merge) && existing_group_names.contains(&normalise(&g.name)) {
            // Map the imported id to the existing group with the same name
            // so child hosts can still resolve their group.
            if let Some(existing) = groups_dao::list(pool)
                .await?
                .into_iter()
                .find(|x| normalise(&x.name) == normalise(&g.name))
            {
                group_remap.insert(g.id.clone(), existing.id);
            }
            continue;
        }
        // Re-attaching a parent group requires the parent to already be
        // inserted; since `bundle.groups` ordering is arbitrary, we just
        // import groups as flat (no parent) and let the user re-nest by
        // hand if needed. Hierarchy export is a P6/P7 nice-to-have.
        let created = groups_dao::create(
            pool,
            GroupInput {
                name: g.name.clone(),
                parent_id: None,
                position: g.position,
            },
        )
        .await?;
        group_remap.insert(g.id.clone(), created.id);
        stats.groups_added += 1;
    }

    // ---- Tags ----
    let mut tag_remap: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for t in &bundle.tags {
        if matches!(mode, ImportMode::Merge) && existing_tag_names.contains(&normalise(&t.name)) {
            if let Some(existing) = tags_dao::list(pool)
                .await?
                .into_iter()
                .find(|x| normalise(&x.name) == normalise(&t.name))
            {
                tag_remap.insert(t.id.clone(), existing.id);
            }
            continue;
        }
        let created = tags_dao::create(
            pool,
            TagInput {
                name: t.name.clone(),
                color: t.color.clone(),
            },
        )
        .await?;
        tag_remap.insert(t.id.clone(), created.id);
        stats.tags_added += 1;
    }

    // ---- Identities ----
    let mut identity_remap: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for i in &bundle.identities {
        if matches!(mode, ImportMode::Merge)
            && existing_identity_names.contains(&normalise(&i.name))
        {
            if let Some(existing) = identities_dao::list(pool)
                .await?
                .into_iter()
                .find(|x| normalise(&x.name) == normalise(&i.name))
            {
                identity_remap.insert(i.id.clone(), existing.id);
            }
            continue;
        }
        let created = identities_dao::create(
            pool,
            IdentityInput {
                name: i.name.clone(),
                username: i.username.clone(),
                agent_forward: i.agent_forward,
            },
        )
        .await?;
        identity_remap.insert(i.id.clone(), created.id);
        stats.identities_added += 1;
    }

    // ---- Hosts ----
    let mut host_remap: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    // First pass : create hosts WITHOUT proxy_jump_host_id (forward refs).
    for h in &bundle.hosts {
        if matches!(mode, ImportMode::Merge) && existing_host_labels.contains(&normalise(&h.label))
        {
            if let Some(existing) = hosts_dao::list(pool)
                .await?
                .into_iter()
                .find(|x| normalise(&x.label) == normalise(&h.label))
            {
                host_remap.insert(h.id.clone(), existing.id);
            }
            continue;
        }
        let input = HostInput {
            label: h.label.clone(),
            hostname: h.hostname.clone(),
            port: h.port,
            username: h.username.clone(),
            group_id: h
                .group_id
                .as_ref()
                .and_then(|gid| group_remap.get(gid).cloned()),
            proxy_jump_host_id: None,
            identity_id: h
                .identity_id
                .as_ref()
                .and_then(|iid| identity_remap.get(iid).cloned()),
            agent_forward: h.agent_forward,
            log_to_file: h.log_to_file,
            pre_connect_script: h.pre_connect_script.clone(),
            post_connect_script: h.post_connect_script.clone(),
        };
        let created = hosts_dao::create(pool, input).await?;
        host_remap.insert(h.id.clone(), created.id);
        stats.hosts_added += 1;
    }
    // Second pass : patch the proxy_jump_host_id now that every host id is mapped.
    for h in &bundle.hosts {
        let Some(new_id) = host_remap.get(&h.id).cloned() else {
            continue;
        };
        let Some(old_proxy) = h.proxy_jump_host_id.as_ref() else {
            continue;
        };
        let Some(new_proxy) = host_remap.get(old_proxy).cloned() else {
            continue;
        };
        sqlx::query("UPDATE hosts SET proxy_jump_host_id = ?1 WHERE id = ?2")
            .bind(&new_proxy)
            .bind(&new_id)
            .execute(pool)
            .await?;
    }

    // ---- host_tags ----
    for link in &bundle.host_tags {
        let (Some(host_id), Some(tag_id)) =
            (host_remap.get(&link.host_id), tag_remap.get(&link.tag_id))
        else {
            continue;
        };
        sqlx::query("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?1, ?2)")
            .bind(host_id)
            .bind(tag_id)
            .execute(pool)
            .await?;
    }

    // ---- Snippets ----
    for s in &bundle.snippets {
        if matches!(mode, ImportMode::Merge) && existing_snippet_names.contains(&normalise(&s.name))
        {
            continue;
        }
        snippets_dao::create(
            pool,
            SnippetInput {
                name: s.name.clone(),
                content: s.content.clone(),
                folder: s.folder.clone(),
                tags_csv: s.tags_csv.clone(),
                variables_schema_json: s.variables_schema_json.clone(),
            },
        )
        .await?;
        stats.snippets_added += 1;
    }

    // ---- Port forwards ----
    for f in &bundle.port_forwards {
        let Some(new_host_id) = host_remap.get(&f.host_id).cloned() else {
            continue;
        };
        let Some(forward_type) = ForwardType::parse(&f.forward_type) else {
            // Stored value doesn't match a known variant — skip rather than
            // poison the DB.
            continue;
        };
        forwards_dao::create(
            pool,
            PortForwardInput {
                host_id: new_host_id,
                forward_type,
                label: f.label.clone(),
                local_port: f.local_port,
                remote_host: f.remote_host.clone(),
                remote_port: f.remote_port,
                auto_start: f.auto_start,
            },
        )
        .await?;
        stats.port_forwards_added += 1;
    }

    Ok(stats)
}

fn normalise(s: &str) -> String {
    s.trim().to_lowercase()
}

fn name_set<I: Iterator<Item = String>>(iter: I) -> std::collections::HashSet<String> {
    iter.map(|s| normalise(&s)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let bundle = VaultBundle {
            format_version: 1,
            exported_at: "2026-05-23T00:00:00Z".into(),
            hosts: vec![],
            groups: vec![],
            tags: vec![],
            host_tags: vec![],
            identities: vec![],
            snippets: vec![],
            port_forwards: vec![],
        };
        let enc = encrypt_bundle(&bundle, "hunter2").expect("encrypt");
        let dec = decrypt_bundle(&enc, "hunter2").expect("decrypt");
        assert_eq!(dec.format_version, 1);
    }

    #[test]
    fn wrong_password_fails() {
        let bundle = VaultBundle {
            format_version: 1,
            exported_at: "x".into(),
            hosts: vec![],
            groups: vec![],
            tags: vec![],
            host_tags: vec![],
            identities: vec![],
            snippets: vec![],
            port_forwards: vec![],
        };
        let enc = encrypt_bundle(&bundle, "correct").expect("encrypt");
        let dec = decrypt_bundle(&enc, "wrong");
        assert!(dec.is_err());
    }

    #[test]
    fn rejects_bad_magic() {
        let buf = vec![0u8; 100];
        let dec = decrypt_bundle(&buf, "anything");
        assert!(dec.is_err());
    }

    #[test]
    fn rejects_truncated_input() {
        let buf = vec![b'T', b'M', b'V', b'2', 1, 0, 0];
        let dec = decrypt_bundle(&buf, "anything");
        assert!(dec.is_err());
    }
}
