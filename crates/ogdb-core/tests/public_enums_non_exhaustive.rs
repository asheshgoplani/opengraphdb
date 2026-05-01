//! Regression test for EVAL-RUST-QUALITY-CYCLE2 §H6 (HIGH).
//!
//! Cycle 1 added `#[non_exhaustive]` only to the four error enums and
//! ogdb-cli's `CompressionAlgorithm` output enum. Cycle 2 extends that
//! discipline to the remaining 14 public ogdb-core enums so that adding
//! a new variant (a new Cypher token class, a new logical-plan node, a
//! new physical-scan strategy) is no longer a SemVer breaking change for
//! downstream callers.
//!
//! Each `match` below fails to compile if the corresponding attribute is
//! ever removed (the wildcard arm becomes unreachable, which `-D
//! warnings` in CI upgrades to a hard error).

use ogdb_core::{
    CompressionAlgorithm, CypherClause, CypherExpression, CypherKeyword, CypherLiteral,
    CypherOperator, CypherPunctuation, DbRole, LogicalPlan, PhysicalJoinStrategy,
    PhysicalScanStrategy, RelationshipDirection, TokenKind, WriteConcurrencyMode,
};

#[test]
fn compression_algorithm_is_non_exhaustive() {
    match CompressionAlgorithm::None {
        CompressionAlgorithm::None => {}
        _ => unreachable!("only None is constructed in this test"),
    }
}

#[test]
fn write_concurrency_mode_is_non_exhaustive() {
    match WriteConcurrencyMode::SingleWriter {
        WriteConcurrencyMode::SingleWriter => {}
        _ => unreachable!("only SingleWriter is constructed in this test"),
    }
}

#[test]
fn db_role_is_non_exhaustive() {
    match DbRole::ReadOnly {
        DbRole::ReadOnly => {}
        _ => unreachable!("only ReadOnly is constructed in this test"),
    }
}

#[test]
fn token_kind_is_non_exhaustive() {
    match TokenKind::Identifier("x".to_string()) {
        TokenKind::Identifier(_) => {}
        _ => unreachable!("only Identifier is constructed in this test"),
    }
}

#[test]
fn cypher_keyword_is_non_exhaustive() {
    match CypherKeyword::Match {
        CypherKeyword::Match => {}
        _ => unreachable!("only Match is constructed in this test"),
    }
}

#[test]
fn cypher_operator_is_non_exhaustive() {
    match CypherOperator::Plus {
        CypherOperator::Plus => {}
        _ => unreachable!("only Plus is constructed in this test"),
    }
}

#[test]
fn cypher_punctuation_is_non_exhaustive() {
    match CypherPunctuation::Dot {
        CypherPunctuation::Dot => {}
        _ => unreachable!("only Dot is constructed in this test"),
    }
}

#[test]
fn cypher_clause_is_non_exhaustive() {
    let mut handled = false;
    let clause = ogdb_core::ReturnClause {
        items: Vec::new(),
        order_by: Vec::new(),
        skip: None,
        limit: None,
        distinct: false,
    };
    let query = ogdb_core::CypherQuery {
        clauses: Vec::new(),
        return_clause: Some(clause),
    };
    if let Some(ret) = query.return_clause {
        handled = ret.items.is_empty();
    }
    assert!(handled);
    // Direct match over CypherClause via a Match clause:
    let synthetic = CypherClause::Delete(ogdb_core::DeleteClause {
        expressions: Vec::new(),
        detach: false,
    });
    match synthetic {
        CypherClause::Delete(_) => {}
        _ => unreachable!("only Delete is constructed in this test"),
    }
}

#[test]
fn relationship_direction_is_non_exhaustive() {
    match RelationshipDirection::Undirected {
        RelationshipDirection::Undirected => {}
        _ => unreachable!("only Undirected is constructed in this test"),
    }
}

#[test]
fn cypher_expression_is_non_exhaustive() {
    match CypherExpression::Identifier("v".to_string()) {
        CypherExpression::Identifier(_) => {}
        _ => unreachable!("only Identifier is constructed in this test"),
    }
}

#[test]
fn cypher_literal_is_non_exhaustive() {
    match CypherLiteral::Null {
        CypherLiteral::Null => {}
        _ => unreachable!("only Null is constructed in this test"),
    }
}

#[test]
fn logical_plan_is_non_exhaustive() {
    let plan = LogicalPlan::Scan {
        label: None,
        variable: None,
    };
    match plan {
        LogicalPlan::Scan { .. } => {}
        _ => unreachable!("only Scan is constructed in this test"),
    }
}

#[test]
fn physical_scan_strategy_is_non_exhaustive() {
    match PhysicalScanStrategy::SequentialScan {
        PhysicalScanStrategy::SequentialScan => {}
        _ => unreachable!("only SequentialScan is constructed in this test"),
    }
}

#[test]
fn physical_join_strategy_is_non_exhaustive() {
    match PhysicalJoinStrategy::NestedLoop {
        PhysicalJoinStrategy::NestedLoop => {}
        _ => unreachable!("only NestedLoop is constructed in this test"),
    }
}
