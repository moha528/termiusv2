//! Snippet variable extraction & substitution (P4-T01 / P4-T02).
//!
//! `{{var}}` placeholders are matched with a tiny hand-rolled scanner — we
//! don't pull `regex` just for this. Whitespace inside the braces is
//! tolerated (`{{ host }}` ≡ `{{host}}`). Variable names are alphanumeric +
//! `_` + `-`; anything else aborts the match and the literal `{{` stays.

use std::collections::HashMap;

/// Walk `content` and return the ordered list of unique variable names.
pub fn extract_variables(content: &str) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let bytes = content.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some((name, end)) = parse_name(bytes, i + 2) {
                if !out.contains(&name) {
                    out.push(name);
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// Replace every recognised `{{var}}` with its value from `values`. Variables
/// missing from the map are left untouched so the caller can validate.
pub fn substitute(content: &str, values: &HashMap<String, String>) -> String {
    let bytes = content.as_bytes();
    let mut out = String::with_capacity(content.len());
    let mut i = 0;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'{' && bytes[i + 1] == b'{' {
            if let Some((name, end)) = parse_name(bytes, i + 2) {
                if let Some(v) = values.get(&name) {
                    out.push_str(v);
                    i = end;
                    continue;
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Try to read `name }}` starting at `start`. Returns `(name, idx_after_close)`.
fn parse_name(bytes: &[u8], start: usize) -> Option<(String, usize)> {
    let mut i = start;
    // optional leading spaces
    while i < bytes.len() && bytes[i] == b' ' {
        i += 1;
    }
    let name_start = i;
    while i < bytes.len() && is_name_byte(bytes[i]) {
        i += 1;
    }
    let name_end = i;
    if name_end == name_start {
        return None;
    }
    while i < bytes.len() && bytes[i] == b' ' {
        i += 1;
    }
    if i + 1 < bytes.len() && bytes[i] == b'}' && bytes[i + 1] == b'}' {
        let name = std::str::from_utf8(&bytes[name_start..name_end]).ok()?.to_string();
        Some((name, i + 2))
    } else {
        None
    }
}

fn is_name_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_distinct_variables_in_order() {
        let s = "ssh {{user}}@{{host}} -p 22 && echo {{user}}";
        assert_eq!(extract_variables(s), vec!["user", "host"]);
    }

    #[test]
    fn tolerates_inner_whitespace() {
        let s = "tail -f /var/log/{{ service }}.log";
        assert_eq!(extract_variables(s), vec!["service"]);
    }

    #[test]
    fn ignores_unterminated_braces() {
        let s = "echo {{not-closed and {{ok}} end";
        assert_eq!(extract_variables(s), vec!["ok"]);
    }

    #[test]
    fn substitute_replaces_known_leaves_unknown() {
        let mut vals = HashMap::new();
        vals.insert("host".into(), "1.2.3.4".into());
        let out = substitute("ssh {{user}}@{{host}}", &vals);
        assert_eq!(out, "ssh {{user}}@1.2.3.4");
    }

    #[test]
    fn substitute_preserves_non_ascii() {
        let mut vals = HashMap::new();
        vals.insert("name".into(), "café".into());
        let out = substitute("bonjour {{name}}", &vals);
        assert_eq!(out, "bonjour café");
    }
}
