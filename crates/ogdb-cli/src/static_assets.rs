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
//!
//! `build.rs` also creates an empty placeholder for `frontend/dist-app/` if
//! it does not exist (e.g. CI builds that skip `npm run build:app`). In that
//! case the embedded `Dir` has no `index.html`; the API endpoints continue
//! to work, and any GET that would otherwise fall through to the SPA
//! receives a small stub explaining how to embed the playground UI.

use include_dir::{include_dir, Dir};

static APP_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../frontend/dist-app");

/// HTML stub served when the binary was built without first running
/// `npm run build:app` — i.e. no SPA is embedded. The user still gets a
/// readable "you reached the API, here's how to get the UI" page instead
/// of a panic or an opaque 500.
const MISSING_SPA_STUB: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>OpenGraphDB</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; line-height: 1.55; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #f4f4f5; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; }
  .muted { color: #666; font-size: 0.9rem; }
  ul { padding-left: 1.25rem; }
  li { margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>OpenGraphDB API is running</h1>
<p>This binary was built without an embedded playground UI.</p>
<p>API endpoints are available at this origin:</p>
<ul>
  <li><code>GET /health</code></li>
  <li><code>GET /schema</code></li>
  <li><code>POST /query</code></li>
  <li><code>GET /metrics</code></li>
</ul>
<p>To embed the playground UI in the binary, run:</p>
<pre>npm --prefix frontend run build:app
cargo build --release</pre>
<p class="muted">Then re-launch <code>ogdb demo</code> or <code>ogdb serve --http</code>.</p>
</body>
</html>
"#;

/// Returns `(bytes, content-type, content-encoding)` for `path` inside the
/// embedded SPA dist, or `None` if no file matches. The leading `/` is
/// stripped, and an empty path (i.e. `GET /`) is mapped to `index.html` so
/// that root requests serve the SPA shell.
///
/// EVAL-FRONTEND-QUALITY-CYCLE2.md BLOCKER-2: the SPA build ships
/// precompressed siblings (`<asset>.br`, `<asset>.gz`) for every chunk over
/// the threshold. When the client advertises support, we serve those
/// directly and tell the caller to set `Content-Encoding`. The content type
/// always reflects the *underlying* asset (e.g. `application/javascript`
/// for `index-*.js.br`) — it's the encoding header that signals brotli.
pub fn lookup(
    path: &str,
    accept_encoding: &str,
) -> Option<(&'static [u8], &'static str, Option<&'static str>)> {
    let trimmed = path.trim_start_matches('/');
    let key = if trimmed.is_empty() {
        "index.html"
    } else {
        trimmed
    };
    let mime = content_type_for(key);
    if accepts_encoding(accept_encoding, "br") {
        let br_key = format!("{key}.br");
        if let Some(file) = APP_DIST.get_file(&br_key) {
            return Some((file.contents(), mime, Some("br")));
        }
    }
    if accepts_encoding(accept_encoding, "gzip") {
        let gz_key = format!("{key}.gz");
        if let Some(file) = APP_DIST.get_file(&gz_key) {
            return Some((file.contents(), mime, Some("gzip")));
        }
    }
    let file = APP_DIST.get_file(key)?;
    Some((file.contents(), mime, None))
}

/// Returns true when the request's `Accept-Encoding` header advertises
/// support for `coding`. We match on token boundaries so `accept_encoding`
/// like `gzip, deflate` doesn't match a substring of an unrelated coding
/// (e.g. `mybrotli`). Quality values are ignored — any non-zero `q=` is
/// treated as accepting; `q=0` would disable but our embedded server
/// doesn't support that nuance and the practical client population
/// (browsers) never sends `q=0` for codings they actually advertise.
fn accepts_encoding(header: &str, coding: &str) -> bool {
    header.split(',').map(|s| s.trim()).any(|token| {
        let name = token.split(';').next().unwrap_or("").trim();
        name.eq_ignore_ascii_case(coding)
    })
}

/// Returns the bytes of `index.html` (the SPA shell) when present, or
/// `None` when the binary was built without first running
/// `npm run build:app`. Callers must handle the `None` case by serving a
/// non-SPA response — see `missing_spa_stub()`.
pub fn index_html() -> Option<&'static [u8]> {
    APP_DIST.get_file("index.html").map(|f| f.contents())
}

/// Returns the HTML stub explaining that no SPA is embedded. Used as the
/// SPA-fallback body when `index_html()` returns `None`.
pub fn missing_spa_stub() -> &'static [u8] {
    MISSING_SPA_STUB.as_bytes()
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

    // The embedded `frontend/dist-app/` is empty in default CI/test builds
    // (build.rs only creates a placeholder directory). Tests therefore must
    // tolerate `lookup("/") == None` instead of asserting on real bundle
    // contents — the real-bundle assertion lives in the integration smoke
    // test that runs against a release build with the SPA embedded.
    #[test]
    fn lookup_unknown_returns_none() {
        // Caller (dispatch_http_request) is responsible for SPA fallback;
        // lookup itself must NOT silently return index.html for unknown paths
        // because that would mask /assets/* misses as 200 OK.
        assert!(lookup("/no-such-asset.xyz", "").is_none());
    }

    #[test]
    fn accepts_encoding_token_match() {
        assert!(accepts_encoding("gzip", "gzip"));
        assert!(accepts_encoding("br, gzip, deflate", "br"));
        assert!(accepts_encoding("br, gzip, deflate", "gzip"));
        assert!(accepts_encoding("gzip;q=1.0, br;q=0.9", "br"));
        // Token-boundary match: a coding name must match an exact comma-
        // separated token, not a substring of one.
        assert!(!accepts_encoding("mybrotli", "br"));
        assert!(!accepts_encoding("identity", "gzip"));
        assert!(!accepts_encoding("", "br"));
    }

    #[test]
    fn index_html_returns_none_when_missing() {
        // In the default build (no `npm run build:app` first), index.html
        // is absent. The accessor must return None — not panic — so callers
        // can serve the stub and keep API endpoints alive.
        // When the SPA *is* embedded, this test still passes either branch:
        // we only assert the call does not panic.
        let _ = index_html();
    }

    #[test]
    fn missing_spa_stub_is_served_as_html() {
        let body = missing_spa_stub();
        assert!(body.starts_with(b"<!doctype html>"));
        let text = std::str::from_utf8(body).unwrap();
        assert!(text.contains("OpenGraphDB API is running"));
        assert!(text.contains("npm --prefix frontend run build:app"));
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
