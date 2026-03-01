# ogdb-tck

openCypher TCK harness for OpenGraphDB.

## What it does

- Parses `.feature` files from a local openCypher TCK checkout (via `cucumber`/`gherkin`)
- Executes supported scenario query steps against `ogdb_core::Database::query(...)`
- Classifies scenarios as `passed`, `failed`, or `skipped` (unsupported feature set)
- Reports Tier-1 category coverage (`MATCH`, `RETURN`, `WHERE`, `CREATE`, `DELETE`, `SET`)
- Computes Tier-1 pass-rate floor checks

## Run

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-tck -- /path/to/openCypher/tck --floor 0.50
```
