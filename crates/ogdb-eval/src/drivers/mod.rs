//! Phase 5 drivers — produce `EvaluationRun`s by exercising real workloads
//! against `ogdb-core` (or, for ingest-only drivers, by parsing artifacts on
//! disk). Each driver is a stand-alone module so it can be invoked
//! independently from the future `ogdb eval` CLI subcommand (Task 4.2).

pub mod ai_agent;
pub mod cli_runner;
pub mod common;
pub mod criterion_ingest;
pub mod graphalytics;
pub mod ldbc_mini;
pub mod ldbc_snb;
pub mod resources;
pub mod scaling;
pub mod skill_quality;
pub mod throughput;
