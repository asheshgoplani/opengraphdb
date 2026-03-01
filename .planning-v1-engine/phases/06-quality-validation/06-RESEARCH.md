# Phase 6: Quality Validation — Research

## Existing Benchmark Infrastructure

### ogdb-bench crate (`crates/ogdb-bench/`)
- Binary crate for CSR+delta vs hybrid storage model comparison
- Contains `benchmark_gates` test module with real `Database` integration tests
- Uses `tempfile::TempDir` for temporary database files
- Pattern: `Database::init(&db_path, Header::default_v1())` to create a fresh database
- Existing gate tests use 100K nodes, 4 edges/node, 5K samples, 1M import edges
- Gate assertions for traversal latency and import throughput already exist
- Tests marked `#[ignore]` for CI with annotation `"performance gate; run on dedicated hardware"`

### Key Database API (from `crates/ogdb-core/src/lib.rs`)
```rust
// Create database
Database::init(path, Header::default_v1()) -> Result<Database, DbError>

// Node creation (wraps a single-node write transaction)
db.create_node() -> Result<u64, DbError>

// Edge creation (wraps a single-edge write transaction)
db.add_edge(src, dst) -> Result<u64, DbError>

// Batch via WriteTransaction for better throughput
let mut tx = db.begin_write();
tx.create_node() -> Result<u64, DbError>
tx.add_edge(src, dst) -> Result<u64, DbError>
tx.commit() -> Result<WriteCommitSummary, DbError>

// Flush to disk
db.checkpoint() -> Result<(), DbError>

// Counts
db.node_count() -> u64
db.edge_count() -> u64
```

### Batch Insertion Strategy
For 1M nodes + 5M edges, per-item transactions would be extremely slow. Use batched `WriteTransaction` with commit every N operations (e.g., 10K or 50K) to amortize transaction overhead while keeping memory bounded.

## RSS Measurement on macOS

### No `/proc/self/status` on macOS
macOS does not have procfs. Two approaches:

#### Approach 1: `mach_task_self()` / `task_info` (in-process, accurate)
```rust
#[cfg(target_os = "macos")]
fn get_rss_bytes() -> u64 {
    use std::mem;
    let mut info: libc::mach_task_basic_info_data_t = unsafe { mem::zeroed() };
    let mut count = libc::MACH_TASK_BASIC_INFO_COUNT;
    let result = unsafe {
        libc::task_info(
            libc::mach_task_self(),
            libc::MACH_TASK_BASIC_INFO,
            &mut info as *mut _ as libc::task_info_t,
            &mut count,
        )
    };
    if result == libc::KERN_SUCCESS {
        info.resident_size as u64
    } else {
        0
    }
}
```
Requires `libc` crate dependency.

#### Approach 2: `ps -o rss=` (external process, simpler)
```rust
fn get_rss_bytes() -> u64 {
    let output = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .ok();
    output
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|kb| kb * 1024) // ps reports in KB
        .unwrap_or(0)
}
```
No extra dependencies, works cross-platform (macOS, Linux), but spawns a subprocess.

#### Approach 3: Linux `/proc/self/status` (CI servers)
```rust
#[cfg(target_os = "linux")]
fn get_rss_bytes() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|line| line.starts_with("VmRSS:"))
                .and_then(|line| line.split_whitespace().nth(1))
                .and_then(|kb| kb.parse::<u64>().ok())
                .map(|kb| kb * 1024)
        })
        .unwrap_or(0)
}
```

**Decision: Use the `ps -o rss=` approach.** It works on both macOS (developer machines) and Linux (CI servers) without any additional dependencies, and gives consistent behavior. The subprocess overhead is negligible for a gate benchmark that runs once.

## Disk Size Measurement

Straightforward: after checkpoint, measure file sizes using `std::fs::metadata().len()`.

Files to measure:
- `*.ogdb` — main database file
- `*.ogdb-wal` — write-ahead log file
- Any additional files in the temp directory

Use `std::fs::read_dir()` on the temp directory and sum all file sizes for comprehensive measurement.

## Test Structure Decision

Both QUAL-01 (memory) and QUAL-02 (disk) share the same dataset setup (1M nodes + 5M edges). They should be in the same test file in `ogdb-bench` to avoid duplicating the slow setup.

Implementation structure:
- Single helper function `build_budget_graph(dir) -> Database` that creates 1M nodes + 5M edges
- Two `#[test] #[ignore]` functions: one asserting RSS < 500MB, one asserting disk < 1GB
- One small non-ignored test that runs at reduced scale (e.g., 1K nodes, 5K edges) to validate the measurement machinery works

## Performance Considerations

- 1M nodes + 5M edges at ~1 edge per write transaction = ~6M transactions = very slow
- Batch size of 50K operations per transaction is reasonable
- For nodes: 20 batches of 50K nodes each
- For edges: 100 batches of 50K edges each
- Use deterministic pseudo-random edge endpoints for reproducibility
- Call `db.checkpoint()` after all insertions to flush WAL to main file before measuring disk
