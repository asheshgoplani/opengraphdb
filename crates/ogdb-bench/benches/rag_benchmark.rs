use criterion::{criterion_group, criterion_main, Criterion};
use ogdb_core::{Database, DocumentFormat, Header, IngestConfig, RetrievalSignal, RrfConfig};
use tempfile::TempDir;

/// Deterministic character-frequency embedding for benchmark reproducibility.
///
/// Not a real semantic embedding model. Creates a vector from normalized byte frequencies.
/// With these fake embeddings, the vector signal is effectively noise relative to semantic
/// meaning. The benchmark focuses on BM25 and graph traversal correctness.
fn fake_embed(text: &str, dims: usize) -> Vec<f32> {
    let mut vec = vec![0.0f32; dims];
    for (i, byte) in text.bytes().enumerate() {
        vec[i % dims] += f32::from(byte) / 255.0;
    }
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-8);
    for v in &mut vec {
        *v /= norm;
    }
    vec
}

#[derive(serde::Deserialize, Debug, Clone)]
struct BenchmarkQuestion {
    #[allow(dead_code)]
    id: String,
    question: String,
    #[allow(dead_code)]
    answer: String,
    #[allow(dead_code)]
    relevant_sections: Vec<String>,
    #[allow(dead_code)]
    difficulty: String,
    #[allow(dead_code)]
    requires_cross_doc: bool,
}

const EMBED_DIMS: usize = 64;

/// Set up a temporary database with ingested benchmark documents.
fn setup_benchmark_db() -> (TempDir, Database) {
    let dir = TempDir::new().expect("temp dir");
    let db_path = dir.path().join("rag_bench.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

    let doc_files: &[(&str, &str)] = &[
        (
            "AI Overview",
            include_str!("../../../benchmarks/rag/dataset/documents/ai-overview.md"),
        ),
        (
            "Machine Learning",
            include_str!("../../../benchmarks/rag/dataset/documents/machine-learning.md"),
        ),
        (
            "Graph Databases",
            include_str!("../../../benchmarks/rag/dataset/documents/graph-databases.md"),
        ),
    ];

    for (title, content) in doc_files {
        let title_str = title.to_string();
        let config = IngestConfig {
            title: title_str,
            format: DocumentFormat::Markdown,
            embed_fn: Some(Box::new(move |text: &str| fake_embed(text, EMBED_DIMS))),
            embedding_dimensions: Some(EMBED_DIMS),
            ..IngestConfig::default()
        };
        db.ingest_document(content.as_bytes(), &config)
            .unwrap_or_else(|e| panic!("ingest_document failed for {title}: {e}"));
    }

    (dir, db)
}

fn load_questions() -> Vec<BenchmarkQuestion> {
    let json = include_str!("../../../benchmarks/rag/dataset/questions.json");
    serde_json::from_str(json).expect("parse questions.json")
}

fn bench_retrieval_strategies(c: &mut Criterion) {
    let (_dir, db) = setup_benchmark_db();
    let questions = load_questions();
    let k = 5;

    let mut group = c.benchmark_group("rag_retrieval");

    // Strategy 1: BM25 only
    group.bench_function("bm25_only", |b| {
        b.iter(|| {
            for q in &questions {
                let config = RrfConfig {
                    signals: vec![RetrievalSignal::Bm25],
                    ..RrfConfig::default()
                };
                let _ = db.hybrid_rag_retrieve_rrf(
                    &fake_embed(&q.question, EMBED_DIMS),
                    &q.question,
                    k,
                    &config,
                );
            }
        });
    });

    // Strategy 2: Vector only
    group.bench_function("vector_only", |b| {
        b.iter(|| {
            for q in &questions {
                let config = RrfConfig {
                    signals: vec![RetrievalSignal::Vector],
                    ..RrfConfig::default()
                };
                let _ = db.hybrid_rag_retrieve_rrf(
                    &fake_embed(&q.question, EMBED_DIMS),
                    &q.question,
                    k,
                    &config,
                );
            }
        });
    });

    // Strategy 3: Full hybrid (BM25 + Vector + Graph + RRF)
    group.bench_function("hybrid_rrf", |b| {
        b.iter(|| {
            for q in &questions {
                let config = RrfConfig::default();
                let _ = db.hybrid_rag_retrieve_rrf(
                    &fake_embed(&q.question, EMBED_DIMS),
                    &q.question,
                    k,
                    &config,
                );
            }
        });
    });

    group.finish();
}

criterion_group!(benches, bench_retrieval_strategies);
criterion_main!(benches);
