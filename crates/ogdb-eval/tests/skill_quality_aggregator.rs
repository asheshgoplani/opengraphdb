//! RED-phase tests for `skill_quality::aggregate`.
//! PLAN.md §6 rows 5–7.

use ogdb_eval::drivers::skill_quality::{aggregate, CaseResult, Difficulty};

fn result(
    skill: &str,
    name: &str,
    difficulty: Difficulty,
    passed: bool,
    score: f64,
    latency_us: u64,
) -> CaseResult {
    CaseResult {
        skill: skill.to_string(),
        case_name: name.to_string(),
        difficulty,
        passed,
        score,
        latency_us,
    }
}

#[test]
fn pass_rate_math_is_ratio_of_passed_to_total() {
    // 3 passed out of 4 → pass_rate = 0.75, cases_failed = 1.
    let results = vec![
        result("ogdb-cypher", "c1", Difficulty::Easy, true, 1.0, 100),
        result("ogdb-cypher", "c2", Difficulty::Easy, true, 1.0, 200),
        result("ogdb-cypher", "c3", Difficulty::Medium, true, 0.8, 300),
        result("ogdb-cypher", "c4", Difficulty::Hard, false, 0.2, 400),
    ];

    let run = aggregate(&results);
    assert_eq!(run.suite, "skill_quality");

    let pass_rate = run
        .metrics
        .get("pass_rate")
        .expect("pass_rate metric must be emitted");
    assert!(pass_rate.higher_is_better, "pass_rate is higher-is-better");
    assert_eq!(pass_rate.unit, "ratio");
    assert!(
        (pass_rate.value - 0.75).abs() < 1e-9,
        "3/4 ⇒ 0.75, got {}",
        pass_rate.value
    );

    let total = run
        .metrics
        .get("total_cases")
        .expect("total_cases metric");
    assert_eq!(total.value, 4.0);

    let failed = run
        .metrics
        .get("cases_failed")
        .expect("cases_failed metric");
    assert_eq!(failed.value, 1.0);
}

#[test]
fn per_difficulty_breakdown_emitted() {
    // Easy: 1/2, Medium: 1/1, Hard: 0/1.
    let results = vec![
        result("ogdb-cypher", "e1", Difficulty::Easy, true, 1.0, 100),
        result("ogdb-cypher", "e2", Difficulty::Easy, false, 0.0, 100),
        result("ogdb-cypher", "m1", Difficulty::Medium, true, 1.0, 200),
        result("ogdb-cypher", "h1", Difficulty::Hard, false, 0.0, 300),
    ];

    let run = aggregate(&results);

    let easy = run.metrics.get("pass_rate_easy").expect("pass_rate_easy");
    let medium = run
        .metrics
        .get("pass_rate_medium")
        .expect("pass_rate_medium");
    let hard = run.metrics.get("pass_rate_hard").expect("pass_rate_hard");

    assert!((easy.value - 0.5).abs() < 1e-9, "easy 1/2 ⇒ 0.5, got {}", easy.value);
    assert!((medium.value - 1.0).abs() < 1e-9, "medium 1/1 ⇒ 1.0, got {}", medium.value);
    assert!((hard.value - 0.0).abs() < 1e-9, "hard 0/1 ⇒ 0.0, got {}", hard.value);

    for m in [easy, medium, hard] {
        assert!(m.higher_is_better);
        assert_eq!(m.unit, "ratio");
    }
}

#[test]
fn response_latency_percentiles_emitted() {
    // 10 samples — percentiles must be ordered and `higher_is_better=false`.
    let mut results = Vec::new();
    for (i, latency_us) in [100u64, 200, 300, 400, 500, 600, 700, 800, 900, 1_000]
        .iter()
        .enumerate()
    {
        results.push(result(
            "ogdb-cypher",
            &format!("c{i}"),
            Difficulty::Easy,
            true,
            1.0,
            *latency_us,
        ));
    }

    let run = aggregate(&results);
    let p50 = run
        .metrics
        .get("latency_p50_us")
        .expect("latency_p50_us metric");
    let p95 = run
        .metrics
        .get("latency_p95_us")
        .expect("latency_p95_us metric");
    let p99 = run
        .metrics
        .get("latency_p99_us")
        .expect("latency_p99_us metric");

    assert_eq!(p50.unit, "us");
    assert!(!p50.higher_is_better, "latency is lower-is-better");
    assert!(!p95.higher_is_better);
    assert!(!p99.higher_is_better);

    assert!(
        p50.value <= p95.value && p95.value <= p99.value,
        "percentiles must be ordered, got p50={} p95={} p99={}",
        p50.value,
        p95.value,
        p99.value
    );
    assert!(
        p99.value > 0.0,
        "p99 must be positive for non-trivial sample set, got {}",
        p99.value
    );
}
