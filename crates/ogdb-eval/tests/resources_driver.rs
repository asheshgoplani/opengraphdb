//! Resources driver test — spec Dimension 3 (RSS peak, disk, CPU user time).
//!
//! The driver takes a workload closure, runs it, and snapshots RSS peak,
//! disk-bytes delta, and user-space CPU time over the run. We don't assert
//! hard numbers (CI variance); we assert shape — every metric populated,
//! delta metrics are non-negative, and the EvaluationRun schema is valid.

use ogdb_eval::drivers::resources::{measure, ResourceSample};
use ogdb_eval::drivers::throughput::ingest_bulk;
use tempfile::TempDir;

#[test]
fn resources_measure_captures_rss_disk_cpu() {
    let dir = TempDir::new().unwrap();
    let workdir = dir.path().to_path_buf();
    let run = measure("throughput", "ingest_bulk", "synthetic", || {
        let _ = ingest_bulk(&workdir, 500);
        ResourceSample::from_dir(&workdir)
    })
    .expect("measure");

    assert_eq!(run.suite, "resources");
    assert_eq!(run.subsuite, "throughput.ingest_bulk");
    for key in [
        "rss_peak_mb",
        "rss_final_mb",
        "disk_mb",
        "cpu_user_s",
        "elapsed_s",
    ] {
        let v = run
            .metrics
            .get(key)
            .unwrap_or_else(|| panic!("{key} missing"))
            .value;
        assert!(v >= 0.0, "{key} must be non-negative, got {v}");
    }
    assert!(
        run.metrics.get("elapsed_s").unwrap().value > 0.0,
        "elapsed must be positive"
    );
}

#[test]
fn resource_sample_reads_rss_and_disk() {
    // Pure helper check — should return a struct with non-negative fields
    // even on empty dirs (rss_bytes may be 0 on non-Linux).
    let dir = TempDir::new().unwrap();
    let sample = ResourceSample::from_dir(dir.path());
    assert!(sample.disk_bytes == 0, "empty dir has zero bytes");
    // rss may be 0 on non-Linux; just assert the field exists.
    let _ = sample.rss_bytes;
}
