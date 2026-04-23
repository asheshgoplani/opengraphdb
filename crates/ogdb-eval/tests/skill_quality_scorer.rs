//! RED-phase tests for `skill_quality::score_case`.
//! PLAN.md §6 rows 3–4.

use std::collections::BTreeMap;

use ogdb_eval::drivers::skill_quality::{
    score_case, AdapterResponse, Difficulty, EvalCase, Expected,
};

fn case_with(
    name: &str,
    must_contain: &[&str],
    must_not_contain: &[&str],
    pattern: Option<&str>,
    scoring: &[(&str, f64)],
) -> EvalCase {
    let mut score_map = BTreeMap::new();
    for (k, v) in scoring {
        score_map.insert((*k).to_string(), *v);
    }
    EvalCase {
        name: name.to_string(),
        difficulty: Difficulty::Easy,
        input: String::new(),
        context: serde_json::Value::Null,
        expected: Expected {
            must_contain: must_contain.iter().map(|s| s.to_string()).collect(),
            must_not_contain: must_not_contain.iter().map(|s| s.to_string()).collect(),
            pattern: pattern.map(|s| s.to_string()),
        },
        scoring: score_map,
    }
}

#[test]
fn scorer_accepts_matching_response() {
    // All must_contain present, no must_not_contain, pattern matches,
    // every scoring-dict key hit by a substring heuristic → passed + full score.
    let case = case_with(
        "basic-node-query",
        &["MATCH", "Person", "RETURN"],
        &["Movie"],
        Some(r"MATCH\s*\(\w+:Person\)\s*RETURN"),
        &[("correct_syntax", 1.0), ("uses_label", 1.0)],
    );
    let resp = AdapterResponse {
        text: "MATCH (p:Person) RETURN p".to_string(),
        latency_us: 1_200,
    };

    let result = score_case(&case, &resp, "ogdb-cypher");

    assert!(result.passed, "matching response must pass, got {result:?}");
    assert_eq!(result.skill, "ogdb-cypher");
    assert_eq!(result.case_name, "basic-node-query");
    assert_eq!(result.latency_us, 1_200);
    assert!(
        (result.score - 1.0).abs() < f64::EPSILON,
        "full scoring-dict match ⇒ score=1.0, got {}",
        result.score
    );
}

#[test]
fn scorer_rejects_must_not_contain_violation() {
    // must_contain hits AND pattern matches, but a must_not_contain token
    // ("Movie") appears → passed=false regardless of everything else.
    let case = case_with(
        "basic-node-query",
        &["MATCH", "Person"],
        &["Movie"],
        Some(r"MATCH"),
        &[("correct_syntax", 1.0)],
    );
    let resp = AdapterResponse {
        text: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p".to_string(),
        latency_us: 500,
    };

    let result = score_case(&case, &resp, "ogdb-cypher");
    assert!(
        !result.passed,
        "must_not_contain violation must flip passed=false, got {result:?}"
    );
}
