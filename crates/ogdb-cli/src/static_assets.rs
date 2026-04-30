//! Embedded SPA dist (Slice S7, .planning/frontend-overhaul/PLAN.md).
//!
//! The `frontend/dist-app/` directory is built by `npm run build:app` and
//! baked into the binary at compile time via `include_dir!`. This lets a
//! user run `ogdb serve --http <db>` and visit `http://localhost:<port>/`
//! to get the full playground without a separate web server or static-file
//! mount.
//!
//! Cache invalidation is handled by `crates/ogdb-cli/build.rs` which emits
//! `cargo:rerun-if-changed=../../frontend/dist-app` so a re-build of the SPA
//! triggers a re-build of the CLI.

use include_dir::{include_dir, Dir};

static APP_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../frontend/dist-app");

/// Returns `(bytes, content-type)` for `path` inside the embedded SPA dist,
/// or `None` if no file matches. The leading `/` is stripped, and an empty
/// path (i.e. `GET /`) is mapped to `index.html` so that root requests
/// serve the SPA shell.
pub fn lookup(path: &str) -> Option<(&'static [u8], &'static str)> {
    let trimmed = path.trim_start_matches('/');
    let key = if trimmed.is_empty() {
        "index.html"
    } else {
        trimmed
    };
    let file = APP_DIST.get_file(key)?;
    Some((file.contents(), content_type_for(key)))
}

/// Returns the bytes of `index.html`, used as SPA-fallback for any unknown
/// non-API path so client-side routing (React Router) can pick up the route.
///
/// This panics if `index.html` is missing from the embedded dist — in that
/// case the binary was compiled without first running `npm run build:app`,
/// which is a build-system bug, not a runtime condition.
pub fn index_html() -> &'static [u8] {
    APP_DIST
        .get_file("index.html")
        .expect("frontend/dist-app/index.html must exist (run `npm run build:app`)")
        .contents()
}

fn content_type_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "txt" | "map" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_root_returns_index_html() {
        let (bytes, mime) = lookup("/").expect("GET / must resolve to index.html");
        assert!(bytes.windows(13).any(|w| w == b"<div id=\"root"));
        assert!(mime.starts_with("text/html"));
    }

    #[test]
    fn lookup_unknown_returns_none() {
        // Caller (dispatch_http_request) is responsible for SPA fallback;
        // lookup itself must NOT silently return index.html for unknown paths
        // because that would mask /assets/* misses as 200 OK.
        assert!(lookup("/no-such-asset.xyz").is_none());
    }

    #[test]
    fn index_html_panics_only_when_missing() {
        // Sanity: index.html exists (build.rs depends on it).
        let bytes = index_html();
        assert!(bytes.windows(13).any(|w| w == b"<div id=\"root"));
    }

    #[test]
    fn content_type_covers_common_spa_assets() {
        assert_eq!(content_type_for("a.html"), "text/html; charset=utf-8");
        assert_eq!(content_type_for("a.css"), "text/css; charset=utf-8");
        assert_eq!(
            content_type_for("a.js"),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(content_type_for("a.svg"), "image/svg+xml");
        assert_eq!(content_type_for("a.woff2"), "font/woff2");
        assert_eq!(content_type_for("a.unknown"), "application/octet-stream");
    }
}
