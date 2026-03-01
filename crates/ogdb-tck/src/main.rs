use ogdb_tck::run_tck_suite;
use std::env;
use std::path::PathBuf;

fn main() {
    let mut args = env::args().skip(1);
    let feature_root = match args.next() {
        Some(path) => PathBuf::from(path),
        None => {
            eprintln!(
                "usage: cargo run --release -p ogdb-tck -- <openCypher-tck-root> [--floor <fraction>]"
            );
            std::process::exit(2);
        }
    };

    let mut floor = 0.50f64;
    while let Some(arg) = args.next() {
        if arg == "--floor" {
            let raw = args.next().unwrap_or_else(|| {
                eprintln!("--floor requires a value");
                std::process::exit(2);
            });
            floor = raw.parse::<f64>().unwrap_or_else(|_| {
                eprintln!("invalid floor value: {raw}");
                std::process::exit(2);
            });
        }
    }

    let report = match run_tck_suite(&feature_root) {
        Ok(report) => report,
        Err(err) => {
            eprintln!("failed to run TCK suite: {err}");
            std::process::exit(1);
        }
    };

    println!(
        "scenarios total={} passed={} failed={} skipped={} tier1_pass_rate={:.3}",
        report.total, report.passed, report.failed, report.skipped, report.tier1_pass_rate
    );
    for (category, coverage) in &report.category_coverage {
        println!(
            "category={} total={} passed={} failed={} skipped={}",
            category, coverage.total, coverage.passed, coverage.failed, coverage.skipped
        );
    }

    if !report.meets_tier1_floor(floor) {
        eprintln!(
            "tier-1 pass rate {:.3} is below floor {:.3}",
            report.tier1_pass_rate, floor
        );
        std::process::exit(3);
    }
}
