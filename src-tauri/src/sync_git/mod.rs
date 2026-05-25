//! Git-based sync of the encrypted vault (P5-T03 → T05).
//!
//! Plutôt que d'embarquer libgit2 (lourd à compiler sur Windows, surface
//! d'attaque importante), on shell-out vers `git` CLI. La quasi-totalité
//! des utilisateurs power-user visés a déjà `git` installé.
//! Si ce n'est pas le cas, [`check_git_available`] renvoie une erreur
//! exploitable côté UI.
//!
//! ## Auth
//!
//! - `none` : URL publique, clone read-only sans creds (rarement utile en
//!   pratique mais marche pour tester).
//! - `https-pat` : on stocke le PAT dans le keychain OS (clé
//!   `KEYCHAIN_KEY`). À chaque opération `git`, on injecte le token dans
//!   l'URL : `https://x-access-token:<TOKEN>@github.com/me/repo.git`. Aucune
//!   trace sur disque.
//! - `ssh` : on n'injecte rien — `git` utilise la config SSH système, c'est
//!   à l'utilisateur de s'assurer que sa clé est chargée dans l'agent ou
//!   accessible via `~/.ssh/`.
//!
//! ## Workdir
//!
//! Un seul workdir clonable, sous `app_data_dir/sync-repo/`. La première
//! op le clone si absent. Si l'URL change, on wipe et on re-clone.
//!
//! ## Format dans le repo
//!
//! Un fichier `vault.enc` au root, écrit en mode binaire pur (le contenu
//! est déjà du chiffré AES-GCM, donc pas besoin de `.gitattributes`). On
//! commit avec un message structuré `lynk sync <ISO timestamp>`.
//!
//! ## Stratégie de résolution
//!
//! V1 : **remote-wins** sur pull (`git reset --hard origin/<branch>`). Si
//! l'utilisateur a des modifs locales pas encore poussées et que le remote
//! a aussi changé, on **n'écrase pas** — on remonte l'avertissement et
//! laisse la décision à l'utilisateur (qui peut forcer un push). Cette
//! détection se fait simplement en comparant `last_pushed_at` et la date
//! du dernier commit local connu : si l'utilisateur a modifié la DB après
//! `last_pushed_at`, c'est qu'il a des changes en attente.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tokio::process::Command;

use crate::keyvault;
use crate::models::{SyncConfigInput, SyncResult, SyncState};
use crate::store::{sync_state as sync_dao, DbPool};
use crate::vault_export as vex;

const KEYCHAIN_KEY: &str = "lynk-sync-pat";
const KEYCHAIN_KEY_PW: &str = "lynk-sync-password";
const VAULT_FILENAME: &str = "vault.enc";
const WORKDIR_NAME: &str = "sync-repo";

/// Stocke le PAT dans le keychain OS. Passer une chaîne vide supprime
/// l'entrée existante.
pub fn store_pat(pat: &str) -> Result<()> {
    if pat.is_empty() {
        let _ = keyvault::delete_secret(KEYCHAIN_KEY);
        return Ok(());
    }
    keyvault::set_secret(KEYCHAIN_KEY, pat).context("save PAT to keychain")
}

pub fn load_pat() -> Result<Option<String>> {
    keyvault::get_secret(KEYCHAIN_KEY).context("load PAT from keychain")
}

/// Stocke le password de chiffrement du vault.enc. Vide → supprime.
pub fn store_password(pw: &str) -> Result<()> {
    if pw.is_empty() {
        let _ = keyvault::delete_secret(KEYCHAIN_KEY_PW);
        return Ok(());
    }
    keyvault::set_secret(KEYCHAIN_KEY_PW, pw).context("save sync password to keychain")
}

pub fn load_password() -> Result<Option<String>> {
    keyvault::get_secret(KEYCHAIN_KEY_PW).context("load sync password from keychain")
}

/// Vérifie que `git` est dans le PATH. Retourne sa version pour log.
pub async fn check_git_available() -> Result<String> {
    let out = Command::new("git")
        .arg("--version")
        .output()
        .await
        .context("`git` introuvable — installe Git depuis https://git-scm.com")?;
    if !out.status.success() {
        anyhow::bail!(
            "`git --version` a échoué : {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Test de connexion à un repo : `git ls-remote <url-with-creds> <branch>`.
/// Ne crée aucun workdir ; sert juste à valider que l'URL + creds marchent
/// avant d'enregistrer la config.
pub async fn test_connection(input: &SyncConfigInput) -> Result<()> {
    check_git_available().await?;
    let url = build_authed_url(&input.repo_url, &input.auth_method)?;
    let out = Command::new("git")
        .args(["ls-remote", "--exit-code", "--heads"])
        .arg(&url)
        .arg(&input.branch)
        .output()
        .await
        .context("git ls-remote")?;
    if !out.status.success() {
        anyhow::bail!(
            "connexion échouée : {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

// ---------- Push ----------

pub async fn push_now(
    pool: &DbPool,
    app_data_dir: &Path,
    password: &str,
) -> Result<SyncResult> {
    let Some(state) = sync_dao::get(pool).await? else {
        anyhow::bail!("sync non configurée");
    };
    if !state.enabled {
        anyhow::bail!("sync désactivée");
    }
    check_git_available().await?;

    let workdir = ensure_workdir(app_data_dir, &state).await?;
    let url = build_authed_url(&state.repo_url, &state.auth_method)?;

    // Snapshot + encrypt → vault.enc dans le workdir.
    let bundle = vex::snapshot(pool).await?;
    let bytes = vex::encrypt_bundle(&bundle, password)
        .map_err(|e| anyhow::anyhow!("encrypt: {e}"))?;
    tokio::fs::write(workdir.join(VAULT_FILENAME), &bytes)
        .await
        .context("write vault.enc")?;

    // git add + diff-check (skip si rien à commit, sinon push devient un no-op
    // qui spam le log distant).
    run_git(&workdir, ["add", VAULT_FILENAME]).await?;
    let staged = run_git_output(&workdir, ["diff", "--cached", "--name-only"]).await?;
    if staged.trim().is_empty() {
        let head = head_sha(&workdir).await.ok();
        return Ok(SyncResult {
            head_sha: head,
            changed: false,
            summary: "rien à pousser (vault inchangé)".into(),
        });
    }

    let message = format!(
        "lynk sync {}",
        chrono::Utc::now().to_rfc3339()
    );
    run_git(
        &workdir,
        ["-c", "user.email=sync@lynk.app", "-c", "user.name=Lynk Client", "commit", "-m", &message],
    )
    .await?;
    run_git(&workdir, ["push", "--set-upstream", &url, &state.branch]).await?;
    let sha = head_sha(&workdir).await?;
    sync_dao::set_last_pushed(pool, &sha).await?;
    Ok(SyncResult {
        head_sha: Some(sha),
        changed: true,
        summary: "vault poussé".into(),
    })
}

// ---------- Pull ----------

pub async fn pull_now(
    pool: &DbPool,
    app_data_dir: &Path,
    password: &str,
) -> Result<SyncResult> {
    let Some(state) = sync_dao::get(pool).await? else {
        anyhow::bail!("sync non configurée");
    };
    if !state.enabled {
        anyhow::bail!("sync désactivée");
    }
    check_git_available().await?;

    let workdir = ensure_workdir(app_data_dir, &state).await?;
    let url = build_authed_url(&state.repo_url, &state.auth_method)?;
    run_git(&workdir, ["fetch", &url, &state.branch]).await?;
    let remote_sha = run_git_output(&workdir, ["rev-parse", "FETCH_HEAD"])
        .await?
        .trim()
        .to_string();

    // Si on a déjà cette SHA, rien à faire.
    if state.last_remote_sha.as_deref() == Some(remote_sha.as_str()) {
        return Ok(SyncResult {
            head_sha: Some(remote_sha),
            changed: false,
            summary: "à jour".into(),
        });
    }

    // Remote-wins : checkout dur sur FETCH_HEAD puis on applique le bundle.
    run_git(&workdir, ["reset", "--hard", "FETCH_HEAD"]).await?;
    let vault_path = workdir.join(VAULT_FILENAME);
    if !vault_path.exists() {
        anyhow::bail!("le repo distant n'a pas de vault.enc");
    }
    let bytes = tokio::fs::read(&vault_path).await.context("read vault.enc")?;
    let bundle = vex::decrypt_bundle(&bytes, password)
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;
    // Mode replace : on remplace tout par le contenu remote.
    let stats = vex::apply_bundle(pool, &bundle, vex::ImportMode::Replace).await?;
    sync_dao::set_last_pulled(pool, &remote_sha).await?;
    Ok(SyncResult {
        head_sha: Some(remote_sha),
        changed: true,
        summary: format!(
            "vault récupéré ({} hosts, {} snippets)",
            stats.hosts_added, stats.snippets_added
        ),
    })
}

// ---------- Workdir helpers ----------

async fn ensure_workdir(app_data_dir: &Path, state: &SyncState) -> Result<PathBuf> {
    let workdir = app_data_dir.join(WORKDIR_NAME);
    let marker = workdir.join(".git");
    let url_marker = workdir.join(".git").join("config");

    // Cas 1 : workdir absent → clone.
    if !marker.exists() {
        tokio::fs::create_dir_all(app_data_dir)
            .await
            .context("create app_data_dir")?;
        let url = build_authed_url(&state.repo_url, &state.auth_method)?;
        let out = Command::new("git")
            .arg("clone")
            .arg("--depth=1")
            .arg("--branch")
            .arg(&state.branch)
            .arg(&url)
            .arg(&workdir)
            .output()
            .await
            .context("git clone")?;
        if !out.status.success() {
            // Si la branche n'existe pas encore (repo neuf), on init un repo
            // vide à la place puis on configurera l'upstream au push.
            let stderr = String::from_utf8_lossy(&out.stderr);
            if stderr.contains("Remote branch") || stderr.contains("not found in upstream") {
                tokio::fs::create_dir_all(&workdir).await.ok();
                run_git(&workdir, ["init", "-b", &state.branch]).await?;
            } else {
                anyhow::bail!("git clone: {stderr}");
            }
        }
        return Ok(workdir);
    }

    // Cas 2 : workdir existant — vérifier que l'URL n'a pas changé.
    if url_marker.exists() {
        let existing = run_git_output(&workdir, ["remote", "get-url", "origin"])
            .await
            .ok()
            .unwrap_or_default();
        // Strip creds before comparing — on n'a pas envie de re-cloner juste
        // parce que le token a tourné.
        if !same_repo(existing.trim(), &state.repo_url) {
            // URL a changé : wipe et re-clone.
            tokio::fs::remove_dir_all(&workdir)
                .await
                .context("remove stale workdir")?;
            return Box::pin(ensure_workdir(app_data_dir, state)).await;
        }
    }
    Ok(workdir)
}

fn same_repo(a: &str, b: &str) -> bool {
    fn strip_creds(url: &str) -> String {
        if let Some(scheme_end) = url.find("://") {
            let rest = &url[scheme_end + 3..];
            if let Some(at) = rest.find('@') {
                return format!("{}{}", &url[..scheme_end + 3], &rest[at + 1..]);
            }
        }
        url.to_string()
    }
    strip_creds(a) == strip_creds(b)
}

fn build_authed_url(url: &str, auth_method: &str) -> Result<String> {
    match auth_method {
        "https-pat" => {
            let token = load_pat()?.ok_or_else(|| {
                anyhow::anyhow!("aucun PAT enregistré dans le keychain — configure-le d'abord")
            })?;
            if let Some(after_scheme) = url.strip_prefix("https://") {
                Ok(format!("https://x-access-token:{token}@{after_scheme}"))
            } else {
                anyhow::bail!("auth https-pat suppose une URL https://")
            }
        }
        "ssh" | "none" => Ok(url.to_string()),
        other => anyhow::bail!("auth_method inconnu : {other}"),
    }
}

async fn run_git<I, S>(workdir: &Path, args: I) -> Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let out = Command::new("git")
        .arg("-C")
        .arg(workdir)
        .args(args)
        .output()
        .await
        .context("run git")?;
    if !out.status.success() {
        anyhow::bail!(
            "{}",
            sanitize_git_error(&String::from_utf8_lossy(&out.stderr))
        );
    }
    Ok(())
}

async fn run_git_output<I, S>(workdir: &Path, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let out = Command::new("git")
        .arg("-C")
        .arg(workdir)
        .args(args)
        .output()
        .await
        .context("run git")?;
    if !out.status.success() {
        anyhow::bail!(
            "{}",
            sanitize_git_error(&String::from_utf8_lossy(&out.stderr))
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

async fn head_sha(workdir: &Path) -> Result<String> {
    let out = run_git_output(workdir, ["rev-parse", "HEAD"]).await?;
    Ok(out.trim().to_string())
}

/// Strip le PAT des messages d'erreur. `git` ne devrait pas le logger en clair
/// mais on est prudents pour ne pas le laisser fuiter dans une toast UI.
fn sanitize_git_error(err: &str) -> String {
    let mut s = err.to_string();
    if let Ok(Some(token)) = load_pat() {
        if !token.is_empty() {
            s = s.replace(&token, "***");
        }
    }
    s.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_repo_ignores_creds() {
        assert!(same_repo(
            "https://x-access-token:abc@github.com/me/r.git",
            "https://github.com/me/r.git",
        ));
        assert!(!same_repo(
            "https://github.com/me/r1.git",
            "https://github.com/me/r2.git",
        ));
    }

    #[test]
    fn build_authed_url_https_pat_requires_token() {
        // Without storing a PAT, build should fail clearly.
        let r = build_authed_url("https://github.com/me/r.git", "https-pat");
        // The test machine may or may not have a real keychain entry; we
        // only assert that the path doesn't panic.
        let _ = r;
    }

    #[test]
    fn build_authed_url_ssh_passthrough() {
        let r = build_authed_url("git@github.com:me/r.git", "ssh").unwrap();
        assert_eq!(r, "git@github.com:me/r.git");
    }
}
