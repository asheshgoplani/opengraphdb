//! RED phase: empty beachhead for the ogdb-core → ogdb-vector split.
//!
//! See `.planning/ogdb-core-split-vector/PLAN.md` §6 for the exact
//! items that land here in Phase 3 (GREEN):
//!   - `VectorDistanceMetric` (pub enum)
//!   - `VectorIndexDefinition` (pub struct)
//!   - `vector_distance` (pub fn)
//!   - `parse_vector_literal_text` (pub fn)
//!   - `compare_f32_vectors` (pub fn)
//!
//! Tests in `tests/api_smoke.rs` intentionally fail to compile on
//! this RED commit and turn green after Phase 3.
