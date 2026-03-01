# 01-02 Summary (CLI Bugfix Verification: BUG-10..BUG-15)

## Task 1: Audit BUG-10 through BUG-13

### What I found/did
- Audited existing CLI regression tests in `crates/ogdb-cli/src/lib.rs`:
  - `global_db_flag_can_supply_database_path`
  - `all_path_subcommands_accept_db_without_positional_path`
  - `query_allows_db_flag_without_positional_path`
  - `query_parses_format_flag_after_query_argument`
  - `query_command_routes_call_procedures_and_create_index_on`
  - `import_reports_missing_database_with_actionable_message`
- Coverage was already adequate for BUG-10/11/12/13.
- No code changes were required for Task 1.

### Verification run
- Command:
  - `cargo test -p ogdb-cli -- global_db_flag_can_supply_database_path all_path_subcommands_accept_db_without_positional_path query_allows_db_flag_without_positional_path query_parses_format_flag_after_query_argument query_command_routes_call_procedures_and_create_index_on import_reports_missing_database_with_actionable_message`
- Result:
  - `6 passed; 0 failed`

## Task 2: Audit BUG-14 and BUG-15, close startup/default-port gap

### What I found/did
- BUG-14 (serve startup output):
  - Evaluated the originally referenced tests and confirmed broader suite coverage already exists for successful startup output:
    - `serve_bolt_handshake_and_query_round_trip` asserts `listening on bolt://...`
    - `serve_http_supports_query_health_and_csv_negotiation` asserts `listening on http://...`
    - `serve_processes_single_tcp_request_when_max_requests_is_set` asserts `listening on mcp://...`
  - No new BUG-14 test was needed.
- BUG-15 (protocol-aware defaults + `--port` behavior):
  - Found a real gap in `resolve_serve_bind_addr_defaults_and_port_override`: it did not assert MCP/gRPC defaults or their override behavior.
  - Updated that test to explicitly cover all four protocols and override paths:
    - MCP default and override
    - Bolt default and override
    - HTTP default and override
    - gRPC default and override

### Files modified
- `crates/ogdb-cli/src/lib.rs`

### Verification run
- Command:
  - `cargo test -p ogdb-cli -- serve_processes_single_tcp_request_when_max_requests_is_set http_serve_reports_bind_errors_and_timeout_helper_panics resolve_serve_bind_addr_defaults_and_port_override serve_accepts_http_port_flag`
- Result:
  - `4 passed; 0 failed`

## Additional validation performed

- `cargo test -p ogdb-cli` (plan-level full crate verification): exit code `0`
- `./scripts/test.sh`: exit code `0`
  - Included successful workspace checks/tests (including `ogdb-cli` unit tests and workspace crates)
- `./scripts/coverage.sh`: skipped per user instruction after identifying concurrent-session workspace-target interference (not a code defect)

## Gaps found and how they were closed
- Gap found: BUG-15 default-port/assertion coverage for MCP and gRPC was incomplete in `resolve_serve_bind_addr_defaults_and_port_override`.
- Closure: added explicit MCP/gRPC default and override assertions in the existing test.

## Test results summary
- Task 1 targeted tests: `6 passed, 0 failed`
- Task 2 targeted tests: `4 passed, 0 failed`
- Full `ogdb-cli` test command: passed (exit code `0`)
- Workspace validation script: passed (exit code `0`)

## Final verification command output
Command:
- `cargo test -p ogdb-cli 2>&1 | tail -5`

Output:
```text
running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
