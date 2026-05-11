# Bolt v4 / v5 Protocol Upgrade Plan

**Date:** 2026-05-08
**Author:** investigation pass
**Worktree base:** `origin/main` at `71dece2` (HEAD when this plan was drafted)
**Target deliverable path in tree:** `documentation/.research/bolt-v45-upgrade-plan-2026-05-08.md`
**Status:** investigation + plan only. No code changes proposed here are implemented.

---

## 0. Why this matters

The binding-parity eval (preserved at tag `audits-2026-05-06`) flagged a structural problem:

- `ogdb-bolt` advertises **Bolt v1 only** (`crates/ogdb-bolt/src/lib.rs:34` defines `BOLT_VERSION_1 = 1`; `perform_handshake` at line 187 picks v1 or 0).
- The official Neo4j drivers from `neo4j-driver>=5.0` (Python) and `neo4j-driver@5` (JavaScript) negotiate **Bolt v5.x, falling back to v4.4**. They will never offer v1 on the wire.
- Consequence: a user who copies a snippet from the Neo4j 5 docs, points `bolt://` at our server, and runs `session.run(...)` gets an immediate handshake failure ("server returned 0x00000000"). The "Neo4j-compatible" marketing claim collapses on first contact.

The fix is conceptually simple (advertise more versions in the four 32-bit handshake slots, implement the v3+ message vocabulary, fix two structure-tag semantics), but the surface area is wider than it looks, mostly because v3 changed *which* message carries auth and v4 changed *which* messages carry result-set windowing.

---

## 1. What's different between v1 and v4 / v5

### 1.1 Handshake bytes (this is the only thing we currently get half-right)

Both v1 and v4/v5 share the same outer handshake shape:

```
client → server (20 bytes)
  4 bytes: magic preamble  60 60 B0 17
 16 bytes: four 32-bit big-endian version slots, client preference order

server → client (4 bytes)
  one 32-bit big-endian version, or 00 00 00 00 if no overlap
```

What changed across versions is **how a version is encoded inside one 4-byte slot**:

| Version  | Big-endian bytes  | Notes                                                                 |
|----------|-------------------|-----------------------------------------------------------------------|
| v1       | `00 00 00 01`     | major=1, minor=0                                                      |
| v2       | `00 00 00 02`     |                                                                       |
| v3       | `00 00 00 03`     |                                                                       |
| v4.0     | `00 00 00 04`     |                                                                       |
| v4.1     | `00 00 01 04`     | minor in third byte                                                   |
| v4.2     | `00 00 02 04`     |                                                                       |
| v4.3     | `00 00 03 04`     |                                                                       |
| v4.4     | `00 00 04 04`     | the "long-lived" v4 minor — still default for older 5.x drivers       |
| v4.4 range proposal | `00 02 04 04`    | second byte = minor-range; lets a client offer "any 4.0 through 4.4" |
| v5.0     | `00 00 00 05`     |                                                                       |
| v5.1     | `00 00 01 05`     | adds LOGON / LOGOFF                                                   |
| v5.2     | `00 00 02 05`     |                                                                       |
| v5.3     | `00 00 03 05`     |                                                                       |
| v5.4     | `00 00 04 05`     | adds TELEMETRY                                                        |
| v5.5–v5.7| `00 00 05 05` … `00 00 07 05` |                                                       |
| manifest | `00 00 01 FF`     | v5.7+ sentinel: client opts into VarInt-encoded manifest negotiation  |

The "minor-range" encoding (second byte non-zero) is how Neo4j 5 drivers compactly offer multiple minor versions in one slot — instead of advertising five v4 minors and burning four slots, a driver sends one slot like `00 04 04 04` meaning "any v4.0 through v4.4." A server picks the highest mutually supported.

Today our handshake at `lib.rs:187` is:

```rust
let negotiated = if versions.contains(&BOLT_VERSION_1) { BOLT_VERSION_1 } else { 0 };
```

The literal `versions.contains(&1)` only ever matches the bare `00 00 00 01` slot. Any modern driver sending `00 04 04 04` (any v4 minor) or `00 02 05 05` (v5 with 2-minor range) gets `0x00000000` back and disconnects.

### 1.2 Message vocabulary

The columns below mark which versions support each message. **Bold** = behaviour or fields changed materially within that version's range.

| Msg name      | Tag | v1 | v2 | v3 | v4.x | v5.0 | v5.1+ | v5.4+ |
|---------------|-----|----|----|----|------|------|-------|-------|
| INIT          | `0x01` | ✓  | ✓  |    |      |      |       |       |
| **HELLO**     | `0x01` |    |    | ✓  | ✓    | ✓    | **✓ (no auth)** | ✓ |
| GOODBYE       | `0x02` |    |    | ✓  | ✓    | ✓    | ✓     | ✓     |
| ACK_FAILURE   | `0x0E` | ✓  | ✓  |    |      |      |       |       |
| RESET         | `0x0F` | ✓  | ✓  | ✓  | ✓    | ✓    | ✓     | ✓     |
| **RUN**       | `0x10` | ✓  | ✓  | **✓ (+extra dict)** | **✓ (+qid)** | ✓ | ✓ | ✓ |
| BEGIN         | `0x11` |    |    | ✓  | ✓    | ✓    | ✓     | ✓     |
| COMMIT        | `0x12` |    |    | ✓  | ✓    | ✓    | ✓     | ✓     |
| ROLLBACK      | `0x13` |    |    | ✓  | ✓    | ✓    | ✓     | ✓     |
| **DISCARD_ALL→DISCARD** | `0x2F` | ✓ (no fields) | ✓ | ✓ | **✓ (+{n,qid})** | ✓ | ✓ | ✓ |
| **PULL_ALL→PULL**       | `0x3F` | ✓ (no fields) | ✓ | ✓ | **✓ (+{n,qid})** | ✓ | ✓ | ✓ |
| TELEMETRY     | `0x54` |    |    |    |      |      |       | ✓     |
| ROUTE         | `0x66` |    |    |    | ✓ (v4.3+) | ✓ | ✓ | ✓ |
| **LOGON**     | `0x6A` |    |    |    |      |      | ✓     | ✓     |
| LOGOFF        | `0x6B` |    |    |    |      |      | ✓     | ✓     |
| SUCCESS       | `0x70` | ✓  | ✓  | ✓  | ✓    | ✓    | ✓     | ✓     |
| RECORD        | `0x71` | ✓  | ✓  | ✓  | ✓    | ✓    | ✓     | ✓     |
| IGNORED       | `0x7E` | ✓  | ✓  | ✓  | ✓    | ✓    | ✓     | ✓     |
| FAILURE       | `0x7F` | ✓  | ✓  | ✓  | ✓    | ✓    | ✓     | ✓     |

The interesting deltas:

1. **`0x01` is reused.** v1/v2 call it `INIT(user_agent::String, auth_token::Dictionary)`. v3+ rename it `HELLO(extra::Dictionary)` and fold the user agent into the extra dict. Same tag byte, completely different field shape. The server discriminates by negotiated version, not by tag.

2. **`0x3F` and `0x2F` change semantics at v4.** Pre-v4 they are zero-field "drain everything." From v4 they carry an `extra::Dictionary{n::Integer, qid::Integer}` that lets the client ask for the next `n` records of stream `qid` (`-1` for "all"). This is what enables result-set pagination and multi-statement-per-transaction streaming.

3. **`ACK_FAILURE` (0x0E) is dropped at v3.** v3+ uses `RESET` (0x0F) for both connection-level recovery and post-failure cleanup. Our code at `lib.rs:490` already routes both to the same branch, so this is mostly a matter of *not accepting* `ACK_FAILURE` on v3+ connections.

4. **Auth moves twice.**
   - v1/v2: `INIT` carries `auth_token::Dictionary{scheme, principal, credentials}`.
   - v3 → v5.0: `HELLO` carries the same auth fields in its `extra` dict.
   - v5.1+: `HELLO` no longer authenticates. The connection enters an `AUTHENTICATION` state and the client must send `LOGON{auth::Dictionary}` (tag `0x6A`) next. `LOGOFF` allows re-auth on the same connection.

5. **`TELEMETRY` (0x54) at v5.4** is a no-op telemetry ping from the driver. It's safe to accept and reply `SUCCESS{}`; the driver doesn't use the body of the reply.

6. **`ROUTE` (0x66) at v4.3+** is for cluster routing tables. We are single-node; the right answer is to reply with a single-server routing table pointing at ourselves, or to reply `FAILURE` with code `Neo.ClientError.Cluster.RoutingTableNotFound` and let the driver fall back to direct connection. (The latter is what Memgraph does in single-node mode.)

### 1.3 PackStream version differences

PackStream itself (the type encoding) is **stable from v1 onward** at the primitive level: null, bool, int, float, bytes, string, list, map, structure markers are unchanged. We already encode/decode all of these correctly (`lib.rs:680–977`).

What did change between PackStream v1 (Bolt v1–v3) and PackStream v2 (Bolt v4+) is the **structure tag semantics**:

| Structure       | Tag  | v1 fields | v2 fields | Change                                                           |
|-----------------|------|-----------|-----------|------------------------------------------------------------------|
| Node            | `0x4E` (`N`) | 3 (id, labels, props) | 4 (id, labels, props, element_id) | element_id added at v5.0 |
| Relationship    | `0x52` (`R`) | 5         | 8         | element_id, start_element_id, end_element_id added at v5.0       |
| UnboundRel      | `0x72` (`r`) | 3         | 4         | element_id added at v5.0                                         |
| Path            | `0x50` (`P`) | 3         | 3         | unchanged                                                        |
| Date            | `0x44` (`D`) | 1         | 1         | unchanged                                                        |
| Time            | `0x54` (`T`) | 2         | 2         | unchanged                                                        |
| LocalTime       | `0x74` (`t`) | 1         | 1         | unchanged                                                        |
| **DateTime**    | `0x49` (`I`) | 3         | 3         | **v5.0: semantics fix — now `seconds_utc, nanos, tz_offset_or_id` instead of localised seconds.** Tag preserved for wire compat; meaning changed. |
| LocalDateTime   | `0x64` (`d`) | 2         | 2         | unchanged                                                        |
| Duration        | `0x45` (`E`) | 4         | 4         | unchanged                                                        |
| Point2D         | `0x58` (`X`) | 3         | 3         | unchanged                                                        |
| Point3D         | `0x59` (`Y`) | 4         | 4         | unchanged                                                        |

The DateTime semantics fix at v5.0 is subtle: pre-5.0 servers folded the tz offset into the seconds field before serialising, which corrupts the value on DST boundaries. v5.0+ servers must emit raw UTC seconds + offset separately. Drivers that negotiate v5+ assume v2 semantics; drivers that negotiate v4 assume v1 semantics. We need to honour the negotiated version when emitting DateTime values, and the same is true for Node / Relationship element_id presence.

Today our `pack_value_from_property` at `lib.rs:560–615` does not emit any of these structure tags at all (DateTime collapses to a `Map`, Duration to a `Map`, Date to a bare integer). That's a separate bug but one we should fix in the same pass because real Neo4j drivers will decode `0x44 0x44 (epoch_days)` into `neo4j.time.Date`, whereas our `Integer(epoch_days)` becomes a Python `int`. That divergence will silently fail every Date round-trip test.

### 1.4 Other things that change but we mostly already handle

- **Chunked framing** (`u16` length prefix, terminator `00 00`): unchanged across all versions. Our `read_chunked_message` / `write_chunked_message` (`lib.rs:632–678`) are version-independent and stay.
- **Message size cap**: our 100 MiB cumulative cap (`BOLT_MAX_MESSAGE_BYTES_DEFAULT`) is fine for all versions.
- **Connection states**: v3+ introduces a more detailed state machine (CONNECTED → AUTHENTICATION → READY → STREAMING → TX_READY → TX_STREAMING → FAILED → INTERRUPTED). v1's state machine is simpler. We need to track which version we negotiated and gate transitions accordingly. Today `ConnectionState` (`lib.rs:274–289`) is a minimal `{failed, pending_result, authenticated_user}` and that's a v1 abstraction.

---

## 2. Code surfaces that must change

All paths below are relative to repo root; line numbers anchor to `origin/main` at `71dece2`.

### 2.1 `crates/ogdb-bolt/src/lib.rs` (1366 lines today)

| Surface                                | Today (line range) | Change                                              | Est. ΔLoC |
|----------------------------------------|--------------------|-----------------------------------------------------|-----------|
| `BOLT_VERSION_1` constant              | 34                 | Add `BOLT_VERSION_3`, `BOLT_VERSION_4_4`, `BOLT_VERSION_5_0`, `BOLT_VERSION_5_4`. Keep `_1` for back-compat. | +10 |
| Message-type constants                 | 53–64              | Add `MSG_HELLO=0x01` alias, `MSG_BEGIN=0x11`, `MSG_COMMIT=0x12`, `MSG_ROLLBACK=0x13`, `MSG_PULL=0x3F` (alias of PULL_ALL), `MSG_DISCARD=0x2F`, `MSG_ROUTE=0x66`, `MSG_LOGON=0x6A`, `MSG_LOGOFF=0x6B`, `MSG_TELEMETRY=0x54`. **Note:** `MSG_AUTH=0x6A` at line 59 *collides with LOGON*. Must be renamed/removed in this pass (see §4.3). | +20 |
| `perform_handshake`                    | 166–199            | Replace single-version match with priority-ordered match (offer v5.4, v5.1, v5.0, v4.4, v3, v1). Decode minor-range slots. **Do not** implement manifest v5.7 in phase 1. | +60 |
| `ConnectionState`                      | 274–289            | Add `negotiated_version: u32` and `state: BoltState` (enum: `Connected, Authenticating, Ready, Streaming, TxReady, TxStreaming, Failed`). Track current `qid` for v4 streaming. | +40 |
| `process_message` dispatch             | 297–511            | Split into `process_v1` / `process_v3plus` / `process_v5_1plus`. Each version-specific handler validates its allowed-message set against `state.state`. | +250 |
| New: `handle_hello`                    | —                  | Parse `extra::Dictionary`, extract `user_agent`, `bolt_agent`, `routing`, (v3–v5.0) auth. Emit SUCCESS with `server`, `connection_id`. | +60 |
| New: `handle_logon` / `handle_logoff`  | —                  | Auth state transitions for v5.1+. Reuse `authenticate_token` from `shared_db`. | +40 |
| New: `handle_begin` / `handle_commit` / `handle_rollback` | — | Open/close a write transaction in `SharedDatabase`. Today every RUN auto-commits; we need an explicit-tx path. **This is the largest semantic change** — see §4.4. | +120 |
| New: `handle_pull_v4` / `handle_discard_v4` | —              | Parse `{n, qid}`, fetch `n` records from the open stream, set `has_more` correctly in SUCCESS metadata. | +80 |
| New: `handle_route`                    | —                  | Return single-node routing table `{servers: [{addresses: [self], role: "ROUTE"/"READ"/"WRITE"}], ttl: 300, db: "neo4j"}`. | +40 |
| New: `handle_telemetry`                | —                  | Accept any integer api code, reply `SUCCESS{}`. | +10 |
| `pack_value_from_property`             | 560–615            | Emit `Date` as `Structure{sig=0x44, fields=[epoch_days]}`, `DateTime` as `Structure{sig=0x49, fields=[seconds, nanos, tz_offset]}` (v5+) or v4 legacy shape, `Duration` as `Structure{sig=0x45, fields=[months, days, seconds, nanos]}`. | +60 |
| New: `encode_node_v5` / `encode_node_v4` | —                | Conditional element_id presence based on `state.negotiated_version`. (Not used until we surface real Node values; today we only return `PropertyValue` scalars.) | +40 |
| Test module                            | 1035–1365          | Existing v1 tests stay; add v3/v4/v5 unit tests for each new handler. | +400 |

**Subtotal in-file:** ~1230 new LoC, ~50 modified. The crate roughly doubles to ~2600 LoC.

### 2.2 `crates/ogdb-bolt/tests/*.rs`

| Test file                          | Today | Change                                                            |
|------------------------------------|-------|-------------------------------------------------------------------|
| `ack_failure_smoke.rs` (211)       | v1    | Keep as-is — pins v1 fallback behaviour.                          |
| `bolt_size_cap.rs` (164)           | v1    | Keep — chunked-framing cap is version-independent.                |
| `pull_all_smoke.rs` (193)          | v1    | Keep — pins v1 fallback.                                          |
| `non_exhaustive_invariant.rs` (28) | trait | Keep.                                                             |
| **new:** `bolt_v3_hello_smoke.rs`  | —     | HELLO + RUN (auto-commit) + PULL_ALL round trip on v3.           |
| **new:** `bolt_v4_pull_qid_smoke.rs` | —   | HELLO + RUN + PULL{n:2,qid:-1} + PULL{n:-1,qid:-1} + has_more semantics. |
| **new:** `bolt_v4_tx_smoke.rs`     | —     | BEGIN + RUN + RUN + COMMIT round trip.                            |
| **new:** `bolt_v5_element_id_smoke.rs` | — | A RUN that returns a Node ensures `element_id` field is present in the structure. |
| **new:** `bolt_v5_1_logon_smoke.rs`  | —   | HELLO (no auth) → LOGON{scheme,token} → RUN.                      |
| **new:** `bolt_v5_4_telemetry_smoke.rs` | — | HELLO → TELEMETRY{0} → SUCCESS.                                |
| **new:** `bolt_handshake_matrix.rs` | —     | Drive each of the 13 advertised version slots and assert what gets negotiated. |

Roughly **+1400 LoC of test code** across seven new files.

### 2.3 Integration test crate (NEW)

`crates/ogdb-bolt/tests/python-driver/` (Python smoke harness, invoked from CI only). See §3.

### 2.4 Dependent crates

| Crate                                  | Today              | Change                                              |
|----------------------------------------|--------------------|-----------------------------------------------------|
| `crates/ogdb-core/src/db.rs`           | auto-commit only   | Add `begin_tx_as_user / commit_tx / rollback_tx` so the Bolt layer can hold an open transaction across multiple RUN messages. Today every `query_cypher_as_user_with_retry` auto-commits. **This is the change with the biggest blast radius.** |
| `crates/ogdb-core/src/property.rs`     | `PropertyValue::DateTime { micros, tz_offset_minutes }` | Either keep the existing micros encoding and translate at the Bolt boundary, *or* (cleaner) add `seconds + nanos + tz` variants so the wire shape and the storage shape line up. |
| `crates/ogdb-cli`                      | starts `serve`     | No change needed; same entry point.                |
| `documentation/MIGRATION-FROM-NEO4J.md` | § "Bolt protocol coverage" at L73–92 says "v1 only" | Update once phase 1 lands: "v1, v3, v4.0–v4.4 negotiated; v5 in progress." |

### 2.5 The `MSG_AUTH = 0x6A` collision (CRITICAL)

`lib.rs:59` defines a custom OpenGraphDB extension message `MSG_AUTH = 0x6A` that takes a single string token. This is **not a standard Bolt message** — it's an OpenGraphDB-specific RBAC handshake added in some earlier work. Its tag byte directly collides with **`LOGON` (0x6A) from Bolt v5.1**.

Three options:

1. **Move our custom AUTH to a non-colliding tag** (e.g. `0x69`) and treat `0x6A` purely as standard LOGON. Breaks any client that uses our extension today, but the only known caller is our own integration tests (`lib.rs:1264–1365`).
2. **Drop the custom AUTH entirely** and route token-based auth through standard LOGON. Cleaner long-term; same one-line test rewrite.
3. **Tag-multiplex by negotiated version**: on v1/v2 connections, `0x6A` is `AUTH`; on v5.1+ it's `LOGON`. Works but is an integrity hazard — any future driver bug that mis-reports its version becomes a security-sensitive parse confusion.

**Recommendation: option 2.** Drop the custom AUTH, implement standard LOGON, update the two in-source tests that use it. The custom AUTH was working around the absence of HELLO/LOGON; once we have those, it's redundant.

---

## 3. Test strategy

### 3.1 Rust unit + crate-level tests

Each new handler gets a direct unit test in `crates/ogdb-bolt/src/lib.rs::tests` driving the encoded byte stream directly (same pattern as `serve_supports_run_pull_all_and_ack_failure_flow` at line 1151). These tests stay fast (sub-second each), don't require Python, and cover the wire format end-to-end.

### 3.2 Integration smoke against the official Neo4j Python driver

This is the test that closes the parity-eval gap. The driver lives at `pip install neo4j>=5.20` and is the ground truth for "does a real Neo4j 5 client work against us."

Proposed harness: `crates/ogdb-bolt/tests/python-driver/`

```
python-driver/
├── conftest.py              # spins up ogdb serve --bolt 127.0.0.1:0
├── test_handshake.py        # asserts negotiated version == 5.x
├── test_session_run.py      # CREATE (n:Person {name: 'Alice'}) RETURN n
├── test_transaction.py      # session.execute_write(...) → multi-statement tx
├── test_pull_pagination.py  # fetch_size=2 on a 10-row result
├── test_failure_recovery.py # bad RUN → driver retries cleanly
├── test_temporals.py        # round-trip Date / DateTime / Duration
└── requirements.txt         # neo4j>=5.20,<6
```

CI wiring:

- New `cargo xtask bolt-driver-smoke` task (or a plain `bash crates/ogdb-bolt/tests/python-driver/run.sh`) that:
  1. `cargo build --release -p ogdb-cli`
  2. `python -m venv .venv && pip install -r requirements.txt`
  3. `pytest crates/ogdb-bolt/tests/python-driver/ -v`
- Gated behind `OGDB_BOLT_DRIVER_SMOKE=1` so contributors without Python can still run `cargo test`.
- Runs on the existing CI matrix (Linux + macOS), `python: ['3.11', '3.12']`.

The four critical assertions:

1. **Cypher round trip**: `CREATE (n:Person {name:$name}) RETURN n.name`, parameters bound from Python. Assert returned record value == `"Alice"`.
2. **Transaction lifecycle**: `session.execute_write(lambda tx: tx.run("CREATE ...").consume())`. The driver sends BEGIN → RUN → PULL → COMMIT; assert all four get SUCCESS.
3. **Error path**: `tx.run("MATCH (n) RETURN m")` (undefined identifier). Driver expects FAILURE → ACK_FAILURE/RESET → SUCCESS sequence on the same connection, then the next `tx.run` should succeed.
4. **Pagination**: result with 10 rows fetched at `fetch_size=2` must round-trip with five PULL{n:2,qid:-1} cycles and `has_more=true` then `has_more=false`.

### 3.3 JavaScript driver follow-on (out of scope for this plan)

`neo4j-driver@5` (Node) is the second most-used driver. The wire format is identical to Python's driver, so if the Python smoke passes, the JS driver should work too. A short JS smoke in phase 3 is sensible but not gating.

### 3.4 What about `cargo test` currently-passing tests?

All four existing test files (`ack_failure_smoke.rs`, `bolt_size_cap.rs`, `pull_all_smoke.rs`, `non_exhaustive_invariant.rs`) drive **v1** explicitly. They must continue to pass unchanged in phase 1 (we keep v1 as a negotiable version), and continue to pass in phase 3 if v1 is retained as fallback. If we ever drop v1 entirely, these tests get retargeted to v3.

---

## 4. Effort estimate + risks

### 4.1 LoC estimate

| Surface                          | New LoC | Modified LoC |
|----------------------------------|---------|--------------|
| `crates/ogdb-bolt/src/lib.rs`    | ~1230   | ~50          |
| `crates/ogdb-bolt/tests/*.rs` (new files) | ~1400 | 0 |
| `crates/ogdb-core` (transaction API) | ~200 | ~50 |
| `crates/ogdb-core/property.rs` (DateTime reshape) | ~80 | ~30 |
| Python smoke harness (`tests/python-driver/`) | ~400 | 0 |
| `documentation/MIGRATION-FROM-NEO4J.md` updates | ~30 | ~30 |
| **Total**                        | **~3340** | **~160** |

Roughly **3.5k additive lines**, of which ~40 % is test code. For comparison, the current crate is 1.4k LoC of source + 0.6k LoC of tests, so post-merge the Bolt surface is ~3× its current size.

Calendar estimate, assuming one developer working serially:
- Phase 1 (v3 + v4): 4–6 working days.
- Phase 2 (v5.0 + v5.1): 2–3 working days.
- Phase 3 (v5.4, drivers smoke, v1 deprecation): 2 working days + however long CI debugging takes.

**Total: ~2 weeks of focused work**, plus an inevitable tail of "the Python driver does X that wasn't in the spec" debugging.

### 4.2 Wire-format risk areas

In rough order of how likely they are to bite us:

1. **HELLO `extra` dict parsing.** The dict shape has grown across versions: v3 wanted `{user_agent, scheme, principal, credentials}`; v4.1 added `routing` and `connection_recv_timeout_seconds`; v4.3 added `patch_bolt`; v5.0 added `bolt_agent` (an inner dict with product/platform/language/language_details); v5.1 *removed* auth from HELLO and added `notifications_minimum_severity` / `notifications_disabled_categories`. Real drivers send all of these unconditionally — we must accept-and-ignore unknown keys rather than failing strictly.
2. **`qid = -1` vs `qid` absent.** Some drivers send `{n: 1000}` without `qid` (meaning the latest stream); others send `{n: 1000, qid: -1}` (also the latest). We must accept both.
3. **DateTime semantics flip at v5.0.** If we get the seconds-vs-localised-seconds wrong, every temporal round-trip drifts by the local UTC offset. Test with a non-UTC tz on the driver side.
4. **Node `element_id` field at v5.0.** Drivers parsing v5 nodes expect 4 structure fields, not 3. A v5-negotiated connection that emits a 3-field Node tag will get a `BoltProtocolError` from the driver. Must conditionally include based on negotiated version.
5. **Connection-state machine.** v3+ is stricter than v1: a RUN sent in `Failed` state must be replied IGNORED, not FAILURE. A BEGIN sent while a stream is still open must be FAILURE. We currently have a 2-bit state (`failed: bool`). We need ~6 states.
6. **`FAILURE` metadata shape.** v5 expects GQL fields (`gql_status`, `description`, `diagnostic_record`) in addition to the legacy `code`/`message`. Drivers will work with just `code`/`message`, but logs get ugly. Worth filling in.
7. **Routing replies.** The driver behaviour when `ROUTE` returns `FAILURE` differs between v4.3, v4.4, and v5: some retry forever, some treat it as fatal. Returning a synthetic single-server routing table is the safest answer for a single-node DB.

### 4.3 Internal-code risk areas

1. **Transaction API in `ogdb-core`.** Today every `query_cypher_as_user_with_retry` is its own auto-commit unit. BEGIN/COMMIT requires holding a write lock across multiple RUNs on one connection. We need to decide: keep one global write lock (simple, serializes all explicit-tx Bolt clients), or per-connection optimistic locking with retry on conflict (matches `WriteConcurrencyMode::MultiWriter`). The simpler path matches our existing semantics; we can upgrade later.
2. **Custom `MSG_AUTH = 0x6A` collision with `LOGON`.** Already covered in §2.5. **Must be resolved in phase 1.**
3. **`PropertyValue::DateTime { micros, tz_offset_minutes }`** stores micros internally; v5 wire format wants seconds + nanos. Lossless conversion exists but is annoying to write correctly across leap seconds. Test with `2025-01-01T00:00:00.000001Z` and `2025-06-15T23:59:59.999999+05:30`.
4. **`pack_value_from_property` quietly returns `Map` for DateTime / Duration today** (`lib.rs:574-600`). Any existing client that depends on this map shape will break the moment we start emitting proper structure tags. Mitigation: emit structure tags only on v3+ connections; keep the legacy map shape on v1 to preserve back-compat.

### 4.4 Backwards compat: keep v1 as a fallback?

**Recommendation: yes, in phases 1 and 2; revisit in phase 3.**

Reasons to keep v1:

- Our existing test crate exercises v1 directly; ripping it out doubles the test-rewrite cost.
- Some embedded use cases (e.g. someone scripting against our `ogdb-cli` with a hand-rolled Bolt client) may rely on v1.
- The cost of advertising one extra version slot is negligible (~zero runtime cost).

Reasons to drop v1 eventually:

- v1's `INIT` shape carries an auth_token map that's structurally different from `HELLO`'s; we maintain two parse paths.
- v1 has no transactional messages, so half the v3+ test surface doesn't apply.
- Marketing-wise, advertising "v1, v3, v4.x, v5.x" looks worse than "v4.x, v5.x."

The clean answer is to keep v1 *negotiable* through phases 1 and 2, then drop it in phase 3 with one release-note deprecation cycle.

---

## 5. Three-phase rollout

### Phase 1: v3 + v4 alongside v1

**Outcome:** modern Neo4j Python driver 5.x connects and runs simple queries via the v4.4 negotiation path.

Tasks (in order):

1. Resolve the `MSG_AUTH = 0x6A` collision (drop custom AUTH, route to LOGON later in phase 2; in phase 1, route to extra HELLO auth fields).
2. Extend handshake to offer `[v4.4, v3, v1, 0]` in priority order; parse minor-range slots.
3. Add `negotiated_version` to `ConnectionState`.
4. Implement `handle_hello` (v3+ auth via the extra dict).
5. Implement `handle_begin` / `handle_commit` / `handle_rollback` in `ogdb-core` (single-writer-lock for now).
6. Implement v4 `handle_pull` / `handle_discard` with `{n, qid}` semantics. The qid bookkeeping piggybacks on `ConnectionState::pending_result`; only one active stream per connection in phase 1.
7. Implement `handle_route` returning a single-server table.
8. Tests: `bolt_v3_hello_smoke.rs`, `bolt_v4_tx_smoke.rs`, `bolt_v4_pull_qid_smoke.rs`, `bolt_handshake_matrix.rs`.
9. Python driver smoke: handshake test + session.run test + transaction test passing.
10. Doc update: `documentation/MIGRATION-FROM-NEO4J.md` § "Bolt protocol coverage."

**Exit criteria:**
- `pytest crates/ogdb-bolt/tests/python-driver/test_handshake.py test_session_run.py test_transaction.py` all green against Python `neo4j==5.x`.
- All existing v1 unit/integration tests still pass.

**Estimated LoC:** ~1900 added.

### Phase 2: v5.0 + v5.1

**Outcome:** Python driver 5.20+ negotiates v5.1, uses LOGON for auth, and round-trips Node objects with element_id.

Tasks:

1. Add `v5_0` and `v5_1` to handshake offer.
2. Implement `handle_logon` / `handle_logoff`; gate via `BoltState::Authenticating`.
3. Update HELLO to skip auth processing on v5.1+ (defer to LOGON).
4. Add element_id field to Node / Relationship encoding when `negotiated_version >= v5_0`.
5. Implement v5.0 DateTime semantics (seconds + nanos + tz_offset), and the legacy v4 shape as fallback.
6. Tests: `bolt_v5_element_id_smoke.rs`, `bolt_v5_1_logon_smoke.rs`, plus the Python `test_temporals.py`.
7. Doc update.

**Exit criteria:**
- Python driver negotiates v5.1 by default; LOGON round trip works.
- Temporal round trip preserves nanosecond precision and tz offset.

**Estimated LoC:** ~700 added.

### Phase 3: v5.4 + driver smoke matrix + v1 deprecation

**Outcome:** v5.4 (TELEMETRY) accepted; CI runs the full driver matrix; v1 marked deprecated.

Tasks:

1. Add `v5_4` to handshake offer; implement `handle_telemetry`.
2. Add JS driver smoke (`crates/ogdb-bolt/tests/js-driver/`) running `neo4j-driver@5` against the same scenarios.
3. Make the Python driver smoke gating in CI (no longer opt-in).
4. Mark `BOLT_VERSION_1` `#[deprecated(since = "0.6.0", note = "...")]`; emit a one-time `eprintln!` warning on v1 handshake.
5. Update CHANGELOG: "Bolt v3, v4.0–v4.4, v5.0–v5.4 supported. v1 deprecated."

**Exit criteria:**
- Both Python and JS official drivers run a CRUD round trip in CI.
- v1 still works but logs a deprecation warning.

**Estimated LoC:** ~400 added (most of phase 3 is test+infra).

### Optional phase 4 (out of scope for this plan)

- Bolt v5.7 manifest negotiation (VarInt-encoded capability bitmask).
- BoltError → GQL FAILURE-metadata mapping (the `gql_status` / `diagnostic_record` fields).
- Routing-table awareness for a future cluster mode (today's `handle_route` is a stub).

---

## 6. Open questions to resolve before phase 1 starts

1. **MSG_AUTH disposition** (§2.5): drop the custom 0x6A message, or rename it? Recommend drop, but it's a breaking API change at the protocol layer (no breakage at the Rust API layer because it's an internal constant).
2. **Single-writer-lock vs per-connection optimistic for explicit transactions** (§4.3.1)? Recommend single-writer-lock in phase 1; can upgrade.
3. **Routing reply shape** (§4.2.7)? Recommend single-server table over FAILURE; matches Memgraph's choice and avoids driver quirks.
4. **DateTime storage shape in `PropertyValue`** (§4.3.3): keep micros and translate at the wire boundary, or change storage to seconds+nanos+tz to match v5? Recommend keep micros for now; translate at boundary. Cleaner refactor is its own follow-up.
5. **Should v1 be dropped in phase 3, or just deprecated?** Recommend deprecate only; drop in a later 0.7.x.

---

## 7. Summary one-pager (TL;DR)

**Problem:** `ogdb-bolt` negotiates Bolt v1 only. Real Neo4j 5.x drivers don't speak v1. The "Neo4j-compatible" claim doesn't hold for any current client.

**Fix:** implement v3, v4.0–v4.4, and v5.0–v5.4 alongside v1. The wire format is well-specified; the work is mechanical, gated by:
- Handshake byte format (~60 LoC change).
- Renamed/added message tags (HELLO `0x01`, BEGIN `0x11`, COMMIT `0x12`, ROLLBACK `0x13`, PULL `0x3F`, DISCARD `0x2F`, ROUTE `0x66`, LOGON `0x6A`, LOGOFF `0x6B`, TELEMETRY `0x54`).
- A connection state machine that gates messages by negotiated version + current state (~250 LoC).
- A real explicit-tx API in `ogdb-core` (~200 LoC).
- Resolving the `MSG_AUTH = 0x6A` ↔ `LOGON = 0x6A` collision.

**Size:** ~3.3k additive lines, 40 % tests. ~2 calendar weeks of focused work.

**Risk hotspots:** HELLO extra-dict accept-and-ignore behaviour; v5.0 DateTime semantics flip; element_id presence on v5+ Nodes; transaction API blast radius into `ogdb-core`.

**Rollout:** phase 1 v3+v4 (closes the parity-eval gap), phase 2 v5.0+v5.1, phase 3 v5.4 + CI driver matrix + v1 deprecation.

**Verification:** existing Rust unit tests + new per-version unit tests + a Python driver smoke harness running the official `neo4j>=5.20` package against `cargo run -p ogdb-cli -- serve --bolt`.
