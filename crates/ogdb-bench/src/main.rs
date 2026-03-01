use std::collections::HashMap;
use std::env;
use std::hint::black_box;
use std::time::{Duration, Instant};

struct DetRng {
    state: u64,
}

impl DetRng {
    fn seeded(seed: u64) -> Self {
        let seed = if seed == 0 { 0x9E3779B97F4A7C15 } else { seed };
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        // xorshift64*
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    fn gen_bool(&mut self, p: f64) -> bool {
        let p = p.clamp(0.0, 1.0);
        if p <= 0.0 {
            return false;
        }
        if p >= 1.0 {
            return true;
        }
        let unit = self.next_u64() as f64 / u64::MAX as f64;
        unit < p
    }

    fn gen_range_u32(&mut self, start: u32, end: u32) -> u32 {
        assert!(start < end, "invalid range [{start}, {end})");
        let span = (end - start) as u64;
        start + (self.next_u64() % span) as u32
    }
}

#[derive(Clone, Debug)]
struct Config {
    nodes: u32,
    edges_per_node: u32,
    ops: usize,
    seed: u64,
    hot_node_share: f64,
    hot_access_share: f64,
    delta_threshold: f64,
    mem_segment_edges: usize,
    level_max_segments: usize,
    levels: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            nodes: 30_000,
            edges_per_node: 16,
            ops: 500_000,
            seed: 42,
            hot_node_share: 0.10,
            hot_access_share: 0.80,
            delta_threshold: 0.10,
            mem_segment_edges: 8_192,
            level_max_segments: 4,
            levels: 3,
        }
    }
}

impl Config {
    fn from_args() -> Self {
        let mut cfg = Self::default();
        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--nodes" => cfg.nodes = parse_next(&mut args, "--nodes"),
                "--edges-per-node" => {
                    cfg.edges_per_node = parse_next(&mut args, "--edges-per-node")
                }
                "--ops" => cfg.ops = parse_next(&mut args, "--ops"),
                "--seed" => cfg.seed = parse_next(&mut args, "--seed"),
                "--hot-node-share" => {
                    cfg.hot_node_share = parse_next(&mut args, "--hot-node-share")
                }
                "--hot-access-share" => {
                    cfg.hot_access_share = parse_next(&mut args, "--hot-access-share")
                }
                "--delta-threshold" => {
                    cfg.delta_threshold = parse_next(&mut args, "--delta-threshold")
                }
                "--mem-segment-edges" => {
                    cfg.mem_segment_edges = parse_next(&mut args, "--mem-segment-edges")
                }
                "--level-max-segments" => {
                    cfg.level_max_segments = parse_next(&mut args, "--level-max-segments")
                }
                "--levels" => cfg.levels = parse_next(&mut args, "--levels"),
                "--help" | "-h" => {
                    print_help();
                    std::process::exit(0);
                }
                _ => {
                    eprintln!("Unknown argument: {arg}");
                    print_help();
                    std::process::exit(2);
                }
            }
        }
        cfg
    }
}

fn parse_next<T: std::str::FromStr>(args: &mut impl Iterator<Item = String>, flag: &str) -> T {
    let raw = args
        .next()
        .unwrap_or_else(|| panic!("Missing value for {flag}"));
    raw.parse::<T>()
        .unwrap_or_else(|_| panic!("Invalid value for {flag}: {raw}"))
}

fn print_help() {
    println!(
        "ogdb-bench

Usage:
  cargo run --release -p ogdb-bench -- [options]

Options:
  --nodes <u32>                 Number of nodes (default: 30000)
  --edges-per-node <u32>        Initial edges per node (default: 16)
  --ops <usize>                 Operations per workload profile (default: 500000)
  --seed <u64>                  RNG seed (default: 42)
  --hot-node-share <f64>        Fraction of nodes considered hot (default: 0.10)
  --hot-access-share <f64>      Fraction of ops targeting hot nodes (default: 0.80)
  --delta-threshold <f64>       CSR+delta compaction threshold (default: 0.10)
  --mem-segment-edges <usize>   Hybrid mem-segment flush threshold (default: 8192)
  --level-max-segments <usize>  Hybrid level fan-in trigger (default: 4)
  --levels <usize>              Number of hybrid levels before base rewrite (default: 3)"
    );
}

#[derive(Clone, Copy)]
enum Op {
    Read(u32),
    Write(u32, u32),
}

#[derive(Clone)]
struct CsrBase {
    num_nodes: u32,
    offsets: Vec<usize>,
    edges: Vec<u32>,
}

impl CsrBase {
    fn from_adj(adj: &[Vec<u32>]) -> Self {
        let num_nodes = adj.len() as u32;
        let mut offsets = Vec::with_capacity(adj.len() + 1);
        offsets.push(0);
        let mut edges = Vec::new();
        for neighbors in adj {
            edges.extend_from_slice(neighbors);
            offsets.push(edges.len());
        }
        Self {
            num_nodes,
            offsets,
            edges,
        }
    }

    fn neighbor_count(&self, src: u32) -> usize {
        let idx = src as usize;
        self.offsets[idx + 1] - self.offsets[idx]
    }

    fn rebuild_with_delta(&mut self, delta: &HashMap<u32, Vec<u32>>) {
        let n = self.num_nodes as usize;
        let mut merged_adj = Vec::with_capacity(n);
        for src in 0..n {
            let start = self.offsets[src];
            let end = self.offsets[src + 1];
            let base_slice = &self.edges[start..end];
            let extra_len = delta.get(&(src as u32)).map_or(0, Vec::len);
            let mut out = Vec::with_capacity(base_slice.len() + extra_len);
            out.extend_from_slice(base_slice);
            if let Some(extra) = delta.get(&(src as u32)) {
                out.extend_from_slice(extra);
            }
            merged_adj.push(out);
        }
        *self = CsrBase::from_adj(&merged_adj);
    }
}

#[derive(Clone, Default)]
struct MaintenanceStats {
    events: u64,
    total: Duration,
    max: Duration,
    stall_ns: Vec<u64>,
    base_rewrites: u64,
}

impl MaintenanceStats {
    fn record(&mut self, elapsed: Duration, base_rewrite: bool) {
        let elapsed_ns = elapsed.as_nanos() as u64;
        self.events += 1;
        self.total += elapsed;
        self.max = self.max.max(elapsed);
        self.stall_ns.push(elapsed_ns);
        if base_rewrite {
            self.base_rewrites += 1;
        }
    }

    fn p95_ms(&self) -> f64 {
        percentile_ns_to_ms(&self.stall_ns, 0.95)
    }

    fn p99_ms(&self) -> f64 {
        percentile_ns_to_ms(&self.stall_ns, 0.99)
    }
}

trait StorageModel {
    fn name(&self) -> &'static str;
    fn read_neighbors(&self, src: u32) -> usize;
    fn insert_edge(&mut self, src: u32, dst: u32);
    fn maintenance_stats(&self) -> MaintenanceStats;
}

struct CsrDeltaModel {
    base: CsrBase,
    delta: HashMap<u32, Vec<u32>>,
    delta_edges: usize,
    delta_threshold: f64,
    maintenance: MaintenanceStats,
}

impl CsrDeltaModel {
    fn new(base: CsrBase, delta_threshold: f64) -> Self {
        Self {
            base,
            delta: HashMap::new(),
            delta_edges: 0,
            delta_threshold,
            maintenance: MaintenanceStats::default(),
        }
    }

    fn maybe_compact(&mut self) {
        let base_edges = self.base.edges.len().max(1);
        let threshold = (self.delta_threshold * base_edges as f64) as usize;
        if self.delta_edges < threshold.max(1) {
            return;
        }
        let started = Instant::now();
        self.base.rebuild_with_delta(&self.delta);
        self.delta.clear();
        self.delta_edges = 0;
        self.maintenance.record(started.elapsed(), true);
    }
}

impl StorageModel for CsrDeltaModel {
    fn name(&self) -> &'static str {
        "CSR+delta"
    }

    fn read_neighbors(&self, src: u32) -> usize {
        self.base.neighbor_count(src) + self.delta.get(&src).map_or(0, Vec::len)
    }

    fn insert_edge(&mut self, src: u32, dst: u32) {
        self.delta.entry(src).or_default().push(dst);
        self.delta_edges += 1;
        self.maybe_compact();
    }

    fn maintenance_stats(&self) -> MaintenanceStats {
        self.maintenance.clone()
    }
}

struct Segment {
    adj: HashMap<u32, Vec<u32>>,
}

fn merge_segments(mut segments: Vec<Segment>) -> Segment {
    let mut merged = HashMap::<u32, Vec<u32>>::new();
    for seg in &mut segments {
        for (src, mut dsts) in seg.adj.drain() {
            merged.entry(src).or_default().append(&mut dsts);
        }
    }
    Segment { adj: merged }
}

struct HybridModel {
    base: CsrBase,
    mem: HashMap<u32, Vec<u32>>,
    mem_edges: usize,
    levels: Vec<Vec<Segment>>,
    mem_segment_edges: usize,
    level_max_segments: usize,
    maintenance: MaintenanceStats,
}

impl HybridModel {
    fn new(
        base: CsrBase,
        mem_segment_edges: usize,
        level_max_segments: usize,
        levels: usize,
    ) -> Self {
        Self {
            base,
            mem: HashMap::new(),
            mem_edges: 0,
            levels: (0..levels.max(1)).map(|_| Vec::new()).collect(),
            mem_segment_edges: mem_segment_edges.max(1),
            level_max_segments: level_max_segments.max(2),
            maintenance: MaintenanceStats::default(),
        }
    }

    fn flush_mem_if_needed(&mut self) {
        if self.mem_edges < self.mem_segment_edges {
            return;
        }
        let segment = Segment {
            adj: std::mem::take(&mut self.mem),
        };
        self.mem_edges = 0;
        self.levels[0].push(segment);
        self.compact_levels();
    }

    fn compact_levels(&mut self) {
        for level in 0..self.levels.len() {
            while self.levels[level].len() > self.level_max_segments {
                let started = Instant::now();
                let drained: Vec<Segment> = self.levels[level]
                    .drain(0..self.level_max_segments)
                    .collect();
                let merged = merge_segments(drained);

                let base_rewrite = if level + 1 < self.levels.len() {
                    self.levels[level + 1].push(merged);
                    false
                } else {
                    self.base.rebuild_with_delta(&merged.adj);
                    true
                };

                self.maintenance.record(started.elapsed(), base_rewrite);
            }
        }
    }
}

impl StorageModel for HybridModel {
    fn name(&self) -> &'static str {
        "Hybrid-like"
    }

    fn read_neighbors(&self, src: u32) -> usize {
        let mut total = self.base.neighbor_count(src);
        total += self.mem.get(&src).map_or(0, Vec::len);
        for level in &self.levels {
            for segment in level {
                total += segment.adj.get(&src).map_or(0, Vec::len);
            }
        }
        total
    }

    fn insert_edge(&mut self, src: u32, dst: u32) {
        self.mem.entry(src).or_default().push(dst);
        self.mem_edges += 1;
        self.flush_mem_if_needed();
    }

    fn maintenance_stats(&self) -> MaintenanceStats {
        self.maintenance.clone()
    }
}

struct RunMetrics {
    name: &'static str,
    reads: usize,
    writes: usize,
    read_p95_ns: u64,
    read_p99_ns: u64,
    write_p95_ns: u64,
    write_p99_ns: u64,
    maintenance: MaintenanceStats,
}

impl RunMetrics {
    fn read_p95_ms(&self) -> f64 {
        ns_to_ms(self.read_p95_ns)
    }

    fn read_p99_ms(&self) -> f64 {
        ns_to_ms(self.read_p99_ns)
    }

    fn write_p95_ms(&self) -> f64 {
        ns_to_ms(self.write_p95_ns)
    }

    fn write_p99_ms(&self) -> f64 {
        ns_to_ms(self.write_p99_ns)
    }
}

fn ns_to_ms(ns: u64) -> f64 {
    ns as f64 / 1_000_000.0
}

fn percentile_ns(values: &[u64], pct: f64) -> u64 {
    if values.is_empty() {
        return 0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let idx = ((sorted.len() - 1) as f64 * pct).round() as usize;
    sorted[idx]
}

fn percentile_ns_to_ms(values: &[u64], pct: f64) -> f64 {
    ns_to_ms(percentile_ns(values, pct))
}

fn run_workload<M: StorageModel>(mut model: M, ops: &[Op]) -> RunMetrics {
    let mut sink: u64 = 0;
    let mut read_lat_ns = Vec::with_capacity(ops.len());
    let mut write_lat_ns = Vec::with_capacity(ops.len());
    let mut reads = 0usize;
    let mut writes = 0usize;

    for op in ops {
        let started = Instant::now();
        match *op {
            Op::Read(src) => {
                reads += 1;
                sink ^= model.read_neighbors(src) as u64;
                read_lat_ns.push(started.elapsed().as_nanos() as u64);
            }
            Op::Write(src, dst) => {
                writes += 1;
                model.insert_edge(src, dst);
                write_lat_ns.push(started.elapsed().as_nanos() as u64);
            }
        }
    }
    black_box(sink);

    RunMetrics {
        name: model.name(),
        reads,
        writes,
        read_p95_ns: percentile_ns(&read_lat_ns, 0.95),
        read_p99_ns: percentile_ns(&read_lat_ns, 0.99),
        write_p95_ns: percentile_ns(&write_lat_ns, 0.95),
        write_p99_ns: percentile_ns(&write_lat_ns, 0.99),
        maintenance: model.maintenance_stats(),
    }
}

fn build_initial_adj(cfg: &Config, rng: &mut DetRng) -> Vec<Vec<u32>> {
    let mut adj = vec![Vec::with_capacity(cfg.edges_per_node as usize); cfg.nodes as usize];
    for src in 0..cfg.nodes {
        for _ in 0..cfg.edges_per_node {
            adj[src as usize].push(rng.gen_range_u32(0, cfg.nodes));
        }
    }
    adj
}

fn hot_node_count(cfg: &Config) -> u32 {
    let hot = (cfg.nodes as f64 * cfg.hot_node_share).round() as u32;
    hot.clamp(1, cfg.nodes.max(1))
}

fn pick_source(cfg: &Config, rng: &mut DetRng, hot_nodes: u32) -> u32 {
    if hot_nodes >= cfg.nodes {
        return rng.gen_range_u32(0, cfg.nodes);
    }
    if rng.gen_bool(cfg.hot_access_share.clamp(0.0, 1.0)) {
        rng.gen_range_u32(0, hot_nodes)
    } else {
        rng.gen_range_u32(hot_nodes, cfg.nodes)
    }
}

fn make_ops(cfg: &Config, write_ratio: f64, seed: u64) -> Vec<Op> {
    let mut rng = DetRng::seeded(seed);
    let hot_nodes = hot_node_count(cfg);
    let write_ratio = write_ratio.clamp(0.0, 1.0);
    let mut ops = Vec::with_capacity(cfg.ops);
    for _ in 0..cfg.ops {
        if rng.gen_bool(write_ratio) {
            let src = pick_source(cfg, &mut rng, hot_nodes);
            let dst = rng.gen_range_u32(0, cfg.nodes);
            ops.push(Op::Write(src, dst));
        } else {
            let src = pick_source(cfg, &mut rng, hot_nodes);
            ops.push(Op::Read(src));
        }
    }
    ops
}

fn print_profile_result(
    label: &str,
    write_ratio: f64,
    csr_metrics: &RunMetrics,
    hybrid_metrics: &RunMetrics,
) {
    println!();
    println!(
        "## {label} workload (writes: {:.0}%, reads: {:.0}%)",
        write_ratio * 100.0,
        (1.0 - write_ratio) * 100.0
    );
    println!("| Model | reads | writes | read p95 (ms) | read p99 (ms) | write p95 (ms) | write p99 (ms) | maint events | maint p95 (ms) | maint p99 (ms) | maint max (ms) | base rewrites |");
    println!("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for m in [csr_metrics, hybrid_metrics] {
        println!(
            "| {} | {} | {} | {:.4} | {:.4} | {:.4} | {:.4} | {} | {:.2} | {:.2} | {:.2} | {} |",
            m.name,
            m.reads,
            m.writes,
            m.read_p95_ms(),
            m.read_p99_ms(),
            m.write_p95_ms(),
            m.write_p99_ms(),
            m.maintenance.events,
            m.maintenance.p95_ms(),
            m.maintenance.p99_ms(),
            m.maintenance.max.as_secs_f64() * 1_000.0,
            m.maintenance.base_rewrites
        );
    }
}

fn find_profile<'a>(
    results: &'a [(String, f64, RunMetrics, RunMetrics)],
    label: &str,
) -> Option<&'a (String, f64, RunMetrics, RunMetrics)> {
    results.iter().find(|(name, _, _, _)| name == label)
}

fn percent_regression(new_ns: u64, base_ns: u64) -> f64 {
    let denom = base_ns.max(1) as f64;
    (new_ns as f64 - base_ns as f64) * 100.0 / denom
}

fn recommendation(results: &[(String, f64, RunMetrics, RunMetrics)]) -> String {
    let Some((_, _, read_dominant_csr, _)) = find_profile(results, "read-dominant") else {
        return "Unable to decide: missing read-dominant profile.".to_string();
    };
    let Some((_, _, mixed_csr, _)) = find_profile(results, "mixed") else {
        return "Unable to decide: missing mixed profile.".to_string();
    };

    let mixed_regression_pct =
        percent_regression(mixed_csr.read_p95_ns, read_dominant_csr.read_p95_ns);

    let mut write_heavy_trigger = false;
    let mut hybrid_materially_better = false;
    let mut max_write_heavy_compaction_p95_ms = 0.0_f64;

    for (_, write_ratio, csr, hybrid) in results {
        if *write_ratio >= 0.30 {
            let csr_maint_p95_ms = csr.maintenance.p95_ms();
            let hybrid_maint_p95_ms = hybrid.maintenance.p95_ms();
            max_write_heavy_compaction_p95_ms =
                max_write_heavy_compaction_p95_ms.max(csr_maint_p95_ms);

            if csr_maint_p95_ms > 200.0 {
                write_heavy_trigger = true;
            }
            if hybrid_maint_p95_ms + 0.001 < csr_maint_p95_ms * 0.7 {
                hybrid_materially_better = true;
            }
        }
    }

    let keep_guard_ok =
        read_dominant_csr.maintenance.p95_ms() <= 50.0 && mixed_regression_pct <= 20.0;
    let mixed_regression_trigger = mixed_regression_pct > 30.0;

    if write_heavy_trigger || mixed_regression_trigger {
        return format!(
            "Pivot trigger hit: write-heavy compaction p95 or mixed-load traversal regression exceeded gates. (max write-heavy compaction p95: {:.2} ms, mixed traversal regression: {:.2}%)",
            max_write_heavy_compaction_p95_ms, mixed_regression_pct
        );
    }

    if keep_guard_ok {
        return format!(
            "Keep CSR+delta baseline: gate checks passed. (read-dominant compaction p95: {:.2} ms, mixed traversal regression: {:.2}%)",
            read_dominant_csr.maintenance.p95_ms(),
            mixed_regression_pct
        );
    }

    if hybrid_materially_better {
        return format!(
            "Keep CSR+delta for now, but hybrid path should remain active: hybrid reduced write-heavy compaction p95 materially in this run. (max CSR write-heavy compaction p95: {:.2} ms, mixed traversal regression: {:.2}%)",
            max_write_heavy_compaction_p95_ms,
            mixed_regression_pct
        );
    }

    format!(
        "Keep CSR+delta baseline with continued measurement. (max write-heavy compaction p95: {:.2} ms, mixed traversal regression: {:.2}%)",
        max_write_heavy_compaction_p95_ms,
        mixed_regression_pct
    )
}

fn main() {
    let cfg = Config::from_args();
    println!("OpenGraphDB storage-decision benchmark");
    println!(
        "config: nodes={}, edges_per_node={}, ops={}, seed={}, hot_node_share={}, hot_access_share={}, delta_threshold={}, mem_segment_edges={}, level_max_segments={}, levels={}",
        cfg.nodes,
        cfg.edges_per_node,
        cfg.ops,
        cfg.seed,
        cfg.hot_node_share,
        cfg.hot_access_share,
        cfg.delta_threshold,
        cfg.mem_segment_edges,
        cfg.level_max_segments,
        cfg.levels
    );

    let mut seed_rng = DetRng::seeded(cfg.seed);
    let initial_adj = build_initial_adj(&cfg, &mut seed_rng);
    let base = CsrBase::from_adj(&initial_adj);
    println!(
        "initial graph: nodes={}, edges={}",
        base.num_nodes,
        base.edges.len()
    );

    let workloads = [
        ("read-dominant", 0.05_f64),
        ("mixed", 0.20_f64),
        ("write-stress", 0.30_f64),
        ("high-write", 0.50_f64),
    ];

    let mut all_results = Vec::<(String, f64, RunMetrics, RunMetrics)>::new();

    for (index, (label, write_ratio)) in workloads.iter().enumerate() {
        let ops_seed = cfg.seed.wrapping_add((index as u64 + 1) * 1009);
        let ops = make_ops(&cfg, *write_ratio, ops_seed);

        let csr = CsrDeltaModel::new(base.clone(), cfg.delta_threshold);
        let hybrid = HybridModel::new(
            base.clone(),
            cfg.mem_segment_edges,
            cfg.level_max_segments,
            cfg.levels,
        );

        let csr_metrics = run_workload(csr, &ops);
        let hybrid_metrics = run_workload(hybrid, &ops);

        print_profile_result(label, *write_ratio, &csr_metrics, &hybrid_metrics);
        all_results.push((
            (*label).to_string(),
            *write_ratio,
            csr_metrics,
            hybrid_metrics,
        ));
    }

    println!();
    println!("Recommendation: {}", recommendation(&all_results));
    println!(
        "Note: this is a synthetic in-memory model benchmark to guide architecture choice, not a replacement for full engine benchmarks."
    );
}

#[cfg(test)]
mod benchmark_gates {
    use ogdb_core::{Database, Header};
    use std::hint::black_box;
    use std::time::Instant;
    use tempfile::TempDir;

    #[derive(Debug, Clone, Copy)]
    struct GateConfig {
        node_count: u64,
        edges_per_node: u64,
        sample_count: u64,
        import_edges: u64,
    }

    #[derive(Debug, Clone, Copy)]
    struct GateResult {
        single_hop_p95_us: f64,
        three_hop_p95_us: f64,
        csv_import_edges_per_sec: f64,
    }

    impl GateConfig {
        fn strict_defaults() -> Self {
            Self {
                node_count: 100_000,
                edges_per_node: 4,
                sample_count: 5_000,
                import_edges: 1_000_000,
            }
        }
    }

    fn percentile_us(samples: &mut [u128], percentile: f64) -> f64 {
        samples.sort_unstable();
        if samples.is_empty() {
            return 0.0;
        }
        let index = (((samples.len() - 1) as f64) * percentile).round() as usize;
        samples[index] as f64 / 1_000.0
    }

    fn temp_db(tag: &str) -> (TempDir, Database) {
        let dir = TempDir::new().expect("temp dir");
        let db_path = dir.path().join(format!("{tag}.ogdb"));
        let db = Database::init(&db_path, Header::default_v1()).expect("init db");
        (dir, db)
    }

    fn seed_graph(db: &mut Database, node_count: u64, edges_per_node: u64) {
        for _ in 0..node_count {
            let _ = db.create_node().expect("create node");
        }

        for src in 0..node_count {
            for offset in 1..=edges_per_node {
                let dst = (src + offset) % node_count;
                let _ = db.add_edge(src, dst).expect("add edge");
            }
        }
    }

    fn measure_single_hop_p95_us(db: &Database, node_count: u64, sample_count: u64) -> f64 {
        let mut samples = Vec::<u128>::with_capacity(sample_count as usize);
        for i in 0..sample_count {
            let src = (i.wrapping_mul(7_919)) % node_count;
            let started = Instant::now();
            let neighbors = db.neighbors(src).expect("neighbors");
            black_box(neighbors.len());
            samples.push(started.elapsed().as_nanos().max(1));
        }
        percentile_us(&mut samples, 0.95)
    }

    fn measure_three_hop_p95_us(db: &Database, node_count: u64, sample_count: u64) -> f64 {
        let mut samples = Vec::<u128>::with_capacity(sample_count as usize);
        for i in 0..sample_count {
            let src = (i.wrapping_mul(15_551)) % node_count;
            let started = Instant::now();
            let levels = db.hop_levels(src, 3).expect("three-hop traversal");
            black_box(levels.len());
            samples.push(started.elapsed().as_nanos().max(1));
        }
        percentile_us(&mut samples, 0.95)
    }

    fn parse_csv_edge(line: &str) -> Option<(u64, u64)> {
        let mut parts = line.split(',');
        let src = parts.next()?.trim().parse::<u64>().ok()?;
        let dst = parts.next()?.trim().parse::<u64>().ok()?;
        if parts.next().is_some() {
            return None;
        }
        Some((src, dst))
    }

    fn measure_csv_import_edges_per_sec(
        db: &mut Database,
        node_count: u64,
        edge_count: u64,
    ) -> f64 {
        let started = Instant::now();
        for edge_id in 0..edge_count {
            let src = edge_id % node_count;
            let dst = (src + (edge_id % 17) + 1) % node_count;
            let row = format!("{src},{dst}");
            let (src, dst) = parse_csv_edge(&row).expect("parse csv edge row");
            let _ = db.add_edge(src, dst).expect("import edge");
        }
        let elapsed = started.elapsed().as_secs_f64();
        if elapsed <= 0.0 {
            return edge_count as f64;
        }
        edge_count as f64 / elapsed
    }

    fn run_gate_benchmark(config: GateConfig) -> GateResult {
        let (_seed_dir, mut graph_db) = temp_db("gate-seed");
        seed_graph(&mut graph_db, config.node_count, config.edges_per_node);

        let single_hop_p95_us =
            measure_single_hop_p95_us(&graph_db, config.node_count, config.sample_count);
        let three_hop_p95_us =
            measure_three_hop_p95_us(&graph_db, config.node_count, config.sample_count);

        let (_import_dir, mut import_db) = temp_db("gate-import");
        seed_graph(&mut import_db, config.node_count, 1);
        let csv_import_edges_per_sec = measure_csv_import_edges_per_sec(
            &mut import_db,
            config.node_count,
            config.import_edges,
        );

        GateResult {
            single_hop_p95_us,
            three_hop_p95_us,
            csv_import_edges_per_sec,
        }
    }

    #[test]
    fn benchmark_gate_harness_reports_non_zero_metrics() {
        let result = run_gate_benchmark(GateConfig {
            node_count: 60,
            edges_per_node: 1,
            sample_count: 12,
            import_edges: 60,
        });

        assert!(result.single_hop_p95_us > 0.0);
        assert!(result.three_hop_p95_us > 0.0);
        assert!(result.csv_import_edges_per_sec > 0.0);
    }

    #[test]
    #[ignore = "performance gate; run on dedicated hardware"]
    fn benchmark_gate_thresholds_for_100k_graph() {
        let result = run_gate_benchmark(GateConfig::strict_defaults());

        assert!(
            result.single_hop_p95_us < 1_000.0,
            "single-hop p95 was {}us",
            result.single_hop_p95_us
        );
        assert!(
            result.three_hop_p95_us < 10_000.0,
            "three-hop p95 was {}us",
            result.three_hop_p95_us
        );
        assert!(
            result.csv_import_edges_per_sec > 500_000.0,
            "csv import throughput was {:.2} edges/sec",
            result.csv_import_edges_per_sec
        );
    }
}

#[cfg(test)]
mod budget_gates {
    use ogdb_core::{Database, Header};
    use std::path::Path;
    use std::time::Instant;
    use tempfile::TempDir;

    const BATCH_SIZE: u64 = 50_000;
    const GATE_NODE_COUNT: u64 = 1_000_000;
    const GATE_EDGE_COUNT: u64 = 5_000_000;
    const MEMORY_BUDGET_BYTES: u64 = 500 * 1024 * 1024;
    const DISK_BUDGET_BYTES: u64 = 1_000 * 1024 * 1024;

    fn ps_rss_bytes() -> Option<u64> {
        let output = std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &std::process::id().to_string()])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        output
            .stdout
            .split(|b| *b == b'\n')
            .find_map(|line| std::str::from_utf8(line).ok())
            .and_then(|raw| raw.trim().parse::<u64>().ok())
            .map(|kb| kb * 1024)
    }

    #[cfg(target_os = "linux")]
    fn proc_status_rss_bytes() -> Option<u64> {
        let status = std::fs::read_to_string("/proc/self/status").ok()?;
        status.lines().find_map(|line| {
            if !line.starts_with("VmRSS:") {
                return None;
            }
            line.split_whitespace()
                .nth(1)
                .and_then(|value| value.parse::<u64>().ok())
                .map(|kb| kb * 1024)
        })
    }

    #[cfg(not(target_os = "linux"))]
    fn proc_status_rss_bytes() -> Option<u64> {
        None
    }

    fn getrusage_rss_bytes() -> Option<u64> {
        let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
        let result = unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) };
        if result != 0 {
            return None;
        }
        let usage = unsafe { usage.assume_init() };
        let raw = u64::try_from(usage.ru_maxrss).ok()?;
        #[cfg(target_os = "macos")]
        {
            Some(raw)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Some(raw * 1024)
        }
    }

    fn get_rss_bytes() -> u64 {
        ps_rss_bytes()
            .or_else(proc_status_rss_bytes)
            .or_else(getrusage_rss_bytes)
            .unwrap_or(0)
    }

    fn dir_disk_bytes(dir: &Path) -> u64 {
        std::fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(|entry| entry.ok())
                    .filter_map(|entry| {
                        entry
                            .metadata()
                            .ok()
                            .filter(|meta| meta.is_file())
                            .map(|meta| meta.len())
                    })
                    .sum()
            })
            .unwrap_or(0)
    }

    fn next_xorshift64(state: &mut u64) -> u64 {
        *state ^= *state >> 12;
        *state ^= *state << 25;
        *state ^= *state >> 27;
        state.wrapping_mul(0x2545F4914F6CDD1D)
    }

    fn build_budget_graph(tag: &str, node_count: u64, edge_count: u64) -> (TempDir, Database) {
        assert!(node_count > 0, "node_count must be non-zero");

        let dir = TempDir::new().expect("temp dir");
        let db_path = dir.path().join(format!("{tag}.ogdb"));
        let mut db = Database::init(&db_path, Header::default_v1()).expect("init db");

        let mut created_nodes = 0_u64;
        while created_nodes < node_count {
            let batch = BATCH_SIZE.min(node_count - created_nodes);
            let mut tx = db.begin_write();
            for _ in 0..batch {
                tx.create_node().expect("create node");
            }
            tx.commit().expect("commit node batch");
            created_nodes += batch;
        }
        assert_eq!(db.node_count(), node_count);

        let mut rng_state = 42_u64;
        let mut created_edges = 0_u64;
        while created_edges < edge_count {
            let batch = BATCH_SIZE.min(edge_count - created_edges);
            let mut tx = db.begin_write();
            for _ in 0..batch {
                let src = next_xorshift64(&mut rng_state) % node_count;
                let dst = next_xorshift64(&mut rng_state) % node_count;
                tx.add_edge(src, dst).expect("add edge");
            }
            tx.commit().expect("commit edge batch");
            created_edges += batch;
        }

        db.checkpoint().expect("checkpoint");
        (dir, db)
    }

    #[test]
    fn budget_measurement_smoke_test() {
        let node_count = 1_000;
        let edge_count = 5_000;
        let (dir, db) = build_budget_graph("smoke", node_count, edge_count);

        assert_eq!(db.node_count(), node_count);
        assert_eq!(db.edge_count(), edge_count);

        let rss = get_rss_bytes();
        assert!(
            rss > 0,
            "RSS measurement returned zero; ps may not be available"
        );

        let disk = dir_disk_bytes(dir.path());
        assert!(disk > 0, "disk measurement returned zero");

        eprintln!(
            "smoke test: nodes={}, edges={}, rss={:.2} MB, disk={:.2} MB",
            node_count,
            edge_count,
            rss as f64 / (1024.0 * 1024.0),
            disk as f64 / (1024.0 * 1024.0)
        );
    }

    #[test]
    #[ignore = "budget gate; run on dedicated hardware with sufficient memory"]
    fn memory_budget_gate_1m_nodes_5m_edges() {
        eprintln!(
            "building budget graph: {} nodes, {} edges ...",
            GATE_NODE_COUNT, GATE_EDGE_COUNT
        );
        let started = Instant::now();
        let (_dir, _db) = build_budget_graph("mem-budget", GATE_NODE_COUNT, GATE_EDGE_COUNT);
        let build_secs = started.elapsed().as_secs_f64();
        eprintln!("graph built in {build_secs:.1}s");

        let rss = get_rss_bytes();
        let rss_mb = rss as f64 / (1024.0 * 1024.0);
        let budget_mb = MEMORY_BUDGET_BYTES as f64 / (1024.0 * 1024.0);
        eprintln!("RSS: {rss_mb:.2} MB (budget: {budget_mb:.0} MB)");

        assert!(
            rss > 0,
            "RSS measurement returned zero; ps may not be available on this platform"
        );
        assert!(
            rss < MEMORY_BUDGET_BYTES,
            "QUAL-01 FAILED: RSS {rss_mb:.2} MB exceeds {budget_mb:.0} MB budget"
        );
    }

    #[test]
    #[ignore = "budget gate; run on dedicated hardware with sufficient memory"]
    fn disk_budget_gate_1m_nodes_5m_edges() {
        eprintln!(
            "building budget graph: {} nodes, {} edges ...",
            GATE_NODE_COUNT, GATE_EDGE_COUNT
        );
        let started = Instant::now();
        let (dir, mut db) = build_budget_graph("disk-budget", GATE_NODE_COUNT, GATE_EDGE_COUNT);
        let build_secs = started.elapsed().as_secs_f64();
        eprintln!("graph built in {build_secs:.1}s");

        db.checkpoint().expect("final checkpoint");

        let disk = dir_disk_bytes(dir.path());
        let disk_mb = disk as f64 / (1024.0 * 1024.0);
        let budget_mb = DISK_BUDGET_BYTES as f64 / (1024.0 * 1024.0);
        eprintln!("disk: {disk_mb:.2} MB (budget: {budget_mb:.0} MB)");

        if let Ok(entries) = std::fs::read_dir(dir.path()) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    let file_name = entry.file_name();
                    let size_mb = meta.len() as f64 / (1024.0 * 1024.0);
                    eprintln!("  {}: {size_mb:.2} MB", file_name.to_string_lossy());
                }
            }
        }

        assert!(disk > 0, "disk measurement returned zero");
        assert!(
            disk < DISK_BUDGET_BYTES,
            "QUAL-02 FAILED: disk {disk_mb:.2} MB exceeds {budget_mb:.0} MB budget"
        );
    }
}
