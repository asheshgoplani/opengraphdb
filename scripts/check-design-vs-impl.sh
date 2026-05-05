#!/usr/bin/env bash
# C4/C5 regression gate: design specification (DESIGN.md / ARCHITECTURE.md /
# README.md / SPEC.md / skills/) must not drift from the shipped
# implementation. Every cycle-4 + cycle-5 HIGH finding was a doc claim
# that contradicted the code; this gate pins each one to a single source
# of truth in `crates/`.
#
# Covers:
#   - C4-H1: vector-ANN library (Cargo.toml is source of truth)
#   - C4-H2: gRPC `serve` claim while handle_serve_grpc is the stub
#   - C4-H3: fictional Rust API (`use opengraphdb::`, params!, props!, etc.)
#   - C4-H4: Bolt version (crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1)
#   - C4-H5: workspace member list (Cargo.toml [workspace] members)
#   - C5-H1: DESIGN.md §1 file-tree must not name fictional `crates/<x>/`
#     entries (the §37 [workspace] block is gated above; §1 is rendered
#     inside a code fence and is invisible to the awk-based check).
#   - C5-H2: every `cargo add <crate>` in user-facing docs must name a
#     real workspace crate (Python+npm packages legitimately ship as
#     `opengraphdb`, but no such Rust crate exists).
#   - C5-H3: DESIGN.md §27/§28 must not call non-existent binding methods
#     (query_df / import_ttl / db.transaction() / db.stream()).
#
# Allowed contexts (intentional): the eval reports under
# `documentation/EVAL-*` document past drift and must keep the original
# strings; the same applies to `documentation/SECURITY-FOLLOWUPS.md` and
# `documentation/MIGRATION-FROM-NEO4J.md` which reference the rejected
# libraries / Neo4j-side defaults by name.
set -euo pipefail

DOCS=(README.md ARCHITECTURE.md SPEC.md DESIGN.md)
DIRS=(documentation skills)
EXISTING=()
for p in "${DOCS[@]}" "${DIRS[@]}"; do
  [[ -e "$p" ]] && EXISTING+=("$p")
done
[[ ${#EXISTING[@]} -eq 0 ]] && exit 0

# Skip historical eval reports + the legitimate cross-references.
SKIP_RE='(/EVAL-|/SECURITY-FOLLOWUPS\.md|/MIGRATION-FROM-NEO4J\.md)'

fail=0

# -------- C4-H1: vector-ANN library --------
ACTUAL_ANN=$(grep -oE '\b(usearch|instant-distance|hnsw_rs)\b' \
              crates/ogdb-core/Cargo.toml 2>/dev/null | head -1 || true)
if [[ -z "$ACTUAL_ANN" ]]; then
  echo "ERROR (C4-H1): cannot determine ANN lib from crates/ogdb-core/Cargo.toml" >&2
  fail=1
else
  # Allow exactly the shipped library + Decision-6 candidate-list mentions.
  # DESIGN.md § Decision 6 keeps `usearch` / `hnsw_rs` as named candidates
  # for the v0.5 backend swap, so we narrow the regex to bare-word "lies"
  # outside that section's allowlist marker.
  # Allowlist legitimate mentions: comparisons that name the shipped lib
  # on the same line, the Decision-6 candidate list, the BENCHMARKS row-6
  # backend-swap caveat, and self-correcting prose.
  ANN_LIES=$(grep -RnE '\b(usearch|hnsw_rs)\b' "${EXISTING[@]}" 2>/dev/null \
    | grep -vE "$SKIP_RE" \
    | grep -vE 'instant-distance' \
    | grep -vE '(Decision 6|candidate|backend swap|backend-swap|v0\.5\.1 swap|v0\.5 swap|Rejected|originally|is wrong|cited .* — that is wrong)' \
    | grep -vE '(\(C\+\+ FFI\)|would need|only library with|mmap, incremental|good SIMD|\(pure-Rust\)|\(pure Rust\))' \
    || true)
  if [[ -n "$ANN_LIES" ]]; then
    echo "ERROR (C4-H1): doc(s) name '$( [[ "$ACTUAL_ANN" == "instant-distance" ]] && echo "usearch / hnsw_rs" || echo "non-shipped ANN" )' as the shipped vector library; Cargo.toml says '$ACTUAL_ANN'." >&2
    echo "$ANN_LIES" >&2
    fail=1
  fi
fi

# -------- C4-H2: gRPC must not be advertised while handle_serve_grpc stubs --------
if grep -qE 'gRPC server bindings are not generated|gRPC support is not enabled' \
        crates/ogdb-cli/src/lib.rs 2>/dev/null; then
  GRPC_LIES=$(grep -nE 'serve.*gRPC|HTTP/Bolt/gRPC|HTTP, Bolt, gRPC' README.md 2>/dev/null \
    | grep -vE '(roadmap|v2)' \
    || true)
  if [[ -n "$GRPC_LIES" ]]; then
    echo "ERROR (C4-H2): README advertises gRPC as a runnable serve protocol but handle_serve_grpc is the not-implemented stub:" >&2
    echo "$GRPC_LIES" >&2
    fail=1
  fi
fi

# -------- C4-H3: fictional Rust API --------
# `use opengraphdb::` / `Database::open(<path>, Config…)` / `params!` /
# `props!` / `db.importer()` are all from the original Decision-4 sketch
# and never landed. Reality-check call-outs (lines starting with `>`) are
# allowed so the historical context can be preserved as prose.
FICTIONAL=$(grep -RnE 'use opengraphdb::|Database::open\([^)]*Config\b|\bparams!\s*\{|\bprops!\s*\{|db\.importer\(\)' \
  "${EXISTING[@]}" 2>/dev/null \
  | grep -vE "$SKIP_RE" \
  | grep -vE '^[^:]*:[0-9]+:>' \
  | grep -vE '(Reality check|never landed|fictional|not present in|There is no|tracked as a v0\.5|v0\.5 ergonomic)' \
  || true)
if [[ -n "$FICTIONAL" ]]; then
  echo "ERROR (C4-H3): doc(s) reference fictional Rust API (the actual crate is 'ogdb_core'):" >&2
  echo "$FICTIONAL" >&2
  fail=1
fi

# -------- C4-H4: Bolt version --------
ACTUAL_BOLT=$(grep -oE 'BOLT_VERSION_[0-9]+' crates/ogdb-bolt/src/lib.rs 2>/dev/null \
              | head -1 | sed 's/BOLT_VERSION_/v/' || true)
if [[ -n "$ACTUAL_BOLT" ]]; then
  # Accept references to the shipped version, the v4/v5 follow-up framing,
  # and any historical context that explicitly notes the v0.5 follow-up.
  BOLT_LIES=$(grep -RnE '\bBolt v[0-9](\.[0-9]+)?\+?\b|\bBolt Protocol v[0-9](\.[0-9]+)?\+?\b' \
      "${EXISTING[@]}" 2>/dev/null \
    | grep -vE "$SKIP_RE" \
    | grep -vE "Bolt( Protocol)? $ACTUAL_BOLT($|[^0-9])" \
    | grep -vE '(v4 / v5|v4/v5|v0\.5 follow-up|v0\.5\+|will reject|negotiation tracked|follow-up|roadmap)' \
    || true)
  if [[ -n "$BOLT_LIES" ]]; then
    echo "ERROR (C4-H4): doc(s) claim a Bolt version that does not match crates/ogdb-bolt/src/lib.rs (shipped: $ACTUAL_BOLT):" >&2
    echo "$BOLT_LIES" >&2
    fail=1
  fi
fi

# -------- C4-H5: workspace member list --------
# DESIGN.md keeps a workspace listing for contributor orientation. Pin it
# to Cargo.toml so a new crate added to the workspace forces a doc bump.
if grep -qE '^\[workspace\]' Cargo.toml 2>/dev/null && \
   grep -qE '^\[workspace\]' DESIGN.md 2>/dev/null; then
  actual=$(awk '/^members = \[/,/^\]/' Cargo.toml \
            | grep -oE '"crates/[^"]+"' | sort -u)
  claimed=$(awk '/^\[workspace\]/,/^\]/' DESIGN.md \
            | grep -oE '"crates/[^"]+"' | sort -u)
  # Doc must list every shipped crate. Extra lines in DESIGN.md that
  # aren't in Cargo.toml means a fictional / never-landed crate (the
  # cycle-4 finding); missing lines means the doc lags reality.
  diff_out=$(diff <(printf '%s\n' "$actual") <(printf '%s\n' "$claimed") || true)
  if [[ -n "$diff_out" ]]; then
    echo "ERROR (C4-H5): DESIGN.md workspace member list has drifted from Cargo.toml:" >&2
    echo "$diff_out" >&2
    fail=1
  fi
fi

# -------- C5-H1: §1 file-tree must not name fictional crates --------
# §37 above pins the [workspace] block. §1 is rendered as an ASCII tree
# inside a code fence, so the awk-based [workspace] check cannot see it.
# Allowlist the Reality-check prose lines (which legitimately mention the
# never-landed sketch crates) by stripping `>`-prefixed quote lines.
if grep -qE '^## 1\. Project Structure' DESIGN.md 2>/dev/null; then
  REAL_CRATES=$(ls crates/ 2>/dev/null | sort -u)
  # Pull crate-shaped tokens (`ogdb-XXX`) appearing in §1 (between "## 1." and "## 2.")
  # from non-prose lines (skip `> Reality check` quote-block lines).
  SECTION1_CRATES=$(awk '/^## 1\. Project Structure/,/^## 2\. /' DESIGN.md \
                    | grep -vE '^>' \
                    | grep -oE '\bogdb-[a-z][a-z0-9-]*' \
                    | sort -u)
  for claimed in $SECTION1_CRATES; do
    if ! grep -qx "$claimed" <<< "$REAL_CRATES"; then
      echo "ERROR (C5-H1): DESIGN.md §1 references fictional crate '$claimed'." >&2
      echo "  Real crates: $(echo $REAL_CRATES | tr '\n' ' ')" >&2
      fail=1
    fi
  done
fi

# -------- C5-H2: cargo add must target a real workspace crate --------
# `pip install opengraphdb` and `npm install opengraphdb` are legitimate
# (the Python+npm packages ship as `opengraphdb`); only the Rust
# `cargo add` form has to match a real crate name.
REAL_CRATE_NAMES=$(find crates/ -maxdepth 2 -name Cargo.toml 2>/dev/null \
  | xargs grep -h '^name = "' 2>/dev/null \
  | sed -E 's/^name = "([^"]+)".*/\1/' \
  | sort -u)
if [[ -n "$REAL_CRATE_NAMES" ]]; then
  BAD_CARGO_ADDS=$(grep -RnE 'cargo add [a-z][a-z0-9_-]*' \
        "${EXISTING[@]}" 2>/dev/null \
      | grep -vE "$SKIP_RE" \
      | while IFS= read -r line; do
          crate=$(echo "$line" | grep -oE 'cargo add [a-z][a-z0-9_-]*' | awk '{print $3}')
          [[ -z "$crate" ]] && continue
          if ! grep -qx "$crate" <<< "$REAL_CRATE_NAMES"; then
            echo "$line"
          fi
        done)
  if [[ -n "$BAD_CARGO_ADDS" ]]; then
    echo "ERROR (C5-H2): doc(s) advertise a 'cargo add <crate>' that does not exist in the workspace:" >&2
    echo "$BAD_CARGO_ADDS" >&2
    echo "  Real crates: $(echo $REAL_CRATE_NAMES | tr '\n' ' ')" >&2
    fail=1
  fi
fi

# -------- C5-H3: fictional binding methods (Python + Node) --------
# `query_df` / `import_ttl` / `db.transaction(...)` / `db.stream(...)` were
# part of the original Decision-7 sketch and never landed on the shipped
# bindings (`crates/ogdb-python/src/lib.rs::PyDatabase`,
# `crates/ogdb-node/src/lib.rs`). Reality-check call-outs (`>` quote
# blocks) are allowed so the historical context can be preserved.
FICTIONAL_BINDINGS=$(grep -RnE '\.query_df\(|\.import_ttl\(|with db\.transaction\(\)|db\.transaction\(async|db\.stream\(' \
      "${EXISTING[@]}" 2>/dev/null \
    | grep -vE "$SKIP_RE" \
    | grep -vE '^[^:]*:[0-9]+:>' \
    | grep -vE '(Reality check|never landed|fictional|tracked as a v0\.5|originally anticipated|sketched|don.t exist|does not exist|do not exist)' \
    || true)
if [[ -n "$FICTIONAL_BINDINGS" ]]; then
  echo "ERROR (C5-H3): doc(s) reference binding methods that don't exist on the shipped Python/Node bindings:" >&2
  echo "$FICTIONAL_BINDINGS" >&2
  fail=1
fi

# -------- C15-F02: SPEC.md headline version stamp --------
# SPEC.md L5 declares the canonical product-spec version. C15 cycle caught
# it pinned at 0.3.0 while the workspace was at 0.5.1 (two minors stale).
# Pin SPEC.md's `**Version:** X.Y.Z` line to the workspace.package version
# in Cargo.toml so a future bump forces a doc sweep.
if [[ -e SPEC.md && -e Cargo.toml ]]; then
  WS_VERSION=$(awk '/^\[workspace\.package\]/{f=1; next} f && /^version = /{print; exit}' Cargo.toml \
                | grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' | tr -d '"' || true)
  SPEC_VERSION=$(grep -oE '^\*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+' SPEC.md \
                  | head -1 | awk '{print $2}' || true)
  if [[ -n "$WS_VERSION" && -n "$SPEC_VERSION" && "$WS_VERSION" != "$SPEC_VERSION" ]]; then
    echo "ERROR (C15-F02): SPEC.md headline version ($SPEC_VERSION) does not match Cargo.toml workspace.package.version ($WS_VERSION)." >&2
    fail=1
  fi
fi

exit $fail
