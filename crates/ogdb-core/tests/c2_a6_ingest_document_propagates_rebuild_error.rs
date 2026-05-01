//! C2-A6 (HIGH) regression pin.
//!
//! `Database::ingest_document` previously called
//! `let _ = self.rebuild_vector_indexes_from_catalog();`
//! which silently swallowed any I/O / state error from the rebuild.
//! On a corrupt vec-index sidecar, the document was reported as
//! ingested with `vector_indexed: true` even when the rebuild had
//! failed and the index was stale.
//!
//! Forcing a real rebuild error in a unit test requires either a
//! size-limited tmpfs (Linux-root-only) or an injected `FileExt`
//! mock — both heavyweight. Use a source-level pin instead: the
//! offending pattern (`let _ = self.rebuild_vector_indexes_from_catalog()`)
//! must not exist in the function body. The propagation pattern
//! (`self.rebuild_vector_indexes_from_catalog()?`) must.
//!
//! This pin is the same flavor as `ogdb_import_reexport_shim.rs` —
//! cheap, stable, catches the regression at compile time.

use std::path::Path;

const LIB_RS: &str = include_str!("../src/lib.rs");

#[test]
fn ingest_document_does_not_swallow_rebuild_error() {
    // The C2-A6 anti-pattern: silent error drop on rebuild.
    let antipatterns = [
        "let _ = self.rebuild_vector_indexes_from_catalog();",
        "let _ = self.rebuild_vector_indexes_from_catalog ();",
        "let _ = self.rebuild_vector_indexes_from_catalog()  ;",
    ];
    for bad in antipatterns {
        assert!(
            !LIB_RS.contains(bad),
            "C2-A6 regression: ingest_document silently dropped the \
             rebuild_vector_indexes_from_catalog error via `{bad}`. \
             Replace with `self.rebuild_vector_indexes_from_catalog()?` \
             so the caller is informed when the index is stale."
        );
    }
}

#[test]
fn ingest_document_propagates_rebuild_error() {
    // The fixed pattern: error propagation via `?`.
    assert!(
        LIB_RS.contains("self.rebuild_vector_indexes_from_catalog()?"),
        "C2-A6: ingest_document must propagate rebuild errors via `?`. \
         If you renamed the call site, update this regression test."
    );

    // Pin the test file itself to the lib.rs path that's authoritative.
    assert!(Path::new("src/lib.rs").exists() || Path::new("crates/ogdb-core/src/lib.rs").exists());
}
