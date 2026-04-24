//! RED-phase placeholder for the extracted `ogdb-algorithms` crate.
//!
//! This file is intentionally empty on the plan+RED commit. The next
//! GREEN commits (see `.planning/ogdb-core-split-algorithms/PLAN.md`
//! §9, Phases 3–4) move the four plain-data algorithm types
//! (`ShortestPathOptions`, `GraphPath`, `Subgraph`, `SubgraphEdge`)
//! and the three pure-math community-detection kernels
//! (`label_propagation`, `louvain`, `leiden`) out of
//! `crates/ogdb-core/src/lib.rs` and land them here. Until that
//! happens, `tests/api_smoke.rs` fails to resolve every `use
//! ogdb_algorithms::{…}` import — that is the expected RED signal.
