//! Synthetic LDBC SNB "mini" fixture: 100 Person nodes + 500 :KNOWS edges.
//!
//! Generated deterministically from a fixed-seed xorshift64 RNG so the
//! graphalytics oracle (Task 5.6) and IS-1 latency expectations stay stable
//! across runs. The fixture is intentionally tiny — full SF0.1 (~1.5GB) is
//! pulled by `scripts/download-ldbc-sf0_1.sh` for non-CI runs only.

use std::path::Path;

use ogdb_core::{Database, Header, PropertyMap, PropertyValue};

use crate::EvalError;

/// Stable seed — DO NOT CHANGE without updating Task 5.6 PageRank oracle.
pub const SEED: u64 = 0x0123_4567_89ab_cdef;

pub const PERSON_COUNT: usize = 100;
pub const KNOWS_COUNT: usize = 500;

/// Handle on the freshly built mini graph. The database lives at the path
/// passed to `build_ldbc_mini`; this struct describes its contents so tests
/// and downstream drivers can verify shape without re-opening it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LdbcMini {
    pub person_count: usize,
    pub knows_count: usize,
    /// Internal node ids for each Person, in insertion order. Person id N
    /// corresponds to `person_node_ids[N]` (typically just `N` since the
    /// fixture is the only writer).
    pub person_node_ids: Vec<u64>,
    /// `(src_logical_id, dst_logical_id)` pairs in insertion order — used by
    /// determinism tests and by the graphalytics driver's in-memory
    /// adjacency build.
    pub adjacency: Vec<(u64, u64)>,
}

/// Open a fresh database at `db_path` and populate it with the mini fixture.
/// Caller owns `db_path`; the file is left on disk so other drivers can
/// re-open it for measurements.
pub fn build_ldbc_mini(db_path: &Path) -> Result<LdbcMini, EvalError> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let mut db = Database::init(db_path, Header::default_v1())
        .map_err(|e| EvalError::InvalidSchema(format!("init db: {e}")))?;

    let labels = vec!["Person".to_string()];
    let mut person_node_ids = Vec::with_capacity(PERSON_COUNT);
    {
        let mut tx = db.begin_write();
        for i in 0..PERSON_COUNT {
            let mut props = PropertyMap::new();
            props.insert("id".to_string(), PropertyValue::I64(i as i64));
            props.insert(
                "firstName".to_string(),
                PropertyValue::String(format!("First{i}")),
            );
            props.insert(
                "lastName".to_string(),
                PropertyValue::String(format!("Last{i}")),
            );
            let nid = tx
                .create_node_with(labels.clone(), props)
                .map_err(|e| EvalError::InvalidSchema(format!("create_node_with: {e}")))?;
            person_node_ids.push(nid);
        }
        tx.commit()
            .map_err(|e| EvalError::InvalidSchema(format!("commit nodes: {e}")))?;
    }

    let mut rng = SEED;
    let mut adjacency = Vec::with_capacity(KNOWS_COUNT);
    let knows_props = PropertyMap::new();
    {
        let mut tx = db.begin_write();
        let mut emitted = 0;
        // Reject self-loops so the adjacency stays useful for BFS oracle.
        while emitted < KNOWS_COUNT {
            let src_idx = (next_u64(&mut rng) as usize) % PERSON_COUNT;
            let dst_idx = (next_u64(&mut rng) as usize) % PERSON_COUNT;
            if src_idx == dst_idx {
                continue;
            }
            let src = person_node_ids[src_idx];
            let dst = person_node_ids[dst_idx];
            tx.add_typed_edge(src, dst, "KNOWS".to_string(), knows_props.clone())
                .map_err(|e| EvalError::InvalidSchema(format!("add_typed_edge: {e}")))?;
            adjacency.push((src_idx as u64, dst_idx as u64));
            emitted += 1;
        }
        tx.commit()
            .map_err(|e| EvalError::InvalidSchema(format!("commit edges: {e}")))?;
    }

    Ok(LdbcMini {
        person_count: PERSON_COUNT,
        knows_count: KNOWS_COUNT,
        person_node_ids,
        adjacency,
    })
}

fn next_u64(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}
