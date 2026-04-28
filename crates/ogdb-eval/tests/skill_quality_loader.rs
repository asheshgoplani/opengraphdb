//! RED-phase tests for `skill_quality::parse_spec` and
//! `load_specs_from_dir`. See `.planning/skill-quality-dimension/PLAN.md`
//! §6 row 1–2. Every test here panics against an `unimplemented!()` stub;
//! Phase 3 makes them pass.

use ogdb_eval::drivers::skill_quality::{parse_spec, SkillQualityError};

const SHIPPED_OGDB_CYPHER_SPEC: &str = r#"{
  "skill": "ogdb-cypher",
  "version": "0.1.0",
  "description": "Eval suite for OpenGraphDB Cypher generation skill",
  "cases": [
    {
      "name": "basic-node-query",
      "difficulty": "easy",
      "input": "Find all Person nodes in the database",
      "context": { "schema": { "labels": ["Person"] } },
      "expected": {
        "must_contain": ["MATCH", "Person", "RETURN"],
        "must_not_contain": ["Movie", "Company"],
        "pattern": "MATCH\\s*\\(\\w+:Person\\)\\s*RETURN"
      },
      "scoring": {
        "correct_syntax": 1,
        "uses_label": 1,
        "has_limit": 0.5
      }
    },
    {
      "name": "aggregation-count",
      "difficulty": "medium",
      "input": "Count how many movies each person directed",
      "context": {},
      "expected": {
        "must_contain": ["count"],
        "pattern": "count\\(.*\\)"
      },
      "scoring": { "uses_count": 1 }
    }
  ]
}"#;

#[test]
fn loader_parses_yaml_shipped_spec() {
    // Exercising the shape of a real shipped `.eval.yaml` body — must
    // surface `skill`, `version`, and every `cases[]` entry with its
    // difficulty, scoring dict, and `expected` matcher triple intact.
    let spec = parse_spec(SHIPPED_OGDB_CYPHER_SPEC).expect("parse shipped spec");

    assert_eq!(spec.skill, "ogdb-cypher");
    assert_eq!(spec.version, "0.1.0");
    assert_eq!(spec.cases.len(), 2, "fixture has two cases");

    let first = &spec.cases[0];
    assert_eq!(first.name, "basic-node-query");
    assert_eq!(
        first.expected.must_contain,
        vec![
            "MATCH".to_string(),
            "Person".to_string(),
            "RETURN".to_string()
        ]
    );
    assert_eq!(
        first.expected.must_not_contain,
        vec!["Movie".to_string(), "Company".to_string()]
    );
    assert_eq!(
        first.expected.pattern.as_deref(),
        Some("MATCH\\s*\\(\\w+:Person\\)\\s*RETURN")
    );

    // scoring weights parse as f64 — both integer-literal 1 and 0.5 must
    // round-trip.
    let correct_syntax = first
        .scoring
        .get("correct_syntax")
        .copied()
        .expect("missing scoring key");
    let has_limit = first
        .scoring
        .get("has_limit")
        .copied()
        .expect("missing fractional weight");
    assert_eq!(correct_syntax, 1.0);
    assert_eq!(has_limit, 0.5);

    let second = &spec.cases[1];
    assert_eq!(second.name, "aggregation-count");
    // Free-form `context` round-trips through serde_json::Value.
    assert!(
        second.context.is_object(),
        "empty object must deserialise to Value::Object, got {:?}",
        second.context
    );
}

#[test]
fn loader_rejects_missing_cases() {
    // A spec with no `cases` array is malformed — surface
    // `SkillQualityError::Invalid`, not a generic serde error.
    let broken = r#"{ "skill": "noop", "version": "0.0.0" }"#;
    match parse_spec(broken) {
        Err(SkillQualityError::Invalid(_)) => {}
        Err(other) => {
            panic!("expected SkillQualityError::Invalid for spec missing `cases`, got {other:?}")
        }
        Ok(spec) => panic!("expected error for spec missing `cases`, got Ok({spec:?})"),
    }
}
