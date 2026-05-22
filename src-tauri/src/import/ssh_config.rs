//! Minimal `~/.ssh/config` parser.
//!
//! Scope (what we support, by design):
//! - `Host <pattern...>` blocks
//! - `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump` directives
//! - Comments (`#`) and blank lines
//! - Wildcard merging matching OpenSSH semantics: "for each parameter, the
//!   first obtained value will be used". The concrete `Host xxx` block always
//!   wins for its own directives; wildcard blocks fill the rest in the order
//!   they appear in the file.
//!
//! Scope (what we explicitly do NOT do, because it's out of charter for v1):
//! - `Match` blocks (full conditional expressions)
//! - `Include` directives (transitive file resolution)
//! - Quoting / multi-token values beyond simple whitespace splitting
//! - Negated patterns (`!`)
//!
//! Concrete entries with no wildcard in their pattern are returned. Wildcard-
//! only blocks are kept as "defaults" applied to other blocks but never
//! returned themselves (they are not connectable on their own).

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A single importable SSH host derived from `~/.ssh/config`.
///
/// Every field except `alias` is optional because OpenSSH defaults kick in
/// when a directive is omitted (e.g. port 22, user = current OS user).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/SshConfigEntry.ts")]
pub struct SshConfigEntry {
    pub alias: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub proxy_jump: Option<String>,
}

/// Read and parse the file at `path`.
pub fn parse(path: &Path) -> Result<Vec<SshConfigEntry>> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("read ssh config {}", path.display()))?;
    Ok(parse_str(&raw))
}

/// Parse the contents of a `ssh_config`-format string.
pub fn parse_str(input: &str) -> Vec<SshConfigEntry> {
    let blocks = collect_blocks(input);
    let (defaults, concrete): (Vec<_>, Vec<_>) = blocks
        .into_iter()
        .partition(|b| b.patterns.iter().any(|p| is_wildcard(p)));

    concrete
        .into_iter()
        .flat_map(|block| {
            block
                .patterns
                .iter()
                .filter(|p| !is_wildcard(p.as_str()))
                .map(|alias| build_entry(alias, &block, &defaults))
                .collect::<Vec<_>>()
        })
        .collect()
}

#[derive(Debug, Default, Clone)]
struct Block {
    patterns: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    proxy_jump: Option<String>,
}

fn collect_blocks(input: &str) -> Vec<Block> {
    let mut out = Vec::new();
    let mut current: Option<Block> = None;

    for raw_line in input.lines() {
        let line = strip_comment(raw_line).trim();
        if line.is_empty() {
            continue;
        }
        let Some((key, value)) = split_kv(line) else {
            continue;
        };

        if key.eq_ignore_ascii_case("Host") {
            if let Some(prev) = current.take() {
                out.push(prev);
            }
            current = Some(Block {
                patterns: value.split_whitespace().map(str::to_string).collect(),
                ..Default::default()
            });
            continue;
        }

        // Match blocks are silently skipped — see module doc.
        if key.eq_ignore_ascii_case("Match") || key.eq_ignore_ascii_case("Include") {
            // Close any current Host block to avoid leaking directives into it.
            if let Some(prev) = current.take() {
                out.push(prev);
            }
            continue;
        }

        let Some(block) = current.as_mut() else {
            continue; // directives before any Host are technically global
                      // OpenSSH defaults; we drop them rather than synthesizing
                      // an artificial wildcard block.
        };

        if key.eq_ignore_ascii_case("HostName") {
            block.hostname = Some(value.into());
        } else if key.eq_ignore_ascii_case("User") {
            block.user = Some(value.into());
        } else if key.eq_ignore_ascii_case("Port") {
            if let Ok(p) = value.parse::<u16>() {
                block.port = Some(p);
            }
        } else if key.eq_ignore_ascii_case("IdentityFile") {
            block.identity_file = Some(expand_home(value));
        } else if key.eq_ignore_ascii_case("ProxyJump") {
            block.proxy_jump = Some(value.into());
        }
    }

    if let Some(last) = current {
        out.push(last);
    }
    out
}

fn build_entry(alias: &str, primary: &Block, defaults: &[Block]) -> SshConfigEntry {
    let mut hostname = primary.hostname.clone();
    let mut user = primary.user.clone();
    let mut port = primary.port;
    let mut identity_file = primary.identity_file.clone();
    let mut proxy_jump = primary.proxy_jump.clone();

    // Wildcard defaults only fill gaps left by the concrete block.
    for block in defaults {
        if !block.patterns.iter().any(|p| matches_pattern(p, alias)) {
            continue;
        }
        hostname = hostname.or_else(|| block.hostname.clone());
        user = user.or_else(|| block.user.clone());
        port = port.or(block.port);
        identity_file = identity_file.or_else(|| block.identity_file.clone());
        proxy_jump = proxy_jump.or_else(|| block.proxy_jump.clone());
    }

    SshConfigEntry {
        alias: alias.to_string(),
        hostname,
        user,
        port,
        identity_file,
        proxy_jump,
    }
}

fn is_wildcard(pattern: &str) -> bool {
    pattern.contains('*') || pattern.contains('?')
}

/// Glob-style match for `?` (one char) and `*` (any chars). Case-insensitive,
/// matching OpenSSH semantics. Negation patterns are not handled.
fn matches_pattern(pattern: &str, alias: &str) -> bool {
    fn rec(p: &[u8], a: &[u8]) -> bool {
        match (p.split_first(), a.split_first()) {
            (None, None) => true,
            (Some((b'*', rest)), _) => {
                // Try consuming 0..n chars from the alias.
                if rec(rest, a) {
                    return true;
                }
                if let Some((_, a_rest)) = a.split_first() {
                    return rec(p, a_rest);
                }
                false
            }
            (Some((b'?', p_rest)), Some((_, a_rest))) => rec(p_rest, a_rest),
            (Some((pc, p_rest)), Some((ac, a_rest))) if pc.eq_ignore_ascii_case(ac) => {
                rec(p_rest, a_rest)
            }
            _ => false,
        }
    }
    rec(pattern.as_bytes(), alias.as_bytes())
}

fn split_kv(line: &str) -> Option<(&str, &str)> {
    // OpenSSH accepts both `Key Value` and `Key=Value`.
    let trimmed = line.trim();
    if let Some(idx) = trimmed.find([' ', '\t', '=']) {
        let key = &trimmed[..idx];
        let rest = trimmed[idx..].trim_start_matches([' ', '\t', '=']);
        if rest.is_empty() {
            return None;
        }
        Some((key, rest))
    } else {
        None
    }
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(i) => &line[..i],
        None => line,
    }
}

fn expand_home(s: &str) -> String {
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let mut p = PathBuf::from(home);
            p.push(rest);
            return p.to_string_lossy().into_owned();
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_is_empty() {
        assert!(parse_str("").is_empty());
        assert!(parse_str("# only comments\n\n").is_empty());
    }

    #[test]
    fn single_host_block() {
        let input = "\
Host prod-1
    HostName prod1.example.com
    User deploy
    Port 2222
    IdentityFile ~/.ssh/prod_key
";
        let entries = parse_str(input);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.alias, "prod-1");
        assert_eq!(e.hostname.as_deref(), Some("prod1.example.com"));
        assert_eq!(e.user.as_deref(), Some("deploy"));
        assert_eq!(e.port, Some(2222));
        assert!(e.identity_file.as_deref().unwrap().ends_with("prod_key"));
    }

    #[test]
    fn wildcard_block_fills_gaps_but_does_not_appear() {
        let input = "\
Host *
    User deploy
    IdentityFile ~/.ssh/id_ed25519

Host prod-*
    User root

Host prod-1
    HostName prod1.example.com
    Port 22

Host staging
    HostName staging.example.com
";
        let entries = parse_str(input);
        let map: std::collections::HashMap<_, _> =
            entries.iter().map(|e| (e.alias.clone(), e)).collect();

        // prod-1: explicit HostName + Port, User inherited from the first
        // matching wildcard block in source order (`Host *` -> deploy), then
        // `Host prod-*` is shadowed for User. IdentityFile from `Host *`.
        let prod = map.get("prod-1").expect("prod-1 present");
        assert_eq!(prod.hostname.as_deref(), Some("prod1.example.com"));
        assert_eq!(prod.user.as_deref(), Some("deploy"));
        assert_eq!(prod.port, Some(22));
        assert!(prod.identity_file.is_some());

        // staging: User from *, IdentityFile from *, no port.
        let stg = map.get("staging").expect("staging present");
        assert_eq!(stg.user.as_deref(), Some("deploy"));
        assert_eq!(stg.port, None);
        assert!(stg.identity_file.is_some());

        // Wildcards themselves are not emitted.
        assert!(!map.contains_key("*"));
        assert!(!map.contains_key("prod-*"));
    }

    #[test]
    fn proxy_jump_is_captured() {
        let input = "\
Host bastion
    HostName bastion.example.com
    User root

Host db
    HostName db.internal
    ProxyJump bastion
";
        let entries = parse_str(input);
        let db = entries.iter().find(|e| e.alias == "db").unwrap();
        assert_eq!(db.proxy_jump.as_deref(), Some("bastion"));
    }

    #[test]
    fn comments_and_inline_comments() {
        let input = "\
# Global
Host server
    HostName srv.example.com # primary
    Port 2200
";
        let entries = parse_str(input);
        let e = &entries[0];
        assert_eq!(e.hostname.as_deref(), Some("srv.example.com"));
        assert_eq!(e.port, Some(2200));
    }

    #[test]
    fn equal_sign_separator_supported() {
        let input = "\
Host x
    HostName=x.example.com
    Port=42
";
        let e = &parse_str(input)[0];
        assert_eq!(e.hostname.as_deref(), Some("x.example.com"));
        assert_eq!(e.port, Some(42));
    }

    #[test]
    fn multi_pattern_host_yields_multiple_entries() {
        let input = "\
Host alpha beta
    HostName cluster.example.com
    User admin
";
        let entries = parse_str(input);
        let aliases: Vec<_> = entries.iter().map(|e| e.alias.as_str()).collect();
        assert!(aliases.contains(&"alpha"));
        assert!(aliases.contains(&"beta"));
    }

    #[test]
    fn pattern_matching() {
        assert!(matches_pattern("*", "anything"));
        assert!(matches_pattern("prod-*", "prod-1"));
        assert!(matches_pattern("prod-?", "prod-1"));
        assert!(!matches_pattern("prod-?", "prod-12"));
        assert!(matches_pattern("Prod-*", "prod-1")); // case-insensitive
    }

    #[test]
    fn invalid_port_is_dropped_silently() {
        let input = "\
Host x
    Port not-a-number
    HostName x.example.com
";
        let e = &parse_str(input)[0];
        assert_eq!(e.port, None);
        assert_eq!(e.hostname.as_deref(), Some("x.example.com"));
    }
}
