use clap::{ArgAction, ArgGroup, Args, CommandFactory, Parser, Subcommand, ValueEnum};
use ogdb_core::{
    Database, DbError, DocumentFormat, EnrichedRagResult, ExportEdge, ExportNode, Header,
    IngestConfig, PropertyMap, PropertyValue, QueryResult,
    SharedDatabase, ShortestPathOptions, VectorDistanceMetric, WriteConcurrencyMode,
};
use oxrdf::{BlankNode, GraphName, Literal, NamedNode, NamedOrBlankNode, Quad, Term};
use oxrdfio::{JsonLdProfileSet, RdfFormat, RdfParser, RdfSerializer};
use rustyline::completion::{Completer, Pair};
#[cfg(not(test))]
use rustyline::error::ReadlineError;
use rustyline::highlight::Highlighter;
use rustyline::hint::Hinter;
use rustyline::validate::Validator;
use rustyline::{Context, Helper};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, BufWriter, IsTerminal, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

mod prom_metrics;

pub const APP_NAME: &str = "opengraphdb";
const SERVER_MULTI_WRITER_RETRIES: usize = 3;
static HTTP_QUERY_COUNT: AtomicU64 = AtomicU64::new(0);
static HTTP_QUERY_DURATION_MICROS: AtomicU64 = AtomicU64::new(0);
static HTTP_QUERY_TIMEOUT_COUNT: AtomicU64 = AtomicU64::new(0);

// HTTP request-size / header caps. Pre-fix (audit 2026-04-22 area 5) a single
// `Content-Length: 4000000000` would allocate 4 GB before any bounds check,
// and a client could stream arbitrarily many / arbitrarily long headers into
// the header HashMap. Keep the numbers conservative — tune via a CLI flag
// only if a real workload demands it.
const MAX_REQUEST_BODY_BYTES: usize = 10 * 1024 * 1024;
const MAX_HEADER_COUNT: usize = 100;
const MAX_HEADER_LINE: usize = 8192;
// Per-connection read/write timeout in seconds. Blocks slow-loris clients
// from pinning a connection indefinitely. The env var exists for tests that
// need a tight bound without compiling a custom binary; production should
// leave it unset.
const HTTP_STREAM_TIMEOUT_SECS_DEFAULT: u64 = 30;
// Per-query execution budget for POST /query. A query that runs past the
// budget is abandoned by the HTTP handler — the worker thread is detached
// (the engine lacks cooperative cancellation today), a 504 is returned to
// the client, and HTTP_QUERY_TIMEOUT_COUNT is incremented.
const HTTP_QUERY_TIMEOUT_MS_DEFAULT: u64 = 10_000;

fn http_stream_timeout() -> Duration {
    let secs = std::env::var("OGDB_HTTP_STREAM_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(HTTP_STREAM_TIMEOUT_SECS_DEFAULT);
    Duration::from_secs(secs.max(1))
}

fn http_query_exec_timeout() -> Duration {
    let ms = std::env::var("OGDB_HTTP_QUERY_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(HTTP_QUERY_TIMEOUT_MS_DEFAULT);
    Duration::from_millis(ms.max(1))
}

// Outcome of attempting to parse an HTTP request off the wire. Pre-fix,
// `read_http_request` returned `Result<Option<HttpRequestMessage>, CliError>`
// and propagated malformed client input as hard errors — which would kill
// the serve loop via `?`. We now classify:
//   * `Closed`    — client closed before sending anything useful (drop conn)
//   * `Rejected`  — valid framing but caps exceeded / malformed — reply 4xx
//                   and keep the server alive for the next connection
//   * `Request`   — fully-parsed message ready for dispatch
#[derive(Debug)]
enum HttpReadOutcome {
    Closed,
    Rejected {
        status: u16,
        reason: &'static str,
        detail: String,
    },
    Request(HttpRequestMessage),
}

#[derive(Debug, Clone, Parser)]
#[command(name = APP_NAME, version, about = "OpenGraphDB CLI", after_long_help = "\
Examples:
  opengraphdb init my.ogdb
  opengraphdb query my.ogdb \"MATCH (n) RETURN n LIMIT 10\"
  opengraphdb query my.ogdb \"MATCH (n) RETURN n\" --json
  opengraphdb import my.ogdb data.csv
  opengraphdb shell my.ogdb
  opengraphdb serve my.ogdb --bolt

Docs: https://github.com/openGraphDB/openGraphDB
Issues: https://github.com/openGraphDB/openGraphDB/issues")]
struct Cli {
    #[arg(
        long = "format",
        global = true,
        value_enum,
        help = "Output format for commands that support machine-readable rendering"
    )]
    output_format: Option<QueryOutputFormat>,
    #[arg(long = "json", global = true, help = "Shorthand for --format json")]
    json: bool,
    #[arg(
        long = "db",
        global = true,
        value_name = "path",
        help = "Database path (alternative to positional <path> on commands)"
    )]
    db_path: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Clone, Subcommand)]
enum Commands {
    #[command(about = "Initialize a new database")]
    Init(InitCommand),
    #[command(about = "Show database file metadata")]
    Info(DbPathCommand),
    #[command(about = "Execute a Cypher query")]
    Query(QueryCommand),
    #[command(about = "Open an interactive Cypher shell")]
    Shell(ShellCommand),
    #[command(about = "Import graph data from CSV, JSON, or JSONL")]
    Import(ImportCommand),
    #[command(about = "Export graph data to CSV, JSON, or JSONL")]
    Export(ExportCommand),
    #[command(about = "Apply schema evolution from a migration script")]
    Migrate(MigrateCommand),
    #[command(name = "import-rdf", about = "Import RDF data into the graph")]
    ImportRdf(ImportRdfCommand),
    #[command(name = "export-rdf", about = "Export graph data as RDF")]
    ExportRdf(ExportRdfCommand),
    #[command(
        name = "validate-shacl",
        about = "Validate graph data against SHACL shapes"
    )]
    ValidateShacl(ValidateShaclCommand),
    #[command(about = "Create a backup of the database")]
    Backup(BackupCommand),
    #[command(about = "Force a WAL checkpoint")]
    Checkpoint(DbPathCommand),
    #[command(about = "Show schema catalog (labels, edge types, property keys)")]
    Schema(DbPathCommand),
    #[command(about = "Show graph statistics (degree distribution, counts)")]
    Stats(DbPathCommand),
    #[command(about = "Show internal storage metrics")]
    Metrics(DbPathCommand),
    #[command(about = "Run the MCP (Model Context Protocol) server")]
    Mcp(McpCommand),
    #[command(about = "Start a database server (Bolt, HTTP, gRPC, or MCP)")]
    Serve(ServeCommand),
    #[command(
        name = "create-node",
        about = "Create a node with optional labels and properties"
    )]
    CreateNode(CreateNodeCommand),
    #[command(name = "add-edge", about = "Add an edge between two nodes")]
    AddEdge(AddEdgeCommand),
    #[command(about = "List outgoing neighbors of a node")]
    Neighbors(NeighborsCommand),
    #[command(about = "List incoming neighbors of a node")]
    Incoming(IncomingCommand),
    #[command(about = "Traverse outgoing edges up to N hops")]
    Hop(HopCommand),
    #[command(name = "hop-in", about = "Traverse incoming edges up to N hops")]
    HopIn(HopInCommand),
}

#[derive(Debug, Clone, Args)]
struct InitCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
    #[arg(
        long,
        default_value_t = 4096,
        value_name = "BYTES",
        value_parser = parse_page_size,
        help = "Page size in bytes (must be a power of two, >= 64)"
    )]
    page_size: u32,
}

#[derive(Debug, Clone, Args)]
struct DbPathCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
}

#[derive(Debug, Clone, Args)]
struct QueryCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "query", help = "Cypher query string")]
    query: Option<String>,
    #[arg(value_name = "query-rest", hide = true)]
    query_tail: Vec<String>,
}

#[derive(Debug, Clone, Args)]
struct ShellCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
    #[arg(
        long,
        value_name = "q1;q2;...",
        help = "Execute semicolon-separated queries non-interactively"
    )]
    commands: Option<String>,
    #[arg(long, value_name = "path", help = "Execute queries from a script file")]
    script: Option<String>,
}

#[derive(Debug, Clone, Args)]
struct ImportCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(
        value_name = "src-path",
        help = "Source file to import (CSV, JSON, or JSONL)"
    )]
    src_path: String,
    #[arg(
        long,
        value_name = "N",
        default_value_t = 10_000,
        value_parser = parse_batch_size,
        help = "Number of records per transaction batch"
    )]
    batch_size: usize,
    #[arg(long, action = ArgAction::SetTrue, help = "Skip records that fail instead of aborting")]
    continue_on_error: bool,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        conflicts_with = "continue_on_error",
        help = "All-or-nothing: roll back the entire import if any record fails"
    )]
    atomic: bool,
}

#[derive(Debug, Clone, Args)]
struct ExportCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "dst-path", help = "Destination file path")]
    dst_path: String,
    #[arg(long, value_name = "LABEL", help = "Export only nodes with this label")]
    label: Option<String>,
    #[arg(
        long = "edge-type",
        value_name = "TYPE",
        help = "Export only edges of this type"
    )]
    edge_type: Option<String>,
    #[arg(
        long = "node-id-range",
        value_name = "START:END",
        help = "Export only nodes in this ID range"
    )]
    node_id_range: Option<String>,
}

#[derive(Debug, Clone, Args)]
struct MigrateCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "script-path", help = "Migration script file path")]
    script_path: String,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        help = "Preview planned changes without applying"
    )]
    dry_run: bool,
}

#[derive(Debug, Clone, Args)]
struct ImportRdfCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "src-path", help = "Source RDF file to import")]
    src_path: String,
    #[arg(
        long = "rdf-format",
        value_enum,
        help = "RDF serialization format (auto-detected from extension if omitted)"
    )]
    format: Option<RdfImportFormatArg>,
    #[arg(
        long = "base-uri",
        value_name = "URI",
        help = "Base URI for resolving relative IRIs"
    )]
    base_uri: Option<String>,
    #[arg(long = "schema-only", action = ArgAction::SetTrue, help = "Import only ontology/schema triples, skip instance data")]
    schema_only: bool,
    #[arg(
        long,
        value_name = "N",
        default_value_t = 10_000,
        value_parser = parse_batch_size,
        help = "Number of records per transaction batch"
    )]
    batch_size: usize,
    #[arg(long, action = ArgAction::SetTrue, help = "Skip records that fail instead of aborting")]
    continue_on_error: bool,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        conflicts_with = "continue_on_error",
        help = "All-or-nothing: roll back the entire import if any record fails"
    )]
    atomic: bool,
}

#[derive(Debug, Clone, Args)]
struct ExportRdfCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "dst-path", help = "Destination RDF file path")]
    dst_path: String,
    #[arg(
        long = "rdf-format",
        value_enum,
        help = "RDF serialization format (auto-detected from extension if omitted)"
    )]
    format: Option<RdfExportFormatArg>,
}

#[derive(Debug, Clone, Args)]
struct ValidateShaclCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(
        value_name = "shapes-path",
        help = "Path to SHACL shapes file (Turtle format)"
    )]
    shapes_path: String,
}

#[derive(Debug, Clone, Args)]
struct BackupCommand {
    #[arg(value_name = "src-path", help = "Source database file path")]
    src_path: String,
    #[arg(value_name = "dst-path", help = "Destination backup file path")]
    dst_path: String,
    #[arg(long, action = ArgAction::SetTrue, help = "Back up while the database is open (hot backup)")]
    online: bool,
    #[arg(long, action = ArgAction::SetTrue, requires = "online", help = "Compact the backup to reclaim space (requires --online)")]
    compact: bool,
}

#[derive(Debug, Clone, Args)]
#[command(group(ArgGroup::new("mode").args(["request", "stdio"]).required(true)))]
struct McpCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
    #[arg(
        long,
        value_name = "JSON_RPC_REQUEST",
        conflicts_with = "stdio",
        help = "Execute a single JSON-RPC request and exit"
    )]
    request: Option<String>,
    #[arg(long, action = ArgAction::SetTrue, conflicts_with = "request", help = "Run as a stdio JSON-RPC server (for MCP clients)")]
    stdio: bool,
    #[arg(
        long,
        value_name = "N",
        requires = "stdio",
        value_parser = clap::value_parser!(u64).range(1..),
        help = "Stop after processing N requests (stdio mode only)"
    )]
    max_requests: Option<u64>,
}

#[derive(Debug, Clone, Args)]
struct ServeCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
    #[arg(
        long,
        value_name = "ADDR",
        help = "Bind address with port (e.g. 127.0.0.1:8080)"
    )]
    bind: Option<String>,
    #[arg(
        long,
        value_name = "PORT",
        conflicts_with = "bind",
        value_parser = clap::value_parser!(u16).range(1..),
        help = "Listen port [default: 7687 bolt/mcp, 8080 http, 7689 grpc]"
    )]
    port: Option<u16>,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        conflicts_with_all = ["http", "grpc"],
        help = "Use the Bolt wire protocol"
    )]
    bolt: bool,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        conflicts_with_all = ["bolt", "grpc"],
        help = "Use the HTTP/JSON query protocol"
    )]
    http: bool,
    #[arg(
        long,
        action = ArgAction::SetTrue,
        conflicts_with_all = ["bolt", "http"],
        help = "Use the gRPC protocol (requires --features grpc)"
    )]
    grpc: bool,
    #[arg(long, value_name = "N", value_parser = clap::value_parser!(u64).range(1..), help = "Stop after processing N requests")]
    max_requests: Option<u64>,
}

#[derive(Debug, Clone, Args)]
struct CreateNodeCommand {
    #[arg(
        value_name = "path",
        required_unless_present = "db_path",
        help = "Database file path"
    )]
    path: Option<String>,
    #[arg(long, value_name = "l1,l2,...", help = "Comma-separated node labels")]
    labels: Option<String>,
    #[arg(
        long,
        value_name = "k=type:value;...",
        help = "Properties (e.g. \"name=string:Alice;age=i64:30\")"
    )]
    props: Option<String>,
}

#[derive(Debug, Clone, Args)]
struct AddEdgeCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "src", help = "Source node ID")]
    src: u64,
    #[arg(value_name = "dst", help = "Destination node ID")]
    dst: u64,
    #[arg(long = "type", value_name = "EDGE_TYPE", help = "Edge type label")]
    edge_type: Option<String>,
    #[arg(
        long,
        value_name = "k=type:value;...",
        help = "Properties (e.g. \"weight=f64:1.5\")"
    )]
    props: Option<String>,
}

#[derive(Debug, Clone, Args)]
struct NeighborsCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "src", help = "Source node ID")]
    src: u64,
}

#[derive(Debug, Clone, Args)]
struct IncomingCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "dst", help = "Destination node ID")]
    dst: u64,
}

#[derive(Debug, Clone, Args)]
struct HopCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "src", help = "Starting node ID")]
    src: u64,
    #[arg(value_name = "hops", help = "Number of hops to traverse")]
    hops: u32,
}

#[derive(Debug, Clone, Args)]
struct HopInCommand {
    #[arg(value_name = "path", help = "Database file path")]
    path: String,
    #[arg(value_name = "dst", help = "Target node ID")]
    dst: u64,
    #[arg(value_name = "hops", help = "Number of hops to traverse")]
    hops: u32,
}

fn parse_page_size(raw: &str) -> Result<u32, String> {
    let page_size = raw
        .parse::<u32>()
        .map_err(|_| "invalid value".to_string())?;
    if page_size < 64 || !page_size.is_power_of_two() {
        return Err("must be a power of two and >= 64".to_string());
    }
    Ok(page_size)
}

fn parse_batch_size(raw: &str) -> Result<usize, String> {
    let batch_size = raw
        .parse::<usize>()
        .map_err(|_| "invalid value".to_string())?;
    if batch_size == 0 {
        return Err("must be >= 1".to_string());
    }
    Ok(batch_size)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

impl CliResult {
    fn ok(msg: impl Into<String>) -> Self {
        Self {
            exit_code: 0,
            stdout: msg.into(),
            stderr: String::new(),
        }
    }

    fn user_error(msg: impl Into<String>) -> Self {
        Self {
            exit_code: 2,
            stdout: String::new(),
            stderr: msg.into(),
        }
    }

    fn runtime_error(msg: impl Into<String>) -> Self {
        Self {
            exit_code: 1,
            stdout: String::new(),
            stderr: msg.into(),
        }
    }

    fn runtime_error_with_stdout(stdout: impl Into<String>, stderr: impl Into<String>) -> Self {
        Self {
            exit_code: 1,
            stdout: stdout.into(),
            stderr: stderr.into(),
        }
    }
}

#[derive(Debug)]
pub enum CliError {
    Usage(String),
    Runtime(String),
    RuntimeWithStdout { stdout: String, stderr: String },
}

impl Display for CliError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Usage(msg) | Self::Runtime(msg) => write!(f, "{msg}"),
            Self::RuntimeWithStdout { stderr, .. } => write!(f, "{stderr}"),
        }
    }
}

impl Error for CliError {}

impl From<DbError> for CliError {
    fn from(value: DbError) -> Self {
        Self::Runtime(value.to_string())
    }
}

pub fn usage() -> String {
    let mut cmd = Cli::command();
    cmd.render_help().to_string()
}

fn resolve_db_path(
    local_path: Option<String>,
    global_db: Option<&str>,
) -> Result<String, CliError> {
    local_path
        .or_else(|| global_db.map(str::to_string))
        .ok_or_else(|| {
            CliError::Usage("database path required: provide <path> or --db".to_string())
        })
}

fn missing_required_arguments(message: &str) -> Vec<String> {
    let marker = "the following required arguments were not provided:";
    let Some(start) = message.find(marker) else {
        return Vec::new();
    };

    let mut missing = Vec::<String>::new();
    let mut collected_any = false;
    for line in message[start + marker.len()..].lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if collected_any {
                break;
            }
            continue;
        }
        if trimmed.starts_with("usage:") || trimmed.starts_with("Usage:") {
            break;
        }
        if trimmed.starts_with('<') || trimmed.starts_with("--") {
            collected_any = true;
            missing.push(trimmed.to_string());
        }
    }
    missing
}

fn parse_error_is_missing_only_path(message: &str) -> bool {
    let missing = missing_required_arguments(message);
    missing.len() == 1 && missing[0] == "<path>"
}

fn contains_db_flag(args: &[String]) -> bool {
    args.iter()
        .any(|arg| arg == "--db" || arg.starts_with("--db="))
}

fn extract_db_flag_value(args: &[String]) -> Option<String> {
    for (idx, arg) in args.iter().enumerate() {
        if let Some(value) = arg.strip_prefix("--db=") {
            return Some(value.to_string());
        }
        if arg == "--db" {
            return args.get(idx + 1).cloned();
        }
    }
    None
}

fn find_subcommand_index(args: &[String]) -> Option<usize> {
    let mut idx = 0usize;
    while idx < args.len() {
        let token = args[idx].as_str();
        match token {
            "--db" | "--format" => {
                idx = idx.saturating_add(2);
            }
            _ if token.starts_with("--db=") || token.starts_with("--format=") => {
                idx = idx.saturating_add(1);
            }
            _ if token.starts_with('-') => return None,
            _ => return Some(idx),
        }
    }
    None
}

fn subcommand_supports_db_path_injection(name: &str) -> bool {
    matches!(
        name,
        "query"
            | "import"
            | "export"
            | "migrate"
            | "import-rdf"
            | "export-rdf"
            | "validate-shacl"
            | "add-edge"
            | "neighbors"
            | "incoming"
            | "hop"
            | "hop-in"
    )
}

fn try_parse_with_injected_db_path(args: &[String]) -> Option<Cli> {
    let db_path = extract_db_flag_value(args)?;
    let subcommand_idx = find_subcommand_index(args)?;
    if !subcommand_supports_db_path_injection(args[subcommand_idx].as_str()) {
        return None;
    }

    let mut injected = args.to_vec();
    injected.insert(subcommand_idx + 1, db_path);
    let argv = std::iter::once(APP_NAME.to_string()).chain(injected);
    Cli::try_parse_from(argv).ok()
}

fn parse_cli(args: &[String]) -> Result<Cli, CliResult> {
    let argv = std::iter::once(APP_NAME.to_string()).chain(args.iter().cloned());
    match Cli::try_parse_from(argv) {
        Ok(cli) => Ok(cli),
        Err(err) => {
            let kind = err.kind();
            if kind == clap::error::ErrorKind::MissingRequiredArgument {
                if let Some(reparsed) = try_parse_with_injected_db_path(args) {
                    return Ok(reparsed);
                }

                let message = err.to_string();
                if !contains_db_flag(args) && parse_error_is_missing_only_path(&message) {
                    return Err(CliResult::user_error(
                        "database path required: provide <path> or --db",
                    ));
                }
            }
            let message = err.to_string().trim_end().replace("Usage:", "usage:");
            if matches!(
                kind,
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion
            ) {
                Err(CliResult::ok(message))
            } else {
                Err(CliResult::user_error(message))
            }
        }
    }
}

pub fn run(args: &[String]) -> CliResult {
    let normalized_args = normalize_rdf_format_alias(args);
    let cli = match parse_cli(&normalized_args) {
        Ok(cli) => cli,
        Err(result) => return result,
    };

    match run_inner(cli) {
        Ok(output) => CliResult::ok(output),
        Err(CliError::Usage(msg)) => CliResult::user_error(msg),
        Err(CliError::Runtime(msg)) => CliResult::runtime_error(msg),
        Err(CliError::RuntimeWithStdout { stdout, stderr }) => {
            CliResult::runtime_error_with_stdout(stdout, stderr)
        }
    }
}

fn normalize_rdf_format_alias(args: &[String]) -> Vec<String> {
    let mut normalized = args.to_vec();
    let mut in_rdf_command = false;
    for arg in &mut normalized {
        if arg == "import-rdf" || arg == "export-rdf" {
            in_rdf_command = true;
            continue;
        }
        if in_rdf_command && arg == "--format" {
            *arg = "--rdf-format".to_string();
        }
    }
    normalized
}

fn run_inner(cli: Cli) -> Result<String, CliError> {
    let Cli {
        output_format,
        json,
        db_path,
        command,
    } = cli;
    let output_format = if json {
        Some(output_format.unwrap_or(QueryOutputFormat::Json))
    } else {
        output_format
    };
    let import_export_format = output_format;
    let output_format = output_format.unwrap_or(QueryOutputFormat::Table);
    let global_db = db_path.as_deref();

    match command {
        Commands::Init(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_init(&path, cmd.page_size)
        }
        Commands::Info(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_info(&path, output_format)
        }
        Commands::Metrics(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_metrics(&path, output_format)
        }
        Commands::Stats(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_stats(&path, output_format)
        }
        Commands::Schema(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_schema(&path, output_format)
        }
        Commands::Checkpoint(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_checkpoint(&path)
        }
        Commands::Backup(cmd) => {
            handle_backup(&cmd.src_path, &cmd.dst_path, cmd.online, cmd.compact)
        }
        Commands::Query(cmd) => {
            let (path, query) = resolve_query_path_and_text(cmd, global_db)?;
            handle_query(&path, &query, output_format)
        }
        Commands::Shell(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_shell(
                &path,
                cmd.commands.as_deref(),
                cmd.script.as_deref(),
                output_format,
            )
        }
        Commands::Mcp(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_mcp(&path, cmd.request.as_deref(), cmd.stdio, cmd.max_requests)
        }
        Commands::Serve(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_serve(
                &path,
                cmd.bind.as_deref(),
                cmd.port,
                cmd.max_requests,
                cmd.bolt,
                cmd.http,
                cmd.grpc,
            )
        }
        Commands::Import(cmd) => handle_import(
            &cmd.path,
            &cmd.src_path,
            import_export_format,
            cmd.batch_size,
            cmd.continue_on_error,
            cmd.atomic,
        ),
        Commands::Export(cmd) => handle_export(
            &cmd.path,
            &cmd.dst_path,
            import_export_format,
            cmd.label.as_deref(),
            cmd.edge_type.as_deref(),
            cmd.node_id_range.as_deref(),
        ),
        Commands::Migrate(cmd) => handle_migrate(&cmd.path, &cmd.script_path, cmd.dry_run),
        Commands::ImportRdf(cmd) => handle_import_rdf(
            &cmd.path,
            &cmd.src_path,
            ImportRdfOptions {
                format_hint: cmd.format,
                base_uri: cmd.base_uri,
                schema_only: cmd.schema_only,
                batch_size: cmd.batch_size,
                continue_on_error: cmd.continue_on_error,
                atomic: cmd.atomic,
            },
        ),
        Commands::ExportRdf(cmd) => handle_export_rdf(&cmd.path, &cmd.dst_path, cmd.format),
        Commands::ValidateShacl(cmd) => {
            handle_validate_shacl(&cmd.path, Path::new(&cmd.shapes_path))
        }
        Commands::CreateNode(cmd) => {
            let path = resolve_db_path(cmd.path, global_db)?;
            handle_create_node(&path, cmd.labels.as_deref(), cmd.props.as_deref())
        }
        Commands::AddEdge(cmd) => handle_add_edge(
            &cmd.path,
            cmd.src,
            cmd.dst,
            cmd.edge_type.as_deref(),
            cmd.props.as_deref(),
        ),
        Commands::Neighbors(cmd) => handle_neighbors(&cmd.path, cmd.src, output_format),
        Commands::Incoming(cmd) => handle_incoming(&cmd.path, cmd.dst, output_format),
        Commands::HopIn(cmd) => handle_hop_in(&cmd.path, cmd.dst, cmd.hops, output_format),
        Commands::Hop(cmd) => handle_hop(&cmd.path, cmd.src, cmd.hops, output_format),
    }
}

fn resolve_query_path_and_text(
    cmd: QueryCommand,
    global_db: Option<&str>,
) -> Result<(String, String), CliError> {
    let mut local_path = Some(cmd.path);
    let mut query_parts = Vec::<String>::new();

    // When --db is supplied and only one positional token is passed, treat that token as query.
    if global_db.is_some() && cmd.query.is_none() && cmd.query_tail.is_empty() {
        if let Some(query) = local_path.take() {
            query_parts.push(query);
        }
    } else if let Some(query) = cmd.query {
        query_parts.push(query);
    }
    query_parts.extend(cmd.query_tail);

    let path = resolve_db_path(local_path, global_db)?;
    Ok((path, query_parts.join(" ")))
}

fn handle_init(path: &str, page_size: u32) -> Result<String, CliError> {
    let header = Header {
        format_version: 1,
        page_size,
        next_node_id: 0,
        edge_count: 0,
    };
    let db = Database::init(path, header)?;
    Ok(format!(
        "initialized {} (format_version={}, page_size={})",
        db.path().display(),
        db.header().format_version,
        db.header().page_size
    ))
}

fn handle_info(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Info)?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let page_count = db.page_count()?;
    Ok(format!(
        "path={}
format_version={}
page_size={}
page_count={}
node_count={}
edge_count={}
total_nodes={}
total_edges={}",
        db.path().display(),
        db.header().format_version,
        db.header().page_size,
        page_count,
        db.node_count(),
        db.edge_count(),
        db.node_count(),
        db.edge_count()
    ))
}

fn handle_metrics(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Metrics)?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let metrics = db.metrics()?;
    Ok(format!(
        "path={}
format_version={}
page_size={}
page_count={}
node_count={}
edge_count={}
wal_size_bytes={}
adjacency_base_edge_count={}
delta_buffer_edge_count={}",
        db.path().display(),
        metrics.format_version,
        metrics.page_size,
        metrics.page_count,
        metrics.node_count,
        metrics.edge_count,
        metrics.wal_size_bytes,
        metrics.adjacency_base_edge_count,
        metrics.delta_buffer_edge_count
    ))
}

fn handle_stats(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Stats)?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let stats = db.out_degree_stats()?;
    let max_node = stats
        .max_out_degree_node
        .map(|id| id.to_string())
        .unwrap_or_else(|| "none".to_string());
    Ok(format!(
        "path={}
node_count={}
edge_count={}
zero_out_degree_nodes={}
max_out_degree={}
max_out_degree_node={}
avg_out_degree={:.6}",
        db.path().display(),
        stats.node_count,
        stats.edge_count,
        stats.zero_out_degree_nodes,
        stats.max_out_degree,
        max_node,
        stats.avg_out_degree
    ))
}

fn handle_schema(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Schema)?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let schema = db.schema_catalog();
    Ok(format!(
        "path={}
model=property_graph_minimal
node_labels={}
edge_types={}
property_keys={}
node_count={}
edge_count={}",
        db.path().display(),
        schema.labels.len(),
        schema.edge_types.len(),
        schema.property_keys.len(),
        db.node_count(),
        db.edge_count()
    ))
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MigrationAction {
    AddLabel(String),
    DropLabel(String),
    AddEdgeType(String),
    DropEdgeType(String),
    AddPropertyKey(String),
    DropPropertyKey(String),
    AddIndex { label: String, property_key: String },
    DropIndex { label: String, property_key: String },
}

impl Display for MigrationAction {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AddLabel(label) => write!(f, "ADD LABEL {label}"),
            Self::DropLabel(label) => write!(f, "DROP LABEL {label}"),
            Self::AddEdgeType(edge_type) => write!(f, "ADD EDGE_TYPE {edge_type}"),
            Self::DropEdgeType(edge_type) => write!(f, "DROP EDGE_TYPE {edge_type}"),
            Self::AddPropertyKey(key) => write!(f, "ADD PROPERTY_KEY {key}"),
            Self::DropPropertyKey(key) => write!(f, "DROP PROPERTY_KEY {key}"),
            Self::AddIndex {
                label,
                property_key,
            } => write!(f, "ADD INDEX ON :{label}({property_key})"),
            Self::DropIndex {
                label,
                property_key,
            } => write!(f, "DROP INDEX ON :{label}({property_key})"),
        }
    }
}

#[derive(Debug, Clone)]
struct MigrationFileSnapshot {
    path: PathBuf,
    bytes: Option<Vec<u8>>,
}

impl MigrationFileSnapshot {
    fn capture(path: PathBuf) -> Result<Self, CliError> {
        let bytes = if path.exists() {
            Some(fs::read(&path).map_err(|e| {
                CliError::Runtime(format!(
                    "failed to snapshot migration file '{}': {e}",
                    path.display()
                ))
            })?)
        } else {
            None
        };
        Ok(Self { path, bytes })
    }

    fn restore(&self) -> Result<(), CliError> {
        match &self.bytes {
            Some(bytes) => fs::write(&self.path, bytes).map_err(|e| {
                CliError::Runtime(format!(
                    "failed to restore migration file '{}': {e}",
                    self.path.display()
                ))
            }),
            None => {
                if self.path.exists() {
                    fs::remove_file(&self.path).map_err(|e| {
                        CliError::Runtime(format!(
                            "failed to remove migration sidecar '{}': {e}",
                            self.path.display()
                        ))
                    })?;
                }
                Ok(())
            }
        }
    }
}

fn migration_wal_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-wal", path.display()))
}

fn migration_meta_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-meta.json", path.display()))
}

fn capture_migration_snapshots(db_path: &Path) -> Result<Vec<MigrationFileSnapshot>, CliError> {
    Ok(vec![
        MigrationFileSnapshot::capture(db_path.to_path_buf())?,
        MigrationFileSnapshot::capture(migration_wal_path(db_path))?,
        MigrationFileSnapshot::capture(migration_meta_path(db_path))?,
    ])
}

fn restore_migration_snapshots(snapshots: &[MigrationFileSnapshot]) -> Result<(), String> {
    let mut errors = Vec::<String>::new();
    for snapshot in snapshots {
        if let Err(err) = snapshot.restore() {
            errors.push(err.to_string());
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn parse_named_migration_identifier(
    line: &str,
    line_no: usize,
    directive_name: &str,
    value_start: usize,
) -> Result<String, CliError> {
    let name = line[value_start..].trim();
    if name.is_empty() {
        return Err(CliError::Runtime(format!(
            "line {line_no}: {directive_name} requires a name"
        )));
    }
    Ok(name.to_string())
}

fn parse_migration_script(content: &str) -> Result<Vec<MigrationAction>, CliError> {
    let mut actions = Vec::<MigrationAction>::new();
    for (index, line) in content.lines().enumerate() {
        let line_no = index + 1;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("//") {
            continue;
        }

        let upper = trimmed.to_ascii_uppercase();
        let action = if upper.starts_with("ADD LABEL ") {
            MigrationAction::AddLabel(parse_named_migration_identifier(
                trimmed,
                line_no,
                "ADD LABEL",
                10,
            )?)
        } else if upper.starts_with("DROP LABEL ") {
            MigrationAction::DropLabel(parse_named_migration_identifier(
                trimmed,
                line_no,
                "DROP LABEL",
                11,
            )?)
        } else if upper.starts_with("ADD EDGE_TYPE ") {
            MigrationAction::AddEdgeType(parse_named_migration_identifier(
                trimmed,
                line_no,
                "ADD EDGE_TYPE",
                14,
            )?)
        } else if upper.starts_with("DROP EDGE_TYPE ") {
            MigrationAction::DropEdgeType(parse_named_migration_identifier(
                trimmed,
                line_no,
                "DROP EDGE_TYPE",
                15,
            )?)
        } else if upper.starts_with("ADD PROPERTY_KEY ") {
            MigrationAction::AddPropertyKey(parse_named_migration_identifier(
                trimmed,
                line_no,
                "ADD PROPERTY_KEY",
                17,
            )?)
        } else if upper.starts_with("DROP PROPERTY_KEY ") {
            MigrationAction::DropPropertyKey(parse_named_migration_identifier(
                trimmed,
                line_no,
                "DROP PROPERTY_KEY",
                18,
            )?)
        } else if upper.starts_with("ADD INDEX ON ") {
            let (label, property_key) = parse_index_target(&trimmed[13..]).ok_or_else(|| {
                CliError::Runtime(format!(
                    "line {line_no}: invalid ADD INDEX syntax. Expected: ADD INDEX ON :Label(property)"
                ))
            })?;
            MigrationAction::AddIndex {
                label,
                property_key,
            }
        } else if upper.starts_with("DROP INDEX ON ") {
            let (label, property_key) = parse_index_target(&trimmed[14..]).ok_or_else(|| {
                CliError::Runtime(format!(
                    "line {line_no}: invalid DROP INDEX syntax. Expected: DROP INDEX ON :Label(property)"
                ))
            })?;
            MigrationAction::DropIndex {
                label,
                property_key,
            }
        } else {
            return Err(CliError::Runtime(format!(
                "line {line_no}: unrecognized directive: {trimmed}"
            )));
        };
        actions.push(action);
    }
    Ok(actions)
}

fn parse_index_target(raw: &str) -> Option<(String, String)> {
    let with_label = raw.trim().strip_prefix(':')?.trim_start();
    let open_paren = with_label.find('(')?;
    let close_paren = with_label.rfind(')')?;
    if close_paren <= open_paren + 1 || !with_label[close_paren + 1..].trim().is_empty() {
        return None;
    }

    let label = with_label[..open_paren].trim();
    let property_key = with_label[open_paren + 1..close_paren].trim();
    if label.is_empty() || property_key.is_empty() {
        return None;
    }
    if property_key.contains('(') || property_key.contains(')') {
        return None;
    }

    Some((label.to_string(), property_key.to_string()))
}

fn apply_migration_action(db: &mut Database, action: &MigrationAction) -> Result<(), DbError> {
    match action {
        MigrationAction::AddLabel(name) => db.register_schema_label(name),
        MigrationAction::DropLabel(name) => db.unregister_schema_label(name).map(|_| ()),
        MigrationAction::AddEdgeType(name) => db.register_schema_edge_type(name),
        MigrationAction::DropEdgeType(name) => db.unregister_schema_edge_type(name).map(|_| ()),
        MigrationAction::AddPropertyKey(name) => db.register_schema_property_key(name),
        MigrationAction::DropPropertyKey(name) => {
            db.unregister_schema_property_key(name).map(|_| ())
        }
        MigrationAction::AddIndex {
            label,
            property_key,
        } => db.create_index(label, property_key),
        MigrationAction::DropIndex {
            label,
            property_key,
        } => db.drop_index(label, property_key),
    }
}

fn handle_migrate(db_path: &str, script_path: &str, dry_run: bool) -> Result<String, CliError> {
    let script = fs::read_to_string(script_path).map_err(|e| {
        CliError::Runtime(format!(
            "failed to read migration script '{}': {e}",
            script_path
        ))
    })?;
    let actions = parse_migration_script(&script)?;
    if actions.is_empty() {
        return Ok("migration script contains no actions".to_string());
    }

    if dry_run {
        let mut lines = Vec::<String>::new();
        for action in &actions {
            lines.push(format!("[DRY-RUN] {action}"));
        }
        lines.push(format!("{} action(s) would be applied", actions.len()));
        return Ok(lines.join("\n"));
    }

    if !Path::new(db_path).exists() {
        return Err(CliError::Runtime(format!(
            "error: database not found at '{db_path}'. Run 'ogdb init <path>' first."
        )));
    }

    let snapshots = capture_migration_snapshots(Path::new(db_path))?;
    let mut db = Database::open(db_path)
        .map_err(|e| CliError::Runtime(format!("failed to open database: {e}")))?;
    let mut output = Vec::<String>::new();
    let mut applied = 0usize;

    for (idx, action) in actions.iter().enumerate() {
        if let Err(err) = apply_migration_action(&mut db, action) {
            drop(db);
            let rollback = restore_migration_snapshots(&snapshots).err();
            let mut message = format!("migration failed at action {}: {action}: {err}", idx + 1);
            if let Some(restore_err) = rollback {
                message.push_str(&format!("\nrollback restore failed: {restore_err}"));
            }
            return Err(CliError::Runtime(message));
        }
        output.push(format!("[APPLIED] {action}"));
        applied = applied.saturating_add(1);
    }

    output.push(format!("{applied} action(s) applied successfully"));
    Ok(output.join("\n"))
}

fn handle_checkpoint(path: &str) -> Result<String, CliError> {
    let mut db = Database::open(path)?;
    db.checkpoint()?;
    Ok(format!("checkpointed {}", db.path().display()))
}

fn handle_backup(
    src_path: &str,
    dst_path: &str,
    online: bool,
    compact: bool,
) -> Result<String, CliError> {
    let mut db = Database::open(src_path)?;
    if online {
        if compact {
            db.backup_online_compact(dst_path, |_copied, _total| {})?;
        } else {
            db.backup_online(dst_path, |_copied, _total| {})?;
        }
    } else {
        db.backup(dst_path)?;
    }
    Ok(format!(
        "backup_created src={} dst={}",
        db.path().display(),
        dst_path
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum QueryOutputFormat {
    Table,
    Json,
    Jsonl,
    Csv,
    Tsv,
}

impl QueryOutputFormat {
    fn parse(raw: &str) -> Result<Self, CliError> {
        match raw.to_ascii_lowercase().as_str() {
            "table" => Ok(Self::Table),
            "json" => Ok(Self::Json),
            "jsonl" => Ok(Self::Jsonl),
            "csv" => Ok(Self::Csv),
            "tsv" => Ok(Self::Tsv),
            _ => Err(CliError::Usage(format!(
                "unsupported --format value: {raw} (expected table|json|jsonl|csv|tsv)"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum QueryPlan {
    Info,
    Metrics,
    Stats,
    Schema,
    FindNodesByProperty { key: String, value: PropertyValue },
    FindNodesByLabel { label: String },
    Neighbors(u64),
    Incoming(u64),
    Hop(u64, u32),
    HopIn(u64, u32),
    CreateNode,
    AddEdge(u64, u64),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct QueryRows {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

impl QueryRows {
    fn row_count(&self) -> usize {
        self.rows.len()
    }

    fn row_objects(&self) -> Vec<Value> {
        self.rows
            .iter()
            .map(|row| {
                let mut map = Map::<String, Value>::new();
                for (col, value) in self.columns.iter().zip(row.iter()) {
                    map.insert(col.clone(), Value::String(value.clone()));
                }
                Value::Object(map)
            })
            .collect()
    }

    fn render_json(&self) -> String {
        serde_json::to_string_pretty(&serde_json::json!({
            "columns": self.columns,
            "rows": self.row_objects(),
            "row_count": self.row_count(),
        }))
        .expect("json rendering should not fail")
    }

    fn render_jsonl(&self) -> String {
        self.row_objects()
            .iter()
            .map(|row| serde_json::to_string(row).expect("jsonl rendering should not fail"))
            .collect::<Vec<String>>()
            .join("\n")
    }

    fn render_delimited(&self, delimiter: char) -> String {
        let mut lines = Vec::<String>::new();
        lines.push(self.columns.join(&delimiter.to_string()));
        for row in &self.rows {
            let rendered = row
                .iter()
                .map(|cell| escape_delimited_cell(cell, delimiter))
                .collect::<Vec<String>>()
                .join(&delimiter.to_string());
            lines.push(rendered);
        }
        lines.join("\n")
    }

    fn render(&self, format: QueryOutputFormat) -> String {
        match format {
            QueryOutputFormat::Table => String::new(),
            QueryOutputFormat::Json => self.render_json(),
            QueryOutputFormat::Jsonl => self.render_jsonl(),
            QueryOutputFormat::Csv => self.render_delimited(','),
            QueryOutputFormat::Tsv => self.render_delimited('\t'),
        }
    }
}

fn query_result_as_rows(result: &QueryResult) -> QueryRows {
    let mut rows = Vec::<Vec<String>>::new();
    for batch in &result.batches {
        let row_count = batch
            .columns
            .values()
            .next()
            .map(|column| column.len())
            .unwrap_or(0);
        for row_idx in 0..row_count {
            let mut row = Vec::<String>::new();
            for column in &result.columns {
                let value = batch
                    .columns
                    .get(column)
                    .and_then(|values| values.get(row_idx))
                    .map(format_property_value)
                    .unwrap_or_else(|| "string:null".to_string());
                row.push(value);
            }
            rows.push(row);
        }
    }
    QueryRows {
        columns: result.columns.clone(),
        rows,
    }
}

fn escape_delimited_cell(cell: &str, delimiter: char) -> String {
    if cell.contains(delimiter) || cell.contains('"') || cell.contains('\n') {
        format!("\"{}\"", cell.replace('"', "\"\""))
    } else {
        cell.to_string()
    }
}

fn parse_query_plan(query: &str) -> Result<QueryPlan, CliError> {
    let tokens: Vec<&str> = query.split_whitespace().collect();
    if tokens.is_empty() {
        return Err(CliError::Usage("empty query string".to_string()));
    }

    match tokens[0].to_ascii_lowercase().as_str() {
        "info" if tokens.len() == 1 => Ok(QueryPlan::Info),
        "metrics" if tokens.len() == 1 => Ok(QueryPlan::Metrics),
        "stats" if tokens.len() == 1 => Ok(QueryPlan::Stats),
        "schema" if tokens.len() == 1 => Ok(QueryPlan::Schema),
        "find" if tokens.len() == 3 && tokens[1].eq_ignore_ascii_case("nodes") => {
            let (key, value) = parse_property_assignment(tokens[2])?;
            Ok(QueryPlan::FindNodesByProperty { key, value })
        }
        "find"
            if tokens.len() == 4
                && tokens[1].eq_ignore_ascii_case("nodes")
                && tokens[2].eq_ignore_ascii_case("label") =>
        {
            Ok(QueryPlan::FindNodesByLabel {
                label: tokens[3].to_string(),
            })
        }
        "neighbors" if tokens.len() == 2 => {
            Ok(QueryPlan::Neighbors(parse_u64_arg(tokens[1], "<src>")?))
        }
        "incoming" if tokens.len() == 2 => {
            Ok(QueryPlan::Incoming(parse_u64_arg(tokens[1], "<dst>")?))
        }
        "hop" if tokens.len() == 3 => Ok(QueryPlan::Hop(
            parse_u64_arg(tokens[1], "<src>")?,
            parse_u32_arg(tokens[2], "<hops>")?,
        )),
        "hop-in" | "hopin" if tokens.len() == 3 => Ok(QueryPlan::HopIn(
            parse_u64_arg(tokens[1], "<dst>")?,
            parse_u32_arg(tokens[2], "<hops>")?,
        )),
        "create" if tokens.len() == 2 && tokens[1].eq_ignore_ascii_case("node") => {
            Ok(QueryPlan::CreateNode)
        }
        "add" if tokens.len() == 4 && tokens[1].eq_ignore_ascii_case("edge") => {
            Ok(QueryPlan::AddEdge(
                parse_u64_arg(tokens[2], "<src>")?,
                parse_u64_arg(tokens[3], "<dst>")?,
            ))
        }
        _ => Err(CliError::Usage(format!(
            "unsupported query: {query}\n\nsupported query forms:
  info
  metrics
  stats
  schema
  find nodes <key=type:value>
  find nodes label <label>
  neighbors <src>
  incoming <dst>
  hop <src> <hops>
  hop-in <dst> <hops>
  create node
  add edge <src> <dst>"
        ))),
    }
}

fn execute_query_plan_as_rows(db_path: &str, plan: QueryPlan) -> Result<QueryRows, CliError> {
    match plan {
        QueryPlan::Info => {
            let db = Database::open(db_path)?;
            Ok(QueryRows {
                columns: vec![
                    "path".to_string(),
                    "format_version".to_string(),
                    "page_size".to_string(),
                    "page_count".to_string(),
                    "node_count".to_string(),
                    "edge_count".to_string(),
                ],
                rows: vec![vec![
                    db.path().display().to_string(),
                    db.header().format_version.to_string(),
                    db.header().page_size.to_string(),
                    db.page_count()?.to_string(),
                    db.node_count().to_string(),
                    db.edge_count().to_string(),
                ]],
            })
        }
        QueryPlan::Metrics => {
            let db = Database::open(db_path)?;
            let metrics = db.metrics()?;
            Ok(QueryRows {
                columns: vec![
                    "path".to_string(),
                    "format_version".to_string(),
                    "page_size".to_string(),
                    "page_count".to_string(),
                    "node_count".to_string(),
                    "edge_count".to_string(),
                    "wal_size_bytes".to_string(),
                    "adjacency_base_edge_count".to_string(),
                    "delta_buffer_edge_count".to_string(),
                ],
                rows: vec![vec![
                    db.path().display().to_string(),
                    metrics.format_version.to_string(),
                    metrics.page_size.to_string(),
                    metrics.page_count.to_string(),
                    metrics.node_count.to_string(),
                    metrics.edge_count.to_string(),
                    metrics.wal_size_bytes.to_string(),
                    metrics.adjacency_base_edge_count.to_string(),
                    metrics.delta_buffer_edge_count.to_string(),
                ]],
            })
        }
        QueryPlan::Stats => {
            let db = Database::open(db_path)?;
            let stats = db.out_degree_stats()?;
            Ok(QueryRows {
                columns: vec![
                    "path".to_string(),
                    "node_count".to_string(),
                    "edge_count".to_string(),
                    "zero_out_degree_nodes".to_string(),
                    "max_out_degree".to_string(),
                    "max_out_degree_node".to_string(),
                    "avg_out_degree".to_string(),
                ],
                rows: vec![vec![
                    db.path().display().to_string(),
                    stats.node_count.to_string(),
                    stats.edge_count.to_string(),
                    stats.zero_out_degree_nodes.to_string(),
                    stats.max_out_degree.to_string(),
                    stats
                        .max_out_degree_node
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "none".to_string()),
                    stats.avg_out_degree.to_string(),
                ]],
            })
        }
        QueryPlan::Schema => {
            let db = Database::open(db_path)?;
            let schema = db.schema_catalog();
            Ok(QueryRows {
                columns: vec![
                    "path".to_string(),
                    "model".to_string(),
                    "node_labels".to_string(),
                    "edge_types".to_string(),
                    "property_keys".to_string(),
                    "node_count".to_string(),
                    "edge_count".to_string(),
                ],
                rows: vec![vec![
                    db.path().display().to_string(),
                    "property_graph_minimal".to_string(),
                    schema.labels.len().to_string(),
                    schema.edge_types.len().to_string(),
                    schema.property_keys.len().to_string(),
                    db.node_count().to_string(),
                    db.edge_count().to_string(),
                ]],
            })
        }
        QueryPlan::FindNodesByProperty { key, value } => {
            let db = Database::open(db_path)?;
            let matching = db.find_nodes_by_property(&key, &value);
            Ok(QueryRows {
                columns: vec![
                    "property_key".to_string(),
                    "property_value".to_string(),
                    "node_id".to_string(),
                ],
                rows: matching
                    .iter()
                    .map(|node_id| {
                        vec![
                            key.clone(),
                            format_property_value(&value),
                            node_id.to_string(),
                        ]
                    })
                    .collect(),
            })
        }
        QueryPlan::FindNodesByLabel { label } => {
            let db = Database::open(db_path)?;
            let matching = db.find_nodes_by_label(&label);
            Ok(QueryRows {
                columns: vec!["label".to_string(), "node_id".to_string()],
                rows: matching
                    .iter()
                    .map(|node_id| vec![label.clone(), node_id.to_string()])
                    .collect(),
            })
        }
        QueryPlan::Neighbors(src) => {
            let db = Database::open(db_path)?;
            let neighbors = db.neighbors(src)?;
            Ok(QueryRows {
                columns: vec!["src".to_string(), "dst".to_string()],
                rows: neighbors
                    .iter()
                    .map(|dst| vec![src.to_string(), dst.to_string()])
                    .collect(),
            })
        }
        QueryPlan::Incoming(dst) => {
            let db = Database::open(db_path)?;
            let incoming = db.incoming_neighbors(dst)?;
            Ok(QueryRows {
                columns: vec!["dst".to_string(), "src".to_string()],
                rows: incoming
                    .iter()
                    .map(|src| vec![dst.to_string(), src.to_string()])
                    .collect(),
            })
        }
        QueryPlan::Hop(src, hops) => {
            let db = Database::open(db_path)?;
            let levels = db.hop_levels(src, hops)?;
            let mut rows = Vec::<Vec<String>>::new();
            for (idx, level) in levels.iter().enumerate() {
                for node in level {
                    rows.push(vec![
                        src.to_string(),
                        hops.to_string(),
                        (idx + 1).to_string(),
                        node.to_string(),
                    ]);
                }
            }
            Ok(QueryRows {
                columns: vec![
                    "src".to_string(),
                    "hops".to_string(),
                    "level".to_string(),
                    "node".to_string(),
                ],
                rows,
            })
        }
        QueryPlan::HopIn(dst, hops) => {
            let db = Database::open(db_path)?;
            let levels = db.hop_levels_incoming(dst, hops)?;
            let mut rows = Vec::<Vec<String>>::new();
            for (idx, level) in levels.iter().enumerate() {
                for node in level {
                    rows.push(vec![
                        dst.to_string(),
                        hops.to_string(),
                        (idx + 1).to_string(),
                        node.to_string(),
                    ]);
                }
            }
            Ok(QueryRows {
                columns: vec![
                    "dst".to_string(),
                    "hops".to_string(),
                    "level".to_string(),
                    "node".to_string(),
                ],
                rows,
            })
        }
        QueryPlan::CreateNode => {
            let mut db = Database::open(db_path)?;
            let node_id = db.create_node()?;
            Ok(QueryRows {
                columns: vec!["node_id".to_string()],
                rows: vec![vec![node_id.to_string()]],
            })
        }
        QueryPlan::AddEdge(src, dst) => {
            let mut db = Database::open(db_path)?;
            let edge_id = db.add_edge(src, dst)?;
            Ok(QueryRows {
                columns: vec!["edge_id".to_string(), "src".to_string(), "dst".to_string()],
                rows: vec![vec![edge_id.to_string(), src.to_string(), dst.to_string()]],
            })
        }
    }
}

fn execute_legacy_query(db_path: &str, query: &str) -> Result<String, CliError> {
    match parse_query_plan(query)? {
        QueryPlan::Info => handle_info(db_path, QueryOutputFormat::Table),
        QueryPlan::Metrics => handle_metrics(db_path, QueryOutputFormat::Table),
        QueryPlan::Stats => handle_stats(db_path, QueryOutputFormat::Table),
        QueryPlan::Schema => handle_schema(db_path, QueryOutputFormat::Table),
        QueryPlan::FindNodesByProperty { key, value } => {
            let plan = QueryPlan::FindNodesByProperty {
                key: key.clone(),
                value: value.clone(),
            };
            let rows = execute_query_plan_as_rows(db_path, plan)?;
            let nodes = rows
                .rows
                .iter()
                .map(|row| row[2].clone())
                .collect::<Vec<String>>()
                .join(",");
            Ok(format!(
                "property_key={key}\nproperty_value={}\ncount={}\nnode_ids={nodes}",
                format_property_value(&value),
                rows.row_count()
            ))
        }
        QueryPlan::FindNodesByLabel { label } => {
            let plan = QueryPlan::FindNodesByLabel {
                label: label.clone(),
            };
            let rows = execute_query_plan_as_rows(db_path, plan)?;
            let nodes = rows
                .rows
                .iter()
                .map(|row| row[1].clone())
                .collect::<Vec<String>>()
                .join(",");
            Ok(format!(
                "label={label}\ncount={}\nnode_ids={nodes}",
                rows.row_count()
            ))
        }
        QueryPlan::Neighbors(src) => handle_neighbors(db_path, src, QueryOutputFormat::Table),
        QueryPlan::Incoming(dst) => handle_incoming(db_path, dst, QueryOutputFormat::Table),
        QueryPlan::Hop(src, hops) => handle_hop(db_path, src, hops, QueryOutputFormat::Table),
        QueryPlan::HopIn(dst, hops) => handle_hop_in(db_path, dst, hops, QueryOutputFormat::Table),
        QueryPlan::CreateNode => handle_create_node(db_path, None, None),
        QueryPlan::AddEdge(src, dst) => handle_add_edge(db_path, src, dst, None, None),
    }
}

fn render_rows_table(rows: &QueryRows) -> String {
    if rows.columns.is_empty() {
        return format!("row_count={}", rows.row_count());
    }
    let mut lines = Vec::<String>::new();
    lines.push(format!("columns={}", rows.columns.join(",")));
    lines.push(format!("row_count={}", rows.row_count()));
    for row in &rows.rows {
        lines.push(row.join(" | "));
    }
    lines.join("\n")
}

fn should_route_to_cypher(db: &Database, query: &str) -> bool {
    db.parse_cypher(query).is_ok() || query.trim_start().to_ascii_uppercase().starts_with("CALL ")
}

// UNWIND is not yet wired through the physical planner, so a query like
// `UNWIND range(1,100) AS i CREATE (:Person {id: i})` errors out in core
// and nothing gets persisted. Until the planner learns UNWIND, the CLI
// desugars the specific `UNWIND range(A, B) AS <var> <rest>` shape into B-A+1
// simple CREATE statements by substituting <var> with each literal value.
// Returns None when the query isn't this exact shape — caller falls back to
// normal Cypher execution (which will surface the planner error).
fn try_expand_unwind_range_create(query: &str) -> Option<Vec<String>> {
    let rest = consume_keyword(query.trim(), "UNWIND")?;
    let rest = consume_keyword(rest.trim_start(), "range")?;
    let rest = rest.trim_start().strip_prefix('(')?;
    let (start, rest) = parse_leading_i64(rest.trim_start())?;
    let rest = rest.trim_start().strip_prefix(',')?;
    let (end, rest) = parse_leading_i64(rest.trim_start())?;
    let rest = rest.trim_start().strip_prefix(')')?;
    let rest = consume_keyword(rest.trim_start(), "AS")?;
    let (var, rest) = parse_leading_identifier(rest.trim_start())?;
    let body = rest.trim_start();
    if body.is_empty() {
        return None;
    }
    if start > end {
        return None;
    }
    let mut queries = Vec::with_capacity((end - start + 1) as usize);
    for i in start..=end {
        queries.push(substitute_identifier_literal(body, &var, &i.to_string()));
    }
    Some(queries)
}

fn consume_keyword<'a>(input: &'a str, keyword: &str) -> Option<&'a str> {
    let head = input.get(..keyword.len())?;
    if !head.eq_ignore_ascii_case(keyword) {
        return None;
    }
    let rest = &input[keyword.len()..];
    // Keyword must be followed by a non-identifier char (whitespace, '(', etc.)
    // to avoid matching a prefix of a longer identifier like `rangex`.
    match rest.chars().next() {
        None => Some(rest),
        Some(c) if c.is_ascii_alphanumeric() || c == '_' => None,
        _ => Some(rest),
    }
}

fn parse_leading_i64(input: &str) -> Option<(i64, &str)> {
    let bytes = input.as_bytes();
    let mut idx = 0;
    if bytes.first().copied() == Some(b'-') || bytes.first().copied() == Some(b'+') {
        idx = 1;
    }
    let digits_start = idx;
    while idx < bytes.len() && bytes[idx].is_ascii_digit() {
        idx += 1;
    }
    if idx == digits_start {
        return None;
    }
    let value: i64 = input[..idx].parse().ok()?;
    Some((value, &input[idx..]))
}

fn parse_leading_identifier(input: &str) -> Option<(String, &str)> {
    let bytes = input.as_bytes();
    let first = *bytes.first()?;
    if !(first.is_ascii_alphabetic() || first == b'_') {
        return None;
    }
    let mut idx = 1;
    while idx < bytes.len() && (bytes[idx].is_ascii_alphanumeric() || bytes[idx] == b'_') {
        idx += 1;
    }
    Some((input[..idx].to_string(), &input[idx..]))
}

// Replace whole-word occurrences of `var` with `value`, skipping over text
// inside single- or double-quoted string literals so we do not corrupt
// property-value strings that happen to contain the variable name.
fn substitute_identifier_literal(query: &str, var: &str, value: &str) -> String {
    let mut out = String::with_capacity(query.len());
    let bytes = query.as_bytes();
    let mut idx = 0;
    let mut in_string: Option<u8> = None;
    while idx < bytes.len() {
        let b = bytes[idx];
        if let Some(quote) = in_string {
            out.push(b as char);
            if b == b'\\' && idx + 1 < bytes.len() {
                out.push(bytes[idx + 1] as char);
                idx += 2;
                continue;
            }
            if b == quote {
                in_string = None;
            }
            idx += 1;
            continue;
        }
        if b == b'\'' || b == b'"' {
            in_string = Some(b);
            out.push(b as char);
            idx += 1;
            continue;
        }
        if b.is_ascii_alphabetic() || b == b'_' {
            let start = idx;
            idx += 1;
            while idx < bytes.len() && (bytes[idx].is_ascii_alphanumeric() || bytes[idx] == b'_') {
                idx += 1;
            }
            let ident = &query[start..idx];
            if ident == var {
                out.push_str(value);
            } else {
                out.push_str(ident);
            }
            continue;
        }
        out.push(b as char);
        idx += 1;
    }
    out
}

fn execute_query_rows(db_path: &str, query: &str) -> Result<QueryRows, CliError> {
    if let Some(expanded) = try_expand_unwind_range_create(query) {
        let mut db = Database::open(db_path)?;
        for q in &expanded {
            db.query(q)
                .map_err(|e| CliError::Runtime(e.to_string()))?;
        }
        return Ok(QueryRows {
            columns: Vec::new(),
            rows: Vec::new(),
        });
    }
    let mut db = Database::open(db_path)?;
    if should_route_to_cypher(&db, query) {
        let result = db
            .query(query)
            .map_err(|e| CliError::Runtime(e.to_string()))?;
        return Ok(query_result_as_rows(&result));
    }
    let plan = parse_query_plan(query)?;
    execute_query_plan_as_rows(db_path, plan)
}

fn execute_query(db_path: &str, query: &str) -> Result<String, CliError> {
    if let Some(expanded) = try_expand_unwind_range_create(query) {
        let mut db = Database::open(db_path)?;
        for q in &expanded {
            db.query(q)
                .map_err(|e| CliError::Runtime(e.to_string()))?;
        }
        let rows = QueryRows {
            columns: Vec::new(),
            rows: Vec::new(),
        };
        return Ok(render_rows_table(&rows));
    }
    let mut db = Database::open(db_path)?;
    if should_route_to_cypher(&db, query) {
        let result = db
            .query(query)
            .map_err(|e| CliError::Runtime(e.to_string()))?;
        let rows = query_result_as_rows(&result);
        return Ok(render_rows_table(&rows));
    }
    execute_legacy_query(db_path, query)
}

fn execute_query_with_format(
    db_path: &str,
    query: &str,
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    if format == QueryOutputFormat::Table {
        return execute_query(db_path, query);
    }
    let rows = execute_query_rows(db_path, query)?;
    Ok(rows.render(format))
}

fn handle_query(db_path: &str, query: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    if query.trim().is_empty() {
        return Err(CliError::Usage("empty query string".to_string()));
    }
    execute_query_with_format(db_path, query, format)
}

fn parse_shell_commands(raw: &str) -> Vec<String> {
    raw.split(';')
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_shell_script_lines(input: &str) -> Vec<String> {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect()
}

fn read_shell_queries_from_reader<R: BufRead>(reader: R) -> Result<Vec<String>, CliError> {
    let mut queries = Vec::<String>::new();
    for line in reader.lines() {
        let line = io_runtime(line, "failed to read shell stdin line")?;
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        queries.push(trimmed.to_string());
    }
    Ok(queries)
}

#[cfg(not(test))]
fn read_shell_queries_from_stdin() -> Result<Vec<String>, CliError> {
    let stdin = io::stdin();
    let reader = BufReader::new(stdin.lock());
    read_shell_queries_from_reader(reader)
}

#[cfg(test)]
fn read_shell_queries_from_stdin() -> Result<Vec<String>, CliError> {
    read_shell_queries_from_reader(BufReader::new(io::empty()))
}

const SHELL_KEYWORDS: &[&str] = &[
    "info",
    "metrics",
    "stats",
    "schema",
    "find",
    "nodes",
    "label",
    "neighbors",
    "incoming",
    "hop",
    "hop-in",
    "create",
    "node",
    "add",
    "edge",
    "match",
    "return",
    "where",
    "set",
    "with",
    "unwind",
    "merge",
    "delete",
    "detach",
    "limit",
    "order",
    "by",
];

#[derive(Debug, Default)]
struct ShellEditorHelper;

impl Helper for ShellEditorHelper {}
impl Validator for ShellEditorHelper {}
impl Highlighter for ShellEditorHelper {}

impl Hinter for ShellEditorHelper {
    type Hint = String;

    fn hint(&self, _line: &str, _pos: usize, _ctx: &Context<'_>) -> Option<Self::Hint> {
        None
    }
}

impl Completer for ShellEditorHelper {
    type Candidate = Pair;

    fn complete(
        &self,
        line: &str,
        pos: usize,
        _ctx: &Context<'_>,
    ) -> rustyline::Result<(usize, Vec<Pair>)> {
        let prefix_start = line[..pos]
            .rfind(char::is_whitespace)
            .map(|idx| idx + 1)
            .unwrap_or(0);
        let prefix = &line[prefix_start..pos];
        if prefix.is_empty() {
            return Ok((prefix_start, Vec::new()));
        }

        let lowercase_prefix = prefix.to_ascii_lowercase();
        let mut candidates = SHELL_KEYWORDS
            .iter()
            .filter_map(|keyword| {
                if keyword.starts_with(&lowercase_prefix) {
                    Some(Pair {
                        display: (*keyword).to_string(),
                        replacement: (*keyword).to_string(),
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<Pair>>();
        candidates.sort_by(|a, b| a.replacement.cmp(&b.replacement));
        candidates.dedup_by(|a, b| a.replacement == b.replacement);
        Ok((prefix_start, candidates))
    }
}

fn shell_history_path() -> Option<PathBuf> {
    let mut home = std::env::var_os("HOME").map(PathBuf::from)?;
    home.push(".ogdb_history");
    Some(home)
}

#[cfg(not(test))]
fn run_shell_interactive(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    let mut editor =
        rustyline::Editor::<ShellEditorHelper, rustyline::history::DefaultHistory>::new()
            .map_err(|e| CliError::Runtime(format!("failed to initialize shell editor: {e}")))?;
    editor.set_helper(Some(ShellEditorHelper));

    let history_path = shell_history_path();
    if let Some(path) = history_path.as_ref() {
        let _ = editor.load_history(path);
    }

    let mut queries = Vec::<String>::new();
    loop {
        match editor.readline("ogdb> ") {
            Ok(line) => {
                let query = line.trim();
                if query.is_empty() {
                    continue;
                }
                let _ = editor.add_history_entry(query);
                queries.push(query.to_string());
            }
            Err(ReadlineError::Interrupted) => continue,
            Err(ReadlineError::Eof) => break,
            Err(err) => return Err(CliError::Runtime(format!("shell input error: {err}"))),
        }
    }

    if let Some(path) = history_path.as_ref() {
        let _ = editor.save_history(path);
    }

    render_shell_query_results(db_path, &queries, format)
}

#[cfg(test)]
fn run_shell_interactive(db_path: &str, format: QueryOutputFormat) -> Result<String, CliError> {
    render_shell_query_results(db_path, &Vec::<String>::new(), format)
}

fn render_shell_query_results(
    db_path: &str,
    queries: &[String],
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    if queries.is_empty() {
        return Err(CliError::Usage(
            "shell input produced zero executable queries".to_string(),
        ));
    }

    if format == QueryOutputFormat::Table {
        let mut blocks = Vec::<String>::new();
        for (idx, query) in queries.iter().enumerate() {
            let result = execute_query(db_path, query)?;
            blocks.push(format!("[{}] {}\n{}", idx + 1, query, result));
        }
        return Ok(format!(
            "commands_executed={}\n{}",
            queries.len(),
            blocks.join("\n--\n")
        ));
    }

    let mut rows = Vec::<Vec<String>>::new();
    for (idx, query) in queries.iter().enumerate() {
        let result = execute_query_rows(db_path, query)?;
        rows.push(vec![
            (idx + 1).to_string(),
            query.clone(),
            result.columns.join(","),
            result.row_count().to_string(),
            serde_json::to_string(&result.row_objects())
                .expect("shell result row serialization should not fail"),
        ]);
    }
    let shell_rows = QueryRows {
        columns: vec![
            "index".to_string(),
            "query".to_string(),
            "result_columns".to_string(),
            "result_row_count".to_string(),
            "result_rows_json".to_string(),
        ],
        rows,
    };
    Ok(shell_rows.render(format))
}

fn handle_shell(
    db_path: &str,
    commands: Option<&str>,
    script_path: Option<&str>,
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    handle_shell_with_stdin_mode(
        db_path,
        commands,
        script_path,
        format,
        io::stdin().is_terminal(),
    )
}

fn handle_shell_with_stdin_mode(
    db_path: &str,
    commands: Option<&str>,
    script_path: Option<&str>,
    format: QueryOutputFormat,
    stdin_is_tty: bool,
) -> Result<String, CliError> {
    if commands.is_some() && script_path.is_some() {
        return Err(CliError::Usage(
            "choose either --commands or --script, not both".to_string(),
        ));
    }

    if let Some(raw) = commands {
        return render_shell_query_results(db_path, &parse_shell_commands(raw), format);
    }

    if let Some(path) = script_path {
        let input = fs::read_to_string(path)
            .map_err(|e| CliError::Runtime(format!("failed to read script file: {e}")))?;
        return render_shell_query_results(db_path, &parse_shell_script_lines(&input), format);
    }

    if stdin_is_tty {
        return run_shell_interactive(db_path, format);
    }

    let queries = read_shell_queries_from_stdin()?;
    render_shell_query_results(db_path, &queries, format)
}

fn io_runtime<T>(result: std::io::Result<T>, context: impl Into<String>) -> Result<T, CliError> {
    let context = context.into();
    match result {
        Ok(value) => Ok(value),
        Err(err) => Err(CliError::Runtime(format!("{context}: {err}"))),
    }
}

#[derive(Debug, Deserialize)]
struct McpRequest {
    #[serde(default)]
    jsonrpc: Option<String>,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Option<Value>,
}

fn handle_mcp(
    db_path: &str,
    request_json: Option<&str>,
    stdio_mode: bool,
    max_requests: Option<u64>,
) -> Result<String, CliError> {
    if request_json.is_some() && max_requests.is_some() {
        return Err(CliError::Usage(
            "--max-requests is only valid with --stdio".to_string(),
        ));
    }
    if let Some(request_json) = request_json {
        return Ok(execute_mcp_request(db_path, request_json));
    }
    if stdio_mode {
        return run_mcp_stdio_command(db_path, max_requests);
    }
    Err(CliError::Usage(
        "choose exactly one of --request or --stdio".to_string(),
    ))
}

fn mcp_result_response(id: Value, result: Value) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    }))
    .expect("mcp result serialization should not fail")
}

fn mcp_error_response(id: Value, code: i64, message: impl Into<String>) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message.into(),
        },
    }))
    .expect("mcp error serialization should not fail")
}

fn compact_json_response_line(response: String) -> String {
    serde_json::from_str::<Value>(&response)
        .map(|json| {
            serde_json::to_string(&json)
                .expect("json response compaction serialization must not fail")
        })
        .unwrap_or(response)
}

fn run_mcp_stdio_command(db_path: &str, max_requests: Option<u64>) -> Result<String, CliError> {
    let _ = Database::open(db_path)?;
    #[cfg(test)]
    {
        let mut reader = BufReader::new(std::io::empty());
        let mut writer = Vec::<u8>::new();
        let requests_processed =
            run_mcp_stdio_session(db_path, &mut reader, &mut writer, max_requests)?;
        return Ok(format!(
            "mcp_stdio_stopped requests_processed={requests_processed}"
        ));
    }
    #[cfg(not(test))]
    {
        let stdin = std::io::stdin();
        let mut reader = BufReader::new(stdin.lock());
        let stdout = std::io::stdout();
        let mut writer = stdout.lock();
        let requests_processed =
            run_mcp_stdio_session(db_path, &mut reader, &mut writer, max_requests)?;
        Ok(format!(
            "mcp_stdio_stopped requests_processed={requests_processed}"
        ))
    }
}

fn run_mcp_stdio_session<R: BufRead, W: Write>(
    db_path: &str,
    reader: &mut R,
    writer: &mut W,
    max_requests: Option<u64>,
) -> Result<u64, CliError> {
    let max_requests = max_requests.unwrap_or(u64::MAX);
    let mut requests_processed = 0u64;
    let mut line = String::new();
    loop {
        line.clear();
        let read_line = reader.read_line(&mut line);
        let bytes = io_runtime(read_line, "failed to read mcp stdio request line")?;
        if bytes == 0 {
            break;
        }
        let request = line.trim();
        if request.is_empty() {
            continue;
        }
        let response = compact_json_response_line(execute_mcp_request(db_path, request));
        let write_response = writer.write_all(response.as_bytes());
        io_runtime(write_response, "failed to write mcp stdio response")?;
        let write_newline = writer.write_all(b"\n");
        io_runtime(write_newline, "failed to write mcp stdio response newline")?;
        io_runtime(writer.flush(), "failed to flush mcp stdio response")?;
        requests_processed += 1;
        if requests_processed >= max_requests {
            break;
        }
    }
    Ok(requests_processed)
}

fn execute_mcp_tools_call(db_path: &str, params: Option<Value>) -> Result<Value, String> {
    let params = params
        .and_then(|value| value.as_object().cloned())
        .ok_or_else(|| "tools/call params must be an object".to_string())?;

    if params.contains_key("query") {
        return execute_mcp_query_tool(db_path, &params);
    }

    let Some(tool_name) = params.get("name").and_then(Value::as_str) else {
        return Err("tools/call params.query must be a string".to_string());
    };
    let args = if let Some(value) = params.get("arguments") {
        value
            .as_object()
            .cloned()
            .ok_or_else(|| "tools/call params.arguments must be an object".to_string())?
    } else {
        Map::<String, Value>::new()
    };

    match tool_name {
        // Standardized MCP tool names (aliases for existing tools + new tools)
        "browse_schema" => execute_mcp_schema_tool(db_path),
        "execute_cypher" => execute_mcp_query_tool(db_path, &args),
        "get_node_neighborhood" => execute_mcp_subgraph_tool(db_path, &args),
        "search_nodes" => execute_mcp_search_nodes_tool(db_path, &args),
        "list_datasets" => execute_mcp_list_datasets_tool(db_path),
        // Legacy tool names (backward compatible)
        "query" => execute_mcp_query_tool(db_path, &args),
        "schema" => execute_mcp_schema_tool(db_path),
        "upsert_node" => execute_mcp_upsert_node_tool(db_path, &args),
        "upsert_edge" => execute_mcp_upsert_edge_tool(db_path, &args),
        "subgraph" => execute_mcp_subgraph_tool(db_path, &args),
        "shortest_path" => execute_mcp_shortest_path_tool(db_path, &args),
        "vector_search" => execute_mcp_vector_search_tool(db_path, &args),
        "text_search" => execute_mcp_text_search_tool(db_path, &args),
        "temporal_diff" => execute_mcp_temporal_diff_tool(db_path, &args),
        "import_rdf" => execute_mcp_import_rdf_tool(db_path, &args),
        "export_rdf" => execute_mcp_export_rdf_tool(db_path, &args),
        "agent_store_episode" => execute_mcp_agent_store_episode_tool(db_path, &args),
        "agent_recall" => execute_mcp_agent_recall_tool(db_path, &args),
        "rag_build_summaries" => execute_mcp_rag_build_summaries_tool(db_path, &args),
        "rag_retrieve" => execute_mcp_rag_retrieve_tool(db_path, &args),
        _ => Err(format!("unknown tool: {tool_name}")),
    }
}

fn execute_mcp_query_tool(db_path: &str, params: &Map<String, Value>) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .ok_or_else(|| "tools/call params.query must be a string".to_string())?;

    let (format, format_label) = if let Some(raw) = params.get("format").and_then(Value::as_str) {
        let parsed = QueryOutputFormat::parse(raw).map_err(|e| e.to_string())?;
        (parsed, raw.to_ascii_lowercase())
    } else {
        (QueryOutputFormat::Json, "json".to_string())
    };

    let output = execute_query_with_format(db_path, query, format).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "format": format_label,
        "output": output,
    }))
}

fn execute_mcp_schema_tool(db_path: &str) -> Result<Value, String> {
    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let schema = snapshot.schema_catalog();
    Ok(serde_json::json!({
        "labels": schema.labels,
        "edge_types": schema.edge_types,
        "property_keys": schema.property_keys,
    }))
}

fn execute_mcp_search_nodes_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let query_text = mcp_required_string(args, "query")?;
    let label = args
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let limit = mcp_optional_usize(args, "limit", 25)?;

    // Build Cypher: search string properties for the query text
    let label_filter = label.map(|l| format!(":{l}")).unwrap_or_default();
    let escaped = query_text.replace('\\', "\\\\").replace('\'', "\\'");

    // Get schema to find searchable properties
    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let schema = snapshot.schema_catalog();

    let props: Vec<&str> = schema
        .property_keys
        .iter()
        .filter(|k| !k.starts_with('_') && *k != "embedding" && *k != "vector")
        .take(10)
        .map(String::as_str)
        .collect();

    if props.is_empty() {
        return Ok(serde_json::json!({
            "results": [],
            "message": "No searchable string properties found in schema"
        }));
    }

    let where_clause = props
        .iter()
        .map(|p| format!("toString(n.{p}) CONTAINS '{escaped}'"))
        .collect::<Vec<_>>()
        .join(" OR ");

    let cypher = format!(
        "MATCH (n{label_filter}) WHERE {where_clause} RETURN n LIMIT {limit}"
    );

    let output = execute_query_with_format(db_path, &cypher, QueryOutputFormat::Json)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "query": cypher,
        "output": output,
    }))
}

fn execute_mcp_list_datasets_tool(db_path: &str) -> Result<Value, String> {
    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let schema = snapshot.schema_catalog();
    let metrics = snapshot.metrics().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "node_count": metrics.node_count,
        "edge_count": metrics.edge_count,
        "labels": schema.labels,
        "edge_types": schema.edge_types,
        "property_keys": schema.property_keys,
    }))
}

fn mcp_required_string(args: &Map<String, Value>, key: &str) -> Result<String, String> {
    let value = args
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("tools/call arguments.{key} must be a string"))?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("tools/call arguments.{key} cannot be empty"));
    }
    Ok(trimmed.to_string())
}

fn mcp_required_u64(args: &Map<String, Value>, key: &str) -> Result<u64, String> {
    args.get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("tools/call arguments.{key} must be an unsigned integer"))
}

fn mcp_required_i64(args: &Map<String, Value>, key: &str) -> Result<i64, String> {
    args.get(key)
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|raw| i64::try_from(raw).ok()))
        })
        .ok_or_else(|| format!("tools/call arguments.{key} must be an integer"))
}

fn mcp_optional_usize(
    args: &Map<String, Value>,
    key: &str,
    default: usize,
) -> Result<usize, String> {
    match args.get(key) {
        None => Ok(default),
        Some(value) => {
            let raw = value
                .as_u64()
                .ok_or_else(|| format!("tools/call arguments.{key} must be an unsigned integer"))?;
            usize::try_from(raw)
                .map_err(|_| format!("tools/call arguments.{key} must fit in usize"))
        }
    }
}

fn mcp_optional_u64(args: &Map<String, Value>, key: &str) -> Result<Option<u64>, String> {
    match args.get(key) {
        None => Ok(None),
        Some(value) => value
            .as_u64()
            .map(Some)
            .ok_or_else(|| format!("tools/call arguments.{key} must be an unsigned integer")),
    }
}

fn mcp_optional_f32(args: &Map<String, Value>, key: &str, default: f32) -> Result<f32, String> {
    match args.get(key) {
        None => Ok(default),
        Some(value) => value
            .as_f64()
            .map(|value| value as f32)
            .ok_or_else(|| format!("tools/call arguments.{key} must be numeric")),
    }
}

fn mcp_required_vector(args: &Map<String, Value>, key: &str) -> Result<Vec<f32>, String> {
    let values = args
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("tools/call arguments.{key} must be an array of numbers"))?;
    if values.is_empty() {
        return Err(format!(
            "tools/call arguments.{key} must include at least one number"
        ));
    }
    let mut out = Vec::<f32>::with_capacity(values.len());
    for value in values {
        let Some(number) = value.as_f64() else {
            return Err(format!(
                "tools/call arguments.{key} must be an array of numbers"
            ));
        };
        out.push(number as f32);
    }
    Ok(out)
}

fn mcp_optional_metric(
    args: &Map<String, Value>,
    key: &str,
) -> Result<Option<VectorDistanceMetric>, String> {
    let Some(raw) = args.get(key).and_then(Value::as_str) else {
        return Ok(None);
    };
    match raw.trim().to_ascii_lowercase().as_str() {
        "cosine" => Ok(Some(VectorDistanceMetric::Cosine)),
        "euclidean" | "l2" => Ok(Some(VectorDistanceMetric::Euclidean)),
        "dot" | "dotproduct" | "dot_product" => Ok(Some(VectorDistanceMetric::DotProduct)),
        _ => Err(format!(
            "tools/call arguments.{key} must be one of cosine|euclidean|dot"
        )),
    }
}

fn mcp_parse_i64_from_value(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|raw| i64::try_from(raw).ok()))
}

fn mcp_parse_time_range(
    args: &Map<String, Value>,
    key: &str,
) -> Result<Option<(i64, i64)>, String> {
    let Some(value) = args.get(key) else {
        return Ok(None);
    };
    let (start, end) = if let Some(values) = value.as_array() {
        if values.len() != 2 {
            return Err(format!(
                "tools/call arguments.{key} must be [start,end] or {{start,end}}"
            ));
        }
        let start = mcp_parse_i64_from_value(&values[0])
            .ok_or_else(|| format!("tools/call arguments.{key}[0] must be an integer"))?;
        let end = mcp_parse_i64_from_value(&values[1])
            .ok_or_else(|| format!("tools/call arguments.{key}[1] must be an integer"))?;
        (start, end)
    } else if let Some(map) = value.as_object() {
        let start = map
            .get("start")
            .and_then(mcp_parse_i64_from_value)
            .ok_or_else(|| format!("tools/call arguments.{key}.start must be an integer"))?;
        let end = map
            .get("end")
            .and_then(mcp_parse_i64_from_value)
            .ok_or_else(|| format!("tools/call arguments.{key}.end must be an integer"))?;
        (start, end)
    } else {
        return Err(format!(
            "tools/call arguments.{key} must be [start,end] or {{start,end}}"
        ));
    };
    if start > end {
        return Err(format!(
            "tools/call arguments.{key}.start must be <= arguments.{key}.end"
        ));
    }
    Ok(Some((start, end)))
}

fn mcp_parse_rdf_import_format(raw: &str) -> Result<RdfImportFormatArg, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "ttl" => Ok(RdfImportFormatArg::Ttl),
        "nt" => Ok(RdfImportFormatArg::Nt),
        "xml" | "rdf" => Ok(RdfImportFormatArg::Xml),
        "jsonld" | "json" => Ok(RdfImportFormatArg::Jsonld),
        "nq" => Ok(RdfImportFormatArg::Nq),
        _ => Err("tools/call arguments.format must be ttl|nt|xml|jsonld|nq".to_string()),
    }
}

fn mcp_parse_rdf_export_format(raw: &str) -> Result<RdfExportFormatArg, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "ttl" => Ok(RdfExportFormatArg::Ttl),
        "nt" => Ok(RdfExportFormatArg::Nt),
        "xml" | "rdf" => Ok(RdfExportFormatArg::Xml),
        "jsonld" | "json" => Ok(RdfExportFormatArg::Jsonld),
        _ => Err("tools/call arguments.format must be ttl|nt|xml|jsonld".to_string()),
    }
}

fn mcp_parse_key_value_output(output: &str) -> Value {
    let mut out = Map::<String, Value>::new();
    for line in output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if let Some((key, value)) = line.split_once('=') {
            let value = value.trim();
            let parsed = if value.eq_ignore_ascii_case("true") {
                Value::Bool(true)
            } else if value.eq_ignore_ascii_case("false") {
                Value::Bool(false)
            } else if let Ok(number) = value.parse::<i64>() {
                Value::Number(number.into())
            } else if let Ok(number) = value.parse::<u64>() {
                Value::Number(number.into())
            } else if let Ok(number) = value.parse::<f64>() {
                serde_json::Number::from_f64(number)
                    .map(Value::Number)
                    .unwrap_or_else(|| Value::String(value.to_string()))
            } else {
                Value::String(value.to_string())
            };
            out.insert(key.trim().to_string(), parsed);
        } else {
            out.insert("output".to_string(), Value::String(output.to_string()));
            break;
        }
    }
    Value::Object(out)
}

fn mcp_optional_properties(args: &Map<String, Value>) -> Result<PropertyMap, String> {
    match args.get("properties") {
        None => Ok(PropertyMap::new()),
        Some(Value::Object(properties)) => {
            json_properties_to_property_map(properties).map_err(|e| e.to_string())
        }
        Some(_) => Err("tools/call arguments.properties must be an object".to_string()),
    }
}

fn execute_mcp_vector_search_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let index_name = mcp_required_string(args, "index_name")?;
    let query_vector = mcp_required_vector(args, "query_vector")?;
    let k = mcp_optional_usize(args, "k", 10)?;
    let metric = mcp_optional_metric(args, "metric")?;

    let db = Database::open(db_path).map_err(|e| e.to_string())?;
    let rows = db
        .vector_search(&index_name, &query_vector, k, metric)
        .map_err(|e| e.to_string())?;
    let results = rows
        .into_iter()
        .map(|(node, score)| serde_json::json!({ "node": node, "score": score }))
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "index_name": index_name,
        "k": k,
        "results": results,
    }))
}

fn execute_mcp_text_search_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let index_name = mcp_required_string(args, "index_name")?;
    let query_text = mcp_required_string(args, "query_text")?;
    let k = mcp_optional_usize(args, "k", 10)?;

    let db = Database::open(db_path).map_err(|e| e.to_string())?;
    let rows = db
        .text_search(&index_name, &query_text, k)
        .map_err(|e| e.to_string())?;
    let results = rows
        .into_iter()
        .map(|(node, score)| serde_json::json!({ "node": node, "score": score }))
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "index_name": index_name,
        "query_text": query_text,
        "k": k,
        "results": results,
    }))
}

fn execute_mcp_temporal_diff_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let timestamp_a = mcp_required_i64(args, "timestamp_a")?;
    let timestamp_b = mcp_required_i64(args, "timestamp_b")?;

    let db = Database::open(db_path).map_err(|e| e.to_string())?;
    let nodes = db.export_nodes().map_err(|e| e.to_string())?;
    let edges = db.export_edges().map_err(|e| e.to_string())?;
    let node_count = nodes.len() as u64;
    let edge_count_at = |timestamp: i64| -> u64 {
        edges
            .iter()
            .filter(|edge| {
                let lower_ok = edge
                    .valid_from
                    .map(|value| value <= timestamp)
                    .unwrap_or(true);
                let upper_ok = edge.valid_to.map(|value| value > timestamp).unwrap_or(true);
                lower_ok && upper_ok
            })
            .count() as u64
    };
    let edge_count_a = edge_count_at(timestamp_a);
    let edge_count_b = edge_count_at(timestamp_b);

    Ok(serde_json::json!({
        "timestamp_a": timestamp_a,
        "timestamp_b": timestamp_b,
        "snapshot_a": {
            "node_count": node_count,
            "edge_count": edge_count_a,
        },
        "snapshot_b": {
            "node_count": node_count,
            "edge_count": edge_count_b,
        },
        "diff": {
            "node_count": 0i64,
            "edge_count": (edge_count_b as i64) - (edge_count_a as i64),
        }
    }))
}

fn execute_mcp_import_rdf_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let src_path = mcp_required_string(args, "src_path")?;
    let format = args
        .get("format")
        .and_then(Value::as_str)
        .map(mcp_parse_rdf_import_format)
        .transpose()?;
    let base_uri = args
        .get("base_uri")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let schema_only = args
        .get("schema_only")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let continue_on_error = args
        .get("continue_on_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let atomic = args.get("atomic").and_then(Value::as_bool).unwrap_or(false);
    if atomic && continue_on_error {
        return Err(
            "tools/call arguments.atomic cannot be used with continue_on_error".to_string(),
        );
    }
    let batch_size = mcp_optional_usize(args, "batch_size", 10_000)?;
    if batch_size == 0 {
        return Err("tools/call arguments.batch_size must be > 0".to_string());
    }

    let output = handle_import_rdf(
        db_path,
        &src_path,
        ImportRdfOptions {
            format_hint: format,
            base_uri,
            schema_only,
            batch_size,
            continue_on_error,
            atomic,
        },
    )
    .map_err(|e| e.to_string())?;
    Ok(mcp_parse_key_value_output(&output))
}

fn execute_mcp_export_rdf_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let dst_path = mcp_required_string(args, "dst_path")?;
    let format = args
        .get("format")
        .and_then(Value::as_str)
        .map(mcp_parse_rdf_export_format)
        .transpose()?;
    let output = handle_export_rdf(db_path, &dst_path, format).map_err(|e| e.to_string())?;
    Ok(mcp_parse_key_value_output(&output))
}

fn execute_mcp_agent_store_episode_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let agent_id = mcp_required_string(args, "agent_id")?;
    let session_id = mcp_required_string(args, "session_id")?;
    let content = mcp_required_string(args, "content")?;
    let embedding = mcp_required_vector(args, "embedding")?;
    let timestamp = mcp_required_i64(args, "timestamp")?;
    let metadata = match args.get("metadata") {
        None => "{}".to_string(),
        Some(Value::String(value)) => value.clone(),
        Some(value) => serde_json::to_string(value)
            .map_err(|e| format!("tools/call arguments.metadata serialization failed: {e}"))?,
    };

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let episode_id = shared
        .with_write(move |db| {
            db.store_episode(
                &agent_id,
                &session_id,
                &content,
                &embedding,
                timestamp,
                &metadata,
            )
        })
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "episode_id": episode_id,
    }))
}

fn execute_mcp_agent_recall_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let agent_id = mcp_required_string(args, "agent_id")?;
    let query_embedding = mcp_required_vector(args, "query_embedding")?;
    let k = mcp_optional_usize(args, "k", 10)?;
    let time_range = mcp_parse_time_range(args, "time_range")?;

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let rows = snapshot
        .recall_episode_scores(&agent_id, &query_embedding, k, time_range)
        .map_err(|e| e.to_string())?;
    let episodes = rows
        .into_iter()
        .map(|(episode, score)| {
            let metadata = serde_json::from_str::<Value>(&episode.metadata)
                .unwrap_or_else(|_| Value::String(episode.metadata.clone()));
            serde_json::json!({
                "episode_id": episode.episode_id,
                "agent_id": episode.agent_id,
                "session_id": episode.session_id,
                "content": episode.content,
                "embedding": episode.embedding,
                "timestamp": episode.timestamp,
                "metadata": metadata,
                "score": score,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "episodes": episodes,
    }))
}

fn execute_mcp_rag_build_summaries_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let resolution = args
        .get("resolution")
        .and_then(Value::as_f64)
        .unwrap_or(1.0);
    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let summaries = snapshot
        .build_community_summaries(resolution)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|summary| {
            serde_json::to_value(summary)
                .expect("community summary serialization for mcp should succeed")
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "resolution": resolution,
        "summaries": summaries,
    }))
}

fn execute_mcp_rag_retrieve_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let query_embedding = mcp_required_vector(args, "query_embedding")?;
    let query_text = mcp_required_string(args, "query_text")?;
    let k = mcp_optional_usize(args, "k", 10)?;
    let alpha = mcp_optional_f32(args, "alpha", 0.5)?;
    if !(0.0..=1.0).contains(&alpha) {
        return Err("tools/call arguments.alpha must be between 0.0 and 1.0".to_string());
    }
    let community_id = mcp_optional_u64(args, "community_id")?;

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let rows = snapshot
        .hybrid_rag_retrieve(&query_embedding, &query_text, k, alpha, community_id)
        .map_err(|e| e.to_string())?;
    let results = rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "node": row.node_id,
                "score": row.score,
                "community_id": row.community_id,
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::json!({
        "results": results,
    }))
}

fn execute_mcp_upsert_node_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let label = mcp_required_string(args, "label")?;
    let match_key = mcp_required_string(args, "match_key")?;
    let match_value = args
        .get("match_value")
        .ok_or_else(|| "tools/call arguments.match_value is required".to_string())
        .and_then(|value| json_value_to_property_value(value).map_err(|e| e.to_string()))?;
    let mut properties = mcp_optional_properties(args)?;
    properties.insert(match_key.clone(), match_value.clone());

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let label_for_write = label.clone();
    let (node_id, created) = shared
        .with_write(move |db| {
            let mut matches =
                db.find_nodes_by_label_and_property(&label_for_write, &match_key, &match_value);
            matches.sort_unstable();
            if let Some(node_id) = matches.first().copied() {
                let mut merged = db.node_properties(node_id)?;
                for (key, value) in &properties {
                    merged.insert(key.clone(), value.clone());
                }
                db.set_node_properties(node_id, &merged)?;
                Ok((node_id, false))
            } else {
                let node_labels = vec![label_for_write.clone()];
                let node_id = db.create_node_with(&node_labels, &properties)?;
                Ok((node_id, true))
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "node_id": node_id,
        "created": created,
        "label": label,
    }))
}

fn execute_mcp_upsert_edge_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let src = mcp_required_u64(args, "src")?;
    let dst = mcp_required_u64(args, "dst")?;
    let edge_type = args
        .get("edge_type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let properties = mcp_optional_properties(args)?;

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let edge_type_for_json = edge_type.clone();
    let (edge_id, created) = shared
        .with_write(move |db| {
            let existing = db
                .export_edges()?
                .into_iter()
                .find(|edge| edge.src == src && edge.dst == dst && edge.edge_type == edge_type);
            if let Some(edge) = existing {
                if !properties.is_empty() {
                    let mut merged = db.edge_properties(edge.id)?;
                    for (key, value) in &properties {
                        merged.insert(key.clone(), value.clone());
                    }
                    db.set_edge_properties(edge.id, &merged)?;
                }
                return Ok((edge.id, false));
            }

            let edge_id = match edge_type.as_deref() {
                Some(edge_type) => db.add_typed_edge(src, dst, edge_type, &properties)?,
                None => {
                    if properties.is_empty() {
                        db.add_edge(src, dst)?
                    } else {
                        db.add_edge_with_properties(src, dst, &properties)?
                    }
                }
            };
            Ok((edge_id, true))
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "edge_id": edge_id,
        "created": created,
        "src": src,
        "dst": dst,
        "edge_type": edge_type_for_json,
    }))
}

fn execute_mcp_subgraph_tool(db_path: &str, args: &Map<String, Value>) -> Result<Value, String> {
    let node_id = mcp_required_u64(args, "node_id")?;
    let hops = args.get("hops").and_then(Value::as_u64).unwrap_or(1);
    let hops_u32 =
        u32::try_from(hops).map_err(|_| "tools/call arguments.hops must fit in u32".to_string())?;
    let edge_type = args
        .get("edge_type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let subgraph = snapshot
        .extract_subgraph(node_id, hops_u32, edge_type.as_deref())
        .map_err(|e| e.to_string())?;

    let mut nodes = Vec::<Value>::new();
    for id in &subgraph.nodes {
        let labels = snapshot.node_labels(*id).map_err(|e| e.to_string())?;
        let properties = snapshot.node_properties(*id).map_err(|e| e.to_string())?;
        nodes.push(serde_json::json!({
            "id": id,
            "labels": labels,
            "properties": property_map_to_export_json(&properties),
        }));
    }

    let edge_rows = subgraph
        .edges
        .iter()
        .map(|edge| {
            serde_json::json!({
                "id": edge.edge_id,
                "src": edge.src,
                "dst": edge.dst,
                "edge_type": edge.edge_type,
            })
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({
        "center": node_id,
        "hops": hops_u32,
        "nodes": nodes,
        "edges": edge_rows,
    }))
}

fn execute_mcp_shortest_path_tool(
    db_path: &str,
    args: &Map<String, Value>,
) -> Result<Value, String> {
    let src = mcp_required_u64(args, "src")?;
    let dst = mcp_required_u64(args, "dst")?;
    let max_hops = args
        .get("max_hops")
        .and_then(Value::as_u64)
        .map(|value| {
            u32::try_from(value)
                .map_err(|_| "tools/call arguments.max_hops must fit in u32".to_string())
        })
        .transpose()?;
    let edge_type = args
        .get("edge_type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let weight_property = args
        .get("weight_property")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let options = ShortestPathOptions {
        max_hops,
        edge_type,
        weight_property,
    };

    let shared = SharedDatabase::open(db_path).map_err(|e| e.to_string())?;
    let snapshot = shared.read_snapshot().map_err(|e| e.to_string())?;
    let path = snapshot
        .shortest_path_with_options(src, dst, &options)
        .map_err(|e| e.to_string())?;

    match path {
        Some(path) => Ok(serde_json::json!({
            "found": true,
            "path": path.node_ids,
            "edge_path": path.edge_ids,
            "length": path.node_ids.len().saturating_sub(1),
            "total_weight": path.total_weight,
        })),
        None => Ok(serde_json::json!({
            "found": false,
            "path": [],
            "edge_path": [],
            "length": 0,
            "total_weight": 0.0,
        })),
    }
}

fn execute_mcp_request(db_path: &str, request_json: &str) -> String {
    let request: McpRequest = match serde_json::from_str(request_json) {
        Ok(value) => value,
        Err(e) => {
            return mcp_error_response(Value::Null, -32700, format!("parse error: {e}"));
        }
    };

    let id = request.id.unwrap_or(Value::Null);
    if request.jsonrpc.as_deref() != Some("2.0") {
        return mcp_error_response(id, -32600, "invalid jsonrpc version (expected 2.0)");
    }

    match request.method.as_str() {
        "initialize" => mcp_result_response(
            id,
            serde_json::json!({
                "protocolVersion": "2025-06-18",
                "serverInfo": {
                    "name": APP_NAME,
                    "version": env!("CARGO_PKG_VERSION"),
                },
                "capabilities": {
                    "tools": true,
                    "resources": true,
                },
            }),
        ),
        "tools/list" => mcp_result_response(
            id,
            serde_json::json!({
                "tools": [
                    // Standardized MCP tool names — AI agents should prefer these
                    {
                        "name": "browse_schema",
                        "description": "Discover all node labels, relationship types, and property keys in the OpenGraphDB database. Call this first to understand the graph structure before writing queries.",
                        "inputSchema": { "type": "object", "properties": {} }
                    },
                    {
                        "name": "execute_cypher",
                        "description": "Execute an openCypher query against the OpenGraphDB database. Returns structured results with columns and rows. Use LIMIT to control result size. Supports MATCH, CREATE, MERGE, DELETE, SET, and all standard Cypher clauses.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": { "type": "string", "description": "The Cypher query to execute" },
                                "format": { "type": "string", "enum": ["table", "json", "jsonl", "csv", "tsv"] }
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "get_node_neighborhood",
                        "description": "Explore the neighborhood around a specific node. Returns connected nodes and relationships within the specified hop distance. Use this to understand how a node relates to the rest of the graph.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "node_id": { "type": "integer", "minimum": 0, "description": "The internal node ID to explore around" },
                                "hops": { "type": "integer", "minimum": 1, "maximum": 5, "description": "Number of hops to expand (1-5, default 1)" },
                                "edge_type": { "type": "string", "description": "Optional: filter to only this relationship type" }
                            },
                            "required": ["node_id"]
                        }
                    },
                    {
                        "name": "search_nodes",
                        "description": "Search for nodes by matching text against their properties. Finds nodes where any string property contains the search term. Optionally filter by node label.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": { "type": "string", "description": "Text to search for in node properties" },
                                "label": { "type": "string", "description": "Optional: filter to only nodes with this label" },
                                "limit": { "type": "integer", "minimum": 1, "maximum": 200, "description": "Maximum results (default 25)" }
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "list_datasets",
                        "description": "List all datasets loaded in the database with their node counts, edge counts, labels, and relationship types. Gives a high-level overview of what data is available.",
                        "inputSchema": { "type": "object", "properties": {} }
                    },
                    // Legacy tool names — kept for backward compatibility
                    {
                        "name": "query",
                        "description": "Execute an OpenGraphDB Cypher query. Returns columns and rows in the requested format. This is the low-level query tool; prefer execute_cypher for a friendlier interface.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": { "type": "string" },
                                "format": { "type": "string", "enum": ["table", "json", "jsonl", "csv", "tsv"] }
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "schema",
                        "description": "Return schema registries (labels, edge types, property keys). Prefer browse_schema for a more descriptive response.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "name": "upsert_node",
                        "description": "Create or update a node by label + match key/value. Performs an idempotent write: if a node with the given label and match_key=match_value exists, it is updated; otherwise a new node is created.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "label": { "type": "string" },
                                "match_key": { "type": "string" },
                                "match_value": {},
                                "properties": { "type": "object" }
                            },
                            "required": ["label", "match_key", "match_value"]
                        }
                    },
                    {
                        "name": "upsert_edge",
                        "description": "Create or update an edge between two node IDs with an optional relationship type and properties. Idempotent: updates existing edge if src + dst + edge_type match.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "src": { "type": "integer", "minimum": 0 },
                                "dst": { "type": "integer", "minimum": 0 },
                                "edge_type": { "type": "string" },
                                "properties": { "type": "object" }
                            },
                            "required": ["src", "dst"]
                        }
                    },
                    {
                        "name": "subgraph",
                        "description": "Extract an N-hop neighborhood subgraph around a node ID. Returns all nodes and edges within the hop radius. Prefer get_node_neighborhood for a friendlier interface.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "node_id": { "type": "integer", "minimum": 0 },
                                "hops": { "type": "integer", "minimum": 0 },
                                "edge_type": { "type": "string" }
                            },
                            "required": ["node_id"]
                        }
                    },
                    {
                        "name": "shortest_path",
                        "description": "Compute the shortest path between two node IDs. Optionally constrain by maximum hops, edge type, or a numeric weight property for weighted traversal.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "src": { "type": "integer", "minimum": 0 },
                                "dst": { "type": "integer", "minimum": 0 },
                                "max_hops": { "type": "integer", "minimum": 0 },
                                "edge_type": { "type": "string" },
                                "weight_property": { "type": "string" }
                            },
                            "required": ["src", "dst"]
                        }
                    },
                    {
                        "name": "vector_search",
                        "description": "Perform approximate nearest-neighbor search over a named vector index using a query embedding. Returns top-k matching nodes with similarity scores.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "index_name": { "type": "string" },
                                "query_vector": { "type": "array", "items": { "type": "number" } },
                                "k": { "type": "integer", "minimum": 1 },
                                "metric": { "type": "string", "enum": ["cosine", "euclidean", "dot"] }
                            },
                            "required": ["index_name", "query_vector"]
                        }
                    },
                    {
                        "name": "text_search",
                        "description": "Search a full-text index by a query string using BM25 ranking. Returns top-k matching nodes. Requires a tantivy text index to have been built on the target properties.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "index_name": { "type": "string" },
                                "query_text": { "type": "string" },
                                "k": { "type": "integer", "minimum": 1 }
                            },
                            "required": ["index_name", "query_text"]
                        }
                    },
                    {
                        "name": "temporal_diff",
                        "description": "Compare node and edge counts between two temporal snapshots to track how the graph changed over a time window.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "timestamp_a": { "type": "integer" },
                                "timestamp_b": { "type": "integer" }
                            },
                            "required": ["timestamp_a", "timestamp_b"]
                        }
                    },
                    {
                        "name": "import_rdf",
                        "description": "Import RDF triples into the graph from a file path. Supports Turtle, N-Triples, RDF/XML, JSON-LD, and N-Quads formats. Preserves source URIs for round-trip fidelity.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "src_path": { "type": "string" },
                                "format": { "type": "string", "enum": ["ttl", "nt", "xml", "jsonld", "nq"] },
                                "base_uri": { "type": "string" },
                                "schema_only": { "type": "boolean" },
                                "continue_on_error": { "type": "boolean" },
                                "batch_size": { "type": "integer", "minimum": 1 }
                            },
                            "required": ["src_path"]
                        }
                    },
                    {
                        "name": "export_rdf",
                        "description": "Export the graph as RDF to a destination file. Supports Turtle, N-Triples, RDF/XML, and JSON-LD output formats.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "dst_path": { "type": "string" },
                                "format": { "type": "string", "enum": ["ttl", "nt", "xml", "jsonld"] }
                            },
                            "required": ["dst_path"]
                        }
                    },
                    {
                        "name": "agent_store_episode",
                        "description": "Store an episodic memory entry for an AI agent session. Embeds the content into the graph for later retrieval by similarity. Use agent_recall to query stored episodes.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "agent_id": { "type": "string" },
                                "session_id": { "type": "string" },
                                "content": { "type": "string" },
                                "embedding": { "type": "array", "items": { "type": "number" } },
                                "timestamp": { "type": "integer" },
                                "metadata": {}
                            },
                            "required": ["agent_id", "session_id", "content", "embedding", "timestamp"]
                        }
                    },
                    {
                        "name": "agent_recall",
                        "description": "Recall previously stored episodic memories for an agent by embedding similarity. Returns top-k episodes most semantically similar to the query embedding.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "agent_id": { "type": "string" },
                                "query_embedding": { "type": "array", "items": { "type": "number" } },
                                "k": { "type": "integer", "minimum": 1 },
                                "time_range": {}
                            },
                            "required": ["agent_id", "query_embedding"]
                        }
                    },
                    {
                        "name": "rag_build_summaries",
                        "description": "Build community summaries for GraphRAG by running community detection and generating text summaries per cluster. Call before rag_retrieve to ensure summaries are up to date.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "resolution": { "type": "number", "minimum": 0 }
                            }
                        }
                    },
                    {
                        "name": "rag_retrieve",
                        "description": "Hybrid vector + text GraphRAG retrieval. Combines embedding similarity with full-text search to return the most relevant graph nodes and community summaries for a query.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query_embedding": { "type": "array", "items": { "type": "number" } },
                                "query_text": { "type": "string" },
                                "k": { "type": "integer", "minimum": 1 },
                                "alpha": { "type": "number", "minimum": 0, "maximum": 1 },
                                "community_id": { "type": "integer", "minimum": 0 }
                            },
                            "required": ["query_embedding", "query_text"]
                        }
                    }
                ]
            }),
        ),
        "resources/list" => mcp_result_response(
            id,
            serde_json::json!({
                "resources": [
                    {
                        "uri": "graph://schema",
                        "name": "Database Schema",
                        "description": "Current graph schema including all node labels, relationship types, and property keys",
                        "mimeType": "application/json"
                    }
                ]
            }),
        ),
        "resources/read" => {
            let uri = request
                .params
                .as_ref()
                .and_then(|p| p.as_object())
                .and_then(|o| o.get("uri"))
                .and_then(Value::as_str)
                .unwrap_or("");
            match uri {
                "graph://schema" => match execute_mcp_schema_tool(db_path) {
                    Ok(schema) => mcp_result_response(
                        id,
                        serde_json::json!({
                            "contents": [{
                                "uri": "graph://schema",
                                "mimeType": "application/json",
                                "text": serde_json::to_string_pretty(&schema).unwrap_or_default()
                            }]
                        }),
                    ),
                    Err(e) => mcp_error_response(id, -32603, e),
                },
                _ => mcp_error_response(id, -32602, format!("unknown resource: {uri}")),
            }
        }
        "tools/call" => match execute_mcp_tools_call(db_path, request.params) {
            Ok(result) => mcp_result_response(id, result),
            Err(msg) => mcp_error_response(id, -32602, msg),
        },
        _ => mcp_error_response(id, -32601, format!("method not found: {}", request.method)),
    }
}

fn handle_serve(
    db_path: &str,
    bind_addr: Option<&str>,
    port: Option<u16>,
    max_requests: Option<u64>,
    bolt_mode: bool,
    http_mode: bool,
    grpc_mode: bool,
) -> Result<String, CliError> {
    if grpc_mode {
        let bind_addr = resolve_serve_bind_addr(bind_addr, port, ServeProtocol::Grpc);
        return handle_serve_grpc(db_path, &bind_addr, max_requests);
    }
    if bolt_mode {
        let bind_addr = resolve_serve_bind_addr(bind_addr, port, ServeProtocol::Bolt);
        return handle_serve_bolt(db_path, &bind_addr, max_requests);
    }
    if http_mode {
        let bind_addr = resolve_serve_bind_addr(bind_addr, port, ServeProtocol::Http);
        return handle_serve_http(db_path, &bind_addr, max_requests);
    }

    let bind_addr = resolve_serve_bind_addr(bind_addr, port, ServeProtocol::Mcp);
    handle_serve_mcp(db_path, &bind_addr, max_requests)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServeProtocol {
    Mcp,
    Bolt,
    Http,
    Grpc,
}

fn resolve_serve_bind_addr(
    bind_addr: Option<&str>,
    port: Option<u16>,
    protocol: ServeProtocol,
) -> String {
    if let Some(bind_addr) = bind_addr {
        return bind_addr.to_string();
    }
    let default_port = match protocol {
        ServeProtocol::Mcp | ServeProtocol::Bolt => 7687,
        ServeProtocol::Http => 8080,
        ServeProtocol::Grpc => 7689,
    };
    let host = match protocol {
        ServeProtocol::Http | ServeProtocol::Mcp => "127.0.0.1",
        ServeProtocol::Bolt | ServeProtocol::Grpc => "0.0.0.0",
    };
    format!("{host}:{}", port.unwrap_or(default_port))
}

fn handle_serve_bolt(
    db_path: &str,
    bind_addr: &str,
    max_requests: Option<u64>,
) -> Result<String, CliError> {
    let shared = SharedDatabase::open_with_write_mode(
        db_path,
        WriteConcurrencyMode::MultiWriter {
            max_retries: SERVER_MULTI_WRITER_RETRIES,
        },
    )?;
    let listening = format!("listening on bolt://{bind_addr}");
    eprintln!("{listening}");
    let requests_processed = ogdb_bolt::serve(shared, bind_addr, max_requests)
        .map_err(|e| CliError::Runtime(format!("failed to run bolt server on {bind_addr}: {e}")))?;
    Ok(format!(
        "{listening}\nserve_stopped protocol=bolt bind={bind_addr} requests_processed={requests_processed}"
    ))
}

#[cfg(not(feature = "grpc"))]
fn handle_serve_grpc(
    _db_path: &str,
    _bind_addr: &str,
    _max_requests: Option<u64>,
) -> Result<String, CliError> {
    Err(CliError::Runtime(
        "gRPC support is not enabled; rebuild with --features grpc".to_string(),
    ))
}

#[cfg(feature = "grpc")]
fn handle_serve_grpc(
    _db_path: &str,
    bind_addr: &str,
    _max_requests: Option<u64>,
) -> Result<String, CliError> {
    let _ = tonic::Code::Ok;
    Err(CliError::Runtime(format!(
        "gRPC server bindings are not generated in this build (bind={bind_addr})"
    )))
}

fn handle_serve_mcp(
    db_path: &str,
    bind_addr: &str,
    max_requests: Option<u64>,
) -> Result<String, CliError> {
    let _ = Database::open(db_path)?;
    let listener = io_runtime(
        TcpListener::bind(bind_addr),
        format!("failed to bind {bind_addr}"),
    )?;
    let local_addr = io_runtime(listener.local_addr(), "failed to query listener address")?;
    let listening = format!("listening on mcp://{local_addr}");
    eprintln!("{listening}");
    let max_requests = max_requests.unwrap_or(u64::MAX);

    let mut requests_processed = 0u64;
    loop {
        let (mut stream, _) = io_runtime(listener.accept(), "accept failed")?;
        let reader_stream = io_runtime(stream.try_clone(), "failed to clone client stream")?;
        let mut reader = BufReader::new(reader_stream);
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = io_runtime(reader.read_line(&mut line), "failed to read request line")?;
            if bytes == 0 {
                break;
            }
            let request = line.trim();
            if request.is_empty() {
                continue;
            }
            let response = compact_json_response_line(execute_mcp_request(db_path, request));
            let write_response = stream.write_all(response.as_bytes());
            io_runtime(write_response, "failed to write response")?;
            io_runtime(stream.write_all(b"\n"), "failed to write response newline")?;
            io_runtime(stream.flush(), "failed to flush response")?;
            requests_processed += 1;
            if requests_processed >= max_requests {
                return Ok(format!(
                    "{listening}\nserve_stopped bind={} requests_processed={requests_processed}",
                    local_addr,
                ));
            }
        }
    }
}

#[derive(Debug)]
struct HttpRequestMessage {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

#[derive(Debug)]
struct HttpResponseMessage {
    status: u16,
    reason: &'static str,
    content_type: String,
    body: Vec<u8>,
}

fn http_json_response(status: u16, reason: &'static str, payload: Value) -> HttpResponseMessage {
    HttpResponseMessage {
        status,
        reason,
        content_type: "application/json".to_string(),
        body: serde_json::to_vec_pretty(&payload).expect("http json serialization"),
    }
}

fn http_csv_response(status: u16, reason: &'static str, body: String) -> HttpResponseMessage {
    HttpResponseMessage {
        status,
        reason,
        content_type: "text/csv".to_string(),
        body: body.into_bytes(),
    }
}

fn http_text_response(
    status: u16,
    reason: &'static str,
    content_type: &str,
    body: String,
) -> HttpResponseMessage {
    HttpResponseMessage {
        status,
        reason,
        content_type: content_type.to_string(),
        body: body.into_bytes(),
    }
}

fn http_error(
    status: u16,
    reason: &'static str,
    message: impl Into<String>,
) -> HttpResponseMessage {
    http_json_response(
        status,
        reason,
        serde_json::json!({ "error": message.into() }),
    )
}

fn http_header_value<'a>(headers: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    headers.get(&key.to_ascii_lowercase()).map(String::as_str)
}

fn http_content_type(headers: &HashMap<String, String>) -> String {
    http_header_value(headers, "content-type")
        .map(|value| {
            value
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase()
        })
        .unwrap_or_default()
}

fn http_accepts_csv(headers: &HashMap<String, String>) -> bool {
    http_header_value(headers, "accept")
        .map(|value| value.to_ascii_lowercase().contains("text/csv"))
        .unwrap_or(false)
}

fn parse_bearer_token(value: &str) -> Option<&str> {
    let (scheme, token) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let token = token.trim();
    if token.is_empty() {
        return None;
    }
    Some(token)
}

/// Convert EnrichedRagResult list to a JSON Value for HTTP responses.
/// PropertyValue is serialized via property_value_to_json for consistent representation.
fn rag_results_to_json(results: &[EnrichedRagResult]) -> Value {
    serde_json::Value::Array(
        results
            .iter()
            .map(|r| {
                let properties: serde_json::Map<String, Value> = r
                    .properties
                    .iter()
                    .map(|(k, v)| (k.clone(), property_value_to_export_json(v)))
                    .collect();
                serde_json::json!({
                    "node_id": r.node_id,
                    "score": r.score,
                    "community_id": r.community_id,
                    "labels": r.labels,
                    "properties": properties,
                })
            })
            .collect(),
    )
}

/// Minimal base64 decoder (standard alphabet).
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut lookup = [255u8; 256];
    for (i, &c) in TABLE.iter().enumerate() {
        lookup[c as usize] = i as u8;
    }

    let cleaned: String = input
        .chars()
        .filter(|&c| c != '\n' && c != '\r' && c != ' ')
        .collect();
    let bytes = cleaned.as_bytes();
    let mut output = Vec::with_capacity(bytes.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;

    for &b in bytes {
        if b == b'=' {
            break;
        }
        let val = lookup[b as usize];
        if val == 255 {
            return Err(format!("invalid base64 character: {}", b as char));
        }
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }

    Ok(output)
}

fn render_prometheus_metrics(snapshot: &ogdb_core::ReadSnapshot<'_>) -> Result<String, CliError> {
    let metrics = snapshot.metrics()?;
    let query_count = HTTP_QUERY_COUNT.load(Ordering::Relaxed);
    let query_duration_micros = HTTP_QUERY_DURATION_MICROS.load(Ordering::Relaxed);
    let query_duration_seconds = (query_duration_micros as f64) / 1_000_000.0;
    Ok(format!(
        "# TYPE ogdb_node_count gauge
ogdb_node_count {}
# TYPE ogdb_edge_count gauge
ogdb_edge_count {}
# TYPE ogdb_page_count gauge
ogdb_page_count {}
# TYPE ogdb_buffer_pool_hits_total counter
ogdb_buffer_pool_hits_total {}
# TYPE ogdb_buffer_pool_misses_total counter
ogdb_buffer_pool_misses_total {}
# TYPE ogdb_query_count_total counter
ogdb_query_count_total {}
# TYPE ogdb_query_duration_seconds_total counter
ogdb_query_duration_seconds_total {:.6}
# TYPE ogdb_wal_size_bytes gauge
ogdb_wal_size_bytes {}
",
        metrics.node_count,
        metrics.edge_count,
        metrics.page_count,
        metrics.buffer_pool_hits,
        metrics.buffer_pool_misses,
        query_count,
        query_duration_seconds,
        metrics.wal_size_bytes
    ))
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpReadOutcome, CliError> {
    let reader_stream = io_runtime(stream.try_clone(), "failed to clone client stream")?;
    let mut reader = BufReader::new(reader_stream);

    // Request line — cap to MAX_HEADER_LINE so a flood of bytes without CRLF
    // cannot balloon the String allocation.
    let mut request_line = String::new();
    let bytes = io_runtime(
        (&mut reader)
            .take((MAX_HEADER_LINE as u64) + 1)
            .read_line(&mut request_line),
        "failed to read request line",
    )?;
    if bytes == 0 {
        return Ok(HttpReadOutcome::Closed);
    }
    if !request_line.ends_with('\n') || request_line.len() > MAX_HEADER_LINE {
        return Ok(HttpReadOutcome::Rejected {
            status: 431,
            reason: "Request Header Fields Too Large",
            detail: format!("request line exceeds {MAX_HEADER_LINE} bytes"),
        });
    }
    let request_line = request_line.trim_end_matches(['\r', '\n']);
    if request_line.is_empty() {
        return Ok(HttpReadOutcome::Closed);
    }

    let mut request_parts = request_line.split_whitespace();
    let method = match request_parts.next() {
        Some(value) => value.to_string(),
        None => {
            return Ok(HttpReadOutcome::Rejected {
                status: 400,
                reason: "Bad Request",
                detail: "missing request method".to_string(),
            });
        }
    };
    let path = match request_parts.next() {
        Some(value) => value.to_string(),
        None => {
            return Ok(HttpReadOutcome::Rejected {
                status: 400,
                reason: "Bad Request",
                detail: "missing request target".to_string(),
            });
        }
    };
    if request_parts.next().is_none() {
        return Ok(HttpReadOutcome::Rejected {
            status: 400,
            reason: "Bad Request",
            detail: "missing HTTP version".to_string(),
        });
    }

    let mut headers = HashMap::<String, String>::new();
    let mut header_count = 0usize;
    loop {
        if header_count >= MAX_HEADER_COUNT {
            return Ok(HttpReadOutcome::Rejected {
                status: 431,
                reason: "Request Header Fields Too Large",
                detail: format!("header count exceeds {MAX_HEADER_COUNT}"),
            });
        }
        let mut line = String::new();
        let read = io_runtime(
            (&mut reader)
                .take((MAX_HEADER_LINE as u64) + 1)
                .read_line(&mut line),
            "failed to read request header line",
        )?;
        if read == 0 {
            break;
        }
        if !line.ends_with('\n') || line.len() > MAX_HEADER_LINE {
            return Ok(HttpReadOutcome::Rejected {
                status: 431,
                reason: "Request Header Fields Too Large",
                detail: format!("header line exceeds {MAX_HEADER_LINE} bytes"),
            });
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
        header_count += 1;
    }

    let content_length = match headers.get("content-length") {
        Some(value) => match value.parse::<usize>() {
            Ok(parsed) => parsed,
            Err(_) => {
                return Ok(HttpReadOutcome::Rejected {
                    status: 400,
                    reason: "Bad Request",
                    detail: format!("invalid Content-Length header: {value}"),
                });
            }
        },
        None => 0,
    };
    if content_length > MAX_REQUEST_BODY_BYTES {
        return Ok(HttpReadOutcome::Rejected {
            status: 413,
            reason: "Payload Too Large",
            detail: format!(
                "request body is {content_length} bytes; limit is {MAX_REQUEST_BODY_BYTES}"
            ),
        });
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        io_runtime(reader.read_exact(&mut body), "failed to read request body")?;
    }

    Ok(HttpReadOutcome::Request(HttpRequestMessage {
        method,
        path,
        headers,
        body,
    }))
}

// CORS headers emitted on every HTTP response. The backend is designed to be
// reachable from browser playgrounds and notebooks served from arbitrary origins
// (file://, localhost dev servers, static-site hosts), so we default to an open
// allow-list. A future `--cors` flag can narrow this to a specific origin.
const HTTP_CORS_HEADERS: &str = "Access-Control-Allow-Origin: *\r\n\
     Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: Content-Type, Authorization\r\n";

fn write_http_response(
    stream: &mut TcpStream,
    response: HttpResponseMessage,
) -> Result<(), CliError> {
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n",
        response.status,
        response.reason,
        response.content_type,
        response.body.len(),
        HTTP_CORS_HEADERS,
    );
    let mut encoded = header.into_bytes();
    encoded.extend_from_slice(&response.body);
    io_runtime(stream.write_all(&encoded), "failed to write http response")?;
    io_runtime(stream.flush(), "failed to flush http response")?;
    Ok(())
}

fn http_preflight_response() -> HttpResponseMessage {
    // Preflight body is empty; Content-Type is inert but emitted for uniformity
    // with the rest of the response pipeline (avoids a special-case header writer).
    HttpResponseMessage {
        status: 204,
        reason: "No Content",
        content_type: "text/plain".to_string(),
        body: Vec::new(),
    }
}

fn parse_http_json_import_records(body: &[u8]) -> Result<Vec<ImportRecord>, CliError> {
    let payload: JsonImportPayload = serde_json::from_slice(body)
        .map_err(|e| CliError::Runtime(format!("invalid json import payload: {e}")))?;
    let mut records = Vec::<ImportRecord>::new();
    match payload {
        JsonImportPayload::Graph(graph) => {
            for node in graph.nodes {
                records.push(ImportRecord::Node(ImportNodeRecord {
                    id: node.id,
                    labels: node.labels,
                    properties: json_properties_to_property_map(&node.properties)?,
                }));
            }
            for edge in graph.edges {
                records.push(ImportRecord::Edge(ImportEdgeRecord {
                    src: edge.src,
                    dst: edge.dst,
                    edge_type: edge_type_normalized(edge.edge_type),
                    properties: json_properties_to_property_map(&edge.properties)?,
                }));
            }
        }
        JsonImportPayload::LegacyEdgeList(edges) => {
            for edge in edges {
                records.push(ImportRecord::Edge(ImportEdgeRecord {
                    src: edge.src,
                    dst: edge.dst,
                    edge_type: None,
                    properties: PropertyMap::new(),
                }));
            }
        }
    }
    Ok(records)
}

fn parse_http_csv_import_records(body: &[u8]) -> Result<Vec<ImportRecord>, CliError> {
    let cursor = std::io::Cursor::new(body);
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .from_reader(cursor);
    let headers = reader
        .headers()
        .map_err(|e| CliError::Runtime(format!("invalid csv import header: {e}")))?
        .clone();

    let header_index = |name: &str| -> Option<usize> {
        headers
            .iter()
            .position(|value| value.trim().eq_ignore_ascii_case(name))
    };

    let id_idx = header_index("id");
    let src_idx = header_index("src");
    let dst_idx = header_index("dst");
    let labels_idx = header_index("labels");
    let type_idx = header_index("type").or_else(|| header_index("edge_type"));

    let mut records = Vec::<ImportRecord>::new();
    if let Some(id_idx) = id_idx {
        let property_columns = headers
            .iter()
            .enumerate()
            .filter_map(|(idx, key)| {
                if idx == id_idx || labels_idx == Some(idx) {
                    return None;
                }
                let key = key.trim();
                if key.is_empty() {
                    return None;
                }
                Some((idx, key.to_string()))
            })
            .collect::<Vec<_>>();

        for (idx, row) in reader.records().enumerate() {
            let line_no = idx + 2;
            let row = row.map_err(|e| {
                CliError::Runtime(format!("invalid csv node row at line {line_no}: {e}"))
            })?;
            let id =
                parse_u64_import_field(row.get(id_idx).unwrap_or_default().trim(), "id", line_no)?;
            let labels = labels_idx
                .and_then(|index| row.get(index))
                .unwrap_or_default()
                .split('|')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            let mut properties = PropertyMap::new();
            for (column_idx, key) in &property_columns {
                let raw = row.get(*column_idx).unwrap_or_default().trim();
                if raw.is_empty() {
                    continue;
                }
                properties.insert(key.clone(), coerce_csv_property_value(raw)?);
            }
            records.push(ImportRecord::Node(ImportNodeRecord {
                id,
                labels,
                properties,
            }));
        }
        return Ok(records);
    }

    if src_idx.is_none() || dst_idx.is_none() {
        return Err(CliError::Runtime(
            "csv import must include either id (nodes) or src+dst (edges) columns".to_string(),
        ));
    }

    let src_idx = src_idx.expect("checked src index");
    let dst_idx = dst_idx.expect("checked dst index");
    let property_columns = headers
        .iter()
        .enumerate()
        .filter_map(|(idx, key)| {
            if idx == src_idx || idx == dst_idx || type_idx == Some(idx) {
                return None;
            }
            let key = key.trim();
            if key.is_empty() {
                return None;
            }
            Some((idx, key.to_string()))
        })
        .collect::<Vec<_>>();

    for (idx, row) in reader.records().enumerate() {
        let line_no = idx + 2;
        let row = row.map_err(|e| {
            CliError::Runtime(format!("invalid csv edge row at line {line_no}: {e}"))
        })?;
        let src =
            parse_u64_import_field(row.get(src_idx).unwrap_or_default().trim(), "src", line_no)?;
        let dst =
            parse_u64_import_field(row.get(dst_idx).unwrap_or_default().trim(), "dst", line_no)?;
        let edge_type = type_idx
            .and_then(|column_idx| row.get(column_idx))
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let mut properties = PropertyMap::new();
        for (column_idx, key) in &property_columns {
            let raw = row.get(*column_idx).unwrap_or_default().trim();
            if raw.is_empty() {
                continue;
            }
            properties.insert(key.clone(), coerce_csv_property_value(raw)?);
        }
        records.push(ImportRecord::Edge(ImportEdgeRecord {
            src,
            dst,
            edge_type,
            properties,
        }));
    }
    Ok(records)
}

fn apply_import_records(
    shared_db: &SharedDatabase,
    records: Vec<ImportRecord>,
) -> Result<Value, CliError> {
    let imported_nodes = records
        .iter()
        .filter(|record| matches!(record, ImportRecord::Node(_)))
        .count() as u64;
    let imported_edges = records
        .iter()
        .filter(|record| matches!(record, ImportRecord::Edge(_)))
        .count() as u64;

    let commit =
        shared_db.with_write_transaction_retry(SERVER_MULTI_WRITER_RETRIES, |mut tx| {
            for record in records.clone() {
                match record {
                    ImportRecord::Node(node) => apply_import_node_record(&mut tx, &node)?,
                    ImportRecord::Edge(edge) => apply_import_edge_record(&mut tx, &edge)?,
                }
            }
            tx.commit()
        })?;

    // `commit.created_nodes` counts every `create_node()` call made during the
    // transaction, which includes the gap-fill nodes the importer creates to
    // match caller-supplied ids (importing a single `{"id":100}` into an empty
    // db allocates ids 0..=100 and reports 101 "created"). That is useful as
    // an internal bookkeeping counter but misleading as a public count field:
    // it looks like "I imported one node" should map to "created_nodes=1".
    //
    // Public contract — what a dashboard / CLI script sees:
    //   created_nodes      = count of node records that were applied (= imported_nodes)
    //   created_edges      = count of edge records that were applied (= imported_edges)
    //   highest_node_id    = max internal node id touched by the commit (former `created_nodes`).
    //
    // `highest_node_id` is the max id allocator saw during this commit — for a
    // sparse import like `{"id":100}` that is 100. For callers that relied on
    // the old shape to diff last-node-id, this field preserves that info.
    let highest_node_id = commit.created_nodes.saturating_sub(1);
    Ok(serde_json::json!({
        "status": "ok",
        "imported_nodes": imported_nodes,
        "imported_edges": imported_edges,
        "created_nodes": imported_nodes,
        "created_edges": imported_edges,
        "highest_node_id": highest_node_id,
    }))
}

fn render_http_export_csv(nodes: &[ExportNode], edges: &[ExportEdge]) -> Result<String, CliError> {
    let mut writer = csv::Writer::from_writer(Vec::<u8>::new());
    writer
        .write_record(["kind", "id", "src", "dst", "type", "labels", "properties"])
        .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
    for node in nodes {
        let properties_json = serde_json::to_string(&property_map_to_export_json(&node.properties))
            .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
        writer
            .write_record([
                "node",
                &node.id.to_string(),
                "",
                "",
                "",
                &node.labels.join("|"),
                &properties_json,
            ])
            .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
    }
    for edge in edges {
        let properties_json = serde_json::to_string(&property_map_to_export_json(&edge.properties))
            .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
        writer
            .write_record([
                "edge",
                "",
                &edge.src.to_string(),
                &edge.dst.to_string(),
                edge.edge_type.as_deref().unwrap_or(""),
                "",
                &properties_json,
            ])
            .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
    }
    writer
        .flush()
        .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
    let bytes = writer
        .into_inner()
        .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))?;
    String::from_utf8(bytes)
        .map_err(|e| CliError::Runtime(format!("failed to render export csv: {e}")))
}

// Outcome of the dispatch-prologue auth gate. `Allow` means the request may
// proceed — per-route handlers still run their own fine-grained checks (e.g.
// /query also maps the bearer token to a user for query_as_user). `Deny` is a
// pre-formed 401 response the caller returns verbatim.
enum AuthOutcome {
    Allow,
    Deny(HttpResponseMessage),
}

// Is this route "mutating" in the sense that it must require a bearer token
// when any user is registered on the database? /query is deliberately not in
// this set — it preserves anonymous access for browser playgrounds that the
// operator has deemed safe (same policy as pre-fix).
fn http_route_requires_auth_when_users_exist(method: &str, path: &str) -> bool {
    if method != "POST" {
        return false;
    }
    if path == "/export" || path == "/import" {
        return true;
    }
    if path == "/rdf/import" || path.starts_with("/rdf/import?") {
        return true;
    }
    if path.starts_with("/rag/") {
        return true;
    }
    // HTTP MCP transport: /mcp/invoke can mutate the graph (upsert_node,
    // rag_build_summaries, agent_store_episode, etc.); /mcp/tools leaks the
    // available tool surface. Both must require a bearer token whenever users
    // are registered — same policy as /export (5.2 CRIT fix).
    if path == "/mcp/tools" || path == "/mcp/invoke" {
        return true;
    }
    false
}

fn authenticate_http_request(
    shared_db: &SharedDatabase,
    request: &HttpRequestMessage,
    require_when_users_exist: bool,
) -> Result<AuthOutcome, CliError> {
    if let Some(auth_value) = http_header_value(&request.headers, "authorization") {
        let Some(token) = parse_bearer_token(auth_value) else {
            return Ok(AuthOutcome::Deny(http_error(
                401,
                "Unauthorized",
                "authorization header must be Bearer <token>",
            )));
        };
        match shared_db.authenticate_token(token)? {
            Some(_) => Ok(AuthOutcome::Allow),
            None => Ok(AuthOutcome::Deny(http_error(
                401,
                "Unauthorized",
                "invalid bearer token",
            ))),
        }
    } else if require_when_users_exist
        && shared_db
            .has_any_users()
            .map_err(|e| CliError::Runtime(e.to_string()))?
    {
        Ok(AuthOutcome::Deny(http_error(
            401,
            "Unauthorized",
            "bearer token required for this endpoint",
        )))
    } else {
        Ok(AuthOutcome::Allow)
    }
}

fn dispatch_http_request(
    shared_db: &SharedDatabase,
    db_path: &str,
    request: HttpRequestMessage,
) -> Result<HttpResponseMessage, CliError> {
    // Auth prologue — runs BEFORE any mutating handler. Pre-fix (audit F5.2),
    // /export and /rag/* had no auth check at all: any network-attached
    // client could exfiltrate the full graph. We now gate them on a valid
    // bearer token whenever at least one user is registered.
    let require_auth =
        http_route_requires_auth_when_users_exist(request.method.as_str(), request.path.as_str());
    if require_auth {
        match authenticate_http_request(shared_db, &request, true)? {
            AuthOutcome::Deny(response) => return Ok(response),
            AuthOutcome::Allow => {}
        }
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => Ok(http_json_response(
            200,
            "OK",
            serde_json::json!({ "status": "ok" }),
        )),
        ("GET", "/metrics") => {
            let snapshot = shared_db.read_snapshot()?;
            let metrics = snapshot.metrics()?;
            prom_metrics::refresh_state_gauges(metrics.node_count, metrics.edge_count, db_path);
            drop(snapshot);
            let body = prom_metrics::encode().map_err(|e| {
                CliError::Runtime(format!("prometheus encode failed: {e}"))
            })?;
            Ok(http_text_response(
                200,
                "OK",
                "text/plain; version=0.0.4",
                body,
            ))
        }
        ("GET", "/metrics/json") => {
            let snapshot = shared_db.read_snapshot()?;
            let metrics = snapshot.metrics()?;
            Ok(http_json_response(
                200,
                "OK",
                serde_json::json!({
                    "format_version": metrics.format_version,
                    "page_size": metrics.page_size,
                    "page_count": metrics.page_count,
                    "node_count": metrics.node_count,
                    "edge_count": metrics.edge_count,
                    "wal_size_bytes": metrics.wal_size_bytes,
                    "adjacency_base_edge_count": metrics.adjacency_base_edge_count,
                    "delta_buffer_edge_count": metrics.delta_buffer_edge_count,
                    "compaction_count": metrics.compaction_count,
                    "compaction_duration_us": metrics.compaction_duration_us,
                    "buffer_pool_hits": metrics.buffer_pool_hits,
                    "buffer_pool_misses": metrics.buffer_pool_misses,
                }),
            ))
        }
        ("GET", "/metrics/prometheus") => {
            let snapshot = shared_db.read_snapshot()?;
            let payload = render_prometheus_metrics(&snapshot)?;
            Ok(http_text_response(
                200,
                "OK",
                "text/plain; version=0.0.4",
                payload,
            ))
        }
        ("GET", "/schema") => {
            let snapshot = shared_db.read_snapshot()?;
            let schema = snapshot.schema_catalog();
            Ok(http_json_response(
                200,
                "OK",
                serde_json::json!({
                    "labels": schema.labels,
                    "edge_types": schema.edge_types,
                    "property_keys": schema.property_keys,
                }),
            ))
        }
        ("POST", "/query") => {
            // Malformed JSON body and missing/wrong-typed `query` are caller
            // errors, not server errors — surface as 400, not the blanket 500
            // the generic CliError-mapping layer would emit.
            let payload: Value = match serde_json::from_slice::<Value>(&request.body) {
                Ok(v) => v,
                Err(e) => {
                    return Ok(http_error(
                        400,
                        "Bad Request",
                        format!("invalid json query payload: {e}"),
                    ));
                }
            };
            let Some(query) = payload
                .as_object()
                .and_then(|object| object.get("query"))
                .and_then(Value::as_str)
            else {
                return Ok(http_error(
                    400,
                    "Bad Request",
                    "query payload must include string query",
                ));
            };

            let user =
                if let Some(auth_value) = http_header_value(&request.headers, "authorization") {
                    let Some(token) = parse_bearer_token(auth_value) else {
                        return Ok(http_error(
                            401,
                            "Unauthorized",
                            "authorization header must be Bearer <token>",
                        ));
                    };
                    match shared_db.authenticate_token(token)? {
                        Some(user) => user,
                        None => return Ok(http_error(401, "Unauthorized", "invalid bearer token")),
                    }
                } else {
                    "anonymous".to_string()
                };

            let started = Instant::now();
            let retries = match shared_db.write_mode() {
                WriteConcurrencyMode::SingleWriter => 0,
                WriteConcurrencyMode::MultiWriter { max_retries } => max_retries,
            };
            // Cap per-query execution time. The core engine has no cooperative
            // cancellation hook yet, so the worker thread is detached on
            // timeout — it will run to completion (holding the write lock) in
            // the background while the HTTP handler returns 504 to the client.
            // This prevents a single pathological query from wedging the
            // accept loop and starving all other clients indefinitely.
            let query_budget = http_query_exec_timeout();
            let (tx, rx) = std::sync::mpsc::channel();
            let shared_worker = shared_db.clone();
            let query_owned = query.to_string();
            let user_owned = user.clone();
            std::thread::spawn(move || {
                if let Ok(delay_ms) = std::env::var("OGDB_TEST_QUERY_DELAY_MS") {
                    if let Ok(ms) = delay_ms.parse::<u64>() {
                        std::thread::sleep(Duration::from_millis(ms));
                    }
                }
                let result = shared_worker.query_cypher_as_user_with_retry(
                    &user_owned,
                    &query_owned,
                    retries,
                );
                let _ = tx.send(result);
            });
            let result = match rx.recv_timeout(query_budget) {
                // Cypher parse/plan/execution failure is surfaced as
                // `DbError::InvalidArgument` by
                // `query_cypher_as_user_with_retry`. That is a client error —
                // they sent bad Cypher — so return 400, not the blanket 500
                // the generic CliError mapping would emit.
                Ok(Ok(result)) => result,
                Ok(Err(DbError::InvalidArgument(msg))) => {
                    return Ok(http_error(400, "Bad Request", msg));
                }
                Ok(Err(e)) => return Err(CliError::Runtime(e.to_string())),
                Err(_) => {
                    HTTP_QUERY_TIMEOUT_COUNT.fetch_add(1, Ordering::Relaxed);
                    eprintln!(
                        "query cancelled: exceeded {}ms budget (user={}, query_len={})",
                        query_budget.as_millis(),
                        user,
                        query.len(),
                    );
                    return Ok(http_error(
                        504,
                        "Gateway Timeout",
                        format!(
                            "query exceeded {}ms execution budget and was cancelled",
                            query_budget.as_millis()
                        ),
                    ));
                }
            };
            HTTP_QUERY_COUNT.fetch_add(1, Ordering::Relaxed);
            let elapsed_micros = u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX);
            HTTP_QUERY_DURATION_MICROS.fetch_add(elapsed_micros, Ordering::Relaxed);
            if http_accepts_csv(&request.headers) {
                let rows = query_result_as_rows(&result);
                return Ok(http_csv_response(
                    200,
                    "OK",
                    rows.render(QueryOutputFormat::Csv),
                ));
            }
            Ok(HttpResponseMessage {
                status: 200,
                reason: "OK",
                content_type: "application/json".to_string(),
                body: result.to_json().into_bytes(),
            })
        }
        ("POST", "/import") => {
            let content_type = http_content_type(&request.headers);
            let records = match content_type.as_str() {
                "" | "application/json" => parse_http_json_import_records(&request.body)?,
                "text/csv" => parse_http_csv_import_records(&request.body)?,
                _ => {
                    return Ok(http_error(
                        415,
                        "Unsupported Media Type",
                        format!("unsupported import content-type: {content_type}"),
                    ));
                }
            };
            let result = apply_import_records(shared_db, records)?;
            Ok(http_json_response(200, "OK", result))
        }
        ("POST", path) if path == "/rdf/import" || path.starts_with("/rdf/import?") => {
            if request.body.len() > RDF_IMPORT_MAX_BYTES {
                return Ok(http_error(
                    413,
                    "Payload Too Large",
                    format!(
                        "rdf import body is {} bytes; limit is {} bytes",
                        request.body.len(),
                        RDF_IMPORT_MAX_BYTES
                    ),
                ));
            }
            let format = match resolve_rdf_format_from_http(&request) {
                Ok(Some(format)) => format,
                Ok(None) => {
                    return Ok(http_error(
                        415,
                        "Unsupported Media Type",
                        "rdf import requires ?format= query or Content-Type header (ttl, nt, xml, jsonld, nq)",
                    ));
                }
                Err(message) => {
                    return Ok(http_error(415, "Unsupported Media Type", message));
                }
            };
            let base_uri = http_query_param(&request.path, "base_uri");
            handle_http_rdf_import(shared_db, db_path, &request.body, format, base_uri.as_deref())
        }
        ("POST", "/export") => {
            let content_type = http_content_type(&request.headers);
            let (label_filter, edge_type_filter, node_id_range) = if request.body.is_empty() {
                (None, None, None)
            } else {
                if !content_type.is_empty() && content_type != "application/json" {
                    return Ok(http_error(
                        415,
                        "Unsupported Media Type",
                        format!("unsupported export content-type: {content_type}"),
                    ));
                }
                let payload: Value = serde_json::from_slice(&request.body)
                    .map_err(|e| CliError::Runtime(format!("invalid json export payload: {e}")))?;
                let object = payload.as_object().ok_or_else(|| {
                    CliError::Runtime("export payload must be a json object".to_string())
                })?;
                let label_filter = object
                    .get("label")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let edge_type_filter = object
                    .get("edge_type")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let node_id_range = object
                    .get("node_id_range")
                    .and_then(Value::as_str)
                    .map(parse_node_id_range_filter)
                    .transpose()?;
                (label_filter, edge_type_filter, node_id_range)
            };

            let (nodes, edges) = shared_db
                .with_write(|db| {
                    collect_export_subset(
                        db,
                        label_filter.as_deref(),
                        edge_type_filter.as_deref(),
                        node_id_range,
                    )
                    .map_err(|err| DbError::InvalidArgument(err.to_string()))
                })
                .map_err(|e| CliError::Runtime(e.to_string()))?;

            if http_accepts_csv(&request.headers) {
                let csv = render_http_export_csv(&nodes, &edges)?;
                return Ok(http_csv_response(200, "OK", csv));
            }

            let payload = serde_json::json!({
                "nodes": nodes
                    .iter()
                    .map(|node| serde_json::json!({
                        "id": node.id,
                        "labels": node.labels,
                        "properties": property_map_to_export_json(&node.properties),
                    }))
                    .collect::<Vec<_>>(),
                "edges": edges
                    .iter()
                    .map(|edge| serde_json::json!({
                        "src": edge.src,
                        "dst": edge.dst,
                        "type": edge.edge_type,
                        "properties": property_map_to_export_json(&edge.properties),
                    }))
                    .collect::<Vec<_>>(),
            });
            Ok(http_json_response(200, "OK", payload))
        }
        ("POST", "/rag/communities") => {
            let resolutions: Option<Vec<f64>> = if request.body.is_empty() {
                None
            } else {
                let body: Value = serde_json::from_slice(&request.body)
                    .map_err(|e| CliError::Runtime(format!("invalid json: {e}")))?;
                body.get("resolutions")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
            };
            let snapshot = shared_db.read_snapshot()?;
            match snapshot.browse_communities(resolutions.as_deref()) {
                Ok(communities) => {
                    let payload = serde_json::to_value(&communities)
                        .map_err(|e| CliError::Runtime(format!("serialize error: {e}")))?;
                    Ok(http_json_response(200, "OK", payload))
                }
                Err(e) => Ok(http_error(400, "Bad Request", e.to_string())),
            }
        }
        ("POST", "/rag/drill") => {
            let body: Value = serde_json::from_slice(&request.body)
                .map_err(|e| CliError::Runtime(format!("invalid json: {e}")))?;
            let community_id = body
                .get("community_id")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| CliError::Runtime("community_id required".to_string()))?;
            let resolutions: Option<Vec<f64>> = body
                .get("resolutions")
                .and_then(|v| serde_json::from_value(v.clone()).ok());
            let snapshot = shared_db.read_snapshot()?;
            match snapshot.drill_into_community(community_id, resolutions.as_deref()) {
                Ok(result) => {
                    let payload = serde_json::to_value(&result)
                        .map_err(|e| CliError::Runtime(format!("serialize error: {e}")))?;
                    Ok(http_json_response(200, "OK", payload))
                }
                Err(e) => Ok(http_error(400, "Bad Request", e.to_string())),
            }
        }
        ("POST", "/rag/search") => {
            let body: Value = serde_json::from_slice(&request.body)
                .map_err(|e| CliError::Runtime(format!("invalid json: {e}")))?;
            let query_text = body
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let embedding: Option<Vec<f32>> = body
                .get("embedding")
                .and_then(|v| serde_json::from_value(v.clone()).ok());
            let k = body
                .get("k")
                .and_then(|v| v.as_u64())
                .unwrap_or(10) as usize;
            let community_id = body.get("community_id").and_then(|v| v.as_u64());
            let snapshot = shared_db.read_snapshot()?;
            match snapshot.rag_hybrid_search(query_text, embedding.as_deref(), k, community_id) {
                Ok(results) => {
                    let payload = rag_results_to_json(&results);
                    Ok(http_json_response(200, "OK", payload))
                }
                Err(e) => Ok(http_error(400, "Bad Request", e.to_string())),
            }
        }
        ("POST", "/rag/ingest") => {
            let body: Value = serde_json::from_slice(&request.body)
                .map_err(|e| CliError::Runtime(format!("invalid json: {e}")))?;
            let title = body
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if title.is_empty() {
                return Ok(http_error(400, "Bad Request", "title is required"));
            }
            let format_str = body
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("PlainText");
            let format = match format_str {
                "Pdf" | "pdf" | "PDF" => DocumentFormat::Pdf,
                "Markdown" | "markdown" | "md" => DocumentFormat::Markdown,
                _ => DocumentFormat::PlainText,
            };
            let data: Vec<u8> = if let Some(b64) = body.get("content_base64").and_then(|v| v.as_str()) {
                match base64_decode(b64) {
                    Ok(bytes) => bytes,
                    Err(msg) => return Ok(http_error(400, "Bad Request", format!("invalid base64: {msg}"))),
                }
            } else if let Some(text) = body.get("content").and_then(|v| v.as_str()) {
                text.as_bytes().to_vec()
            } else {
                return Ok(http_error(400, "Bad Request", "content or content_base64 required"));
            };
            let source_uri = body
                .get("source_uri")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let config = IngestConfig {
                title,
                format,
                source_uri,
                ..IngestConfig::default()
            };
            match shared_db.with_write(|db| db.ingest_document(&data, &config)) {
                Ok(result) => {
                    let payload = serde_json::to_value(&result)
                        .map_err(|e| CliError::Runtime(format!("serialize error: {e}")))?;
                    Ok(http_json_response(200, "OK", payload))
                }
                Err(e) => Ok(http_error(400, "Bad Request", e.to_string())),
            }
        }
        ("POST", "/mcp/tools") => Ok(handle_http_mcp_tools(db_path)),
        ("POST", "/mcp/invoke") => Ok(handle_http_mcp_invoke(db_path, &request.body)),
        ("OPTIONS", _) => {
            // CORS preflight — applies to every path, including unknown ones.
            // Browsers require 2xx here before they will issue the actual request.
            Ok(http_preflight_response())
        }
        ("GET", _) | ("POST", _) => Ok(http_error(
            404,
            "Not Found",
            format!("unknown endpoint: {}", request.path),
        )),
        _ => Ok(http_error(
            405,
            "Method Not Allowed",
            format!(
                "unsupported method for {}: {}",
                request.path, request.method
            ),
        )),
    }
}

// HTTP MCP transport: `/mcp/tools` and `/mcp/invoke` expose the same tool
// surface as `ogdb mcp --stdio`, so remote AI agents can drive the database
// over HTTP. Both delegate to the same primitives as the stdio path
// (`execute_mcp_request` for the tool catalog, `execute_mcp_tools_call` for
// invocation) — this is the single source of truth for the tool set, shared
// by both transports.
fn handle_http_mcp_tools(db_path: &str) -> HttpResponseMessage {
    let request_json = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;
    let response = execute_mcp_request(db_path, request_json);
    match serde_json::from_str::<Value>(&response) {
        Ok(value) => {
            if let Some(result) = value.get("result") {
                http_json_response(200, "OK", result.clone())
            } else if let Some(error) = value.get("error") {
                http_json_response(500, "Internal Server Error", error.clone())
            } else {
                http_error(
                    500,
                    "Internal Server Error",
                    "mcp tools/list produced neither result nor error",
                )
            }
        }
        Err(e) => http_error(
            500,
            "Internal Server Error",
            format!("failed to parse mcp response: {e}"),
        ),
    }
}

fn handle_http_mcp_invoke(db_path: &str, body: &[u8]) -> HttpResponseMessage {
    let payload: Value = match serde_json::from_slice(body) {
        Ok(value) => value,
        Err(e) => {
            return http_error(
                400,
                "Bad Request",
                format!("invalid json invoke payload: {e}"),
            );
        }
    };
    let object = match payload.as_object() {
        Some(object) => object,
        None => {
            return http_error(400, "Bad Request", "invoke payload must be a json object");
        }
    };
    if !object.contains_key("name") {
        return http_error(
            400,
            "Bad Request",
            "invoke payload must include string `name`",
        );
    }
    match execute_mcp_tools_call(db_path, Some(payload)) {
        Ok(result) => http_json_response(200, "OK", result),
        Err(message) => {
            // Known-bad tool or bad arguments map to 4xx so callers can
            // distinguish them from genuine server-side failures.
            let lowered = message.to_ascii_lowercase();
            let is_client_error = lowered.starts_with("unknown tool")
                || lowered.contains("must be")
                || lowered.contains("required")
                || lowered.contains("cannot be empty");
            let status = if is_client_error { 400 } else { 500 };
            let reason = if is_client_error {
                "Bad Request"
            } else {
                "Internal Server Error"
            };
            http_json_response(
                status,
                reason,
                serde_json::json!({ "error": message }),
            )
        }
    }
}

/// SSE handler for POST /query/trace.
/// Executes the query with real traversal tracing and streams each visited node as an SSE event,
/// followed by a final "result" event containing the complete query result JSON.
fn handle_trace_sse(
    shared_db: &SharedDatabase,
    request: &HttpRequestMessage,
    stream: &mut TcpStream,
) -> Result<(), CliError> {
    // Parse query from JSON body
    let payload: Value = serde_json::from_slice(&request.body)
        .map_err(|e| CliError::Runtime(format!("invalid json query payload: {e}")))?;
    let query = payload
        .as_object()
        .and_then(|object| object.get("query"))
        .and_then(Value::as_str)
        .ok_or_else(|| CliError::Runtime("query payload must include string query".to_string()))?;

    // Authenticate (same pattern as /query)
    let user = if let Some(auth_value) = http_header_value(&request.headers, "authorization") {
        let token = parse_bearer_token(auth_value)
            .ok_or_else(|| CliError::Runtime("authorization header must be Bearer <token>".to_string()))?;
        shared_db
            .authenticate_token(token)?
            .ok_or_else(|| CliError::Runtime("invalid bearer token".to_string()))?
    } else {
        "anonymous".to_string()
    };

    // Write SSE response headers immediately. CORS headers mirror write_http_response
    // so playground Live Mode can consume the stream from a non-backend origin.
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n{}\r\n",
        HTTP_CORS_HEADERS,
    );
    io_runtime(stream.write_all(header.as_bytes()), "failed to write SSE header")?;
    io_runtime(stream.flush(), "failed to flush SSE header")?;

    // Execute query with real traversal tracing
    let started = Instant::now();
    let retries = match shared_db.write_mode() {
        WriteConcurrencyMode::SingleWriter => 0,
        WriteConcurrencyMode::MultiWriter { max_retries } => max_retries,
    };
    let (result, trace) = shared_db
        .query_cypher_as_user_with_trace(&user, query, retries)
        .map_err(|e| CliError::Runtime(e.to_string()))?;

    HTTP_QUERY_COUNT.fetch_add(1, Ordering::Relaxed);
    let elapsed_micros = u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX);
    HTTP_QUERY_DURATION_MICROS.fetch_add(elapsed_micros, Ordering::Relaxed);

    // Stream each unique trace step as an SSE event (best-effort: ignore client disconnects)
    let unique_nodes = trace.unique_node_ids();
    for (i, node_id) in unique_nodes.iter().enumerate() {
        let event = format!(
            "event: trace\ndata: {}\n\n",
            serde_json::json!({ "nodeId": node_id, "stepIndex": i })
        );
        if io_runtime(stream.write_all(event.as_bytes()), "sse trace write").is_err() {
            return Ok(());
        }
        let _ = stream.flush();
    }

    // Send the complete query result as the final SSE event
    let result_json = result.to_json();
    let done_event = format!("event: result\ndata: {result_json}\n\n");
    let _ = io_runtime(stream.write_all(done_event.as_bytes()), "sse result write");
    let _ = stream.flush();

    Ok(())
}

fn handle_serve_http(
    db_path: &str,
    bind_addr: &str,
    max_requests: Option<u64>,
) -> Result<String, CliError> {
    if !Path::new(db_path).exists() {
        if let Some(parent) = Path::new(db_path).parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    CliError::Runtime(format!(
                        "failed to create database parent directory {}: {e}",
                        parent.display()
                    ))
                })?;
            }
        }
        let _ = SharedDatabase::init_with_write_mode(
            db_path,
            Header::default_v1(),
            WriteConcurrencyMode::MultiWriter {
                max_retries: SERVER_MULTI_WRITER_RETRIES,
            },
        )?;
    }
    let shared_db = SharedDatabase::open_with_write_mode(
        db_path,
        WriteConcurrencyMode::MultiWriter {
            max_retries: SERVER_MULTI_WRITER_RETRIES,
        },
    )?;
    let listener = io_runtime(
        TcpListener::bind(bind_addr),
        format!("failed to bind {bind_addr}"),
    )?;
    let local_addr = io_runtime(listener.local_addr(), "failed to query listener address")?;
    let listening = format!("listening on http://{local_addr}");
    eprintln!("{listening}");
    prom_metrics::ensure_registered();
    let max_requests = max_requests.unwrap_or(u64::MAX);
    let mut requests_processed = 0u64;

    loop {
        let (mut stream, _) = io_runtime(listener.accept(), "http accept failed")?;
        // Bound per-connection read/write time so a slow-loris client cannot
        // pin the loop forever. set_read_timeout / set_write_timeout apply to
        // the underlying socket — both this handle and the try_clone'd reader
        // inside read_http_request observe the same timeout.
        let timeout = http_stream_timeout();
        let _ = stream.set_read_timeout(Some(timeout));
        let _ = stream.set_write_timeout(Some(timeout));

        // A malformed-bytes / slow-loris / timed-out read must NOT tear down
        // the accept loop. Treat any read error as a dead connection: close
        // this stream, keep serving. Pre-fix (audit F5.3 + F5.6) this path
        // propagated via `?` and a single bad client could crash the server.
        let outcome = match read_http_request(&mut stream) {
            Ok(outcome) => outcome,
            Err(_) => continue,
        };
        match outcome {
            HttpReadOutcome::Closed => {
                // Drop the stream; do not count this toward the request budget.
                continue;
            }
            HttpReadOutcome::Rejected {
                status,
                reason,
                detail,
            } => {
                let response = http_error(status, reason, detail);
                let _ = write_http_response(&mut stream, response);
                requests_processed = requests_processed.saturating_add(1);
                if requests_processed >= max_requests {
                    return Ok(format!(
                        "{listening}\nserve_stopped protocol=http bind={} requests_processed={requests_processed}",
                        local_addr,
                    ));
                }
                continue;
            }
            HttpReadOutcome::Request(request) => {
                let route_label =
                    prom_metrics::route_label(&request.method, &request.path);
                let is_mutating = request.method == "POST";
                if is_mutating {
                    prom_metrics::TXN_ACTIVE.inc();
                }
                let timer = Instant::now();

                // Intercept POST /query/trace before normal dispatch — SSE writes directly to stream
                if request.method == "POST" && request.path == "/query/trace" {
                    let sse_status = match handle_trace_sse(&shared_db, &request, &mut stream) {
                        Ok(()) => 200u16,
                        Err(err) => {
                            let response = http_error(500, "Internal Server Error", err.to_string());
                            let _ = write_http_response(&mut stream, response);
                            500
                        }
                    };
                    if is_mutating {
                        prom_metrics::TXN_ACTIVE.dec();
                    }
                    let elapsed = timer.elapsed().as_secs_f64();
                    prom_metrics::REQUESTS_TOTAL
                        .with_label_values(&[&route_label, &sse_status.to_string()])
                        .inc();
                    prom_metrics::REQUEST_DURATION_SECONDS
                        .with_label_values(&[&route_label])
                        .observe(elapsed);
                    requests_processed = requests_processed.saturating_add(1);
                    if requests_processed >= max_requests {
                        return Ok(format!(
                            "{listening}\nserve_stopped protocol=http bind={} requests_processed={requests_processed}",
                            local_addr,
                        ));
                    }
                    continue;
                }

                let response = match dispatch_http_request(&shared_db, db_path, request) {
                    Ok(response) => response,
                    Err(err) => http_error(500, "Internal Server Error", err.to_string()),
                };
                let response_status = response.status;
                if is_mutating {
                    prom_metrics::TXN_ACTIVE.dec();
                }
                let elapsed = timer.elapsed().as_secs_f64();
                prom_metrics::REQUESTS_TOTAL
                    .with_label_values(&[&route_label, &response_status.to_string()])
                    .inc();
                prom_metrics::REQUEST_DURATION_SECONDS
                    .with_label_values(&[&route_label])
                    .observe(elapsed);
                write_http_response(&mut stream, response)?;
                requests_processed = requests_processed.saturating_add(1);
                if requests_processed >= max_requests {
                    return Ok(format!(
                        "{listening}\nserve_stopped protocol=http bind={} requests_processed={requests_processed}",
                        local_addr,
                    ));
                }
            }
        }
    }
}

const RDF_IMPORT_MAX_BYTES: usize = 128 * 1024 * 1024;
const RDF_IMPORT_HTTP_BATCH: usize = 10_000;

fn http_query_param(path: &str, key: &str) -> Option<String> {
    let (_, query) = path.split_once('?')?;
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some(parts) => parts,
            None => continue,
        };
        if k.eq_ignore_ascii_case(key) {
            return Some(http_decode_query_value(v));
        }
    }
    None
}

fn http_decode_query_value(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                match (hi, lo) {
                    (Some(hi), Some(lo)) => {
                        out.push(((hi * 16 + lo) as u8) as char);
                        i += 3;
                    }
                    _ => {
                        out.push('%');
                        i += 1;
                    }
                }
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}

fn rdf_format_from_query_str(value: &str) -> Option<RdfImportFormatArg> {
    match value.to_ascii_lowercase().as_str() {
        "ttl" | "turtle" => Some(RdfImportFormatArg::Ttl),
        "nt" | "ntriples" | "n-triples" => Some(RdfImportFormatArg::Nt),
        "xml" | "rdf" | "rdfxml" | "rdf-xml" => Some(RdfImportFormatArg::Xml),
        "jsonld" | "json-ld" | "json" => Some(RdfImportFormatArg::Jsonld),
        "nq" | "nquads" | "n-quads" => Some(RdfImportFormatArg::Nq),
        _ => None,
    }
}

fn rdf_format_from_content_type(content_type: &str) -> Option<RdfImportFormatArg> {
    match content_type {
        "text/turtle" | "application/x-turtle" => Some(RdfImportFormatArg::Ttl),
        "application/n-triples" | "text/plain" => Some(RdfImportFormatArg::Nt),
        "application/rdf+xml" => Some(RdfImportFormatArg::Xml),
        "application/ld+json" => Some(RdfImportFormatArg::Jsonld),
        "application/n-quads" => Some(RdfImportFormatArg::Nq),
        _ => None,
    }
}

fn resolve_rdf_format_from_http(
    request: &HttpRequestMessage,
) -> Result<Option<RdfImportFormatArg>, String> {
    if let Some(value) = http_query_param(&request.path, "format") {
        return match rdf_format_from_query_str(&value) {
            Some(format) => Ok(Some(format)),
            None => Err(format!("unsupported rdf format: {value}")),
        };
    }
    let content_type = http_content_type(&request.headers);
    if content_type.is_empty() {
        return Ok(None);
    }
    if let Some(format) = rdf_format_from_content_type(&content_type) {
        return Ok(Some(format));
    }
    Err(format!("unsupported rdf content-type: {content_type}"))
}

struct RdfUploadTempfile {
    path: std::path::PathBuf,
}

impl Drop for RdfUploadTempfile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn write_rdf_body_to_tempfile(body: &[u8], ext: &str) -> Result<RdfUploadTempfile, CliError> {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id() as u64;
    let name = format!("ogdb-rdf-upload-{pid:x}-{nanos:x}-{counter:x}.{ext}");
    let path = std::env::temp_dir().join(name);
    let mut file = File::create(&path).map_err(|e| {
        CliError::Runtime(format!(
            "failed to stage rdf upload at {}: {e}",
            path.display()
        ))
    })?;
    file.write_all(body).map_err(|e| {
        CliError::Runtime(format!(
            "failed to write rdf upload at {}: {e}",
            path.display()
        ))
    })?;
    drop(file);
    Ok(RdfUploadTempfile { path })
}

fn handle_http_rdf_import(
    shared_db: &SharedDatabase,
    db_path: &str,
    body: &[u8],
    format: RdfImportFormatArg,
    base_uri: Option<&str>,
) -> Result<HttpResponseMessage, CliError> {
    let tmp = write_rdf_body_to_tempfile(body, format.as_str())?;
    let tmp_path = tmp.path.to_string_lossy().into_owned();

    let parsed = parse_rdf_into_plan(&tmp_path, format, base_uri, false, false);
    let (plan, skipped_quads) = match parsed {
        Ok(value) => value,
        Err(CliError::Runtime(message)) => {
            return Ok(http_error(400, "Bad Request", message));
        }
        Err(err) => return Err(err),
    };

    let schema_labels = plan.schema_labels.clone();
    let schema_edge_types = plan.schema_edge_types.clone();
    let schema_property_keys = plan.schema_property_keys.clone();
    let prefixes = plan.prefixes.clone();
    let label_uris = plan.label_uris.clone();
    let predicate_uris = plan.predicate_uris.clone();
    let records = plan.into_records();

    let write_outcome = shared_db
        .with_write(|db| -> Result<(ImportProgress, u64, u64), DbError> {
            let mut batcher =
                ImportBatcher::new_with_mode(db, RDF_IMPORT_HTTP_BATCH, false, true);
            for record in records {
                batcher.mark_processed();
                batcher
                    .push(record)
                    .map_err(|e| DbError::InvalidArgument(e.to_string()))?;
            }
            let mut progress = batcher
                .finish()
                .map_err(|e| DbError::InvalidArgument(e.to_string()))?;
            progress.skipped_records = progress.skipped_records.saturating_add(skipped_quads);
            for label in &schema_labels {
                db.register_schema_label(label)?;
            }
            for edge_type in &schema_edge_types {
                db.register_schema_edge_type(edge_type)?;
            }
            for key in &schema_property_keys {
                db.register_schema_property_key(key)?;
            }
            Ok((progress, db.node_count(), db.edge_count()))
        })
        .map_err(|e| CliError::Runtime(e.to_string()))?;

    let (progress, total_nodes, total_edges) = write_outcome;

    let mut rdf_meta = load_rdf_meta(db_path)?;
    for (prefix, iri) in prefixes {
        rdf_meta.prefixes.insert(prefix, iri);
    }
    for (label, iri) in label_uris {
        rdf_meta.label_uris.insert(label, iri);
    }
    for (key, iri) in predicate_uris {
        rdf_meta.predicate_uris.insert(key, iri);
    }
    rdf_meta.format_version = RDF_META_FORMAT_VERSION;
    save_rdf_meta(db_path, &rdf_meta)?;

    Ok(http_json_response(
        200,
        "OK",
        serde_json::json!({
            "ok": true,
            "db_path": db_path,
            "format": format.as_str(),
            "processed_records": progress.processed_records,
            "imported_nodes": progress.imported_nodes,
            "imported_edges": progress.imported_edges,
            "skipped_records": progress.skipped_records,
            "committed_batches": progress.committed_batches,
            "created_nodes": progress.created_nodes,
            "total_nodes": total_nodes,
            "total_edges": total_edges,
            "warnings": [],
        }),
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GraphDataFormat {
    Csv,
    Json,
    Jsonl,
}

impl GraphDataFormat {
    fn as_str(self) -> &'static str {
        match self {
            Self::Csv => "csv",
            Self::Json => "json",
            Self::Jsonl => "jsonl",
        }
    }
}

const RDF_META_FORMAT_VERSION: u32 = 1;
const RDF_TYPE_IRI: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUB_CLASS_OF_IRI: &str = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const OWL_CLASS_IRI: &str = "http://www.w3.org/2002/07/owl#Class";
const OWL_OBJECT_PROPERTY_IRI: &str = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATATYPE_PROPERTY_IRI: &str = "http://www.w3.org/2002/07/owl#DatatypeProperty";
const SH_NODE_SHAPE: &str = "http://www.w3.org/ns/shacl#NodeShape";
const SH_TARGET_CLASS: &str = "http://www.w3.org/ns/shacl#targetClass";
const SH_PROPERTY: &str = "http://www.w3.org/ns/shacl#property";
const SH_PATH: &str = "http://www.w3.org/ns/shacl#path";
const SH_MIN_COUNT: &str = "http://www.w3.org/ns/shacl#minCount";
const RDF_RESERVED_LABEL_BLANK_NODE: &str = "_BlankNode";
const RDF_RESERVED_LABEL_CLASS_NODE: &str = "_RdfClass";
const RDF_SUBCLASS_EDGE_TYPE: &str = "_subClassOf";

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum RdfImportFormatArg {
    Ttl,
    Nt,
    Xml,
    Jsonld,
    Nq,
}

impl RdfImportFormatArg {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ttl => "ttl",
            Self::Nt => "nt",
            Self::Xml => "xml",
            Self::Jsonld => "jsonld",
            Self::Nq => "nq",
        }
    }

    fn to_rdf_format(self) -> RdfFormat {
        match self {
            Self::Ttl => RdfFormat::Turtle,
            Self::Nt => RdfFormat::NTriples,
            Self::Xml => RdfFormat::RdfXml,
            Self::Jsonld => RdfFormat::JsonLd {
                profile: JsonLdProfileSet::empty(),
            },
            Self::Nq => RdfFormat::NQuads,
        }
    }

    fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "ttl" => Some(Self::Ttl),
            "nt" => Some(Self::Nt),
            "rdf" | "xml" => Some(Self::Xml),
            "jsonld" | "json" => Some(Self::Jsonld),
            "nq" => Some(Self::Nq),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
enum RdfExportFormatArg {
    Ttl,
    Nt,
    Xml,
    Jsonld,
}

impl RdfExportFormatArg {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ttl => "ttl",
            Self::Nt => "nt",
            Self::Xml => "xml",
            Self::Jsonld => "jsonld",
        }
    }

    fn to_rdf_format(self) -> RdfFormat {
        match self {
            Self::Ttl => RdfFormat::Turtle,
            Self::Nt => RdfFormat::NTriples,
            Self::Xml => RdfFormat::RdfXml,
            Self::Jsonld => RdfFormat::JsonLd {
                profile: JsonLdProfileSet::empty(),
            },
        }
    }

    fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_ascii_lowercase().as_str() {
            "ttl" => Some(Self::Ttl),
            "nt" => Some(Self::Nt),
            "rdf" | "xml" => Some(Self::Xml),
            "jsonld" | "json" => Some(Self::Jsonld),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PersistedRdfMeta {
    format_version: u32,
    #[serde(default)]
    prefixes: BTreeMap<String, String>,
    #[serde(default)]
    label_uris: BTreeMap<String, String>,
    #[serde(default)]
    predicate_uris: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum RdfResourceKey {
    Named(String),
    Blank(String),
}

impl RdfResourceKey {
    fn uri_value(&self) -> String {
        match self {
            Self::Named(iri) => iri.clone(),
            Self::Blank(id) => format!("_:{}", id),
        }
    }

    fn local_name(&self) -> String {
        match self {
            Self::Named(iri) => local_name_from_iri(iri),
            Self::Blank(id) => id.clone(),
        }
    }
}

#[derive(Debug, Clone)]
struct RdfNodeState {
    id: u64,
    labels: BTreeSet<String>,
    properties: PropertyMap,
}

#[derive(Debug, Default)]
struct RdfImportPlan {
    next_node_id: u64,
    resource_nodes: HashMap<RdfResourceKey, u64>,
    hierarchy_nodes: HashMap<RdfResourceKey, u64>,
    nodes: HashMap<u64, RdfNodeState>,
    edges: Vec<ImportEdgeRecord>,
    schema_labels: BTreeSet<String>,
    schema_edge_types: BTreeSet<String>,
    schema_property_keys: BTreeSet<String>,
    prefixes: BTreeMap<String, String>,
    label_uris: BTreeMap<String, String>,
    predicate_uris: BTreeMap<String, String>,
}

impl RdfImportPlan {
    fn allocate_node_id(&mut self) -> u64 {
        let id = self.next_node_id;
        self.next_node_id = self.next_node_id.saturating_add(1);
        id
    }

    fn ensure_resource_node(&mut self, key: &RdfResourceKey, graph: Option<&str>) -> u64 {
        if let Some(id) = self.resource_nodes.get(key).copied() {
            if let Some(graph) = graph {
                let node = self
                    .nodes
                    .get_mut(&id)
                    .expect("resource node id must resolve to state");
                node.properties
                    .entry("_graph".to_string())
                    .or_insert_with(|| PropertyValue::String(graph.to_string()));
            }
            return id;
        }
        let id = self.allocate_node_id();
        self.resource_nodes.insert(key.clone(), id);
        let mut labels = BTreeSet::<String>::new();
        let mut properties = PropertyMap::new();
        match key {
            RdfResourceKey::Named(iri) => {
                properties.insert("_uri".to_string(), PropertyValue::String(iri.clone()));
            }
            RdfResourceKey::Blank(blank_id) => {
                labels.insert(RDF_RESERVED_LABEL_BLANK_NODE.to_string());
                properties.insert(
                    "_uri".to_string(),
                    PropertyValue::String(format!("_:{}", blank_id)),
                );
                properties.insert(
                    "_blank_id".to_string(),
                    PropertyValue::String(blank_id.clone()),
                );
            }
        }
        if let Some(graph) = graph {
            properties.insert(
                "_graph".to_string(),
                PropertyValue::String(graph.to_string()),
            );
        }
        self.nodes.insert(
            id,
            RdfNodeState {
                id,
                labels,
                properties,
            },
        );
        id
    }

    fn ensure_hierarchy_node(&mut self, key: &RdfResourceKey) -> u64 {
        if let Some(id) = self.hierarchy_nodes.get(key).copied() {
            return id;
        }
        let id = self.allocate_node_id();
        self.hierarchy_nodes.insert(key.clone(), id);
        let mut labels = BTreeSet::<String>::new();
        labels.insert(RDF_RESERVED_LABEL_CLASS_NODE.to_string());
        let mut properties = PropertyMap::new();
        properties.insert("_uri".to_string(), PropertyValue::String(key.uri_value()));
        if let RdfResourceKey::Blank(blank_id) = key {
            properties.insert(
                "_blank_id".to_string(),
                PropertyValue::String(blank_id.clone()),
            );
        }
        properties.insert(
            "label".to_string(),
            PropertyValue::String(key.local_name().to_string()),
        );
        self.nodes.insert(
            id,
            RdfNodeState {
                id,
                labels,
                properties,
            },
        );
        id
    }

    fn add_schema_label(&mut self, label: &str, iri: &str) {
        self.schema_labels.insert(label.to_string());
        self.label_uris.insert(label.to_string(), iri.to_string());
    }

    fn add_schema_edge_type(&mut self, edge_type: &str, iri: &str) {
        self.schema_edge_types.insert(edge_type.to_string());
        self.predicate_uris
            .insert(edge_type.to_string(), iri.to_string());
    }

    fn add_schema_property_key(&mut self, key: &str, iri: &str) {
        self.schema_property_keys.insert(key.to_string());
        self.predicate_uris.insert(key.to_string(), iri.to_string());
    }

    fn add_rdf_type(
        &mut self,
        subject: &RdfResourceKey,
        class_label: &str,
        class_uri: &str,
        graph_name: Option<&str>,
    ) {
        let subject_id = self.ensure_resource_node(subject, graph_name);
        let subject_node = self
            .nodes
            .get_mut(&subject_id)
            .expect("subject node must exist");
        subject_node.labels.insert(class_label.to_string());
        self.add_schema_label(class_label, class_uri);
    }

    fn add_literal_property(
        &mut self,
        subject: &RdfResourceKey,
        predicate_uri: &str,
        value: PropertyValue,
        graph_name: Option<&str>,
    ) {
        let key = local_name_from_iri(predicate_uri);
        let subject_id = self.ensure_resource_node(subject, graph_name);
        let subject_node = self
            .nodes
            .get_mut(&subject_id)
            .expect("subject node must exist");
        subject_node.properties.insert(key.clone(), value);
        self.add_schema_property_key(&key, predicate_uri);
    }

    fn add_resource_edge(
        &mut self,
        subject: &RdfResourceKey,
        predicate_uri: &str,
        object: &RdfResourceKey,
        graph_name: Option<&str>,
    ) {
        let src = self.ensure_resource_node(subject, graph_name);
        let dst = self.ensure_resource_node(object, graph_name);
        let edge_type = edge_type_from_iri(predicate_uri);
        let mut properties = PropertyMap::new();
        properties.insert(
            "_uri".to_string(),
            PropertyValue::String(predicate_uri.to_string()),
        );
        if let Some(graph_name) = graph_name {
            properties.insert(
                "_graph".to_string(),
                PropertyValue::String(graph_name.to_string()),
            );
        }
        self.edges.push(ImportEdgeRecord {
            src,
            dst,
            edge_type: Some(edge_type.clone()),
            properties,
        });
        self.add_schema_edge_type(&edge_type, predicate_uri);
    }

    fn add_subclass_edge(&mut self, child: &RdfResourceKey, parent: &RdfResourceKey) {
        let src = self.ensure_hierarchy_node(child);
        let dst = self.ensure_hierarchy_node(parent);
        let mut properties = PropertyMap::new();
        properties.insert(
            "_uri".to_string(),
            PropertyValue::String(RDFS_SUB_CLASS_OF_IRI.to_string()),
        );
        self.edges.push(ImportEdgeRecord {
            src,
            dst,
            edge_type: Some(RDF_SUBCLASS_EDGE_TYPE.to_string()),
            properties,
        });
    }

    fn into_records(self) -> Vec<ImportRecord> {
        let mut nodes = self.nodes.into_values().collect::<Vec<_>>();
        nodes.sort_by_key(|node| node.id);
        let mut records = Vec::<ImportRecord>::with_capacity(nodes.len() + self.edges.len());
        for node in nodes {
            records.push(ImportRecord::Node(ImportNodeRecord {
                id: node.id,
                labels: node.labels.into_iter().collect(),
                properties: node.properties,
            }));
        }
        records.extend(self.edges.into_iter().map(ImportRecord::Edge));
        records
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ImportNodeRecord {
    id: u64,
    labels: Vec<String>,
    properties: PropertyMap,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ImportEdgeRecord {
    src: u64,
    dst: u64,
    edge_type: Option<String>,
    properties: PropertyMap,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ImportRecord {
    Node(ImportNodeRecord),
    Edge(ImportEdgeRecord),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ImportProgress {
    processed_records: u64,
    imported_nodes: u64,
    imported_edges: u64,
    skipped_records: u64,
    committed_batches: u64,
    created_nodes: u64,
}

#[derive(Debug, Clone)]
struct ImportRdfOptions {
    format_hint: Option<RdfImportFormatArg>,
    base_uri: Option<String>,
    schema_only: bool,
    batch_size: usize,
    continue_on_error: bool,
    atomic: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NodeIdRange {
    start: u64,
    end: u64,
}

#[derive(Debug)]
struct ImportBatcher<'a> {
    db: &'a mut Database,
    batch_size: usize,
    continue_on_error: bool,
    atomic_mode: bool,
    pending: Vec<ImportRecord>,
    progress: ImportProgress,
}

impl<'a> ImportBatcher<'a> {
    fn new(db: &'a mut Database, batch_size: usize, continue_on_error: bool) -> Self {
        Self::new_with_mode(db, batch_size, continue_on_error, false)
    }

    fn new_with_mode(
        db: &'a mut Database,
        batch_size: usize,
        continue_on_error: bool,
        atomic_mode: bool,
    ) -> Self {
        Self {
            db,
            batch_size,
            continue_on_error,
            atomic_mode,
            pending: Vec::new(),
            progress: ImportProgress {
                processed_records: 0,
                imported_nodes: 0,
                imported_edges: 0,
                skipped_records: 0,
                committed_batches: 0,
                created_nodes: 0,
            },
        }
    }

    fn mark_processed(&mut self) {
        self.progress.processed_records = self.progress.processed_records.saturating_add(1);
    }

    fn mark_skipped(&mut self) {
        self.progress.skipped_records = self.progress.skipped_records.saturating_add(1);
    }

    fn push(&mut self, record: ImportRecord) -> Result<(), CliError> {
        self.pending.push(record);
        if !self.atomic_mode && self.pending.len() >= self.batch_size {
            self.flush()?;
        }
        Ok(())
    }

    fn flush(&mut self) -> Result<(), CliError> {
        if self.pending.is_empty() {
            return Ok(());
        }

        let batch = std::mem::take(&mut self.pending);
        let mut tx = self.db.begin_write();
        let mut applied_records = 0u64;
        let mut imported_nodes = 0u64;
        let mut imported_edges = 0u64;
        let mut skipped_records = 0u64;
        for record in batch {
            let apply_result = match &record {
                ImportRecord::Node(node) => apply_import_node_record(&mut tx, node),
                ImportRecord::Edge(edge) => apply_import_edge_record(&mut tx, edge),
            };
            match apply_result {
                Ok(()) => {
                    applied_records = applied_records.saturating_add(1);
                    match record {
                        ImportRecord::Node(_) => imported_nodes = imported_nodes.saturating_add(1),
                        ImportRecord::Edge(_) => imported_edges = imported_edges.saturating_add(1),
                    }
                }
                Err(err) => {
                    if self.continue_on_error {
                        skipped_records = skipped_records.saturating_add(1);
                        continue;
                    }
                    if self.atomic_mode {
                        return Err(CliError::Runtime(format!(
                            "atomic import rolled back: record {} failed: {err}",
                            self.progress.processed_records + applied_records + skipped_records + 1
                        )));
                    }
                    return Err(CliError::Runtime(format!("failed to import record: {err}")));
                }
            }
        }

        self.progress.imported_nodes = self.progress.imported_nodes.saturating_add(imported_nodes);
        self.progress.imported_edges = self.progress.imported_edges.saturating_add(imported_edges);
        self.progress.skipped_records = self
            .progress
            .skipped_records
            .saturating_add(skipped_records);

        if applied_records == 0 {
            tx.rollback();
            return Ok(());
        }

        let commit = tx.commit()?;
        self.progress.created_nodes = self
            .progress
            .created_nodes
            .saturating_add(commit.created_nodes);
        self.progress.committed_batches = self.progress.committed_batches.saturating_add(1);
        Ok(())
    }

    fn finish(mut self) -> Result<ImportProgress, CliError> {
        self.flush()?;
        Ok(self.progress)
    }
}

#[derive(Debug, Clone)]
struct CsvBundlePaths {
    nodes_path: PathBuf,
    edges_path: PathBuf,
}

#[derive(Debug, Deserialize)]
struct JsonNodeRecord {
    id: u64,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    properties: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
struct JsonEdgeRecord {
    #[serde(alias = "startNode")]
    src: u64,
    #[serde(alias = "endNode")]
    dst: u64,
    #[serde(default, rename = "type", alias = "edge_type")]
    edge_type: Option<String>,
    #[serde(default)]
    properties: Map<String, Value>,
}

#[derive(Debug, Deserialize, Default)]
struct JsonGraphPayload {
    #[serde(default)]
    nodes: Vec<JsonNodeRecord>,
    #[serde(default)]
    edges: Vec<JsonEdgeRecord>,
}

#[derive(Debug, Deserialize)]
struct LegacyJsonEdgeRow {
    #[serde(alias = "startNode")]
    src: u64,
    #[serde(alias = "endNode")]
    dst: u64,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum JsonImportPayload {
    Graph(JsonGraphPayload),
    LegacyEdgeList(Vec<LegacyJsonEdgeRow>),
}

fn parse_u64_import_field(raw: &str, name: &str, line_no: usize) -> Result<u64, CliError> {
    raw.parse::<u64>().map_err(|_| {
        CliError::Runtime(format!(
            "invalid {name} value at line {line_no}: {raw} (expected unsigned integer)"
        ))
    })
}

fn graph_data_format_from_output_format(
    format: Option<QueryOutputFormat>,
    operation: &str,
) -> Result<Option<GraphDataFormat>, CliError> {
    match format {
        Some(QueryOutputFormat::Csv) => Ok(Some(GraphDataFormat::Csv)),
        Some(QueryOutputFormat::Json) => Ok(Some(GraphDataFormat::Json)),
        Some(QueryOutputFormat::Jsonl) => Ok(Some(GraphDataFormat::Jsonl)),
        Some(QueryOutputFormat::Table) | Some(QueryOutputFormat::Tsv) => Err(CliError::Usage(
            format!("unsupported --format for {operation}: expected csv|json|jsonl"),
        )),
        None => Ok(None),
    }
}

fn detect_graph_data_format(path: &str) -> Option<GraphDataFormat> {
    let ext = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;
    match ext.as_str() {
        "csv" => Some(GraphDataFormat::Csv),
        "json" => Some(GraphDataFormat::Json),
        "jsonl" | "ndjson" => Some(GraphDataFormat::Jsonl),
        _ => None,
    }
}

fn resolve_graph_data_format(
    format: Option<QueryOutputFormat>,
    path: &str,
    operation: &str,
) -> Result<GraphDataFormat, CliError> {
    if let Some(selected) = graph_data_format_from_output_format(format, operation)? {
        return Ok(selected);
    }
    detect_graph_data_format(path).ok_or_else(|| {
        CliError::Runtime(format!(
            "unable to determine {operation} format from path: {path} (use --format csv|json|jsonl)"
        ))
    })
}

fn csv_bundle_paths(base_path: &Path) -> CsvBundlePaths {
    if base_path.is_dir() {
        return CsvBundlePaths {
            nodes_path: base_path.join("nodes.csv"),
            edges_path: base_path.join("edges.csv"),
        };
    }

    let raw = base_path.to_string_lossy();
    if raw.ends_with(".nodes.csv") {
        let prefix = raw.trim_end_matches(".nodes.csv");
        return CsvBundlePaths {
            nodes_path: base_path.to_path_buf(),
            edges_path: PathBuf::from(format!("{prefix}.edges.csv")),
        };
    }
    if raw.ends_with(".edges.csv") {
        let prefix = raw.trim_end_matches(".edges.csv");
        return CsvBundlePaths {
            nodes_path: PathBuf::from(format!("{prefix}.nodes.csv")),
            edges_path: base_path.to_path_buf(),
        };
    }

    if base_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("csv"))
        .unwrap_or(false)
    {
        let mut stem = base_path.to_path_buf();
        stem.set_extension("");
        return CsvBundlePaths {
            nodes_path: PathBuf::from(format!("{}.nodes.csv", stem.display())),
            edges_path: PathBuf::from(format!("{}.edges.csv", stem.display())),
        };
    }

    CsvBundlePaths {
        nodes_path: PathBuf::from(format!("{}.nodes.csv", base_path.display())),
        edges_path: PathBuf::from(format!("{}.edges.csv", base_path.display())),
    }
}

fn coerce_csv_property_value(raw: &str) -> Result<PropertyValue, CliError> {
    let trimmed = raw.trim();
    if let Some((prefix, _)) = trimmed.split_once(':') {
        let prefix = prefix.to_ascii_lowercase();
        if matches!(
            prefix.as_str(),
            "bool" | "i64" | "f64" | "string" | "bytes" | "vector"
        ) {
            return parse_property_value_literal(trimmed);
        }
    }

    if trimmed.eq_ignore_ascii_case("true") {
        return Ok(PropertyValue::Bool(true));
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return Ok(PropertyValue::Bool(false));
    }
    if let Ok(value) = trimmed.parse::<i64>() {
        return Ok(PropertyValue::I64(value));
    }
    if let Ok(value) = trimmed.parse::<f64>() {
        if value.is_finite() {
            return Ok(PropertyValue::F64(value));
        }
    }

    Ok(PropertyValue::String(trimmed.to_string()))
}

fn handle_stream_parse_error(
    continue_on_error: bool,
    progress: &mut ImportBatcher<'_>,
    err: CliError,
) -> Result<(), CliError> {
    if continue_on_error {
        progress.mark_skipped();
        return Ok(());
    }
    Err(err)
}

fn stream_csv_nodes_file(path: &Path, batcher: &mut ImportBatcher<'_>) -> Result<(), CliError> {
    let file = File::open(path)
        .map_err(|e| CliError::Runtime(format!("failed to open import source: {e}")))?;
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .flexible(true)
        .from_reader(file);
    let headers = reader
        .headers()
        .map_err(|e| CliError::Runtime(format!("invalid csv node header: {e}")))?
        .clone();
    if headers.len() < 2
        || !headers
            .get(0)
            .unwrap_or_default()
            .eq_ignore_ascii_case("id")
        || !headers
            .get(1)
            .unwrap_or_default()
            .eq_ignore_ascii_case("labels")
    {
        return Err(CliError::Runtime(
            "invalid csv node header: expected columns starting with id,labels".to_string(),
        ));
    }

    let property_keys: Vec<String> = headers.iter().skip(2).map(str::to_string).collect();
    for (idx, row_result) in reader.records().enumerate() {
        let line_no = idx + 2;
        batcher.mark_processed();
        let row = match row_result {
            Ok(value) => value,
            Err(err) => {
                let parse_err =
                    CliError::Runtime(format!("invalid csv node row at line {line_no}: {err}"));
                handle_stream_parse_error(batcher.continue_on_error, batcher, parse_err)?;
                continue;
            }
        };

        let id_raw = row.get(0).unwrap_or_default().trim();
        let labels_raw = row.get(1).unwrap_or_default().trim();
        let parse_node = (|| -> Result<ImportNodeRecord, CliError> {
            let id = parse_u64_import_field(id_raw, "id", line_no)?;
            let labels = labels_raw
                .split('|')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>();
            let mut properties = PropertyMap::new();
            for (idx, key) in property_keys.iter().enumerate() {
                let raw = row.get(idx + 2).unwrap_or_default().trim();
                if raw.is_empty() {
                    continue;
                }
                properties.insert(key.clone(), coerce_csv_property_value(raw)?);
            }
            Ok(ImportNodeRecord {
                id,
                labels,
                properties,
            })
        })();

        match parse_node {
            Ok(node) => batcher.push(ImportRecord::Node(node))?,
            Err(err) => {
                handle_stream_parse_error(batcher.continue_on_error, batcher, err)?;
            }
        }
    }

    Ok(())
}

fn stream_csv_edges_file(path: &Path, batcher: &mut ImportBatcher<'_>) -> Result<(), CliError> {
    let file = File::open(path)
        .map_err(|e| CliError::Runtime(format!("failed to open import source: {e}")))?;
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .flexible(true)
        .from_reader(file);
    let headers = reader
        .headers()
        .map_err(|e| CliError::Runtime(format!("invalid csv edge header: {e}")))?
        .clone();
    if headers.len() < 2
        || !headers
            .get(0)
            .unwrap_or_default()
            .eq_ignore_ascii_case("src")
        || !headers
            .get(1)
            .unwrap_or_default()
            .eq_ignore_ascii_case("dst")
    {
        return Err(CliError::Runtime(
            "invalid csv edge header: expected columns starting with src,dst".to_string(),
        ));
    }

    let has_type_column = headers
        .get(2)
        .map(|value| value.eq_ignore_ascii_case("type"))
        .unwrap_or(false);
    let property_start = if has_type_column { 3 } else { 2 };
    let property_keys: Vec<String> = headers
        .iter()
        .skip(property_start)
        .map(str::to_string)
        .collect();

    for (idx, row_result) in reader.records().enumerate() {
        let line_no = idx + 2;
        batcher.mark_processed();
        let row = match row_result {
            Ok(value) => value,
            Err(err) => {
                let parse_err =
                    CliError::Runtime(format!("invalid csv edge row at line {line_no}: {err}"));
                handle_stream_parse_error(batcher.continue_on_error, batcher, parse_err)?;
                continue;
            }
        };
        let parse_edge = (|| -> Result<ImportEdgeRecord, CliError> {
            let src =
                parse_u64_import_field(row.get(0).unwrap_or_default().trim(), "src", line_no)?;
            let dst =
                parse_u64_import_field(row.get(1).unwrap_or_default().trim(), "dst", line_no)?;
            let edge_type = if has_type_column {
                row.get(2)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
            } else {
                None
            };
            let mut properties = PropertyMap::new();
            for (idx, key) in property_keys.iter().enumerate() {
                let raw = row.get(property_start + idx).unwrap_or_default().trim();
                if raw.is_empty() {
                    continue;
                }
                properties.insert(key.clone(), coerce_csv_property_value(raw)?);
            }
            Ok(ImportEdgeRecord {
                src,
                dst,
                edge_type,
                properties,
            })
        })();

        match parse_edge {
            Ok(edge) => batcher.push(ImportRecord::Edge(edge))?,
            Err(err) => {
                handle_stream_parse_error(batcher.continue_on_error, batcher, err)?;
            }
        }
    }

    Ok(())
}

fn stream_csv_import(src_path: &str, batcher: &mut ImportBatcher<'_>) -> Result<(), CliError> {
    let src = Path::new(src_path);
    let bundle = csv_bundle_paths(src);
    let has_nodes = bundle.nodes_path.exists();
    let has_edges = bundle.edges_path.exists();

    if has_nodes || has_edges {
        if has_nodes {
            stream_csv_nodes_file(&bundle.nodes_path, batcher)?;
        }
        if has_edges {
            stream_csv_edges_file(&bundle.edges_path, batcher)?;
        }
        return Ok(());
    }

    stream_csv_edges_file(src, batcher)
}

fn json_value_to_property_value(value: &Value) -> Result<PropertyValue, CliError> {
    match value {
        Value::Bool(value) => Ok(PropertyValue::Bool(*value)),
        Value::Number(number) => {
            if let Some(value) = number.as_u64() {
                let value = i64::try_from(value).map_err(|_| {
                    CliError::Runtime(format!(
                        "numeric property value out of range for i64: {value}"
                    ))
                })?;
                return Ok(PropertyValue::I64(value));
            }
            if let Some(value) = number.as_i64() {
                return Ok(PropertyValue::I64(value));
            }
            Ok(PropertyValue::F64(
                number
                    .as_f64()
                    .expect("serde_json::Number must be representable as f64"),
            ))
        }
        Value::String(value) => {
            if let Some(raw) = value.strip_prefix("bytes:") {
                return decode_hex_bytes(raw).map(PropertyValue::Bytes);
            }
            Ok(PropertyValue::String(value.clone()))
        }
        Value::Array(values) => {
            let mut vector = Vec::<f32>::with_capacity(values.len());
            for entry in values {
                let Value::Number(number) = entry else {
                    return Err(CliError::Runtime(
                        "unsupported non-numeric vector property entry in import payload"
                            .to_string(),
                    ));
                };
                vector.push(
                    number
                        .as_f64()
                        .expect("serde_json::Number must be representable as f64")
                        as f32,
                );
            }
            Ok(PropertyValue::Vector(vector))
        }
        Value::Null => Err(CliError::Runtime(
            "unsupported null property value in import payload".to_string(),
        )),
        Value::Object(_) => Err(CliError::Runtime(
            "unsupported non-scalar property value in import payload".to_string(),
        )),
    }
}

fn json_properties_to_property_map(
    properties: &Map<String, Value>,
) -> Result<PropertyMap, CliError> {
    let mut out = PropertyMap::new();
    for (key, value) in properties {
        if value.is_null() {
            continue;
        }
        out.insert(key.clone(), json_value_to_property_value(value)?);
    }
    Ok(out)
}

fn stream_json_import(src_path: &str, batcher: &mut ImportBatcher<'_>) -> Result<(), CliError> {
    let file = File::open(src_path)
        .map_err(|e| CliError::Runtime(format!("failed to open import source: {e}")))?;
    let payload: JsonImportPayload = serde_json::from_reader(BufReader::new(file))
        .map_err(|e| CliError::Runtime(format!("invalid json import payload: {e}")))?;

    match payload {
        JsonImportPayload::Graph(graph) => {
            for node in graph.nodes {
                batcher.mark_processed();
                let parse_node = (|| -> Result<ImportNodeRecord, CliError> {
                    Ok(ImportNodeRecord {
                        id: node.id,
                        labels: node.labels,
                        properties: json_properties_to_property_map(&node.properties)?,
                    })
                })();
                match parse_node {
                    Ok(record) => batcher.push(ImportRecord::Node(record))?,
                    Err(err) => {
                        handle_stream_parse_error(batcher.continue_on_error, batcher, err)?;
                    }
                }
            }
            for edge in graph.edges {
                batcher.mark_processed();
                let parse_edge = (|| -> Result<ImportEdgeRecord, CliError> {
                    Ok(ImportEdgeRecord {
                        src: edge.src,
                        dst: edge.dst,
                        edge_type: edge_type_normalized(edge.edge_type),
                        properties: json_properties_to_property_map(&edge.properties)?,
                    })
                })();
                match parse_edge {
                    Ok(record) => batcher.push(ImportRecord::Edge(record))?,
                    Err(err) => {
                        handle_stream_parse_error(batcher.continue_on_error, batcher, err)?;
                    }
                }
            }
        }
        JsonImportPayload::LegacyEdgeList(edges) => {
            for edge in edges {
                batcher.mark_processed();
                batcher.push(ImportRecord::Edge(ImportEdgeRecord {
                    src: edge.src,
                    dst: edge.dst,
                    edge_type: None,
                    properties: PropertyMap::new(),
                }))?;
            }
        }
    }

    Ok(())
}

fn json_object_u64_field(
    object: &Map<String, Value>,
    key: &str,
    line_no: usize,
) -> Result<u64, CliError> {
    let value = object.get(key).ok_or_else(|| {
        CliError::Runtime(format!(
            "invalid jsonl record at line {line_no}: missing {key} field"
        ))
    })?;
    if let Some(value) = value.as_u64() {
        return Ok(value);
    }
    Err(CliError::Runtime(format!(
        "invalid jsonl record at line {line_no}: {key} must be an unsigned integer"
    )))
}

fn json_object_labels_field(
    object: &Map<String, Value>,
    line_no: usize,
) -> Result<Vec<String>, CliError> {
    let Some(value) = object.get("labels") else {
        return Ok(Vec::new());
    };
    let labels = value.as_array().ok_or_else(|| {
        CliError::Runtime(format!(
            "invalid jsonl record at line {line_no}: labels must be an array"
        ))
    })?;
    let mut out = Vec::<String>::new();
    for label in labels {
        let label = label.as_str().ok_or_else(|| {
            CliError::Runtime(format!(
                "invalid jsonl record at line {line_no}: labels must contain strings"
            ))
        })?;
        if !label.trim().is_empty() {
            out.push(label.to_string());
        }
    }
    Ok(out)
}

fn json_object_properties_field(
    object: &Map<String, Value>,
    line_no: usize,
) -> Result<PropertyMap, CliError> {
    match object.get("properties") {
        None => Ok(PropertyMap::new()),
        Some(Value::Object(properties)) => json_properties_to_property_map(properties),
        Some(_) => Err(CliError::Runtime(format!(
            "invalid jsonl record at line {line_no}: properties must be an object"
        ))),
    }
}

fn edge_type_normalized(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn parse_jsonl_import_record(line: &str, line_no: usize) -> Result<ImportRecord, CliError> {
    let value: Value = serde_json::from_str(line).map_err(|e| {
        CliError::Runtime(format!(
            "invalid jsonl record at line {line_no}: failed to parse json: {e}"
        ))
    })?;
    let object = value.as_object().ok_or_else(|| {
        CliError::Runtime(format!(
            "invalid jsonl record at line {line_no}: expected json object"
        ))
    })?;

    let discriminator = object
        .get("kind")
        .or_else(|| object.get("entity"))
        .or_else(|| object.get("record_type"))
        .and_then(Value::as_str)
        .map(|value| value.to_ascii_lowercase());

    if discriminator.as_deref() == Some("node")
        || (discriminator.is_none() && object.contains_key("id") && !object.contains_key("src"))
    {
        return Ok(ImportRecord::Node(ImportNodeRecord {
            id: json_object_u64_field(object, "id", line_no)?,
            labels: json_object_labels_field(object, line_no)?,
            properties: json_object_properties_field(object, line_no)?,
        }));
    }

    if discriminator.as_deref() == Some("edge")
        || (discriminator.is_none() && object.contains_key("src") && object.contains_key("dst"))
    {
        let edge_type = object
            .get("type")
            .or_else(|| object.get("edge_type"))
            .and_then(Value::as_str)
            .map(str::to_string);
        return Ok(ImportRecord::Edge(ImportEdgeRecord {
            src: json_object_u64_field(object, "src", line_no)?,
            dst: json_object_u64_field(object, "dst", line_no)?,
            edge_type: edge_type_normalized(edge_type),
            properties: json_object_properties_field(object, line_no)?,
        }));
    }

    Err(CliError::Runtime(format!(
        "invalid jsonl record at line {line_no}: missing node/edge discriminator"
    )))
}

fn stream_jsonl_import(src_path: &str, batcher: &mut ImportBatcher<'_>) -> Result<(), CliError> {
    let file = File::open(src_path)
        .map_err(|e| CliError::Runtime(format!("failed to open import source: {e}")))?;
    let reader = BufReader::new(file);
    for (idx, line_result) in reader.lines().enumerate() {
        let line_no = idx + 1;
        let line = line_result
            .map_err(|e| CliError::Runtime(format!("failed to read import line: {e}")))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        batcher.mark_processed();
        match parse_jsonl_import_record(trimmed, line_no) {
            Ok(record) => batcher.push(record)?,
            Err(err) => {
                handle_stream_parse_error(batcher.continue_on_error, batcher, err)?;
            }
        }
    }
    Ok(())
}

fn apply_import_node_record(
    tx: &mut ogdb_core::WriteTransaction<'_>,
    node: &ImportNodeRecord,
) -> Result<(), DbError> {
    while tx.projected_node_count() <= node.id {
        let _ = tx.create_node()?;
    }
    tx.set_node_labels(node.id, node.labels.clone())?;
    tx.set_node_properties(node.id, node.properties.clone())?;
    Ok(())
}

fn apply_import_edge_record(
    tx: &mut ogdb_core::WriteTransaction<'_>,
    edge: &ImportEdgeRecord,
) -> Result<(), DbError> {
    let required = edge.src.max(edge.dst);
    while tx.projected_node_count() <= required {
        let _ = tx.create_node()?;
    }

    match edge.edge_type.clone() {
        Some(edge_type) => {
            let _ = tx.add_typed_edge(edge.src, edge.dst, edge_type, edge.properties.clone())?;
        }
        None => {
            if edge.properties.is_empty() {
                let _ = tx.add_edge(edge.src, edge.dst)?;
            } else {
                let _ = tx.add_edge_with_properties(edge.src, edge.dst, edge.properties.clone())?;
            }
        }
    }
    Ok(())
}

fn handle_import(
    db_path: &str,
    src_path: &str,
    format_hint: Option<QueryOutputFormat>,
    batch_size: usize,
    continue_on_error: bool,
    atomic: bool,
) -> Result<String, CliError> {
    if !Path::new(db_path).exists() {
        return Err(CliError::Runtime(format!(
            "error: database not found at '{db_path}'. Run 'ogdb init <path>' first."
        )));
    }
    let format = resolve_graph_data_format(format_hint, src_path, "import")?;
    let mut db = Database::open(db_path)?;
    let mut batcher = if atomic {
        ImportBatcher::new_with_mode(&mut db, batch_size, continue_on_error, true)
    } else {
        ImportBatcher::new(&mut db, batch_size, continue_on_error)
    };

    match format {
        GraphDataFormat::Csv => stream_csv_import(src_path, &mut batcher)?,
        GraphDataFormat::Json => stream_json_import(src_path, &mut batcher)?,
        GraphDataFormat::Jsonl => stream_jsonl_import(src_path, &mut batcher)?,
    }

    let progress = batcher.finish()?;
    Ok(format!(
        "processed_records={}
imported_nodes={}
imported_edges={}
skipped_records={}
committed_batches={}
created_nodes={}
total_nodes={}
total_edges={}",
        progress.processed_records,
        progress.imported_nodes,
        progress.imported_edges,
        progress.skipped_records,
        progress.committed_batches,
        progress.created_nodes,
        db.node_count(),
        db.edge_count()
    ))
}

fn rdf_meta_path_for_db(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}-rdfmeta.json", path.display()))
}

fn load_rdf_meta(db_path: &str) -> Result<PersistedRdfMeta, CliError> {
    let path = rdf_meta_path_for_db(Path::new(db_path));
    if !path.exists() {
        return Ok(PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            ..PersistedRdfMeta::default()
        });
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| CliError::Runtime(format!("failed to read rdf metadata: {e}")))?;
    if raw.trim().is_empty() {
        return Ok(PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            ..PersistedRdfMeta::default()
        });
    }
    let parsed: PersistedRdfMeta = serde_json::from_str(&raw)
        .map_err(|e| CliError::Runtime(format!("invalid rdf metadata format: {e}")))?;
    if parsed.format_version != RDF_META_FORMAT_VERSION {
        return Err(CliError::Runtime(format!(
            "invalid rdf metadata format version: {}",
            parsed.format_version
        )));
    }
    Ok(parsed)
}

fn save_rdf_meta(db_path: &str, meta: &PersistedRdfMeta) -> Result<(), CliError> {
    let path = rdf_meta_path_for_db(Path::new(db_path));
    let rendered = serde_json::to_string_pretty(meta)
        .expect("rdf metadata serialization should not fail for known structure");
    fs::write(path, format!("{rendered}\n"))
        .map_err(|e| CliError::Runtime(format!("failed to persist rdf metadata: {e}")))
}

fn detect_rdf_import_format(path: &str) -> Option<RdfImportFormatArg> {
    let ext = Path::new(path).extension().and_then(|ext| ext.to_str())?;
    RdfImportFormatArg::from_extension(ext)
}

fn resolve_rdf_import_format(
    format_hint: Option<RdfImportFormatArg>,
    path: &str,
) -> Result<RdfImportFormatArg, CliError> {
    if let Some(format) = format_hint {
        return Ok(format);
    }
    detect_rdf_import_format(path).ok_or_else(|| {
        CliError::Runtime(format!(
            "unable to determine import-rdf format from path: {path} (use --format ttl|nt|xml|jsonld|nq)"
        ))
    })
}

fn detect_rdf_export_format(path: &str) -> Option<RdfExportFormatArg> {
    let ext = Path::new(path).extension().and_then(|ext| ext.to_str())?;
    RdfExportFormatArg::from_extension(ext)
}

fn resolve_rdf_export_format(
    format_hint: Option<RdfExportFormatArg>,
    path: &str,
) -> Result<RdfExportFormatArg, CliError> {
    if let Some(format) = format_hint {
        return Ok(format);
    }
    detect_rdf_export_format(path).ok_or_else(|| {
        CliError::Runtime(format!(
            "unable to determine export-rdf format from path: {path} (use --format ttl|nt|xml|jsonld)"
        ))
    })
}

fn local_name_from_iri(iri: &str) -> String {
    iri.rsplit_once('#')
        .and_then(|(_, tail)| (!tail.is_empty()).then_some(tail))
        .or_else(|| {
            iri.rsplit_once('/')
                .and_then(|(_, tail)| (!tail.is_empty()).then_some(tail))
        })
        .or_else(|| {
            iri.rsplit_once(':')
                .and_then(|(_, tail)| (!tail.is_empty()).then_some(tail))
        })
        .unwrap_or(iri)
        .to_string()
}

fn edge_type_from_iri(iri: &str) -> String {
    to_cypher_edge_case(&local_name_from_iri(iri))
}

fn to_cypher_edge_case(name: &str) -> String {
    if name.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = name.chars().collect();
    let mut result = String::new();
    for (i, &ch) in chars.iter().enumerate() {
        if !ch.is_alphanumeric() {
            if !result.is_empty() && !result.ends_with('_') {
                result.push('_');
            }
            continue;
        }
        if ch.is_ascii_uppercase() {
            let prev = if i > 0 { chars.get(i - 1).copied() } else { None };
            let next = chars.get(i + 1).copied();
            let prev_lower_or_digit =
                prev.is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
            let prev_upper = prev.is_some_and(|c| c.is_ascii_uppercase());
            let next_lower = next.is_some_and(|c| c.is_ascii_lowercase());
            let boundary = prev_lower_or_digit || (prev_upper && next_lower);
            if boundary && !result.is_empty() && !result.ends_with('_') {
                result.push('_');
            }
            result.push(ch);
        } else {
            result.push(ch.to_ascii_uppercase());
        }
    }
    result.trim_matches('_').to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeShapeConstraint {
    pub shape_id: String,
    pub target_class: String,
    pub required_properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShaclViolation {
    pub node_id: u64,
    pub shape_id: String,
    pub target_class: String,
    pub violated_property: String,
    pub message: String,
}

fn shacl_node_or_blank_id(node: &NamedOrBlankNode) -> String {
    match node {
        NamedOrBlankNode::NamedNode(named) => named.as_str().to_string(),
        NamedOrBlankNode::BlankNode(blank) => format!("_:{}", blank.as_str()),
    }
}

fn shacl_term_id(term: &Term) -> Option<String> {
    match term {
        Term::NamedNode(named) => Some(named.as_str().to_string()),
        Term::BlankNode(blank) => Some(format!("_:{}", blank.as_str())),
        Term::Literal(_) => None,
    }
}

fn shacl_literal_to_i64(term: &Term) -> Option<i64> {
    match term {
        Term::Literal(literal) => literal.value().parse::<i64>().ok(),
        _ => None,
    }
}

pub fn parse_shacl_shapes(
    shapes_path: &Path,
) -> Result<Vec<NodeShapeConstraint>, Box<dyn std::error::Error>> {
    let file = File::open(shapes_path)?;
    let reader = BufReader::new(file);
    let parser = RdfParser::from_format(RdfFormat::Turtle).for_reader(reader);

    let mut quads: Vec<Quad> = Vec::new();
    for result in parser {
        quads.push(result?);
    }

    let mut node_shapes = HashSet::<String>::new();
    for quad in &quads {
        if quad.predicate.as_ref().as_str() != RDF_TYPE_IRI {
            continue;
        }
        let Term::NamedNode(object) = &quad.object else {
            continue;
        };
        if object.as_str() == SH_NODE_SHAPE {
            node_shapes.insert(shacl_node_or_blank_id(&quad.subject));
        }
    }

    let mut shape_target_classes = HashMap::<String, String>::new();
    let mut shape_property_nodes = HashMap::<String, Vec<String>>::new();
    let mut property_paths = HashMap::<String, String>::new();
    let mut property_min_counts = HashMap::<String, i64>::new();

    for quad in &quads {
        let predicate = quad.predicate.as_ref().as_str();
        let subject_id = shacl_node_or_blank_id(&quad.subject);
        if predicate == SH_TARGET_CLASS {
            if !node_shapes.contains(&subject_id) {
                continue;
            }
            let Term::NamedNode(target_class) = &quad.object else {
                continue;
            };
            shape_target_classes.insert(subject_id, local_name_from_iri(target_class.as_str()));
            continue;
        }
        if predicate == SH_PROPERTY {
            if !node_shapes.contains(&subject_id) {
                continue;
            }
            if let Some(property_node_id) = shacl_term_id(&quad.object) {
                shape_property_nodes
                    .entry(subject_id)
                    .or_default()
                    .push(property_node_id);
            }
            continue;
        }
        if predicate == SH_PATH {
            let Term::NamedNode(path_iri) = &quad.object else {
                continue;
            };
            property_paths.insert(subject_id, local_name_from_iri(path_iri.as_str()));
            continue;
        }
        if predicate == SH_MIN_COUNT {
            if let Some(min_count) = shacl_literal_to_i64(&quad.object) {
                property_min_counts.insert(subject_id, min_count);
            }
        }
    }

    let mut ordered_shape_ids = node_shapes.into_iter().collect::<Vec<String>>();
    ordered_shape_ids.sort();

    let mut constraints = Vec::<NodeShapeConstraint>::new();
    for shape_id in ordered_shape_ids {
        let Some(target_class) = shape_target_classes.get(&shape_id) else {
            continue;
        };
        let mut required_properties = Vec::<String>::new();
        if let Some(property_nodes) = shape_property_nodes.get(&shape_id) {
            for property_node in property_nodes {
                let min_count = property_min_counts.get(property_node).copied().unwrap_or(0);
                if min_count < 1 {
                    continue;
                }
                if let Some(path) = property_paths.get(property_node) {
                    required_properties.push(path.clone());
                }
            }
        }
        required_properties.sort();
        required_properties.dedup();
        constraints.push(NodeShapeConstraint {
            shape_id,
            target_class: target_class.clone(),
            required_properties,
        });
    }

    Ok(constraints)
}

pub fn validate_against_shacl(
    db: &Database,
    shapes: &[NodeShapeConstraint],
) -> Vec<ShaclViolation> {
    let mut violations = Vec::<ShaclViolation>::new();

    for shape in shapes {
        for node_id in 0..db.node_count() {
            let Ok(labels) = db.node_labels(node_id) else {
                continue;
            };
            if !labels.iter().any(|label| label == &shape.target_class) {
                continue;
            }

            let Ok(properties) = db.node_properties(node_id) else {
                continue;
            };
            for required_property in &shape.required_properties {
                if properties.contains_key(required_property) {
                    continue;
                }
                violations.push(ShaclViolation {
                    node_id,
                    shape_id: shape.shape_id.clone(),
                    target_class: shape.target_class.clone(),
                    violated_property: required_property.clone(),
                    message: format!(
                        "Node {} (:{}) is missing required property '{}'",
                        node_id, shape.target_class, required_property
                    ),
                });
            }
        }
    }

    violations
}

fn rdf_resource_key_from_subject(subject: &NamedOrBlankNode) -> RdfResourceKey {
    match subject {
        NamedOrBlankNode::NamedNode(node) => RdfResourceKey::Named(node.as_str().to_string()),
        NamedOrBlankNode::BlankNode(node) => RdfResourceKey::Blank(node.as_str().to_string()),
    }
}

fn rdf_resource_key_from_term(term: &Term) -> Option<RdfResourceKey> {
    match term {
        Term::NamedNode(node) => Some(RdfResourceKey::Named(node.as_str().to_string())),
        Term::BlankNode(node) => Some(RdfResourceKey::Blank(node.as_str().to_string())),
        Term::Literal(_) => None,
    }
}

fn graph_name_value(graph_name: &GraphName) -> Option<String> {
    match graph_name {
        GraphName::DefaultGraph => None,
        GraphName::NamedNode(node) => Some(node.as_str().to_string()),
        GraphName::BlankNode(node) => Some(format!("_:{}", node.as_str())),
    }
}

fn rdf_literal_to_property_value(literal: &Literal) -> PropertyValue {
    let datatype = literal.datatype().as_str();
    let value = literal.value();
    let is_boolean = datatype == oxrdf::vocab::xsd::BOOLEAN.as_str();
    let is_integer = matches!(
        datatype,
        value if value == oxrdf::vocab::xsd::INTEGER.as_str()
            || value == oxrdf::vocab::xsd::INT.as_str()
            || value == oxrdf::vocab::xsd::LONG.as_str()
            || value == oxrdf::vocab::xsd::SHORT.as_str()
            || value == oxrdf::vocab::xsd::BYTE.as_str()
            || value == oxrdf::vocab::xsd::NON_NEGATIVE_INTEGER.as_str()
            || value == oxrdf::vocab::xsd::POSITIVE_INTEGER.as_str()
            || value == oxrdf::vocab::xsd::NON_POSITIVE_INTEGER.as_str()
            || value == oxrdf::vocab::xsd::NEGATIVE_INTEGER.as_str()
            || value == oxrdf::vocab::xsd::UNSIGNED_LONG.as_str()
            || value == oxrdf::vocab::xsd::UNSIGNED_INT.as_str()
            || value == oxrdf::vocab::xsd::UNSIGNED_SHORT.as_str()
            || value == oxrdf::vocab::xsd::UNSIGNED_BYTE.as_str()
    );
    let is_float = datatype == oxrdf::vocab::xsd::DECIMAL.as_str()
        || datatype == oxrdf::vocab::xsd::DOUBLE.as_str()
        || datatype == oxrdf::vocab::xsd::FLOAT.as_str();

    if is_boolean {
        if value.eq_ignore_ascii_case("true") {
            return PropertyValue::Bool(true);
        }
        if value.eq_ignore_ascii_case("false") {
            return PropertyValue::Bool(false);
        }
    }
    if is_integer {
        if let Ok(parsed) = value.parse::<i64>() {
            return PropertyValue::I64(parsed);
        }
    }
    if is_float {
        if let Some(parsed) = value
            .parse::<f64>()
            .ok()
            .filter(|parsed| parsed.is_finite())
        {
            return PropertyValue::F64(parsed);
        }
    }
    PropertyValue::String(value.to_string())
}

fn process_rdf_quad(plan: &mut RdfImportPlan, quad: Quad, schema_only: bool) {
    let subject_key = rdf_resource_key_from_subject(&quad.subject);
    let predicate_uri = quad.predicate.as_str().to_string();
    let graph_name = graph_name_value(&quad.graph_name);

    if predicate_uri == RDF_TYPE_IRI {
        if let Term::NamedNode(object_node) = &quad.object {
            let object_iri = object_node.as_str();
            if object_iri == OWL_CLASS_IRI {
                if let RdfResourceKey::Named(subject_iri) = &subject_key {
                    let label = local_name_from_iri(subject_iri);
                    plan.add_schema_label(&label, subject_iri);
                }
                return;
            }
            if object_iri == OWL_OBJECT_PROPERTY_IRI {
                if let RdfResourceKey::Named(subject_iri) = &subject_key {
                    let edge_type = edge_type_from_iri(subject_iri);
                    plan.add_schema_edge_type(&edge_type, subject_iri);
                }
                return;
            }
            if object_iri == OWL_DATATYPE_PROPERTY_IRI {
                if let RdfResourceKey::Named(subject_iri) = &subject_key {
                    let key = local_name_from_iri(subject_iri);
                    plan.add_schema_property_key(&key, subject_iri);
                }
                return;
            }
            if schema_only {
                return;
            }
            let class_label = local_name_from_iri(object_iri);
            plan.add_rdf_type(
                &subject_key,
                &class_label,
                object_iri,
                graph_name.as_deref(),
            );
            return;
        }
    }
    if predicate_uri == RDF_TYPE_IRI && schema_only {
        return;
    }

    if predicate_uri == RDFS_SUB_CLASS_OF_IRI {
        let Some(parent_key) = rdf_resource_key_from_term(&quad.object) else {
            return;
        };
        if let RdfResourceKey::Named(child_iri) = &subject_key {
            let child_label = local_name_from_iri(child_iri);
            plan.add_schema_label(&child_label, child_iri);
        }
        if let RdfResourceKey::Named(parent_iri) = &parent_key {
            let parent_label = local_name_from_iri(parent_iri);
            plan.add_schema_label(&parent_label, parent_iri);
        }
        plan.add_subclass_edge(&subject_key, &parent_key);
        return;
    }

    if schema_only {
        return;
    }

    match &quad.object {
        Term::NamedNode(_) | Term::BlankNode(_) => {
            if let Some(object_key) = rdf_resource_key_from_term(&quad.object) {
                plan.add_resource_edge(
                    &subject_key,
                    &predicate_uri,
                    &object_key,
                    graph_name.as_deref(),
                );
            }
        }
        Term::Literal(literal) => {
            plan.add_literal_property(
                &subject_key,
                &predicate_uri,
                rdf_literal_to_property_value(literal),
                graph_name.as_deref(),
            );
        }
    }
}

fn parse_rdf_into_plan(
    src_path: &str,
    format: RdfImportFormatArg,
    base_uri: Option<&str>,
    schema_only: bool,
    continue_on_error: bool,
) -> Result<(RdfImportPlan, u64), CliError> {
    let file = File::open(src_path)
        .map_err(|e| CliError::Runtime(format!("failed to open import source: {e}")))?;
    let mut parser_builder = RdfParser::from_format(format.to_rdf_format());
    if let Some(base_uri) = base_uri {
        parser_builder = parser_builder
            .with_base_iri(base_uri)
            .map_err(|e| CliError::Runtime(format!("invalid --base-uri value: {e}")))?;
    }
    let mut parser = parser_builder.for_reader(BufReader::new(file));
    let mut skipped_quads = 0u64;
    let mut plan = RdfImportPlan::default();
    for next in parser.by_ref() {
        match next {
            Ok(quad) => process_rdf_quad(&mut plan, quad, schema_only),
            Err(err) => {
                if continue_on_error {
                    skipped_quads = skipped_quads.saturating_add(1);
                    continue;
                }
                return Err(CliError::Runtime(format!(
                    "failed to parse RDF input: {err}"
                )));
            }
        }
    }

    for (prefix, iri) in parser.prefixes() {
        if prefix.is_empty() {
            continue;
        }
        plan.prefixes.insert(prefix.to_string(), iri.to_string());
    }
    Ok((plan, skipped_quads))
}

fn handle_validate_shacl(db_path: &str, shapes_path: &Path) -> Result<String, CliError> {
    let shapes = parse_shacl_shapes(shapes_path)
        .map_err(|e| CliError::Runtime(format!("failed to parse SHACL shapes: {e}")))?;
    if shapes.is_empty() {
        return Ok("No SHACL NodeShape constraints found in shapes file.".to_string());
    }

    let db = Database::open(db_path)?;
    let violations = validate_against_shacl(&db, &shapes);
    if violations.is_empty() {
        return Ok("Validation passed: graph conforms to all SHACL shapes.".to_string());
    }

    let mut lines = Vec::<String>::new();
    lines.push(format!(
        "Validation failed: {} violation(s) found.",
        violations.len()
    ));
    lines.push(String::new());
    for violation in &violations {
        lines.push(format!("  VIOLATION: {}", violation.message));
    }
    lines.push(String::new());
    lines.push(
        serde_json::to_string_pretty(&violations)
            .expect("serializing SHACL violations should not fail"),
    );

    Err(CliError::RuntimeWithStdout {
        stdout: lines.join("\n"),
        stderr: "SHACL validation failed.".to_string(),
    })
}

fn handle_import_rdf(
    db_path: &str,
    src_path: &str,
    options: ImportRdfOptions,
) -> Result<String, CliError> {
    let ImportRdfOptions {
        format_hint,
        base_uri,
        schema_only,
        batch_size,
        continue_on_error,
        atomic,
    } = options;
    let format = resolve_rdf_import_format(format_hint, src_path)?;
    let (plan, skipped_quads) = parse_rdf_into_plan(
        src_path,
        format,
        base_uri.as_deref(),
        schema_only,
        continue_on_error,
    )?;
    let schema_labels = plan.schema_labels.clone();
    let schema_edge_types = plan.schema_edge_types.clone();
    let schema_property_keys = plan.schema_property_keys.clone();
    let prefixes = plan.prefixes.clone();
    let label_uris = plan.label_uris.clone();
    let predicate_uris = plan.predicate_uris.clone();
    let records = plan.into_records();

    let mut db = Database::open(db_path)?;
    let mut batcher = if atomic {
        ImportBatcher::new_with_mode(&mut db, batch_size, continue_on_error, true)
    } else {
        ImportBatcher::new(&mut db, batch_size, continue_on_error)
    };
    for record in records {
        batcher.mark_processed();
        batcher.push(record)?;
    }
    let mut progress = batcher.finish()?;
    progress.skipped_records = progress.skipped_records.saturating_add(skipped_quads);

    for label in schema_labels {
        db.register_schema_label(&label)?;
    }
    for edge_type in schema_edge_types {
        db.register_schema_edge_type(&edge_type)?;
    }
    for key in schema_property_keys {
        db.register_schema_property_key(&key)?;
    }

    let mut rdf_meta = load_rdf_meta(db_path)?;
    for (prefix, iri) in prefixes {
        rdf_meta.prefixes.insert(prefix, iri);
    }
    for (label, iri) in label_uris {
        rdf_meta.label_uris.insert(label, iri);
    }
    for (key, iri) in predicate_uris {
        rdf_meta.predicate_uris.insert(key, iri);
    }
    rdf_meta.format_version = RDF_META_FORMAT_VERSION;
    save_rdf_meta(db_path, &rdf_meta)?;

    Ok(format!(
        "processed_records={}
imported_nodes={}
imported_edges={}
skipped_records={}
committed_batches={}
created_nodes={}
total_nodes={}
total_edges={}
format={}",
        progress.processed_records,
        progress.imported_nodes,
        progress.imported_edges,
        progress.skipped_records,
        progress.committed_batches,
        progress.created_nodes,
        db.node_count(),
        db.edge_count(),
        format.as_str()
    ))
}

fn value_as_string_property(properties: &PropertyMap, key: &str) -> Option<String> {
    match properties.get(key) {
        Some(PropertyValue::String(value)) => Some(value.clone()),
        _ => None,
    }
}

fn subject_from_uri_value(uri: &str) -> Option<NamedOrBlankNode> {
    if let Some(blank_id) = uri.strip_prefix("_:") {
        return BlankNode::new(blank_id).ok().map(Into::into);
    }
    NamedNode::new(uri).ok().map(Into::into)
}

fn term_from_uri_value(uri: &str) -> Option<Term> {
    if let Some(blank_id) = uri.strip_prefix("_:") {
        return BlankNode::new(blank_id).ok().map(Into::into);
    }
    NamedNode::new(uri).ok().map(Into::into)
}

fn named_node_or_fallback(uri: &str, fallback: &str) -> NamedNode {
    if let Ok(node) = NamedNode::new(uri) {
        return node;
    }
    NamedNode::new(fallback).expect("fallback IRI must always be valid")
}

fn subject_from_uri_or_fallback(uri: &str, fallback: &str) -> NamedOrBlankNode {
    subject_from_uri_value(uri)
        .unwrap_or_else(|| NamedOrBlankNode::from(named_node_or_fallback(fallback, fallback)))
}

fn term_from_uri_or_fallback(uri: &str, fallback: &str) -> Term {
    term_from_uri_value(uri)
        .unwrap_or_else(|| Term::from(named_node_or_fallback(fallback, fallback)))
}

fn property_value_to_rdf_literal(value: &PropertyValue) -> Literal {
    match value {
        PropertyValue::Bool(value) => Literal::from(*value),
        PropertyValue::I64(value) => Literal::from(*value),
        PropertyValue::F64(value) => Literal::from(*value),
        PropertyValue::String(value) => Literal::from(value.clone()),
        PropertyValue::Bytes(value) => Literal::from(format!("bytes:{}", encode_hex_bytes(value))),
        PropertyValue::Vector(value) => {
            Literal::from(format!("vector:{}", format_vector_literal(value)))
        }
        PropertyValue::Date(value) => Literal::from(format!("date:{value}")),
        PropertyValue::Duration { months, days, nanos } => Literal::from(format!("duration:{months}:{days}:{nanos}")),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => Literal::from(format!("datetime:{micros}:{tz_offset_minutes}")),
        PropertyValue::List(values) => Literal::from(format!(
            "list:[{}]",
            values
                .iter()
                .map(format_property_value)
                .collect::<Vec<_>>()
                .join(",")
        )),
        PropertyValue::Map(values) => Literal::from(format!(
            "map:{{{}}}",
            values
                .iter()
                .map(|(key, value)| format!("{key}:{}", format_property_value(value)))
                .collect::<Vec<_>>()
                .join(",")
        )),
    }
}

fn expand_prefixed_name(value: &str, prefixes: &BTreeMap<String, String>) -> Option<String> {
    let (prefix, suffix) = value.split_once(':')?;
    let namespace = prefixes.get(prefix)?;
    Some(format!("{namespace}{suffix}"))
}

fn resolve_predicate_uri(key: &str, meta: &PersistedRdfMeta) -> String {
    if let Some(iri) = meta.predicate_uris.get(key) {
        return iri.clone();
    }
    if !key.contains("://") {
        if let Some(expanded) = expand_prefixed_name(key, &meta.prefixes) {
            return expanded;
        }
    }
    if NamedNode::new(key).is_ok() {
        return key.to_string();
    }
    format!("urn:ogdb:predicate:{key}")
}

fn resolve_label_uri(label: &str, meta: &PersistedRdfMeta) -> String {
    if let Some(iri) = meta.label_uris.get(label) {
        return iri.clone();
    }
    if !label.contains("://") {
        if let Some(expanded) = expand_prefixed_name(label, &meta.prefixes) {
            return expanded;
        }
    }
    if NamedNode::new(label).is_ok() {
        return label.to_string();
    }
    format!("urn:ogdb:label:{label}")
}

fn export_rdf_write_error<E: std::fmt::Display>(e: E) -> CliError {
    CliError::Runtime(format!("failed to write export-rdf output: {e}"))
}

fn handle_export_rdf(
    db_path: &str,
    dst_path: &str,
    format_hint: Option<RdfExportFormatArg>,
) -> Result<String, CliError> {
    if Path::new(dst_path).exists() {
        return Err(CliError::Runtime(format!(
            "export destination already exists: {dst_path}"
        )));
    }
    let format = resolve_rdf_export_format(format_hint, dst_path)?;
    let rdf_meta = load_rdf_meta(db_path)?;
    let db = Database::open(db_path)?;
    let schema = db.schema_catalog();
    let nodes = db.export_nodes()?;
    let edges = db.export_edges()?;
    let node_by_id = nodes
        .iter()
        .map(|node| (node.id, node))
        .collect::<HashMap<u64, &ExportNode>>();

    let mut serializer = RdfSerializer::from_format(format.to_rdf_format());
    for (prefix, iri) in &rdf_meta.prefixes {
        serializer = serializer
            .with_prefix(prefix.clone(), iri.clone())
            .map_err(|e| CliError::Runtime(format!("invalid stored rdf prefix '{prefix}': {e}")))?;
    }

    let output_file = File::create(dst_path)
        .map_err(|e| CliError::Runtime(format!("failed to write export-rdf output: {e}")))?;
    let mut writer = serializer.for_writer(BufWriter::new(output_file));
    let mut exported_triples = 0u64;

    let rdf_type = NamedNode::new(RDF_TYPE_IRI).expect("rdf:type IRI constant must be valid");
    let owl_class = NamedNode::new(OWL_CLASS_IRI).expect("owl:Class IRI constant must be valid");
    let owl_object_property = NamedNode::new(OWL_OBJECT_PROPERTY_IRI)
        .expect("owl:ObjectProperty IRI constant must be valid");
    let owl_datatype_property = NamedNode::new(OWL_DATATYPE_PROPERTY_IRI)
        .expect("owl:DatatypeProperty IRI constant must be valid");

    for label in &schema.labels {
        let class_uri = resolve_label_uri(label, &rdf_meta);
        let subject =
            subject_from_uri_or_fallback(&class_uri, &format!("urn:ogdb:label-decl:{label}"));
        writer
            .serialize_quad(&Quad {
                subject,
                predicate: rdf_type.clone(),
                object: Term::NamedNode(owl_class.clone()),
                graph_name: GraphName::DefaultGraph,
            })
            .map_err(|e| CliError::Runtime(format!("failed to write export-rdf output: {e}")))?;
        exported_triples = exported_triples.saturating_add(1);
    }
    for edge_type in &schema.edge_types {
        let predicate_uri = resolve_predicate_uri(edge_type, &rdf_meta);
        let subject = subject_from_uri_or_fallback(
            &predicate_uri,
            &format!("urn:ogdb:edge-type-decl:{edge_type}"),
        );
        writer
            .serialize_quad(&Quad {
                subject,
                predicate: rdf_type.clone(),
                object: Term::NamedNode(owl_object_property.clone()),
                graph_name: GraphName::DefaultGraph,
            })
            .map_err(|e| CliError::Runtime(format!("failed to write export-rdf output: {e}")))?;
        exported_triples = exported_triples.saturating_add(1);
    }
    for key in &schema.property_keys {
        if key.starts_with('_') {
            continue;
        }
        let property_uri = resolve_predicate_uri(key, &rdf_meta);
        let subject =
            subject_from_uri_or_fallback(&property_uri, &format!("urn:ogdb:property-decl:{key}"));
        writer
            .serialize_quad(&Quad {
                subject,
                predicate: rdf_type.clone(),
                object: Term::NamedNode(owl_datatype_property.clone()),
                graph_name: GraphName::DefaultGraph,
            })
            .map_err(|e| CliError::Runtime(format!("failed to write export-rdf output: {e}")))?;
        exported_triples = exported_triples.saturating_add(1);
    }

    for node in &nodes {
        let subject_uri = value_as_string_property(&node.properties, "_uri")
            .unwrap_or_else(|| format!("urn:ogdb:node:{}", node.id));
        let subject = subject_from_uri_or_fallback(
            &subject_uri,
            &format!("urn:ogdb:node-subject:{}", node.id),
        );

        for label in node.labels.iter().filter(|label| !label.starts_with('_')) {
            let class_uri = resolve_label_uri(label, &rdf_meta);
            let class_node = named_node_or_fallback(&class_uri, &format!("urn:ogdb:label:{label}"));
            writer
                .serialize_quad(&Quad {
                    subject: subject.clone(),
                    predicate: rdf_type.clone(),
                    object: Term::NamedNode(class_node),
                    graph_name: GraphName::DefaultGraph,
                })
                .map_err(export_rdf_write_error)?;
            exported_triples = exported_triples.saturating_add(1);
        }

        let is_hierarchy_class_node = node
            .labels
            .iter()
            .any(|label| label == RDF_RESERVED_LABEL_CLASS_NODE);
        for (key, value) in &node.properties {
            if matches!(key.as_str(), "_uri" | "_blank_id" | "_graph") {
                continue;
            }
            if is_hierarchy_class_node {
                continue;
            }
            let predicate_uri = resolve_predicate_uri(key, &rdf_meta);
            let predicate =
                named_node_or_fallback(&predicate_uri, &format!("urn:ogdb:predicate:{key}"));
            writer
                .serialize_quad(&Quad {
                    subject: subject.clone(),
                    predicate,
                    object: Term::Literal(property_value_to_rdf_literal(value)),
                    graph_name: GraphName::DefaultGraph,
                })
                .map_err(export_rdf_write_error)?;
            exported_triples = exported_triples.saturating_add(1);
        }
    }

    for edge in &edges {
        let src_node = node_by_id
            .get(&edge.src)
            .copied()
            .expect("edge source must reference an exported node");
        let dst_node = node_by_id
            .get(&edge.dst)
            .copied()
            .expect("edge destination must reference an exported node");
        let src_uri = value_as_string_property(&src_node.properties, "_uri")
            .unwrap_or_else(|| format!("urn:ogdb:node:{}", src_node.id));
        let dst_uri = value_as_string_property(&dst_node.properties, "_uri")
            .unwrap_or_else(|| format!("urn:ogdb:node:{}", dst_node.id));
        let subject =
            subject_from_uri_or_fallback(&src_uri, &format!("urn:ogdb:edge-src:{}", src_node.id));
        let object =
            term_from_uri_or_fallback(&dst_uri, &format!("urn:ogdb:edge-dst:{}", dst_node.id));

        let predicate_uri = value_as_string_property(&edge.properties, "_uri")
            .or_else(|| {
                edge.edge_type
                    .as_deref()
                    .map(|edge_type| resolve_predicate_uri(edge_type, &rdf_meta))
            })
            .unwrap_or_else(|| "urn:ogdb:predicate:edge".to_string());
        let predicate = named_node_or_fallback(&predicate_uri, "urn:ogdb:predicate:edge");
        writer
            .serialize_quad(&Quad {
                subject,
                predicate,
                object,
                graph_name: GraphName::DefaultGraph,
            })
            .map_err(|e| CliError::Runtime(format!("failed to write export-rdf output: {e}")))?;
        exported_triples = exported_triples.saturating_add(1);
    }

    let _ = writer
        .finish()
        .map_err(|e| CliError::Runtime(format!("failed to finish export-rdf output: {e}")))?;

    Ok(format!(
        "exported_triples={}
path={}
format={}",
        exported_triples,
        dst_path,
        format.as_str()
    ))
}

fn parse_node_id_range_filter(raw: &str) -> Result<NodeIdRange, CliError> {
    let (start_raw, end_raw) = raw.split_once(':').ok_or_else(|| {
        CliError::Runtime(format!(
            "invalid --node-id-range value: {raw} (expected START:END)"
        ))
    })?;
    let start = start_raw.parse::<u64>().map_err(|_| {
        CliError::Runtime(format!(
            "invalid --node-id-range value: {raw} (expected START:END)"
        ))
    })?;
    let end = end_raw.parse::<u64>().map_err(|_| {
        CliError::Runtime(format!(
            "invalid --node-id-range value: {raw} (expected START:END)"
        ))
    })?;
    if start > end {
        return Err(CliError::Runtime(format!(
            "invalid --node-id-range value: {raw} (start must be <= end)"
        )));
    }
    Ok(NodeIdRange { start, end })
}

fn property_value_to_export_json(value: &PropertyValue) -> Value {
    match value {
        PropertyValue::Bool(value) => Value::Bool(*value),
        PropertyValue::I64(value) => Value::Number((*value).into()),
        PropertyValue::F64(value) => serde_json::Number::from_f64(*value)
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_string())),
        PropertyValue::String(value) => Value::String(value.clone()),
        PropertyValue::Bytes(value) => Value::String(format!("bytes:{}", encode_hex_bytes(value))),
        PropertyValue::Vector(value) => Value::Array(
            value
                .iter()
                .map(|entry| {
                    serde_json::Number::from_f64(*entry as f64)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                })
                .collect(),
        ),
        PropertyValue::Date(value) => Value::Number(i64::from(*value).into()),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => Value::Object(
            [
                ("micros".to_string(), Value::Number((*micros).into())),
                (
                    "tz_offset_minutes".to_string(),
                    Value::Number(i64::from(*tz_offset_minutes).into()),
                ),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::Duration { months, days, nanos } => Value::Object(
            [
                ("months".to_string(), Value::Number((*months).into())),
                ("days".to_string(), Value::Number((*days).into())),
                ("nanos".to_string(), Value::Number((*nanos).into())),
            ]
            .into_iter()
            .collect(),
        ),
        PropertyValue::List(values) => {
            Value::Array(values.iter().map(property_value_to_export_json).collect())
        }
        PropertyValue::Map(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (key.clone(), property_value_to_export_json(value)))
                .collect(),
        ),
    }
}

fn property_map_to_export_json(properties: &PropertyMap) -> Map<String, Value> {
    let mut out = Map::<String, Value>::new();
    for (key, value) in properties {
        out.insert(key.clone(), property_value_to_export_json(value));
    }
    out
}

fn property_value_to_export_csv(value: &PropertyValue) -> String {
    match value {
        PropertyValue::Bool(value) => value.to_string(),
        PropertyValue::I64(value) => value.to_string(),
        PropertyValue::F64(value) => value.to_string(),
        PropertyValue::String(value) => value.clone(),
        PropertyValue::Bytes(value) => format!("bytes:{}", encode_hex_bytes(value)),
        PropertyValue::Vector(value) => format!("vector:{}", format_vector_literal(value)),
        PropertyValue::Date(value) => format!("date:{value}"),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => format!("datetime:{micros}:{tz_offset_minutes}"),
        PropertyValue::Duration { months, days, nanos } => format!("duration:{months}:{days}:{nanos}"),
        PropertyValue::List(values) => format!(
            "list:[{}]",
            values
                .iter()
                .map(property_value_to_export_csv)
                .collect::<Vec<_>>()
                .join(",")
        ),
        PropertyValue::Map(values) => format!(
            "map:{{{}}}",
            values
                .iter()
                .map(|(key, value)| format!("{key}:{}", property_value_to_export_csv(value)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

fn collect_sorted_node_property_keys(nodes: &[ExportNode]) -> Vec<String> {
    let mut keys = nodes
        .iter()
        .flat_map(|node| node.properties.keys().cloned())
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    keys
}

fn collect_sorted_edge_property_keys(edges: &[ExportEdge]) -> Vec<String> {
    let mut keys = edges
        .iter()
        .flat_map(|edge| edge.properties.keys().cloned())
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    keys
}

fn collect_export_subset(
    db: &Database,
    label_filter: Option<&str>,
    edge_type_filter: Option<&str>,
    node_id_range: Option<NodeIdRange>,
) -> Result<(Vec<ExportNode>, Vec<ExportEdge>), CliError> {
    let mut selected_nodes = Vec::<ExportNode>::new();
    let mut selected_node_ids = HashSet::<u64>::new();
    for node in db.export_nodes()? {
        if let Some(range) = node_id_range {
            if node.id < range.start || node.id > range.end {
                continue;
            }
        }
        if let Some(label) = label_filter {
            if !node.labels.iter().any(|candidate| candidate == label) {
                continue;
            }
        }
        selected_node_ids.insert(node.id);
        selected_nodes.push(node);
    }

    let mut selected_edges = Vec::<ExportEdge>::new();
    for edge in db.export_edges()? {
        if !selected_node_ids.contains(&edge.src) || !selected_node_ids.contains(&edge.dst) {
            continue;
        }
        if let Some(expected) = edge_type_filter {
            if edge.edge_type.as_deref() != Some(expected) {
                continue;
            }
        }
        selected_edges.push(edge);
    }

    Ok((selected_nodes, selected_edges))
}

fn write_export_csv_bundle(
    base_path: &str,
    nodes: &[ExportNode],
    edges: &[ExportEdge],
) -> Result<CsvBundlePaths, CliError> {
    let base = Path::new(base_path);
    let bundle = csv_bundle_paths(base);
    if base.exists() || bundle.nodes_path.exists() || bundle.edges_path.exists() {
        return Err(CliError::Runtime(format!(
            "export destination already exists: {base_path}"
        )));
    }

    let node_keys = collect_sorted_node_property_keys(nodes);
    let edge_keys = collect_sorted_edge_property_keys(edges);

    let mut node_writer = csv::Writer::from_path(&bundle.nodes_path)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    let mut node_header = vec!["id".to_string(), "labels".to_string()];
    node_header.extend(node_keys.iter().cloned());
    node_writer
        .write_record(node_header)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    for node in nodes {
        let mut row = vec![
            node.id.to_string(),
            node.labels
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join("|"),
        ];
        for key in &node_keys {
            row.push(
                node.properties
                    .get(key)
                    .map(property_value_to_export_csv)
                    .unwrap_or_default(),
            );
        }
        node_writer
            .write_record(row)
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    }
    node_writer
        .flush()
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;

    let mut edge_writer = csv::Writer::from_path(&bundle.edges_path)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    let mut edge_header = vec!["src".to_string(), "dst".to_string(), "type".to_string()];
    edge_header.extend(edge_keys.iter().cloned());
    edge_writer
        .write_record(edge_header)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    for edge in edges {
        let mut row = vec![
            edge.src.to_string(),
            edge.dst.to_string(),
            edge.edge_type.clone().unwrap_or_default(),
        ];
        for key in &edge_keys {
            row.push(
                edge.properties
                    .get(key)
                    .map(property_value_to_export_csv)
                    .unwrap_or_default(),
            );
        }
        edge_writer
            .write_record(row)
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    }
    edge_writer
        .flush()
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;

    Ok(bundle)
}

fn write_export_json_file(
    dst_path: &str,
    nodes: &[ExportNode],
    edges: &[ExportEdge],
) -> Result<(), CliError> {
    if Path::new(dst_path).exists() {
        return Err(CliError::Runtime(format!(
            "export destination already exists: {dst_path}"
        )));
    }
    let json_nodes = nodes
        .iter()
        .map(|node| {
            serde_json::json!({
                "id": node.id,
                "labels": node.labels,
                "properties": property_map_to_export_json(&node.properties),
            })
        })
        .collect::<Vec<_>>();
    let json_edges = edges
        .iter()
        .map(|edge| {
            serde_json::json!({
                "src": edge.src,
                "dst": edge.dst,
                "type": edge.edge_type,
                "properties": property_map_to_export_json(&edge.properties),
            })
        })
        .collect::<Vec<_>>();
    let rendered = serde_json::to_string_pretty(&serde_json::json!({
        "nodes": json_nodes,
        "edges": json_edges,
    }))
    .expect("graph export json serialization must not fail");
    fs::write(dst_path, rendered)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))
}

fn write_export_jsonl_file(
    dst_path: &str,
    nodes: &[ExportNode],
    edges: &[ExportEdge],
) -> Result<(), CliError> {
    if Path::new(dst_path).exists() {
        return Err(CliError::Runtime(format!(
            "export destination already exists: {dst_path}"
        )));
    }
    let mut file = File::create(dst_path)
        .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    for node in nodes {
        let row = serde_json::json!({
            "kind": "node",
            "id": node.id,
            "labels": node.labels,
            "properties": property_map_to_export_json(&node.properties),
        });
        let encoded =
            serde_json::to_string(&row).expect("jsonl node serialization should not fail");
        file.write_all(encoded.as_bytes())
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
        file.write_all(b"\n")
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    }
    for edge in edges {
        let row = serde_json::json!({
            "kind": "edge",
            "src": edge.src,
            "dst": edge.dst,
            "type": edge.edge_type,
            "properties": property_map_to_export_json(&edge.properties),
        });
        let encoded =
            serde_json::to_string(&row).expect("jsonl edge serialization should not fail");
        file.write_all(encoded.as_bytes())
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
        file.write_all(b"\n")
            .map_err(|e| CliError::Runtime(format!("failed to write export: {e}")))?;
    }
    Ok(())
}

fn handle_export(
    db_path: &str,
    dst_path: &str,
    format_hint: Option<QueryOutputFormat>,
    label_filter: Option<&str>,
    edge_type_filter: Option<&str>,
    node_id_range_raw: Option<&str>,
) -> Result<String, CliError> {
    let format = resolve_graph_data_format(format_hint, dst_path, "export")?;
    let node_id_range = if let Some(raw) = node_id_range_raw {
        Some(parse_node_id_range_filter(raw)?)
    } else {
        None
    };

    let db = Database::open(db_path)?;
    let (nodes, edges) = collect_export_subset(&db, label_filter, edge_type_filter, node_id_range)?;

    match format {
        GraphDataFormat::Csv => {
            let bundle = write_export_csv_bundle(dst_path, &nodes, &edges)?;
            Ok(format!(
                "exported_nodes={}
exported_edges={}
path={}
format={}
nodes_path={}
edges_path={}",
                nodes.len(),
                edges.len(),
                dst_path,
                format.as_str(),
                bundle.nodes_path.display(),
                bundle.edges_path.display()
            ))
        }
        GraphDataFormat::Json => {
            write_export_json_file(dst_path, &nodes, &edges)?;
            Ok(format!(
                "exported_nodes={}
exported_edges={}
path={}
format={}",
                nodes.len(),
                edges.len(),
                dst_path,
                format.as_str()
            ))
        }
        GraphDataFormat::Jsonl => {
            write_export_jsonl_file(dst_path, &nodes, &edges)?;
            Ok(format!(
                "exported_nodes={}
exported_edges={}
path={}
format={}",
                nodes.len(),
                edges.len(),
                dst_path,
                format.as_str()
            ))
        }
    }
}

fn parse_label_list(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_property_value_literal(raw: &str) -> Result<PropertyValue, CliError> {
    let (kind, value) = raw
        .split_once(':')
        .ok_or_else(|| CliError::Usage(format!("invalid property value literal: {raw}")))?;
    match kind.to_ascii_lowercase().as_str() {
        "bool" => match value.to_ascii_lowercase().as_str() {
            "true" => Ok(PropertyValue::Bool(true)),
            "false" => Ok(PropertyValue::Bool(false)),
            _ => Err(CliError::Usage(format!(
                "invalid bool property value: {value}"
            ))),
        },
        "i64" => value
            .parse::<i64>()
            .map(PropertyValue::I64)
            .map_err(|_| CliError::Usage(format!("invalid i64 property value: {value}"))),
        "f64" => value
            .parse::<f64>()
            .map(PropertyValue::F64)
            .map_err(|_| CliError::Usage(format!("invalid f64 property value: {value}"))),
        "string" => Ok(PropertyValue::String(value.to_string())),
        "bytes" => decode_hex_bytes(value).map(PropertyValue::Bytes),
        "vector" => parse_vector_literal(value).map(PropertyValue::Vector),
        _ => Err(CliError::Usage(format!(
            "unsupported property type: {kind} (expected bool|i64|f64|string|bytes|vector)"
        ))),
    }
}

fn parse_vector_literal(raw: &str) -> Result<Vec<f32>, CliError> {
    let trimmed = raw.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return Err(CliError::Usage(format!(
            "invalid vector property value: {raw} (expected [v1,v2,...])"
        )));
    }
    let body = &trimmed[1..trimmed.len() - 1];
    if body.trim().is_empty() {
        return Ok(Vec::new());
    }
    body.split(',')
        .map(|entry| {
            entry
                .trim()
                .parse::<f32>()
                .map_err(|_| CliError::Usage(format!("invalid vector property value: {raw}")))
        })
        .collect()
}

fn format_vector_literal(values: &[f32]) -> String {
    let rendered = values
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",");
    format!("[{rendered}]")
}

fn decode_hex_bytes(raw: &str) -> Result<Vec<u8>, CliError> {
    if !raw.len().is_multiple_of(2) {
        return Err(CliError::Usage(format!(
            "invalid bytes property value: {raw} (expected even-length hex)"
        )));
    }
    let mut out = Vec::<u8>::with_capacity(raw.len() / 2);
    let mut idx = 0usize;
    while idx < raw.len() {
        let next = idx + 2;
        let byte = u8::from_str_radix(&raw[idx..next], 16).map_err(|_| {
            CliError::Usage(format!(
                "invalid bytes property value: {raw} (expected hexadecimal digits)"
            ))
        })?;
        out.push(byte);
        idx = next;
    }
    Ok(out)
}

fn encode_hex_bytes(raw: &[u8]) -> String {
    let mut out = String::new();
    for byte in raw {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn format_property_value(value: &PropertyValue) -> String {
    match value {
        PropertyValue::Bool(v) => format!("bool:{v}"),
        PropertyValue::I64(v) => format!("i64:{v}"),
        PropertyValue::F64(v) => format!("f64:{v}"),
        PropertyValue::String(v) => format!("string:{v}"),
        PropertyValue::Bytes(v) => format!("bytes:{}", encode_hex_bytes(v)),
        PropertyValue::Vector(v) => format!("vector:{}", format_vector_literal(v)),
        PropertyValue::Date(v) => format!("date:{v}"),
        PropertyValue::DateTime {
            micros,
            tz_offset_minutes,
        } => format!("datetime:{micros}:{tz_offset_minutes}"),
        PropertyValue::Duration { months, days, nanos } => format!("duration:{months}:{days}:{nanos}"),
        PropertyValue::List(values) => format!(
            "list:[{}]",
            values
                .iter()
                .map(format_property_value)
                .collect::<Vec<_>>()
                .join(",")
        ),
        PropertyValue::Map(values) => format!(
            "map:{{{}}}",
            values
                .iter()
                .map(|(key, value)| format!("{key}:{}", format_property_value(value)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

fn parse_property_assignment(raw: &str) -> Result<(String, PropertyValue), CliError> {
    let (key, value) = raw
        .split_once('=')
        .ok_or_else(|| CliError::Usage(format!("invalid property assignment: {raw}")))?;
    let key = key.trim();
    if key.is_empty() {
        return Err(CliError::Usage(format!(
            "invalid property assignment: {raw} (empty key)"
        )));
    }
    let parsed_value = parse_property_value_literal(value.trim())?;
    Ok((key.to_string(), parsed_value))
}

fn parse_property_assignments(raw: &str) -> Result<PropertyMap, CliError> {
    let mut out = PropertyMap::new();
    for assignment in raw
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let (key, value) = parse_property_assignment(assignment)?;
        out.insert(key, value);
    }
    Ok(out)
}

fn handle_create_node(
    db_path: &str,
    labels_raw: Option<&str>,
    props_raw: Option<&str>,
) -> Result<String, CliError> {
    let labels = labels_raw.map(parse_label_list).unwrap_or_default();
    let properties = if let Some(raw) = props_raw {
        parse_property_assignments(raw)?
    } else {
        PropertyMap::new()
    };

    let mut db = Database::open(db_path)?;
    let node_id = db.create_node_with(&labels, &properties)?;
    Ok(format!("node_id={node_id}"))
}

fn parse_u64_arg(raw: &str, name: &str) -> Result<u64, CliError> {
    raw.parse::<u64>()
        .map_err(|_| CliError::Usage(format!("invalid {name}: {raw}")))
}

fn parse_u32_arg(raw: &str, name: &str) -> Result<u32, CliError> {
    raw.parse::<u32>()
        .map_err(|_| CliError::Usage(format!("invalid {name}: {raw}")))
}

fn handle_add_edge(
    db_path: &str,
    src: u64,
    dst: u64,
    edge_type: Option<&str>,
    props_raw: Option<&str>,
) -> Result<String, CliError> {
    let properties = if let Some(raw) = props_raw {
        parse_property_assignments(raw)?
    } else {
        PropertyMap::new()
    };

    let mut db = Database::open(db_path)?;
    let edge_id = if let Some(edge_type) = edge_type {
        db.add_typed_edge(src, dst, edge_type, &properties)?
    } else if properties.is_empty() {
        db.add_edge(src, dst)?
    } else {
        db.add_edge_with_properties(src, dst, &properties)?
    };
    Ok(format!("edge_id={edge_id}"))
}

fn handle_neighbors(
    db_path: &str,
    src: u64,
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Neighbors(src))?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let neighbors = db.neighbors(src)?;
    let joined = neighbors
        .iter()
        .map(u64::to_string)
        .collect::<Vec<String>>()
        .join(",");
    Ok(format!(
        "src={}
count={}
neighbors={}",
        src,
        neighbors.len(),
        joined
    ))
}

fn handle_incoming(db_path: &str, dst: u64, format: QueryOutputFormat) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Incoming(dst))?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let incoming = db.incoming_neighbors(dst)?;
    let joined = incoming
        .iter()
        .map(u64::to_string)
        .collect::<Vec<String>>()
        .join(",");
    Ok(format!(
        "dst={}
count={}
incoming={}",
        dst,
        incoming.len(),
        joined
    ))
}

fn handle_hop_in(
    db_path: &str,
    dst: u64,
    hops: u32,
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::HopIn(dst, hops))?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let levels = db.hop_levels_incoming(dst, hops)?;
    let reachable_count = levels.iter().map(Vec::len).sum::<usize>();

    let mut lines = vec![
        format!("dst={dst}"),
        format!("hops={hops}"),
        format!("reachable_count={reachable_count}"),
    ];
    for (idx, level) in levels.iter().enumerate() {
        let joined = level
            .iter()
            .map(u64::to_string)
            .collect::<Vec<String>>()
            .join(",");
        lines.push(format!("level{}={joined}", idx + 1));
    }
    Ok(lines.join("\n"))
}

fn handle_hop(
    db_path: &str,
    src: u64,
    hops: u32,
    format: QueryOutputFormat,
) -> Result<String, CliError> {
    if format != QueryOutputFormat::Table {
        let rows = execute_query_plan_as_rows(db_path, QueryPlan::Hop(src, hops))?;
        return Ok(rows.render(format));
    }

    let db = Database::open(db_path)?;
    let levels = db.hop_levels(src, hops)?;
    let reachable_count = levels.iter().map(Vec::len).sum::<usize>();

    let mut lines = vec![
        format!("src={src}"),
        format!("hops={hops}"),
        format!("reachable_count={reachable_count}"),
    ];
    for (idx, level) in levels.iter().enumerate() {
        let joined = level
            .iter()
            .map(u64::to_string)
            .collect::<Vec<String>>()
            .join(",");
        lines.push(format!("level{}={joined}", idx + 1));
    }
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ogdb_core::{DbRole, VectorDistanceMetric};
    use std::env;
    use std::fs;
    use std::io::{BufRead, BufReader, Cursor, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::path::PathBuf;
    use std::process;
    use std::thread;
    use std::time::Duration;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(tag: &str) -> PathBuf {
        let mut path = env::temp_dir();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        path.push(format!("ogdb-cli-{tag}-{}-{ts}.ogdb", process::id()));
        path
    }

    fn wal_path(path: &PathBuf) -> PathBuf {
        PathBuf::from(format!("{}-wal", path.display()))
    }

    fn meta_path(path: &PathBuf) -> PathBuf {
        PathBuf::from(format!("{}-meta.json", path.display()))
    }

    fn temp_file_path(tag: &str, ext: &str) -> PathBuf {
        let mut path = env::temp_dir();
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        path.push(format!("ogdb-cli-{tag}-{}-{ts}.{ext}", process::id()));
        path
    }

    fn connect_with_retry(addr: &str) -> TcpStream {
        loop {
            if let Ok(stream) = TcpStream::connect(addr) {
                return stream;
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn connect_with_retry_timeout(addr: &str, timeout: Duration) -> TcpStream {
        let start = std::time::Instant::now();
        loop {
            if let Ok(stream) = TcpStream::connect(addr) {
                return stream;
            }
            if start.elapsed() >= timeout {
                panic!("timed out connecting to {addr}");
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn bolt_pack_value_string(value: &str) -> Vec<u8> {
        let bytes = value.as_bytes();
        let mut out = Vec::<u8>::new();
        if bytes.len() < 16 {
            out.push(0x80 | (bytes.len() as u8));
        } else {
            assert!(
                bytes.len() <= u8::MAX as usize,
                "test helper does not support strings larger than u8"
            );
            out.push(0xD0);
            out.push(bytes.len() as u8);
        }
        out.extend_from_slice(bytes);
        out
    }

    fn bolt_pack_value_map(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        assert!(entries.len() < 16, "test helper only supports tiny maps");
        let mut out = vec![0xA0 | (entries.len() as u8)];
        for (key, value) in entries {
            out.extend_from_slice(&bolt_pack_value_string(key));
            out.extend_from_slice(value);
        }
        out
    }

    fn bolt_pack_struct(signature: u8, fields: &[Vec<u8>]) -> Vec<u8> {
        assert!(
            fields.len() < 16,
            "test helper only supports tiny structures"
        );
        let mut out = vec![0xB0 | (fields.len() as u8), signature];
        for field in fields {
            out.extend_from_slice(field);
        }
        out
    }

    fn bolt_write_message(stream: &mut TcpStream, payload: &[u8]) {
        let len = u16::try_from(payload.len()).expect("payload too large for test helper");
        stream
            .write_all(&len.to_be_bytes())
            .expect("write bolt chunk length");
        stream.write_all(payload).expect("write bolt payload");
        stream.write_all(&[0, 0]).expect("write bolt chunk tail");
        stream.flush().expect("flush bolt payload");
    }

    fn bolt_read_message(stream: &mut TcpStream) -> Vec<u8> {
        let mut payload = Vec::<u8>::new();
        loop {
            let mut len_buf = [0u8; 2];
            stream
                .read_exact(&mut len_buf)
                .expect("read bolt chunk length");
            let len = u16::from_be_bytes(len_buf);
            if len == 0 {
                break;
            }
            let mut chunk = vec![0u8; len as usize];
            stream
                .read_exact(&mut chunk)
                .expect("read bolt chunk payload");
            payload.extend_from_slice(&chunk);
        }
        payload
    }

    fn bolt_message_signature(payload: &[u8]) -> u8 {
        assert!(
            payload.len() >= 2,
            "payload too short for signature extraction"
        );
        assert!(
            (payload[0] & 0xF0) == 0xB0,
            "payload is not a tiny struct marker"
        );
        payload[1]
    }

    fn read_http_response(stream: TcpStream) -> (u16, String, Vec<u8>) {
        let mut reader = BufReader::new(stream);
        let mut status_line = String::new();
        reader
            .read_line(&mut status_line)
            .expect("read http status line");
        let mut parts = status_line.trim().split_whitespace();
        let _http = parts.next().expect("status line protocol");
        let status = parts
            .next()
            .expect("status code")
            .parse::<u16>()
            .expect("numeric status");
        let mut content_type = String::new();
        let mut content_length = 0usize;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).expect("read header line");
            let trimmed = line.trim_end_matches(['\r', '\n']);
            if trimmed.is_empty() {
                break;
            }
            if let Some((key, value)) = trimmed.split_once(':') {
                let key = key.trim().to_ascii_lowercase();
                let value = value.trim().to_string();
                if key == "content-type" {
                    content_type = value;
                } else if key == "content-length" {
                    // Replaces a prior `.expect("content-length number")` that
                    // would panic the test runner on malformed server output —
                    // audit F5.6 wants no `.expect` on parsed header values,
                    // even inside test helpers. We fall back to 0 (and skip
                    // the body read via `read_exact` on an empty buffer) so
                    // the caller gets a clear assertion failure instead of a
                    // panic spewing into the test log.
                    content_length = value.parse::<usize>().unwrap_or(0);
                }
            }
        }
        let mut body = vec![0u8; content_length];
        reader.read_exact(&mut body).expect("read http body");
        (status, content_type, body)
    }

    fn send_http_request(
        addr: &str,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: &[u8],
    ) -> (u16, String, Vec<u8>) {
        let mut stream = connect_with_retry_timeout(addr, Duration::from_secs(2));
        let mut request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Length: {}\r\n",
            body.len()
        );
        for (name, value) in headers {
            request.push_str(name);
            request.push_str(": ");
            request.push_str(value);
            request.push_str("\r\n");
        }
        request.push_str("\r\n");
        stream
            .write_all(request.as_bytes())
            .expect("write http request headers");
        stream.write_all(body).expect("write http request body");
        stream.flush().expect("flush http request");
        read_http_response(stream)
    }

    fn ok_write(_: &mut Database) -> Result<(), DbError> {
        Ok(())
    }

    fn ok_write_tx(_: ogdb_core::WriteTransaction<'_>) -> Result<(), DbError> {
        Ok(())
    }

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
            Ok(0)
        }
    }

    impl BufRead for FailingReader {
        fn fill_buf(&mut self) -> io::Result<&[u8]> {
            Err(io::Error::other("boom"))
        }

        fn consume(&mut self, _amt: usize) {}
    }

    #[test]
    fn usage_function_renders_clap_help() {
        let help = usage();
        assert!(help.contains("OpenGraphDB CLI"));
        assert!(help.contains("commands"));
    }

    #[test]
    fn shell_reader_parses_queries_and_skips_comments_and_blanks() {
        let input = "# comment\n\n create node \n  stats\n";
        let queries = read_shell_queries_from_reader(Cursor::new(input)).expect("read queries");
        assert_eq!(
            queries,
            vec!["create node".to_string(), "stats".to_string()]
        );
    }

    #[test]
    fn shell_reader_surfaces_io_errors() {
        let mut reader = FailingReader;
        let mut scratch = [0_u8; 0];
        let bytes = reader.read(&mut scratch).expect("read should succeed");
        assert_eq!(bytes, 0);
        reader.consume(0);

        let err = read_shell_queries_from_reader(FailingReader).expect_err("reader must fail");
        assert!(matches!(err, CliError::Runtime(_)));
        assert!(err.to_string().contains("failed to read shell stdin line"));
    }

    #[test]
    fn shell_editor_helper_hint_and_completion_cover_keywords() {
        let helper = ShellEditorHelper;
        let history = rustyline::history::DefaultHistory::new();
        let ctx = Context::new(&history);

        assert_eq!(helper.hint("sta", 3, &ctx), None);

        let (start, candidates) = helper.complete("sta", 3, &ctx).expect("complete succeeds");
        assert_eq!(start, 0);
        assert!(candidates.iter().any(|pair| pair.replacement == "stats"));

        let (upper_start, upper_candidates) = helper
            .complete("MA", 2, &ctx)
            .expect("uppercase complete works");
        assert_eq!(upper_start, 0);
        assert!(upper_candidates
            .iter()
            .any(|pair| pair.replacement == "match"));

        let (multi_start, multi_candidates) = helper
            .complete("m", 1, &ctx)
            .expect("multi candidate complete works");
        assert_eq!(multi_start, 0);
        assert!(multi_candidates.len() >= 3);
        assert!(multi_candidates
            .windows(2)
            .all(|w| w[0].replacement <= w[1].replacement));

        let (empty_start, empty_candidates) = helper
            .complete("find ", 5, &ctx)
            .expect("empty prefix complete works");
        assert_eq!(empty_start, 5);
        assert!(empty_candidates.is_empty());
    }

    #[test]
    fn shell_history_path_targets_user_home_history_file() {
        let history_path = shell_history_path().expect("HOME should be set in test env");
        assert_eq!(
            history_path.file_name().and_then(|v| v.to_str()),
            Some(".ogdb_history")
        );
    }

    #[test]
    fn shell_dispatch_interactive_mode_calls_interactive_handler() {
        let path = temp_db_path("shell-interactive-dispatch");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let err = handle_shell_with_stdin_mode(
            &path.display().to_string(),
            None,
            None,
            QueryOutputFormat::Table,
            true,
        )
        .expect_err("interactive test stub should return usage error");
        assert!(matches!(err, CliError::Usage(_)));
        assert!(err
            .to_string()
            .contains("shell input produced zero executable queries"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_dispatch_non_tty_mode_reads_stdin_queries() {
        let path = temp_db_path("shell-non-tty-dispatch");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let err = handle_shell_with_stdin_mode(
            &path.display().to_string(),
            None,
            None,
            QueryOutputFormat::Table,
            false,
        )
        .expect_err("empty stdin should surface shell usage error");
        assert!(matches!(err, CliError::Usage(_)));
        assert!(err
            .to_string()
            .contains("shell input produced zero executable queries"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn handle_mcp_requires_mode_when_called_directly() {
        let path = temp_db_path("mcp-direct-mode-required");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let err = handle_mcp(&path.display().to_string(), None, false, None)
            .expect_err("mode must be required");
        assert!(matches!(err, CliError::Usage(_)));
        assert!(err
            .to_string()
            .contains("choose exactly one of --request or --stdio"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn resolve_db_path_requires_local_or_global_path() {
        let err = resolve_db_path(None, None).expect_err("path should be required");
        assert!(matches!(err, CliError::Usage(_)));
        assert_eq!(
            err.to_string(),
            "database path required: provide <path> or --db"
        );
    }

    #[test]
    fn query_arg_parsers_surface_invalid_numbers() {
        let src_err = parse_u64_arg("x", "<src>").expect_err("u64 parser should fail");
        assert!(matches!(src_err, CliError::Usage(_)));
        assert!(src_err.to_string().contains("invalid <src>: x"));

        let hops_err = parse_u32_arg("y", "<hops>").expect_err("u32 parser should fail");
        assert!(matches!(hops_err, CliError::Usage(_)));
        assert!(hops_err.to_string().contains("invalid <hops>: y"));
    }

    #[test]
    fn query_result_rows_fill_missing_cells_with_string_null() {
        let mut batch_columns = std::collections::BTreeMap::<String, Vec<PropertyValue>>::new();
        batch_columns.insert("src".to_string(), vec![PropertyValue::I64(1)]);
        let result = QueryResult {
            columns: vec!["src".to_string(), "dst".to_string()],
            batches: vec![ogdb_core::RecordBatch {
                columns: batch_columns,
            }],
        };

        let rows = query_result_as_rows(&result);
        assert_eq!(rows.columns, vec!["src".to_string(), "dst".to_string()]);
        assert_eq!(rows.rows.len(), 1);
        assert_eq!(rows.rows[0][0], "i64:1");
        assert_eq!(rows.rows[0][1], "string:null");
    }

    #[test]
    fn execute_query_cypher_runtime_errors_are_wrapped() {
        let path = temp_db_path("query-runtime-wrap");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let table_err = execute_query(&path.display().to_string(), "RETURN n")
            .expect_err("unknown variable should fail analysis/runtime");
        assert!(matches!(table_err, CliError::Runtime(_)));
        assert!(!table_err.to_string().is_empty());

        let rows_err = execute_query_rows(&path.display().to_string(), "RETURN n")
            .expect_err("unknown variable should fail analysis/runtime");
        assert!(matches!(rows_err, CliError::Runtime(_)));
        assert!(!rows_err.to_string().is_empty());

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn init_creates_database_file() {
        let path = temp_db_path("init");
        let args = vec![
            "init".to_string(),
            path.display().to_string(),
            "--page-size".to_string(),
            "8192".to_string(),
        ];

        let out = run(&args);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("initialized"));

        let info = run(&vec!["info".to_string(), path.display().to_string()]);
        assert_eq!(info.exit_code, 0);
        assert!(info.stdout.contains("format_version=1"));
        assert!(info.stdout.contains("page_size=8192"));
        assert!(info.stdout.contains("page_count=0"));
        assert!(info.stdout.contains("node_count=0"));
        assert!(info.stdout.contains("edge_count=0"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn shared_database_timeout_apis_work_from_cli_dependency() {
        let path = temp_db_path("shared-timeout-cli-dep");
        let shared =
            ogdb_core::SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");

        let snapshot = shared
            .read_snapshot_with_timeout(Duration::from_millis(1))
            .expect("read snapshot with timeout");
        assert_eq!(snapshot.node_count(), 0);
        drop(snapshot);

        let node_count = shared
            .with_write_timeout(Duration::from_millis(1), |db| {
                let _ = db.create_node()?;
                Ok(db.node_count())
            })
            .expect("write with timeout");
        assert_eq!(node_count, 1);

        let mut embedded = Database::open(&path).expect("open db for tx path coverage");
        let tx_summary = {
            let mut tx = embedded.begin_write();
            let staged_node = tx.create_node().expect("stage node in tx");
            assert_eq!(staged_node, 1);
            tx.commit().expect("commit staged tx node")
        };
        assert_eq!(tx_summary.created_nodes, 1);

        shared
            .with_write_transaction_timeout(Duration::from_millis(1), ok_write_tx)
            .expect("write tx succeeds before contention");

        let held_snapshot = shared.read_snapshot().expect("hold read snapshot");
        let tx_timeout = shared
            .with_write_transaction_timeout(Duration::from_millis(1), ok_write_tx)
            .expect_err("write tx timeout under read lock");
        assert!(matches!(tx_timeout, DbError::Timeout(_)));
        assert!(tx_timeout
            .to_string()
            .contains("write transaction lock acquisition exceeded"));
        drop(held_snapshot);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shared_database_timeout_apis_surface_poison_errors_from_cli_dependency() {
        let path = temp_db_path("shared-poison-cli-dep");
        let shared =
            ogdb_core::SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
        shared
            .with_write_timeout(Duration::from_millis(1), ok_write)
            .expect("write succeeds before poison");
        shared
            .with_write_transaction_timeout(Duration::from_millis(1), ok_write_tx)
            .expect("write tx succeeds before poison");

        let poisoned = shared.clone();
        let panic_outcome = std::panic::catch_unwind(move || {
            let _ = poisoned.with_write::<(), _>(|_| {
                panic!("poison shared lock from cli test");
            });
        });
        assert!(panic_outcome.is_err());

        let read_err = shared
            .read_snapshot_with_timeout(Duration::from_millis(1))
            .expect_err("poisoned read lock");
        assert!(matches!(read_err, DbError::Corrupt(_)));
        assert!(read_err.to_string().contains("read snapshot lock poisoned"));

        let write_err = shared
            .with_write_timeout(Duration::from_millis(1), ok_write)
            .expect_err("poisoned write lock");
        assert!(matches!(write_err, DbError::Corrupt(_)));
        assert!(write_err.to_string().contains("write lock poisoned"));

        let tx_err = shared
            .with_write_transaction_timeout(Duration::from_millis(1), ok_write_tx)
            .expect_err("poisoned write tx lock");
        assert!(matches!(tx_err, DbError::Corrupt(_)));
        assert!(tx_err
            .to_string()
            .contains("write transaction lock poisoned"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn returns_usage_error_for_missing_command() {
        let out = run(&[]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("commands"));
    }

    #[test]
    fn help_command_prints_usage() {
        let out = run(&["help".to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("commands"));
    }

    #[test]
    fn help_flag_prints_usage() {
        let out_long = run(&["--help".to_string()]);
        assert_eq!(out_long.exit_code, 0);
        assert!(out_long.stdout.contains("commands"));

        let out_short = run(&["-h".to_string()]);
        assert_eq!(out_short.exit_code, 0);
        assert!(out_short.stdout.contains("commands"));
    }

    #[test]
    fn version_flag_prints_version() {
        let out = run(&["--version".to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains(env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn global_db_flag_can_supply_database_path() {
        let path = temp_db_path("global-db-flag");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "info".to_string(),
            "--db".to_string(),
            path.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("node_count=0"));
        assert!(out.stdout.contains("edge_count=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn all_path_subcommands_accept_db_without_positional_path() {
        let db = "/tmp/ogdb-cli-parse-placeholder.ogdb".to_string();
        let cases = vec![
            vec!["init".to_string(), "--db".to_string(), db.clone()],
            vec!["info".to_string(), "--db".to_string(), db.clone()],
            vec!["metrics".to_string(), "--db".to_string(), db.clone()],
            vec!["stats".to_string(), "--db".to_string(), db.clone()],
            vec!["schema".to_string(), "--db".to_string(), db.clone()],
            vec!["checkpoint".to_string(), "--db".to_string(), db.clone()],
            vec![
                "query".to_string(),
                "--db".to_string(),
                db.clone(),
                "info".to_string(),
            ],
            vec![
                "shell".to_string(),
                "--db".to_string(),
                db.clone(),
                "--commands".to_string(),
                "info".to_string(),
            ],
            vec![
                "import".to_string(),
                "--db".to_string(),
                db.clone(),
                "graph.json".to_string(),
            ],
            vec![
                "export".to_string(),
                "--db".to_string(),
                db.clone(),
                "graph.json".to_string(),
            ],
            vec![
                "import-rdf".to_string(),
                "--db".to_string(),
                db.clone(),
                "graph.ttl".to_string(),
            ],
            vec![
                "export-rdf".to_string(),
                "--db".to_string(),
                db.clone(),
                "graph.ttl".to_string(),
            ],
            vec![
                "migrate".to_string(),
                "--db".to_string(),
                db.clone(),
                "schema.migrate".to_string(),
            ],
            vec![
                "mcp".to_string(),
                "--db".to_string(),
                db.clone(),
                "--request".to_string(),
                "{}".to_string(),
            ],
            vec![
                "serve".to_string(),
                "--db".to_string(),
                db.clone(),
                "--max-requests".to_string(),
                "1".to_string(),
            ],
            vec!["create-node".to_string(), "--db".to_string(), db.clone()],
            vec![
                "add-edge".to_string(),
                "--db".to_string(),
                db.clone(),
                "0".to_string(),
                "1".to_string(),
            ],
            vec![
                "neighbors".to_string(),
                "--db".to_string(),
                db.clone(),
                "0".to_string(),
            ],
            vec![
                "incoming".to_string(),
                "--db".to_string(),
                db.clone(),
                "0".to_string(),
            ],
            vec![
                "hop".to_string(),
                "--db".to_string(),
                db.clone(),
                "0".to_string(),
                "1".to_string(),
            ],
            vec![
                "hop-in".to_string(),
                "--db".to_string(),
                db.clone(),
                "0".to_string(),
                "1".to_string(),
            ],
        ];

        for args in cases {
            let parse = parse_cli(&args);
            match parse {
                Ok(_) => {}
                Err(result) => panic!("parse failed for {:?}: {}", args, result.stderr),
            }
        }
    }

    #[test]
    fn global_format_flag_applies_to_read_commands() {
        let path = temp_db_path("global-format-flag");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "--format".to_string(),
            "json".to_string(),
            "info".to_string(),
            path.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        let value: serde_json::Value = serde_json::from_str(&out.stdout).expect("valid json");
        assert_eq!(value["row_count"], 1);
        assert_eq!(value["rows"][0]["node_count"], "0");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn init_requires_path_argument() {
        let out = run(&["init".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn init_requires_page_size_value_when_flag_present() {
        let path = temp_db_path("missing-pagesize-value");
        let out = run(&vec![
            "init".to_string(),
            path.display().to_string(),
            "--page-size".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("--page-size"));
        assert!(out.stderr.contains("required"));
    }

    #[test]
    fn init_rejects_unknown_flag() {
        let path = temp_db_path("unknown-flag");
        let out = run(&vec![
            "init".to_string(),
            path.display().to_string(),
            "--unknown".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("unexpected argument"));
    }

    #[test]
    fn returns_usage_error_for_unknown_command() {
        let out = run(&["unknown".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("unrecognized subcommand"));
    }

    #[test]
    fn returns_usage_error_for_invalid_page_size() {
        let path = temp_db_path("bad-pagesize");
        let out = run(&vec![
            "init".to_string(),
            path.display().to_string(),
            "--page-size".to_string(),
            "3000".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("power of two"));
    }

    #[test]
    fn returns_usage_error_for_too_small_page_size() {
        let path = temp_db_path("small-pagesize");
        let out = run(&vec![
            "init".to_string(),
            path.display().to_string(),
            "--page-size".to_string(),
            "32".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains(">= 64"));
    }

    #[test]
    fn returns_usage_error_for_non_numeric_page_size() {
        let path = temp_db_path("bad-pagesize-string");
        let out = run(&vec![
            "init".to_string(),
            path.display().to_string(),
            "--page-size".to_string(),
            "not-a-number".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("--page-size"));
        assert!(out.stderr.contains("invalid value"));
    }

    #[test]
    fn returns_runtime_error_for_missing_file_on_info() {
        let path = temp_db_path("missing");
        let out = run(&vec!["info".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("io error"));
    }

    #[test]
    fn returns_runtime_error_when_init_path_already_exists() {
        let path = temp_db_path("existing");
        let first = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(first.exit_code, 0);

        let second = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(second.exit_code, 1);
        assert!(second.stderr.contains("already exists"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn info_reports_page_count_after_allocation() {
        let path = temp_db_path("info-page-count");
        let db = Database::init(&path, Header::default_v1()).expect("init must succeed");
        let _ = db.allocate_page().expect("allocate page");

        let out = run(&vec!["info".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("page_count=1"));
        assert!(out.stdout.contains("node_count=0"));
        assert!(out.stdout.contains("edge_count=0"));

        fs::remove_file(&path).expect("cleanup");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn info_metrics_stats_and_schema_support_machine_readable_formats() {
        let path = temp_db_path("read-formats");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let info_json = run(&vec![
            "info".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(info_json.exit_code, 0);
        let info_value: serde_json::Value =
            serde_json::from_str(&info_json.stdout).expect("valid info json");
        assert_eq!(info_value["rows"][0]["node_count"], "2");
        assert_eq!(info_value["rows"][0]["edge_count"], "1");

        let stats_jsonl = run(&vec![
            "stats".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
        ]);
        assert_eq!(stats_jsonl.exit_code, 0);
        let stats_row: serde_json::Value =
            serde_json::from_str(stats_jsonl.stdout.trim()).expect("valid stats jsonl");
        assert_eq!(stats_row["max_out_degree"], "1");

        let schema_csv = run(&vec![
            "schema".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "csv".to_string(),
        ]);
        assert_eq!(schema_csv.exit_code, 0);
        assert!(schema_csv
            .stdout
            .starts_with("path,model,node_labels,edge_types,property_keys,node_count,edge_count"));
        assert!(schema_csv.stdout.contains(",property_graph_minimal,"));

        let metrics_json = run(&vec![
            "metrics".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(metrics_json.exit_code, 0);
        let metrics_value: serde_json::Value =
            serde_json::from_str(&metrics_json.stdout).expect("valid metrics json");
        assert_eq!(metrics_value["rows"][0]["node_count"], "2");
        assert_eq!(metrics_value["rows"][0]["edge_count"], "1");
        assert_eq!(metrics_value["rows"][0]["delta_buffer_edge_count"], "0");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn stats_command_reports_degree_metrics() {
        let path = temp_db_path("stats");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "2".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "2".to_string(),
            "3".to_string(),
        ]);

        let out = run(&vec!["stats".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("node_count=4"));
        assert!(out.stdout.contains("edge_count=3"));
        assert!(out.stdout.contains("zero_out_degree_nodes=2"));
        assert!(out.stdout.contains("max_out_degree=2"));
        assert!(out.stdout.contains("max_out_degree_node=0"));
        assert!(out.stdout.contains("avg_out_degree=0.750000"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn schema_command_reports_baseline_shape() {
        let path = temp_db_path("schema");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let out = run(&vec!["schema".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("model=property_graph_minimal"));
        assert!(out.stdout.contains("node_labels=0"));
        assert!(out.stdout.contains("edge_types=0"));
        assert!(out.stdout.contains("property_keys=0"));
        assert!(out.stdout.contains("node_count=2"));
        assert!(out.stdout.contains("edge_count=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn schema_command_reports_property_graph_catalog_counts() {
        let path = temp_db_path("schema-property-catalog");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let n0 = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person,Employee".to_string(),
            "--props".to_string(),
            "age=i64:42;name=string:alice;active=bool:true".to_string(),
        ]);
        assert_eq!(n0.exit_code, 0);
        assert!(n0.stdout.contains("node_id=0"));

        let n1 = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person".to_string(),
            "--props".to_string(),
            "age=i64:7;name=string:bob;active=bool:false".to_string(),
        ]);
        assert_eq!(n1.exit_code, 0);
        assert!(n1.stdout.contains("node_id=1"));

        let e0 = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--props".to_string(),
            "weight=f64:0.75".to_string(),
        ]);
        assert_eq!(e0.exit_code, 0);
        assert!(e0.stdout.contains("edge_id=0"));

        let e1 = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "0".to_string(),
            "--type".to_string(),
            "KNOWS".to_string(),
            "--props".to_string(),
            "since=i64:2024;proof=bytes:00ff".to_string(),
        ]);
        assert_eq!(e1.exit_code, 0);
        assert!(e1.stdout.contains("edge_id=1"));

        let schema = run(&vec!["schema".to_string(), path.display().to_string()]);
        assert_eq!(schema.exit_code, 0);
        assert!(schema.stdout.contains("node_labels=2"));
        assert!(schema.stdout.contains("edge_types=1"));
        assert!(schema.stdout.contains("property_keys=6"));
        assert!(schema.stdout.contains("node_count=2"));
        assert!(schema.stdout.contains("edge_count=2"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn migrate_dry_run_prints_planned_actions() {
        let path = temp_db_path("migrate-dry-run");
        let script = temp_file_path("migrate-dry-run-script", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &script,
            "ADD LABEL Person\nADD LABEL Company\nADD INDEX ON :Person(name)\n",
        )
        .expect("write migration script");

        let out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            script.display().to_string(),
            "--dry-run".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("[DRY-RUN] ADD LABEL Person"));
        assert!(out.stdout.contains("[DRY-RUN] ADD LABEL Company"));
        assert!(out.stdout.contains("[DRY-RUN] ADD INDEX ON :Person(name)"));
        assert!(out.stdout.contains("3 action(s) would be applied"));

        let schema = run(&vec!["schema".to_string(), path.display().to_string()]);
        assert_eq!(schema.exit_code, 0);
        assert!(schema.stdout.contains("node_labels=0"));
        assert!(schema.stdout.contains("edge_types=0"));
        assert!(schema.stdout.contains("property_keys=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(&script).expect("cleanup script");
    }

    #[test]
    fn migrate_dry_run_supports_global_db_flag() {
        let path = temp_db_path("migrate-dry-run-db-flag");
        let script = temp_file_path("migrate-dry-run-db-flag-script", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&script, "ADD LABEL Person\n").expect("write migration script");

        let out = run(&vec![
            "migrate".to_string(),
            "--db".to_string(),
            path.display().to_string(),
            script.display().to_string(),
            "--dry-run".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("[DRY-RUN] ADD LABEL Person"));
        assert!(out.stdout.contains("1 action(s) would be applied"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(&script).expect("cleanup script");
    }

    #[test]
    fn migrate_apply_executes_all_actions() {
        let path = temp_db_path("migrate-apply");
        let script = temp_file_path("migrate-apply-script", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &script,
            "# Schema evolution\nADD LABEL Person\nADD LABEL Company\nADD EDGE_TYPE WORKS_AT\nADD PROPERTY_KEY email\nADD INDEX ON :Person(email)\n",
        )
        .expect("write migration script");

        let out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            script.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("[APPLIED] ADD LABEL Person"));
        assert!(out.stdout.contains("[APPLIED] ADD LABEL Company"));
        assert!(out.stdout.contains("[APPLIED] ADD EDGE_TYPE WORKS_AT"));
        assert!(out.stdout.contains("[APPLIED] ADD PROPERTY_KEY email"));
        assert!(out.stdout.contains("[APPLIED] ADD INDEX ON :Person(email)"));
        assert!(out.stdout.contains("5 action(s) applied successfully"));

        let db = Database::open(&path).expect("open migrated db");
        let schema = db.schema_catalog();
        assert!(schema.labels.contains(&"Person".to_string()));
        assert!(schema.labels.contains(&"Company".to_string()));
        assert!(schema.edge_types.contains(&"WORKS_AT".to_string()));
        assert!(schema.property_keys.contains(&"email".to_string()));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(&script).expect("cleanup script");
    }

    #[test]
    fn migrate_drop_operations_remove_schema_entries() {
        let path = temp_db_path("migrate-drop");
        let add_script = temp_file_path("migrate-drop-add", "migrate");
        let drop_script = temp_file_path("migrate-drop-drop", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(
            &add_script,
            "ADD LABEL TempLabel\nADD EDGE_TYPE TEMP_REL\nADD PROPERTY_KEY temp_prop\n",
        )
        .expect("write add script");
        let add_out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            add_script.display().to_string(),
        ]);
        assert_eq!(add_out.exit_code, 0);

        fs::write(
            &drop_script,
            "DROP LABEL TempLabel\nDROP EDGE_TYPE TEMP_REL\nDROP PROPERTY_KEY temp_prop\n",
        )
        .expect("write drop script");
        let drop_out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            drop_script.display().to_string(),
        ]);
        assert_eq!(drop_out.exit_code, 0);
        assert!(drop_out.stdout.contains("[APPLIED] DROP LABEL TempLabel"));
        assert!(drop_out
            .stdout
            .contains("[APPLIED] DROP EDGE_TYPE TEMP_REL"));
        assert!(drop_out
            .stdout
            .contains("[APPLIED] DROP PROPERTY_KEY temp_prop"));
        assert!(drop_out.stdout.contains("3 action(s) applied successfully"));

        let db = Database::open(&path).expect("open migrated db");
        let schema = db.schema_catalog();
        assert!(!schema.labels.contains(&"TempLabel".to_string()));
        assert!(!schema.edge_types.contains(&"TEMP_REL".to_string()));
        assert!(!schema.property_keys.contains(&"temp_prop".to_string()));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(&add_script).expect("cleanup add script");
        fs::remove_file(&drop_script).expect("cleanup drop script");
    }

    #[test]
    fn migrate_invalid_directive_returns_parse_error() {
        let path = temp_db_path("migrate-invalid");
        let script = temp_file_path("migrate-invalid-script", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&script, "ADD LABEL Person\nRENAME LABEL Person TO User\n")
            .expect("write invalid migration script");

        let out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            script.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("line 2"));
        assert!(out.stderr.contains("unrecognized directive"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(&script).expect("cleanup script");
    }

    #[test]
    fn migrate_skips_comments_and_empty_lines() {
        let path = temp_db_path("migrate-comments");
        let script = temp_file_path("migrate-comments-script", "migrate");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &script,
            "# comment\n// another comment\n\nADD LABEL Person\n\n# more\nADD LABEL Company\n",
        )
        .expect("write migration script");

        let out = run(&vec![
            "migrate".to_string(),
            path.display().to_string(),
            script.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("2 action(s) applied successfully"));

        let db = Database::open(&path).expect("open migrated db");
        let schema = db.schema_catalog();
        assert!(schema.labels.contains(&"Person".to_string()));
        assert!(schema.labels.contains(&"Company".to_string()));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(&script).expect("cleanup script");
    }

    #[test]
    fn schema_rejects_wrong_argument_count() {
        let out = run(&["schema".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn stats_command_reports_empty_graph_metrics() {
        let path = temp_db_path("stats-empty");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec!["stats".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("node_count=0"));
        assert!(out.stdout.contains("edge_count=0"));
        assert!(out.stdout.contains("zero_out_degree_nodes=0"));
        assert!(out.stdout.contains("max_out_degree=0"));
        assert!(out.stdout.contains("max_out_degree_node=none"));
        assert!(out.stdout.contains("avg_out_degree=0.000000"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn stats_rejects_wrong_argument_count() {
        let out = run(&["stats".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn metrics_command_reports_storage_metrics() {
        let path = temp_db_path("metrics");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let out = run(&vec!["metrics".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("format_version=1"));
        assert!(out.stdout.contains("page_size=4096"));
        assert!(out.stdout.contains("page_count=1"));
        assert!(out.stdout.contains("node_count=2"));
        assert!(out.stdout.contains("edge_count=1"));
        assert!(out.stdout.contains("wal_size_bytes="));
        assert!(out.stdout.contains("adjacency_base_edge_count=1"));
        assert!(out.stdout.contains("delta_buffer_edge_count=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn metrics_rejects_wrong_argument_count() {
        let out = run(&["metrics".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn read_commands_reject_invalid_format_flags() {
        let path = temp_db_path("read-format-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let info_missing = run(&vec![
            "info".to_string(),
            path.display().to_string(),
            "--format".to_string(),
        ]);
        assert_eq!(info_missing.exit_code, 2);
        assert!(info_missing.stderr.contains("--format"));

        let stats_bad = run(&vec![
            "stats".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "xml".to_string(),
        ]);
        assert_eq!(stats_bad.exit_code, 2);
        assert!(stats_bad.stderr.contains("invalid value"));
        assert!(stats_bad.stderr.contains("xml"));

        let metrics_missing = run(&vec![
            "metrics".to_string(),
            path.display().to_string(),
            "--format".to_string(),
        ]);
        assert_eq!(metrics_missing.exit_code, 2);
        assert!(metrics_missing.stderr.contains("--format"));

        let schema_unknown = run(&vec![
            "schema".to_string(),
            path.display().to_string(),
            "--bad-flag".to_string(),
        ]);
        assert_eq!(schema_unknown.exit_code, 2);
        assert!(schema_unknown.stderr.contains("unexpected argument"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn checkpoint_command_truncates_wal() {
        let path = temp_db_path("checkpoint");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let wal = wal_path(&path);
        let before = fs::metadata(&wal).expect("wal metadata before").len();
        assert!(before > 8);

        let out = run(&vec!["checkpoint".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("checkpointed"));
        let after = fs::metadata(&wal).expect("wal metadata after").len();
        assert_eq!(after, 8);

        fs::remove_file(path).expect("cleanup db");
        fs::remove_file(wal).expect("cleanup wal");
    }

    #[test]
    fn checkpoint_rejects_wrong_argument_count() {
        let out = run(&["checkpoint".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn backup_command_creates_database_copy() {
        let src = temp_db_path("backup-src");
        let dst = temp_db_path("backup-dst");
        let init = run(&vec!["init".to_string(), src.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), src.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), src.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            src.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let out = run(&vec![
            "backup".to_string(),
            src.display().to_string(),
            dst.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("backup_created"));

        let info = run(&vec!["info".to_string(), dst.display().to_string()]);
        assert_eq!(info.exit_code, 0);
        assert!(info.stdout.contains("node_count=2"));
        assert!(info.stdout.contains("edge_count=1"));
        assert!(wal_path(&dst).exists());

        fs::remove_file(&src).expect("cleanup src db");
        fs::remove_file(wal_path(&src)).expect("cleanup src wal");
        fs::remove_file(&dst).expect("cleanup dst db");
        fs::remove_file(wal_path(&dst)).expect("cleanup dst wal");
    }

    #[test]
    fn backup_rejects_wrong_argument_count() {
        let out = run(&["backup".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb backup <src-path> <dst-path>"));
    }

    #[test]
    fn backup_returns_runtime_error_when_destination_exists() {
        let src = temp_db_path("backup-existing-src");
        let dst = temp_db_path("backup-existing-dst");
        let init = run(&vec!["init".to_string(), src.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&dst, []).expect("create dst file");

        let out = run(&vec![
            "backup".to_string(),
            src.display().to_string(),
            dst.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("already exists"));

        fs::remove_file(&src).expect("cleanup src db");
        fs::remove_file(wal_path(&src)).expect("cleanup src wal");
        fs::remove_file(dst).expect("cleanup dst db");
    }

    #[test]
    fn backup_command_supports_online_and_compact_modes() {
        let src = temp_db_path("backup-online-src");
        let dst_online = temp_db_path("backup-online-dst");
        let dst_compact = temp_db_path("backup-compact-dst");
        let init = run(&vec!["init".to_string(), src.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), src.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), src.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            src.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let online = run(&vec![
            "backup".to_string(),
            src.display().to_string(),
            dst_online.display().to_string(),
            "--online".to_string(),
        ]);
        assert_eq!(online.exit_code, 0);
        assert!(online.stdout.contains("backup_created"));

        let compact = run(&vec![
            "backup".to_string(),
            src.display().to_string(),
            dst_compact.display().to_string(),
            "--online".to_string(),
            "--compact".to_string(),
        ]);
        assert_eq!(compact.exit_code, 0);
        assert!(compact.stdout.contains("backup_created"));

        fs::remove_file(&src).expect("cleanup src db");
        fs::remove_file(wal_path(&src)).expect("cleanup src wal");
        fs::remove_file(&dst_online).expect("cleanup online dst db");
        fs::remove_file(wal_path(&dst_online)).expect("cleanup online dst wal");
        fs::remove_file(&dst_compact).expect("cleanup compact dst db");
        fs::remove_file(wal_path(&dst_compact)).expect("cleanup compact dst wal");
    }

    #[test]
    fn backup_compact_requires_online_flag() {
        let src = temp_db_path("backup-compact-requires-online-src");
        let dst = temp_db_path("backup-compact-requires-online-dst");
        let init = run(&vec!["init".to_string(), src.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "backup".to_string(),
            src.display().to_string(),
            dst.display().to_string(),
            "--compact".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("--online"));

        fs::remove_file(&src).expect("cleanup src db");
        fs::remove_file(wal_path(&src)).expect("cleanup src wal");
    }

    #[test]
    fn query_command_executes_read_queries() {
        let path = temp_db_path("query-reads");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let neighbors = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "neighbors".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(neighbors.exit_code, 0);
        assert!(neighbors.stdout.contains("count=1"));
        assert!(neighbors.stdout.contains("neighbors=1"));

        let stats = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "stats".to_string(),
        ]);
        assert_eq!(stats.exit_code, 0);
        assert!(stats.stdout.contains("node_count=2"));

        let hop = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "hop".to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(hop.exit_code, 0);
        assert!(hop.stdout.contains("reachable_count=1"));
        assert!(hop.stdout.contains("level1=1"));

        let incoming = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "incoming".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(incoming.exit_code, 0);
        assert!(incoming.stdout.contains("dst=1"));
        assert!(incoming.stdout.contains("incoming=0"));

        let hop_in = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "hop-in".to_string(),
            "1".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(hop_in.exit_code, 0);
        assert!(hop_in.stdout.contains("dst=1"));
        assert!(hop_in.stdout.contains("reachable_count=1"));
        assert!(hop_in.stdout.contains("level1=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_command_executes_write_queries() {
        let path = temp_db_path("query-writes");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let create = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "create node".to_string(),
        ]);
        assert_eq!(create.exit_code, 0);
        assert!(create.stdout.contains("node_id=0"));

        let _ = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "create node".to_string(),
        ]);
        let add = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "add edge 0 1".to_string(),
        ]);
        assert_eq!(add.exit_code, 0);
        assert!(add.stdout.contains("edge_id=0"));

        let info = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "info".to_string(),
        ]);
        assert_eq!(info.exit_code, 0);
        assert!(info.stdout.contains("node_count=2"));
        assert!(info.stdout.contains("edge_count=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_command_executes_cypher_queries_via_core_pipeline() {
        let path = temp_db_path("query-cypher");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let create = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "CREATE (n:Person {name: 'Alice', age: 42})".to_string(),
        ]);
        assert_eq!(create.exit_code, 0);

        let select = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "MATCH (n:Person) RETURN n.name AS name, n.age AS age".to_string(),
        ]);
        assert_eq!(select.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&select.stdout).expect("valid cypher json");
        assert_eq!(json_value["row_count"], 1);
        assert_eq!(json_value["rows"][0]["name"], "string:Alice");
        assert_eq!(json_value["rows"][0]["age"], "i64:42");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    // Regression: `ogdb query <db> "UNWIND range(A, B) AS i CREATE (...)"`
    // used to error out ("physical planning for UNWIND is not implemented")
    // and persist zero nodes. The CLI now desugars this pattern into N
    // individual CREATE statements so it actually writes. When the core
    // planner eventually learns UNWIND, the desugar is safe to remove — this
    // test still asserts the observable contract (CREATE persists N nodes).
    #[test]
    fn query_command_unwind_range_create_persists_all_nodes() {
        let path = temp_db_path("query-unwind-range-create");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let create = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "UNWIND range(1, 7) AS i CREATE (:Person {id: i})".to_string(),
        ]);
        assert_eq!(
            create.exit_code, 0,
            "UNWIND+CREATE must succeed: stderr={}",
            create.stderr
        );

        let info = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "info".to_string(),
        ]);
        assert_eq!(info.exit_code, 0);
        assert!(
            info.stdout.contains("node_count=7"),
            "expected 7 nodes after UNWIND range(1,7) CREATE, got: {}",
            info.stdout
        );

        let select = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "MATCH (n:Person) RETURN n.id AS id".to_string(),
        ]);
        assert_eq!(select.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&select.stdout).expect("valid cypher json");
        assert_eq!(json_value["row_count"], 7);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        let _ = fs::remove_file(meta_path(&path));
    }

    #[test]
    fn query_command_routes_call_procedures_and_create_index_on() {
        let path = temp_db_path("query-call-and-create-index");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "CREATE (a:Person {name: 'Alice'})".to_string(),
        ]);
        let _ = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "CREATE (b:Person {name: 'Bob'})".to_string(),
        ]);
        let _ = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS]->(b)"
                .to_string(),
        ]);

        let create_index = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "CREATE INDEX ON :Person(name)".to_string(),
        ]);
        assert_eq!(create_index.exit_code, 0);

        let list_indexes = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "CALL db.indexes()".to_string(),
        ]);
        assert_eq!(list_indexes.exit_code, 0);
        let indexes_json: serde_json::Value =
            serde_json::from_str(&list_indexes.stdout).expect("valid indexes json");
        assert!(indexes_json["row_count"].as_u64().unwrap_or(0) >= 1);

        let shortest_path = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "CALL db.algo.shortestPath(0, 1)".to_string(),
        ]);
        assert_eq!(shortest_path.exit_code, 0);
        let shortest_json: serde_json::Value =
            serde_json::from_str(&shortest_path.stdout).expect("valid shortest path json");
        assert_eq!(shortest_json["row_count"], 1);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn query_allows_db_flag_without_positional_path() {
        let path = temp_db_path("query-global-db");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "query".to_string(),
            "--db".to_string(),
            path.display().to_string(),
            "info".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("node_count=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_parses_format_flag_after_query_argument() {
        let path = temp_db_path("query-format-after-query");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "info".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        let value: serde_json::Value = serde_json::from_str(&out.stdout).expect("valid json");
        assert_eq!(value["row_count"], 1);
        assert_eq!(value["rows"][0]["node_count"], "0");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_rejects_missing_query_string() {
        let out = run(&["query".to_string(), "x.ogdb".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("empty query string"));
    }

    #[test]
    fn query_rejects_empty_query_string() {
        let path = temp_db_path("query-empty");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "   ".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("empty query string"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_rejects_unsupported_query() {
        let path = temp_db_path("query-unsupported");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "gibberish".to_string(),
            "tokens".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("unsupported query"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_supports_schema_form() {
        let path = temp_db_path("query-schema");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "schema".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("model=property_graph_minimal"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_supports_find_nodes_by_property_form_and_formats() {
        let path = temp_db_path("query-find-nodes");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--props".to_string(),
            "name=string:alice;age=i64:42".to_string(),
        ]);
        let _ = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--props".to_string(),
            "name=string:alice;age=i64:7".to_string(),
        ]);

        let table = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "name=string:alice".to_string(),
        ]);
        assert_eq!(table.exit_code, 0);
        assert!(table.stdout.contains("property_key=name"));
        assert!(table.stdout.contains("property_value=string:alice"));
        assert!(table.stdout.contains("count=2"));
        assert!(table.stdout.contains("node_ids=0,1"));

        let json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "name=string:alice".to_string(),
        ]);
        assert_eq!(json.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&json.stdout).expect("valid find-nodes json");
        assert_eq!(json_value["row_count"], 2);
        assert_eq!(json_value["rows"][0]["property_key"], "name");
        assert_eq!(json_value["rows"][0]["property_value"], "string:alice");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn query_supports_find_nodes_by_label_form_and_formats() {
        let path = temp_db_path("query-find-nodes-by-label");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person".to_string(),
        ]);
        let _ = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person,Employee".to_string(),
        ]);
        let _ = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Admin".to_string(),
        ]);

        let table = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "label".to_string(),
            "Person".to_string(),
        ]);
        assert_eq!(table.exit_code, 0);
        assert!(table.stdout.contains("label=Person"));
        assert!(table.stdout.contains("count=2"));
        assert!(table.stdout.contains("node_ids=0,1"));

        let json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "label".to_string(),
            "Person".to_string(),
        ]);
        assert_eq!(json.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&json.stdout).expect("valid find-nodes-by-label json");
        assert_eq!(json_value["row_count"], 2);
        assert_eq!(json_value["rows"][0]["label"], "Person");
        assert_eq!(json_value["rows"][0]["node_id"], "0");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn query_find_nodes_returns_runtime_error_for_missing_database() {
        let missing = temp_db_path("query-find-missing");
        let out = run(&vec![
            "query".to_string(),
            missing.display().to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "name=string:alice".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("io error"));
    }

    #[test]
    fn query_find_nodes_by_label_returns_runtime_error_for_missing_database() {
        let missing = temp_db_path("query-find-label-missing");
        let out = run(&vec![
            "query".to_string(),
            missing.display().to_string(),
            "find".to_string(),
            "nodes".to_string(),
            "label".to_string(),
            "Person".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("io error"));
    }

    #[test]
    fn query_supports_metrics_form() {
        let path = temp_db_path("query-metrics");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "metrics".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("wal_size_bytes="));
        assert!(out.stdout.contains("delta_buffer_edge_count=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_rejects_missing_or_invalid_format_flag_values() {
        let path = temp_db_path("query-format-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let missing_value = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
        ]);
        assert_eq!(missing_value.exit_code, 2);
        assert!(missing_value.stderr.contains("--format"));

        let missing_query = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(missing_query.exit_code, 2);
        assert!(missing_query.stderr.contains("empty query string"));

        let bad_value = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "xml".to_string(),
            "info".to_string(),
        ]);
        assert_eq!(bad_value.exit_code, 2);
        assert!(bad_value.stderr.contains("invalid value"));
        assert!(bad_value.stderr.contains("xml"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_formats_cover_info_stats_schema_and_hop_in_rows() {
        let path = temp_db_path("query-format-coverage");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let info_json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "info".to_string(),
        ]);
        assert_eq!(info_json.exit_code, 0);
        let info_value: serde_json::Value =
            serde_json::from_str(&info_json.stdout).expect("valid info json");
        assert_eq!(info_value["rows"][0]["format_version"], "1");
        assert_eq!(info_value["rows"][0]["node_count"], "2");
        assert_eq!(info_value["rows"][0]["edge_count"], "1");

        let stats_json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "stats".to_string(),
        ]);
        assert_eq!(stats_json.exit_code, 0);
        let stats_value: serde_json::Value =
            serde_json::from_str(&stats_json.stdout).expect("valid stats json");
        assert_eq!(stats_value["rows"][0]["max_out_degree"], "1");

        let schema_json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "schema".to_string(),
        ]);
        assert_eq!(schema_json.exit_code, 0);
        let schema_value: serde_json::Value =
            serde_json::from_str(&schema_json.stdout).expect("valid schema json");
        assert_eq!(schema_value["rows"][0]["model"], "property_graph_minimal");
        assert_eq!(schema_value["rows"][0]["node_count"], "2");

        let hop_in_jsonl = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
            "hop-in".to_string(),
            "1".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(hop_in_jsonl.exit_code, 0);
        let row: serde_json::Value =
            serde_json::from_str(hop_in_jsonl.stdout.trim()).expect("valid hop-in jsonl");
        assert_eq!(row["dst"], "1");
        assert_eq!(row["hops"], "1");
        assert_eq!(row["level"], "1");
        assert_eq!(row["node"], "0");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_format_stats_reports_none_max_node_for_empty_graph() {
        let path = temp_db_path("query-format-stats-empty");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let stats_json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "stats".to_string(),
        ]);
        assert_eq!(stats_json.exit_code, 0);
        let value: serde_json::Value =
            serde_json::from_str(&stats_json.stdout).expect("valid stats json");
        assert_eq!(value["rows"][0]["max_out_degree_node"], "none");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_supports_json_jsonl_csv_tsv_and_table_formats() {
        let path = temp_db_path("query-formats");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let json_out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "neighbors".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(json_out.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&json_out.stdout).expect("valid json output");
        assert_eq!(json_value["columns"][0], "src");
        assert_eq!(json_value["columns"][1], "dst");
        assert_eq!(json_value["row_count"], 1);
        assert_eq!(json_value["rows"][0]["src"], "0");
        assert_eq!(json_value["rows"][0]["dst"], "1");

        let jsonl_out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
            "hop".to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(jsonl_out.exit_code, 0);
        let lines: Vec<&str> = jsonl_out.stdout.lines().collect();
        assert_eq!(lines.len(), 1);
        let jsonl_value: serde_json::Value =
            serde_json::from_str(lines[0]).expect("valid jsonl row");
        assert_eq!(jsonl_value["src"], "0");
        assert_eq!(jsonl_value["level"], "1");
        assert_eq!(jsonl_value["node"], "1");

        let csv_out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "csv".to_string(),
            "neighbors".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(csv_out.exit_code, 0);
        assert!(csv_out.stdout.starts_with("src,dst\n0,1"));

        let tsv_out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "tsv".to_string(),
            "incoming".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(tsv_out.exit_code, 0);
        assert!(tsv_out.stdout.starts_with("dst\tsrc\n1\t0"));

        let table_out = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "table".to_string(),
            "neighbors".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(table_out.exit_code, 0);
        assert!(table_out.stdout.contains("count=1"));
        assert!(table_out.stdout.contains("neighbors=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn query_formats_support_write_queries() {
        let path = temp_db_path("query-format-writes");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let create_json = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
            "create node".to_string(),
        ]);
        assert_eq!(create_json.exit_code, 0);
        let create_value: serde_json::Value =
            serde_json::from_str(&create_json.stdout).expect("valid create json");
        assert_eq!(create_value["row_count"], 1);
        assert_eq!(create_value["rows"][0]["node_id"], "0");

        let _ = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "create node".to_string(),
        ]);
        let add_jsonl = run(&vec![
            "query".to_string(),
            path.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
            "add edge 0 1".to_string(),
        ]);
        assert_eq!(add_jsonl.exit_code, 0);
        let row: serde_json::Value =
            serde_json::from_str(add_jsonl.stdout.trim()).expect("valid edge jsonl");
        assert_eq!(row["edge_id"], "0");
        assert_eq!(row["src"], "0");
        assert_eq!(row["dst"], "1");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_commands_mode_executes_multiple_queries() {
        let path = temp_db_path("shell-commands");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "create node; create node; add edge 0 1; neighbors 0".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("commands_executed=4"));
        assert!(out.stdout.contains("[4] neighbors 0"));
        assert!(out.stdout.contains("neighbors=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_executes_cypher_queries_in_sequence() {
        let path = temp_db_path("shell-cypher");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "CREATE (n:Person {name: 'A', age: 1}); CREATE (n:Person {name: 'B', age: 2}); MATCH (n:Person) RETURN n.name AS name ORDER BY n.name ASC".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&out.stdout).expect("valid shell cypher json");
        assert_eq!(json_value["row_count"], 3);
        assert_eq!(json_value["rows"][2]["result_row_count"], "2");
        assert!(json_value["rows"][2]["result_rows_json"]
            .as_str()
            .expect("result rows json string")
            .contains("string:A"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn shell_script_mode_executes_queries() {
        let path = temp_db_path("shell-script");
        let script = temp_db_path("shell-script-file");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &script,
            "# comment\ncreate node\ncreate node\nadd edge 0 1\nstats\n",
        )
        .expect("write script");

        let out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--script".to_string(),
            script.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("commands_executed=4"));
        assert!(out.stdout.contains("edge_count=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(script).expect("cleanup script");
    }

    #[test]
    fn shell_supports_machine_readable_formats() {
        let path = temp_db_path("shell-formats");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let json_out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "create node; create node; add edge 0 1; neighbors 0".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(json_out.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&json_out.stdout).expect("valid shell json");
        assert_eq!(json_value["row_count"], 4);
        assert_eq!(json_value["rows"][3]["query"], "neighbors 0");
        assert_eq!(json_value["rows"][3]["result_columns"], "src,dst");
        assert_eq!(json_value["rows"][3]["result_row_count"], "1");

        let csv_out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "stats".to_string(),
            "--format".to_string(),
            "csv".to_string(),
        ]);
        assert_eq!(csv_out.exit_code, 0);
        assert!(csv_out
            .stdout
            .starts_with("index,query,result_columns,result_row_count,result_rows_json"));
        assert!(csv_out.stdout.contains("1,stats,"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_returns_runtime_error_for_missing_script_file() {
        let path = temp_db_path("shell-missing-script");
        let missing_script = temp_db_path("shell-missing-script-file");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--script".to_string(),
            missing_script.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("failed to read script file"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn import_csv_bundle_supports_labels_properties_and_type_coercion() {
        let path = temp_db_path("import-csv-full");
        let input_base = temp_file_path("import-csv-full-input", "csv");
        let mut input_stem = input_base.clone();
        input_stem.set_extension("");
        let nodes_csv = PathBuf::from(format!("{}.nodes.csv", input_stem.display()));
        let edges_csv = PathBuf::from(format!("{}.edges.csv", input_stem.display()));

        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &nodes_csv,
            "id,labels,name,age,active,score\n0,Person|Employee,Alice,41,true,3.5\n2,Person,Bob,37,false,2.0\n",
        )
        .expect("write nodes csv");
        fs::write(
            &edges_csv,
            "src,dst,type,since,weight\n0,2,KNOWS,2020,1.25\n2,1,,2019,0.5\n",
        )
        .expect("write edges csv");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            input_base.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=2"));
        assert!(out.stdout.contains("created_nodes=3"));
        assert!(out.stdout.contains("total_nodes=3"));
        assert!(out.stdout.contains("total_edges=2"));

        let db = Database::open(&path).expect("open db");
        let labels0 = db.node_labels(0).expect("labels n0");
        assert_eq!(labels0, vec!["Employee".to_string(), "Person".to_string()]);
        let props0 = db.node_properties(0).expect("props n0");
        assert_eq!(
            props0.get("name"),
            Some(&PropertyValue::String("Alice".to_string()))
        );
        assert_eq!(props0.get("age"), Some(&PropertyValue::I64(41)));
        assert_eq!(props0.get("active"), Some(&PropertyValue::Bool(true)));
        assert_eq!(props0.get("score"), Some(&PropertyValue::F64(3.5)));
        assert!(db.node_labels(1).expect("labels n1").is_empty());

        assert_eq!(
            db.edge_type(0).expect("edge 0 type"),
            Some("KNOWS".to_string())
        );
        assert_eq!(db.edge_type(1).expect("edge 1 type"), None);
        let edge0_props = db.edge_properties(0).expect("edge 0 props");
        assert_eq!(edge0_props.get("since"), Some(&PropertyValue::I64(2020)));
        assert_eq!(edge0_props.get("weight"), Some(&PropertyValue::F64(1.25)));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(nodes_csv).expect("cleanup nodes csv");
        fs::remove_file(edges_csv).expect("cleanup edges csv");
    }

    #[test]
    fn import_json_and_jsonl_support_full_property_graph_payloads() {
        let path = temp_db_path("import-json-full");
        let json_input = temp_file_path("import-json-full-input", "txt");
        let jsonl_input = temp_file_path("import-jsonl-full-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(
            &json_input,
            r#"{
  "nodes": [
    { "id": 0, "labels": ["Person"], "properties": { "name": "Alice", "age": 41 } },
    { "id": 1, "labels": ["Person"], "properties": { "name": "Bob", "active": true } }
  ],
  "edges": [
    { "src": 0, "dst": 1, "type": "KNOWS", "properties": { "since": 2020 } }
  ]
}"#,
        )
        .expect("write import json");

        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":2,"labels":["Person","Manager"],"properties":{"name":"Cara","score":1.5}}
{"kind":"edge","src":1,"dst":2,"type":"MANAGES","properties":{"since":2022}}"#,
        )
        .expect("write import jsonl");

        let json_out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            json_input.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(json_out.exit_code, 0);
        assert!(json_out.stdout.contains("imported_nodes=2"));
        assert!(json_out.stdout.contains("imported_edges=1"));
        assert!(json_out.stdout.contains("total_nodes=2"));
        assert!(json_out.stdout.contains("total_edges=1"));

        let jsonl_out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
        ]);
        assert_eq!(jsonl_out.exit_code, 0);
        assert!(jsonl_out.stdout.contains("imported_nodes=1"));
        assert!(jsonl_out.stdout.contains("imported_edges=1"));
        assert!(jsonl_out.stdout.contains("total_nodes=3"));
        assert!(jsonl_out.stdout.contains("total_edges=2"));

        let db = Database::open(&path).expect("open db");
        assert_eq!(
            db.node_labels(2).expect("labels n2"),
            vec!["Manager".to_string(), "Person".to_string()]
        );
        assert_eq!(
            db.edge_type(1).expect("edge 1 type"),
            Some("MANAGES".to_string())
        );
        assert_eq!(db.edge_count(), 2);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(json_input).expect("cleanup json input");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_streaming_batches_and_continue_on_error_report_progress() {
        let path = temp_db_path("import-streaming-continue");
        let jsonl_input = temp_file_path("import-streaming-continue-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":0,"labels":["Person"],"properties":{"name":"Alice"}}
{"kind":"node","id":"bad"}
{"kind":"node","id":1,"labels":["Person"],"properties":{"active":true}}
{"kind":"edge","src":0,"dst":1,"type":"KNOWS","properties":{"since":2020}}
{"kind":"edge","src":0}"#,
        )
        .expect("write import jsonl");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--batch-size".to_string(),
            "2".to_string(),
            "--continue-on-error".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=1"));
        assert!(out.stdout.contains("skipped_records=2"));
        assert!(out.stdout.contains("committed_batches=2"));
        assert!(out.stdout.contains("total_nodes=2"));
        assert!(out.stdout.contains("total_edges=1"));

        let strict_out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--batch-size".to_string(),
            "2".to_string(),
        ]);
        assert_eq!(strict_out.exit_code, 1);
        assert!(strict_out.stderr.contains("invalid jsonl record"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_atomic_valid_data_commits_single_batch() {
        let path = temp_db_path("import-atomic-valid");
        let jsonl_input = temp_file_path("import-atomic-valid-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":0,"labels":["Person"],"properties":{"name":"Alice"}}
{"kind":"node","id":1,"labels":["Person"],"properties":{"name":"Bob"}}
{"kind":"edge","src":0,"dst":1,"type":"KNOWS","properties":{"since":2020}}"#,
        )
        .expect("write import jsonl");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--batch-size".to_string(),
            "1".to_string(),
            "--atomic".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=1"));
        assert!(
            out.stdout.contains("committed_batches=1"),
            "atomic mode must commit once: {}",
            out.stdout
        );
        assert!(out.stdout.contains("total_nodes=2"));
        assert!(out.stdout.contains("total_edges=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_atomic_corrupt_record_rolls_back_all() {
        let path = temp_db_path("import-atomic-rollback");
        let jsonl_input = temp_file_path("import-atomic-rollback-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let mut db = Database::open(&path).expect("open baseline db");
        let _ = db
            .create_node_with(
                &["Existing".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Baseline".to_string()),
                )]),
            )
            .expect("create baseline node");
        drop(db);

        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":1,"labels":["Person"],"properties":{"name":"Alice"}}
{"kind":"node","id":"bad"}
{"kind":"node","id":2,"labels":["Person"],"properties":{"name":"Bob"}}"#,
        )
        .expect("write import jsonl");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--atomic".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("invalid jsonl record"));

        let db_after = Database::open(&path).expect("open db after failure");
        assert_eq!(
            db_after.node_count(),
            1,
            "atomic import failure must not add partial nodes"
        );
        assert_eq!(db_after.edge_count(), 0);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_atomic_conflicts_with_continue_on_error() {
        let path = temp_db_path("import-atomic-conflict");
        let jsonl_input = temp_file_path("import-atomic-conflict-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":0,"labels":["Person"],"properties":{"name":"Alice"}}"#,
        )
        .expect("write import jsonl");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--atomic".to_string(),
            "--continue-on-error".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("cannot be used with"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_non_atomic_default_behavior_is_unchanged() {
        let path = temp_db_path("import-non-atomic-default");
        let jsonl_input = temp_file_path("import-non-atomic-default-input", "jsonl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &jsonl_input,
            r#"{"kind":"node","id":0,"labels":["Person"],"properties":{"name":"Alice"}}
{"kind":"node","id":1,"labels":["Person"],"properties":{"name":"Bob"}}"#,
        )
        .expect("write import jsonl");

        let out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            jsonl_input.display().to_string(),
            "--batch-size".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=0"));
        assert!(
            out.stdout.contains("committed_batches=2"),
            "non-atomic mode should keep per-batch commits: {}",
            out.stdout
        );

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(jsonl_input).expect("cleanup jsonl input");
    }

    #[test]
    fn import_rejects_wrong_argument_count_and_format_resolution_errors() {
        let wrong_arity = run(&["import".to_string()]);
        assert_eq!(wrong_arity.exit_code, 2);
        assert!(wrong_arity.stderr.contains("usage: opengraphdb import"));

        let path = temp_db_path("import-format-errors");
        let no_ext_input = temp_file_path("import-format-errors-input", "txt");
        let bad_json = temp_file_path("import-format-errors-bad", "json");
        let missing = temp_file_path("import-format-errors-missing", "csv");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(&no_ext_input, "{}").expect("write no-ext input");
        let no_detect = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            no_ext_input.display().to_string(),
        ]);
        assert_eq!(no_detect.exit_code, 1);
        assert!(no_detect
            .stderr
            .contains("unable to determine import format"));

        let bad_format = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            no_ext_input.display().to_string(),
            "--format".to_string(),
            "xml".to_string(),
        ]);
        assert_eq!(bad_format.exit_code, 2);
        assert!(bad_format.stderr.contains("invalid value"));
        assert!(bad_format.stderr.contains("xml"));

        fs::write(&bad_json, "{]").expect("write bad json");
        let json_out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            bad_json.display().to_string(),
        ]);
        assert_eq!(json_out.exit_code, 1);
        assert!(json_out.stderr.contains("invalid json import payload"));

        let missing_out = run(&vec![
            "import".to_string(),
            path.display().to_string(),
            missing.display().to_string(),
        ]);
        assert_eq!(missing_out.exit_code, 1);
        assert!(missing_out.stderr.contains("failed to open import source"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(no_ext_input).expect("cleanup no ext");
        fs::remove_file(bad_json).expect("cleanup bad json");
    }

    #[test]
    fn import_reports_missing_database_with_actionable_message() {
        let missing_db = temp_db_path("import-missing-db-message");
        let input = temp_file_path("import-missing-db-message-input", "json");
        fs::write(&input, "{\"nodes\":[],\"edges\":[]}").expect("write import json");

        let out = run(&vec![
            "import".to_string(),
            missing_db.display().to_string(),
            input.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert_eq!(
            out.stderr.trim(),
            format!(
                "error: database not found at '{}'. Run 'ogdb init <path>' first.",
                missing_db.display()
            )
        );

        fs::remove_file(input).expect("cleanup input");
    }

    #[test]
    fn export_full_property_graph_to_csv_json_and_jsonl() {
        let path = temp_db_path("export-full-formats");
        let csv_base = temp_file_path("export-full-csv", "csv");
        let json_out = temp_file_path("export-full-json", "json");
        let jsonl_out = temp_file_path("export-full-jsonl", "txt");

        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let mut db = Database::open(&path).expect("open db");
        let mut n0_props = PropertyMap::new();
        n0_props.insert(
            "name".to_string(),
            PropertyValue::String("Alice".to_string()),
        );
        n0_props.insert("age".to_string(), PropertyValue::I64(41));
        let _ = db
            .create_node_with(&["Person".to_string(), "Employee".to_string()], &n0_props)
            .expect("create n0");
        let mut n1_props = PropertyMap::new();
        n1_props.insert("name".to_string(), PropertyValue::String("Bob".to_string()));
        let _ = db
            .create_node_with(&["Person".to_string()], &n1_props)
            .expect("create n1");
        let mut edge_props = PropertyMap::new();
        edge_props.insert("since".to_string(), PropertyValue::I64(2020));
        edge_props.insert("weight".to_string(), PropertyValue::F64(0.9));
        let _ = db
            .add_typed_edge(0, 1, "KNOWS", &edge_props)
            .expect("add edge");

        let csv_cmd = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            csv_base.display().to_string(),
        ]);
        assert_eq!(csv_cmd.exit_code, 0);
        assert!(csv_cmd.stdout.contains("exported_nodes=2"));
        assert!(csv_cmd.stdout.contains("exported_edges=1"));
        let mut csv_stem = csv_base.clone();
        csv_stem.set_extension("");
        let nodes_csv = PathBuf::from(format!("{}.nodes.csv", csv_stem.display()));
        let edges_csv = PathBuf::from(format!("{}.edges.csv", csv_stem.display()));
        let mut nodes_reader = csv::Reader::from_path(&nodes_csv).expect("open nodes csv");
        let node_headers = nodes_reader.headers().expect("nodes headers").clone();
        let node_row_0 = nodes_reader
            .records()
            .next()
            .expect("first node row")
            .expect("valid first node row");
        assert_eq!(
            node_row_0.get(0).expect("id col"),
            "0",
            "first column should be node id"
        );
        assert_eq!(
            node_row_0.get(1).expect("labels col"),
            "Employee|Person",
            "second column should be labels"
        );
        let name_idx = node_headers
            .iter()
            .position(|value| value == "name")
            .expect("name column exists");
        let age_idx = node_headers
            .iter()
            .position(|value| value == "age")
            .expect("age column exists");
        assert_eq!(node_row_0.get(name_idx).expect("name"), "Alice");
        assert_eq!(node_row_0.get(age_idx).expect("age"), "41");

        let mut edges_reader = csv::Reader::from_path(&edges_csv).expect("open edges csv");
        let edge_headers = edges_reader.headers().expect("edge headers").clone();
        let edge_row_0 = edges_reader
            .records()
            .next()
            .expect("first edge row")
            .expect("valid first edge row");
        assert_eq!(edge_row_0.get(0).expect("src"), "0");
        assert_eq!(edge_row_0.get(1).expect("dst"), "1");
        assert_eq!(edge_row_0.get(2).expect("type"), "KNOWS");
        let since_idx = edge_headers
            .iter()
            .position(|value| value == "since")
            .expect("since column exists");
        let weight_idx = edge_headers
            .iter()
            .position(|value| value == "weight")
            .expect("weight column exists");
        assert_eq!(edge_row_0.get(since_idx).expect("since"), "2020");
        assert_eq!(edge_row_0.get(weight_idx).expect("weight"), "0.9");

        let json_cmd = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            json_out.display().to_string(),
        ]);
        assert_eq!(json_cmd.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&json_out).expect("read json"))
                .expect("valid export json");
        assert_eq!(
            json_value["nodes"].as_array().expect("nodes array").len(),
            2
        );
        assert_eq!(
            json_value["edges"].as_array().expect("edges array").len(),
            1
        );
        assert_eq!(json_value["edges"][0]["type"], "KNOWS");

        let jsonl_cmd = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            jsonl_out.display().to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
        ]);
        assert_eq!(jsonl_cmd.exit_code, 0);
        let jsonl_text = fs::read_to_string(&jsonl_out).expect("read jsonl");
        assert!(jsonl_text.contains("\"kind\":\"node\""));
        assert!(jsonl_text.contains("\"kind\":\"edge\""));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(nodes_csv).expect("cleanup nodes csv");
        fs::remove_file(edges_csv).expect("cleanup edges csv");
        fs::remove_file(json_out).expect("cleanup json");
        fs::remove_file(jsonl_out).expect("cleanup jsonl");
    }

    #[test]
    fn export_supports_label_edge_type_and_node_id_range_filters() {
        let path = temp_db_path("export-filters");
        let json_out = temp_file_path("export-filters-json", "json");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let mut db = Database::open(&path).expect("open db");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Alice".to_string()),
                )]),
            )
            .expect("create n0");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Bob".to_string()),
                )]),
            )
            .expect("create n1");
        let _ = db
            .create_node_with(
                &["Company".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Acme".to_string()),
                )]),
            )
            .expect("create n2");
        let _ = db
            .add_typed_edge(0, 1, "KNOWS", &PropertyMap::new())
            .expect("add knows");
        let _ = db
            .add_typed_edge(0, 2, "WORKS_AT", &PropertyMap::new())
            .expect("add works_at");

        let cmd = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            json_out.display().to_string(),
            "--label".to_string(),
            "Person".to_string(),
            "--edge-type".to_string(),
            "KNOWS".to_string(),
            "--node-id-range".to_string(),
            "0:1".to_string(),
        ]);
        assert_eq!(cmd.exit_code, 0);
        let json_value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&json_out).expect("read json"))
                .expect("valid export json");
        assert_eq!(json_value["nodes"].as_array().expect("nodes").len(), 2);
        assert_eq!(json_value["edges"].as_array().expect("edges").len(), 1);
        assert_eq!(json_value["edges"][0]["type"], "KNOWS");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(json_out).expect("cleanup json");
    }

    #[test]
    fn export_rejects_bad_inputs_existing_destination_and_unwritable_parent() {
        let wrong_arity = run(&["export".to_string()]);
        assert_eq!(wrong_arity.exit_code, 2);
        assert!(wrong_arity.stderr.contains("usage: opengraphdb export"));

        let path = temp_db_path("export-bad");
        let dst = temp_file_path("export-bad-dst", "json");
        let no_ext = temp_file_path("export-bad-no-ext", "txt");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&dst, "already-there").expect("write existing destination");

        let bad_format = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            no_ext.display().to_string(),
            "--format".to_string(),
            "xml".to_string(),
        ]);
        assert_eq!(bad_format.exit_code, 2);
        assert!(bad_format.stderr.contains("invalid value"));
        assert!(bad_format.stderr.contains("xml"));

        let missing_format = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            no_ext.display().to_string(),
        ]);
        assert_eq!(missing_format.exit_code, 1);
        assert!(missing_format
            .stderr
            .contains("unable to determine export format"));

        let exists = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            dst.display().to_string(),
        ]);
        assert_eq!(exists.exit_code, 1);
        assert!(exists.stderr.contains("export destination already exists"));

        let bad_range = run(&vec![
            "export".to_string(),
            path.display().to_string(),
            temp_file_path("export-bad-range", "json")
                .display()
                .to_string(),
            "--node-id-range".to_string(),
            "bad".to_string(),
        ]);
        assert_eq!(bad_range.exit_code, 1);
        assert!(bad_range.stderr.contains("invalid --node-id-range value"));

        let path_unwritable = temp_db_path("export-unwritable");
        let mut bad_parent = temp_file_path("export-missing-parent", "dir");
        bad_parent.set_extension("no_such_dir");
        let unwritable_dst = bad_parent.join("out.json");
        let init_unwritable = run(&vec![
            "init".to_string(),
            path_unwritable.display().to_string(),
        ]);
        assert_eq!(init_unwritable.exit_code, 0);
        let unwritable = run(&vec![
            "export".to_string(),
            path_unwritable.display().to_string(),
            unwritable_dst.display().to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(unwritable.exit_code, 1);
        assert!(unwritable.stderr.contains("failed to write export"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(dst).expect("cleanup existing destination");
        let _ = fs::remove_file(no_ext);
        fs::remove_file(&path_unwritable).expect("cleanup unwritable db");
        fs::remove_file(wal_path(&path_unwritable)).expect("cleanup unwritable wal");
    }

    #[test]
    fn rdf_helper_format_and_extension_resolution_covers_all_variants() {
        assert_eq!(RdfImportFormatArg::Ttl.as_str(), "ttl");
        assert_eq!(RdfImportFormatArg::Nt.as_str(), "nt");
        assert_eq!(RdfImportFormatArg::Xml.as_str(), "xml");
        assert_eq!(RdfImportFormatArg::Jsonld.as_str(), "jsonld");
        assert_eq!(RdfImportFormatArg::Nq.as_str(), "nq");
        assert_eq!(RdfImportFormatArg::Ttl.to_rdf_format(), RdfFormat::Turtle);
        assert_eq!(RdfImportFormatArg::Nt.to_rdf_format(), RdfFormat::NTriples);
        assert_eq!(RdfImportFormatArg::Xml.to_rdf_format(), RdfFormat::RdfXml);
        assert!(matches!(
            RdfImportFormatArg::Jsonld.to_rdf_format(),
            RdfFormat::JsonLd { .. }
        ));
        assert_eq!(RdfImportFormatArg::Nq.to_rdf_format(), RdfFormat::NQuads);
        assert_eq!(
            RdfImportFormatArg::from_extension("ttl"),
            Some(RdfImportFormatArg::Ttl)
        );
        assert_eq!(
            RdfImportFormatArg::from_extension("nt"),
            Some(RdfImportFormatArg::Nt)
        );
        assert_eq!(
            RdfImportFormatArg::from_extension("xml"),
            Some(RdfImportFormatArg::Xml)
        );
        assert_eq!(
            RdfImportFormatArg::from_extension("jsonld"),
            Some(RdfImportFormatArg::Jsonld)
        );
        assert_eq!(
            RdfImportFormatArg::from_extension("nq"),
            Some(RdfImportFormatArg::Nq)
        );
        assert_eq!(RdfImportFormatArg::from_extension("bad"), None);

        assert_eq!(RdfExportFormatArg::Ttl.as_str(), "ttl");
        assert_eq!(RdfExportFormatArg::Nt.as_str(), "nt");
        assert_eq!(RdfExportFormatArg::Xml.as_str(), "xml");
        assert_eq!(RdfExportFormatArg::Jsonld.as_str(), "jsonld");
        assert_eq!(RdfExportFormatArg::Ttl.to_rdf_format(), RdfFormat::Turtle);
        assert_eq!(RdfExportFormatArg::Nt.to_rdf_format(), RdfFormat::NTriples);
        assert_eq!(RdfExportFormatArg::Xml.to_rdf_format(), RdfFormat::RdfXml);
        assert!(matches!(
            RdfExportFormatArg::Jsonld.to_rdf_format(),
            RdfFormat::JsonLd { .. }
        ));
        assert_eq!(
            RdfExportFormatArg::from_extension("ttl"),
            Some(RdfExportFormatArg::Ttl)
        );
        assert_eq!(
            RdfExportFormatArg::from_extension("nt"),
            Some(RdfExportFormatArg::Nt)
        );
        assert_eq!(
            RdfExportFormatArg::from_extension("xml"),
            Some(RdfExportFormatArg::Xml)
        );
        assert_eq!(
            RdfExportFormatArg::from_extension("json"),
            Some(RdfExportFormatArg::Jsonld)
        );
        assert_eq!(RdfExportFormatArg::from_extension("nq"), None);

        assert_eq!(
            detect_rdf_import_format("/tmp/input.ttl"),
            Some(RdfImportFormatArg::Ttl)
        );
        assert_eq!(detect_rdf_import_format("/tmp/input"), None);
        assert_eq!(
            resolve_rdf_import_format(None, "/tmp/input.nt")
                .expect("resolve import from extension"),
            RdfImportFormatArg::Nt
        );
        let import_missing_ext =
            resolve_rdf_import_format(None, "/tmp/input").expect_err("missing import extension");
        assert!(import_missing_ext
            .to_string()
            .contains("unable to determine import-rdf format"));

        assert_eq!(
            detect_rdf_export_format("/tmp/output.ttl"),
            Some(RdfExportFormatArg::Ttl)
        );
        assert_eq!(detect_rdf_export_format("/tmp/output"), None);
        assert_eq!(
            resolve_rdf_export_format(None, "/tmp/output.xml")
                .expect("resolve export from extension"),
            RdfExportFormatArg::Xml
        );
        let export_missing_ext =
            resolve_rdf_export_format(None, "/tmp/output").expect_err("missing export extension");
        assert!(export_missing_ext
            .to_string()
            .contains("unable to determine export-rdf format"));
    }

    #[test]
    fn rdf_plan_and_key_helpers_cover_blank_and_hierarchy_paths() {
        let mut plan = RdfImportPlan::default();
        let blank = RdfResourceKey::Blank("b1".to_string());
        let named = RdfResourceKey::Named("http://example.com/ns#Thing".to_string());

        assert_eq!(blank.uri_value(), "_:b1");
        assert_eq!(blank.local_name(), "b1");
        assert_eq!(named.local_name(), "Thing");

        let blank_id = plan.ensure_resource_node(&blank, Some("http://example.com/g1"));
        let blank_id_again = plan.ensure_resource_node(&blank, Some("http://example.com/g2"));
        assert_eq!(blank_id, blank_id_again);
        let blank_node = plan.nodes.get(&blank_id).expect("blank node");
        assert_eq!(
            blank_node.properties.get("_graph"),
            Some(&PropertyValue::String("http://example.com/g1".to_string()))
        );

        let hierarchy_blank = plan.ensure_hierarchy_node(&blank);
        let hierarchy_blank_again = plan.ensure_hierarchy_node(&blank);
        assert_eq!(hierarchy_blank, hierarchy_blank_again);
        let hierarchy_props = &plan
            .nodes
            .get(&hierarchy_blank)
            .expect("hierarchy node")
            .properties;
        assert_eq!(
            hierarchy_props.get("_blank_id"),
            Some(&PropertyValue::String("b1".to_string()))
        );

        plan.add_subclass_edge(&blank, &named);
        let records = plan.into_records();
        assert!(records.iter().any(|record| match record {
            ImportRecord::Edge(edge) => edge.edge_type.as_deref() == Some(RDF_SUBCLASS_EDGE_TYPE),
            ImportRecord::Node(_) => false,
        }));
    }

    #[test]
    fn rdf_meta_and_resolution_helpers_cover_success_and_error_paths() {
        let path = temp_db_path("rdf-meta-helpers");

        let missing = load_rdf_meta(&path.display().to_string()).expect("load missing rdf meta");
        assert_eq!(missing.format_version, RDF_META_FORMAT_VERSION);
        assert!(missing.prefixes.is_empty());

        let meta = PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            prefixes: std::collections::BTreeMap::from([(
                "ex".to_string(),
                "http://example.com/".to_string(),
            )]),
            label_uris: std::collections::BTreeMap::from([(
                "Person".to_string(),
                "http://schema.org/Person".to_string(),
            )]),
            predicate_uris: std::collections::BTreeMap::from([(
                "name".to_string(),
                "http://schema.org/name".to_string(),
            )]),
        };
        save_rdf_meta(&path.display().to_string(), &meta).expect("save rdf meta");
        let loaded = load_rdf_meta(&path.display().to_string()).expect("reload rdf meta");
        assert_eq!(loaded.prefixes, meta.prefixes);
        assert_eq!(loaded.label_uris, meta.label_uris);
        assert_eq!(loaded.predicate_uris, meta.predicate_uris);

        let sidecar = rdf_meta_path_for_db(&path);
        fs::write(&sidecar, "").expect("truncate rdf meta");
        let empty = load_rdf_meta(&path.display().to_string()).expect("load empty rdf meta");
        assert_eq!(empty.format_version, RDF_META_FORMAT_VERSION);
        assert!(empty.prefixes.is_empty());

        fs::write(
            &sidecar,
            r#"{"format_version":999,"prefixes":{},"label_uris":{},"predicate_uris":{}}"#,
        )
        .expect("write bad version rdf meta");
        let bad_version = load_rdf_meta(&path.display().to_string()).expect_err("bad version");
        assert!(bad_version
            .to_string()
            .contains("invalid rdf metadata format version"));

        fs::write(&sidecar, "{not-json").expect("write invalid rdf meta");
        let bad_json = load_rdf_meta(&path.display().to_string()).expect_err("bad json");
        assert!(bad_json.to_string().contains("invalid rdf metadata format"));

        let _ = fs::remove_file(&sidecar);
    }

    #[test]
    fn rdf_value_conversion_and_uri_helpers_cover_branches() {
        assert_eq!(local_name_from_iri("http://example.com/ns#Thing"), "Thing");
        assert_eq!(
            local_name_from_iri("http://example.com/path/Thing"),
            "Thing"
        );
        assert_eq!(local_name_from_iri("urn:example:Thing"), "Thing");
        assert_eq!(local_name_from_iri("Thing"), "Thing");

        let named = NamedNode::new("http://example.com/s").expect("named node");
        let blank = BlankNode::new("bnode").expect("blank node");
        assert_eq!(
            rdf_resource_key_from_subject(&NamedOrBlankNode::from(named.clone())),
            RdfResourceKey::Named("http://example.com/s".to_string())
        );
        assert_eq!(
            rdf_resource_key_from_subject(&NamedOrBlankNode::from(blank.clone())),
            RdfResourceKey::Blank("bnode".to_string())
        );
        assert_eq!(
            rdf_resource_key_from_term(&Term::NamedNode(named.clone())),
            Some(RdfResourceKey::Named("http://example.com/s".to_string()))
        );
        assert_eq!(
            rdf_resource_key_from_term(&Term::BlankNode(blank.clone())),
            Some(RdfResourceKey::Blank("bnode".to_string()))
        );
        assert_eq!(
            rdf_resource_key_from_term(&Term::Literal(Literal::from("value"))),
            None
        );

        assert_eq!(graph_name_value(&GraphName::DefaultGraph), None);
        assert_eq!(
            graph_name_value(&GraphName::NamedNode(named.clone())),
            Some("http://example.com/s".to_string())
        );
        assert_eq!(
            graph_name_value(&GraphName::BlankNode(blank.clone())),
            Some("_:bnode".to_string())
        );

        let lit_true = Literal::new_typed_literal("true", oxrdf::vocab::xsd::BOOLEAN);
        let lit_false = Literal::new_typed_literal("false", oxrdf::vocab::xsd::BOOLEAN);
        let lit_bad_bool = Literal::new_typed_literal("maybe", oxrdf::vocab::xsd::BOOLEAN);
        let lit_i64 = Literal::new_typed_literal("42", oxrdf::vocab::xsd::INTEGER);
        let lit_bad_i64 = Literal::new_typed_literal("oops", oxrdf::vocab::xsd::INTEGER);
        let lit_f64 = Literal::new_typed_literal("1.5", oxrdf::vocab::xsd::DOUBLE);
        let lit_nan = Literal::new_typed_literal("NaN", oxrdf::vocab::xsd::DOUBLE);
        assert_eq!(
            rdf_literal_to_property_value(&lit_true),
            PropertyValue::Bool(true)
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_false),
            PropertyValue::Bool(false)
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_bad_bool),
            PropertyValue::String("maybe".to_string())
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_i64),
            PropertyValue::I64(42)
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_bad_i64),
            PropertyValue::String("oops".to_string())
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_f64),
            PropertyValue::F64(1.5)
        );
        assert_eq!(
            rdf_literal_to_property_value(&lit_nan),
            PropertyValue::String("NaN".to_string())
        );

        let prop_map = PropertyMap::from([(
            "name".to_string(),
            PropertyValue::String("Alice".to_string()),
        )]);
        assert_eq!(
            value_as_string_property(&prop_map, "name"),
            Some("Alice".to_string())
        );
        assert_eq!(value_as_string_property(&prop_map, "missing"), None);

        assert!(subject_from_uri_value("not a uri").is_none());
        assert!(subject_from_uri_value("_:bad id").is_none());
        assert!(term_from_uri_value("not a uri").is_none());
        assert!(term_from_uri_value("_:bad id").is_none());
        let subject = subject_from_uri_or_fallback("not a uri", "urn:ogdb:fallback:subject");
        let term = term_from_uri_or_fallback("not a uri", "urn:ogdb:fallback:term");
        assert!(matches!(subject, NamedOrBlankNode::NamedNode(_)));
        assert!(matches!(term, Term::NamedNode(_)));
        assert_eq!(
            named_node_or_fallback("not a uri", "urn:ogdb:fallback:node").as_str(),
            "urn:ogdb:fallback:node"
        );

        assert_eq!(
            property_value_to_rdf_literal(&PropertyValue::Bytes(vec![0xde, 0xad])).value(),
            "bytes:dead"
        );
        assert_eq!(
            property_value_to_rdf_literal(&PropertyValue::Bool(true)).value(),
            "true"
        );
        assert_eq!(
            property_value_to_rdf_literal(&PropertyValue::I64(42)).value(),
            "42"
        );
        assert_eq!(
            property_value_to_rdf_literal(&PropertyValue::F64(1.25)).value(),
            "1.25"
        );

        let prefixes = std::collections::BTreeMap::from([(
            "ex".to_string(),
            "http://example.com/".to_string(),
        )]);
        assert_eq!(
            expand_prefixed_name("ex:thing", &prefixes),
            Some("http://example.com/thing".to_string())
        );
        assert_eq!(expand_prefixed_name("no-prefix", &prefixes), None);

        let meta = PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            prefixes,
            label_uris: std::collections::BTreeMap::from([(
                "Person".to_string(),
                "http://schema.org/Person".to_string(),
            )]),
            predicate_uris: std::collections::BTreeMap::from([(
                "name".to_string(),
                "http://schema.org/name".to_string(),
            )]),
        };
        assert_eq!(
            resolve_predicate_uri("name", &meta),
            "http://schema.org/name".to_string()
        );
        assert_eq!(
            resolve_predicate_uri("http://schema.org/age", &meta),
            "http://schema.org/age".to_string()
        );
        assert_eq!(
            resolve_predicate_uri("ex:age", &meta),
            "http://example.com/age".to_string()
        );
        assert_eq!(
            resolve_predicate_uri("age", &meta),
            "urn:ogdb:predicate:age".to_string()
        );
        assert_eq!(
            resolve_label_uri("Person", &meta),
            "http://schema.org/Person".to_string()
        );
        assert_eq!(
            resolve_label_uri("http://schema.org/Org", &meta),
            "http://schema.org/Org".to_string()
        );
        assert_eq!(
            resolve_label_uri("ex:Org", &meta),
            "http://example.com/Org".to_string()
        );
        assert_eq!(
            resolve_label_uri("Org", &meta),
            "urn:ogdb:label:Org".to_string()
        );
    }

    #[test]
    fn rdf_process_quad_helper_covers_literal_type_and_invalid_subclass_paths() {
        let mut plan = RdfImportPlan::default();
        let type_quad = Quad {
            subject: NamedOrBlankNode::from(
                NamedNode::new("http://example.com/s").expect("subject IRI"),
            ),
            predicate: NamedNode::new(RDF_TYPE_IRI).expect("rdf:type IRI"),
            object: Term::Literal(Literal::from("not-a-class-uri")),
            graph_name: GraphName::DefaultGraph,
        };
        process_rdf_quad(&mut plan, type_quad, true);
        assert!(plan.nodes.is_empty());
        assert!(plan.edges.is_empty());

        let subclass_quad = Quad {
            subject: NamedOrBlankNode::from(
                NamedNode::new("http://example.com/Child").expect("child IRI"),
            ),
            predicate: NamedNode::new(RDFS_SUB_CLASS_OF_IRI).expect("rdfs:subClassOf IRI"),
            object: Term::Literal(Literal::from("not-a-resource")),
            graph_name: GraphName::DefaultGraph,
        };
        process_rdf_quad(&mut plan, subclass_quad, false);
        assert!(plan.nodes.is_empty());
        assert!(plan.edges.is_empty());
    }

    #[test]
    fn export_rdf_write_error_helper_formats_message() {
        let err = export_rdf_write_error("boom");
        assert!(err
            .to_string()
            .contains("failed to write export-rdf output: boom"));
    }

    #[test]
    fn rdf_parse_helper_covers_base_uri_prefix_and_error_modes() {
        let valid = temp_file_path("rdf-parse-helper-valid", "ttl");
        fs::write(
            &valid,
            r#"@prefix : <http://example.com/> .
:s :p :o .
"#,
        )
        .expect("write valid ttl");
        let (plan, skipped) = parse_rdf_into_plan(
            &valid.display().to_string(),
            RdfImportFormatArg::Ttl,
            None,
            false,
            false,
        )
        .expect("parse valid ttl");
        assert_eq!(skipped, 0);
        assert!(plan.prefixes.is_empty());

        let bad_base = parse_rdf_into_plan(
            &valid.display().to_string(),
            RdfImportFormatArg::Ttl,
            Some("not a uri"),
            false,
            false,
        )
        .expect_err("invalid base uri should fail");
        assert!(bad_base.to_string().contains("invalid --base-uri value"));

        let invalid = temp_file_path("rdf-parse-helper-invalid", "ttl");
        fs::write(&invalid, "@prefix ex: <http://example.com/> .\nex:s ex:p")
            .expect("write invalid ttl");
        let (plan_skip, skipped_count) = parse_rdf_into_plan(
            &invalid.display().to_string(),
            RdfImportFormatArg::Ttl,
            None,
            false,
            true,
        )
        .expect("continue-on-error parser");
        assert!(plan_skip.nodes.is_empty());
        assert!(skipped_count > 0);

        let strict_err = parse_rdf_into_plan(
            &invalid.display().to_string(),
            RdfImportFormatArg::Ttl,
            None,
            false,
            false,
        )
        .expect_err("strict parser should fail");
        assert!(strict_err.to_string().contains("failed to parse RDF input"));

        let _ = fs::remove_file(valid);
        let _ = fs::remove_file(invalid);
    }

    #[test]
    fn export_rdf_helper_paths_cover_existing_destination_and_invalid_prefixes() {
        let path = temp_db_path("export-rdf-helper-paths");
        let existing_dst = temp_file_path("export-rdf-helper-existing", "ttl");
        let invalid_prefix_dst = temp_file_path("export-rdf-helper-invalid-prefix", "ttl");
        let fallback_export = temp_file_path("export-rdf-helper-fallback", "nt");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(&existing_dst, "already there").expect("write existing output");
        let exists = run(&vec![
            "export-rdf".to_string(),
            path.display().to_string(),
            existing_dst.display().to_string(),
            "--format".to_string(),
            "ttl".to_string(),
        ]);
        assert_eq!(exists.exit_code, 1);
        assert!(exists.stderr.contains("export destination already exists"));
        fs::remove_file(&existing_dst).expect("cleanup existing output");

        let bad_meta = PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            prefixes: std::collections::BTreeMap::from([(
                "bad".to_string(),
                "not a uri".to_string(),
            )]),
            ..PersistedRdfMeta::default()
        };
        save_rdf_meta(&path.display().to_string(), &bad_meta).expect("save bad rdf meta");
        let invalid_prefix = run(&vec![
            "export-rdf".to_string(),
            path.display().to_string(),
            invalid_prefix_dst.display().to_string(),
            "--format".to_string(),
            "ttl".to_string(),
        ]);
        assert_eq!(invalid_prefix.exit_code, 1);
        assert!(invalid_prefix.stderr.contains("invalid stored rdf prefix"));

        let mut db = Database::open(&path).expect("open db");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([
                    (
                        "_uri".to_string(),
                        PropertyValue::String("not a uri".to_string()),
                    ),
                    (
                        "name".to_string(),
                        PropertyValue::String("Alice".to_string()),
                    ),
                ]),
            )
            .expect("create n0");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "_uri".to_string(),
                    PropertyValue::String("http://example.com/bob".to_string()),
                )]),
            )
            .expect("create n1");
        let _ = db
            .create_node_with(
                &[RDF_RESERVED_LABEL_CLASS_NODE.to_string()],
                &PropertyMap::from([
                    (
                        "_uri".to_string(),
                        PropertyValue::String("http://example.com/ClassNode".to_string()),
                    ),
                    (
                        "hierarchyOnly".to_string(),
                        PropertyValue::String("skip-me".to_string()),
                    ),
                ]),
            )
            .expect("create hierarchy helper node");
        let _ = db
            .add_typed_edge(0, 1, "KNOWS", &PropertyMap::new())
            .expect("add typed edge");
        drop(db);

        let fallback_meta = PersistedRdfMeta {
            format_version: RDF_META_FORMAT_VERSION,
            predicate_uris: std::collections::BTreeMap::from([(
                "KNOWS".to_string(),
                "http://schema.org/knows".to_string(),
            )]),
            ..PersistedRdfMeta::default()
        };
        save_rdf_meta(&path.display().to_string(), &fallback_meta).expect("save fallback meta");
        let export_ok = run(&vec![
            "export-rdf".to_string(),
            path.display().to_string(),
            fallback_export.display().to_string(),
            "--format".to_string(),
            "nt".to_string(),
        ]);
        assert_eq!(export_ok.exit_code, 0);
        let rendered = fs::read_to_string(&fallback_export).expect("read fallback export");
        assert!(rendered.contains("http://schema.org/knows"));
        assert!(
            !rendered.contains("<http://example.com/ClassNode> <urn:ogdb:predicate:hierarchyOnly>")
        );

        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(wal_path(&path));
        let _ = fs::remove_file(meta_path(&path));
        let _ = fs::remove_file(rdf_meta_path_for_db(&path));
        let _ = fs::remove_file(invalid_prefix_dst);
        let _ = fs::remove_file(fallback_export);
    }

    #[test]
    fn import_rdf_turtle_converts_to_property_graph_and_preserves_uris() {
        let path = temp_db_path("import-rdf-ttl");
        let input = temp_file_path("import-rdf-ttl-input", "ttl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(
            &input,
            r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:john a schema:Person ;
  schema:name "John" ;
  schema:age "42"^^xsd:integer ;
  schema:worksAt ex:acme .

ex:acme a schema:Organization ;
  schema:name "Acme Corp" .
"#,
        )
        .expect("write rdf input");

        let out = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            input.display().to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=1"));

        let db = Database::open(&path).expect("open db");
        let john_nodes = db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/john".to_string()),
        );
        assert_eq!(john_nodes.len(), 1);
        let acme_nodes = db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/acme".to_string()),
        );
        assert_eq!(acme_nodes.len(), 1);

        let john = john_nodes[0];
        let acme = acme_nodes[0];
        assert_eq!(
            db.node_labels(john).expect("john labels"),
            vec!["Person".to_string()]
        );
        assert_eq!(
            db.node_labels(acme).expect("acme labels"),
            vec!["Organization".to_string()]
        );
        let john_props = db.node_properties(john).expect("john props");
        assert_eq!(
            john_props.get("name"),
            Some(&PropertyValue::String("John".to_string()))
        );
        assert_eq!(john_props.get("age"), Some(&PropertyValue::I64(42)));

        let edge = db
            .export_edges()
            .expect("export edges")
            .into_iter()
            .find(|edge| edge.src == john && edge.dst == acme)
            .expect("john worksAt acme edge");
        assert_eq!(edge.edge_type.as_deref(), Some("WORKS_AT"));
        assert_eq!(
            edge.properties.get("_uri"),
            Some(&PropertyValue::String(
                "http://schema.org/worksAt".to_string()
            ))
        );

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(input).expect("cleanup input");
    }

    #[test]
    fn import_rdf_atomic_imports_in_single_batch() {
        let path = temp_db_path("import-rdf-atomic");
        let input = temp_file_path("import-rdf-atomic-input", "ttl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &input,
            r#"@prefix ex: <http://example.com/> .

ex:a ex:knows ex:b .
"#,
        )
        .expect("write rdf input");

        let out = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            input.display().to_string(),
            "--atomic".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("imported_nodes=2"));
        assert!(out.stdout.contains("imported_edges=1"));
        assert!(out.stdout.contains("committed_batches=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        let _ = fs::remove_file(rdf_meta_path_for_db(&path));
        fs::remove_file(input).expect("cleanup input");
    }

    #[test]
    fn import_rdf_supports_base_uri_blank_nodes_and_named_graphs() {
        let base_uri_path = temp_db_path("import-rdf-base-uri");
        let base_uri_input = temp_file_path("import-rdf-base-uri-input", "ttl");
        let init = run(&vec![
            "init".to_string(),
            base_uri_path.display().to_string(),
        ]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &base_uri_input,
            r#"@prefix schema: <http://schema.org/> .
<john> a schema:Person ;
  schema:name "John" .
"#,
        )
        .expect("write base-uri rdf input");

        let base_out = run(&vec![
            "import-rdf".to_string(),
            base_uri_path.display().to_string(),
            base_uri_input.display().to_string(),
            "--base-uri".to_string(),
            "http://example.com/people/".to_string(),
        ]);
        assert_eq!(base_out.exit_code, 0);

        let base_db = Database::open(&base_uri_path).expect("open base-uri db");
        let john_nodes = base_db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/people/john".to_string()),
        );
        assert_eq!(john_nodes.len(), 1);

        fs::remove_file(&base_uri_path).expect("cleanup base db");
        fs::remove_file(wal_path(&base_uri_path)).expect("cleanup base wal");
        fs::remove_file(meta_path(&base_uri_path)).expect("cleanup base meta");
        fs::remove_file(&base_uri_input).expect("cleanup base input");

        let nq_path = temp_db_path("import-rdf-nq");
        let nq_input = temp_file_path("import-rdf-nq-input", "nq");
        let init = run(&vec!["init".to_string(), nq_path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &nq_input,
            r#"<http://example.com/john> <http://schema.org/knows> _:b1 <http://example.com/g1> .
_:b1 <http://schema.org/name> "Blanky" <http://example.com/g1> .
"#,
        )
        .expect("write nquads input");

        let nq_out = run(&vec![
            "import-rdf".to_string(),
            nq_path.display().to_string(),
            nq_input.display().to_string(),
            "--format".to_string(),
            "nq".to_string(),
        ]);
        assert_eq!(nq_out.exit_code, 0);

        let nq_db = Database::open(&nq_path).expect("open nq db");
        let john = nq_db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/john".to_string()),
        )[0];
        let blank_nodes =
            nq_db.find_nodes_by_property("_blank_id", &PropertyValue::String("b1".to_string()));
        assert_eq!(blank_nodes.len(), 1);
        let blank = blank_nodes[0];
        assert_eq!(
            nq_db.node_labels(blank).expect("blank labels"),
            vec!["_BlankNode".to_string()]
        );
        let blank_props = nq_db.node_properties(blank).expect("blank props");
        assert_eq!(
            blank_props.get("name"),
            Some(&PropertyValue::String("Blanky".to_string()))
        );
        assert_eq!(
            blank_props.get("_graph"),
            Some(&PropertyValue::String("http://example.com/g1".to_string()))
        );

        let knows_edge = nq_db
            .export_edges()
            .expect("export nq edges")
            .into_iter()
            .find(|edge| edge.src == john && edge.dst == blank)
            .expect("knows edge");
        assert_eq!(knows_edge.edge_type.as_deref(), Some("KNOWS"));
        assert_eq!(
            knows_edge.properties.get("_uri"),
            Some(&PropertyValue::String(
                "http://schema.org/knows".to_string()
            ))
        );
        assert_eq!(
            knows_edge.properties.get("_graph"),
            Some(&PropertyValue::String("http://example.com/g1".to_string()))
        );

        fs::remove_file(&nq_path).expect("cleanup nq db");
        fs::remove_file(wal_path(&nq_path)).expect("cleanup nq wal");
        fs::remove_file(meta_path(&nq_path)).expect("cleanup nq meta");
        fs::remove_file(nq_input).expect("cleanup nq input");
    }

    #[test]
    fn import_rdf_schema_only_populates_schema_catalog_and_subclass_hierarchy() {
        let path = temp_db_path("import-rdf-schema-only");
        let input = temp_file_path("import-rdf-schema-only-input", "ttl");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(
            &input,
            r#"@prefix ex: <http://example.com/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Person a owl:Class .
ex:Employee a owl:Class ;
  rdfs:subClassOf ex:Person .
ex:worksAt a owl:ObjectProperty .
ex:name a owl:DatatypeProperty .

ex:alice a ex:Employee ;
  ex:name "Alice" ;
  ex:worksAt ex:acme .
"#,
        )
        .expect("write ontology input");

        let out = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            input.display().to_string(),
            "--schema-only".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);

        let db = Database::open(&path).expect("open db");
        let schema = db.schema_catalog();
        assert!(schema.labels.contains(&"Employee".to_string()));
        assert!(schema.labels.contains(&"Person".to_string()));
        assert!(schema.edge_types.contains(&"WORKS_AT".to_string()));
        assert!(schema.property_keys.contains(&"name".to_string()));

        let alice_nodes = db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/alice".to_string()),
        );
        assert!(
            alice_nodes.is_empty(),
            "schema-only import should skip instance data"
        );

        let subclass_edge = db
            .export_edges()
            .expect("export edges")
            .into_iter()
            .find(|edge| edge.edge_type.as_deref() == Some("_subClassOf"))
            .expect("subclass hierarchy edge");
        let child_props = db
            .node_properties(subclass_edge.src)
            .expect("child class node props");
        let parent_props = db
            .node_properties(subclass_edge.dst)
            .expect("parent class node props");
        assert_eq!(
            child_props.get("_uri"),
            Some(&PropertyValue::String(
                "http://example.com/Employee".to_string()
            ))
        );
        assert_eq!(
            parent_props.get("_uri"),
            Some(&PropertyValue::String(
                "http://example.com/Person".to_string()
            ))
        );

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(input).expect("cleanup input");
    }

    #[test]
    fn export_rdf_round_trips_uris_and_prefixes() {
        let path = temp_db_path("export-rdf-roundtrip");
        let import_input = temp_file_path("export-rdf-roundtrip-input", "ttl");
        let export_output = temp_file_path("export-rdf-roundtrip-output", "ttl");
        let roundtrip_path = temp_db_path("export-rdf-roundtrip-reimport");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        fs::write(
            &import_input,
            r#"@prefix ex: <http://example.com/> .
@prefix schema: <http://schema.org/> .

ex:john a schema:Person ;
  schema:name "John" ;
  schema:worksAt ex:acme .
ex:acme a schema:Organization ;
  schema:name "Acme Corp" .
"#,
        )
        .expect("write import ttl");

        let import_out = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            import_input.display().to_string(),
        ]);
        assert_eq!(import_out.exit_code, 0);

        let export_out = run(&vec![
            "export-rdf".to_string(),
            path.display().to_string(),
            export_output.display().to_string(),
            "--format".to_string(),
            "ttl".to_string(),
        ]);
        assert_eq!(export_out.exit_code, 0);
        assert!(export_out.stdout.contains("exported_triples="));
        let rendered = fs::read_to_string(&export_output).expect("read rdf output");
        assert!(rendered.contains("@prefix ex:"));
        assert!(rendered.contains("@prefix schema:"));
        assert!(rendered.contains("schema:worksAt"));

        let init_roundtrip = run(&vec![
            "init".to_string(),
            roundtrip_path.display().to_string(),
        ]);
        assert_eq!(init_roundtrip.exit_code, 0);
        let reimport_out = run(&vec![
            "import-rdf".to_string(),
            roundtrip_path.display().to_string(),
            export_output.display().to_string(),
        ]);
        assert_eq!(reimport_out.exit_code, 0);
        let reimport_db = Database::open(&roundtrip_path).expect("open roundtrip db");
        let john_nodes = reimport_db.find_nodes_by_property(
            "_uri",
            &PropertyValue::String("http://example.com/john".to_string()),
        );
        assert_eq!(john_nodes.len(), 1);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(&import_input).expect("cleanup import input");
        fs::remove_file(&export_output).expect("cleanup export output");

        fs::remove_file(&roundtrip_path).expect("cleanup roundtrip db");
        fs::remove_file(wal_path(&roundtrip_path)).expect("cleanup roundtrip wal");
        fs::remove_file(meta_path(&roundtrip_path)).expect("cleanup roundtrip meta");
    }

    #[test]
    fn rdf_commands_validate_usage_and_format_resolution() {
        let import_wrong_arity = run(&["import-rdf".to_string()]);
        assert_eq!(import_wrong_arity.exit_code, 2);
        assert!(import_wrong_arity
            .stderr
            .contains("usage: opengraphdb import-rdf"));

        let export_wrong_arity = run(&["export-rdf".to_string()]);
        assert_eq!(export_wrong_arity.exit_code, 2);
        assert!(export_wrong_arity
            .stderr
            .contains("usage: opengraphdb export-rdf"));

        let path = temp_db_path("rdf-format-resolution");
        let no_ext_input = temp_file_path("rdf-format-resolution", "txt");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&no_ext_input, "<s> <p> <o> .").expect("write no-ext rdf input");

        let no_detect = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            no_ext_input.display().to_string(),
        ]);
        assert_eq!(no_detect.exit_code, 1);
        assert!(no_detect
            .stderr
            .contains("unable to determine import-rdf format"));

        let bad_format = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            no_ext_input.display().to_string(),
            "--format".to_string(),
            "csv".to_string(),
        ]);
        assert_eq!(bad_format.exit_code, 2);
        assert!(bad_format.stderr.contains("invalid value"));

        let bad_export_format = run(&vec![
            "export-rdf".to_string(),
            path.display().to_string(),
            temp_file_path("rdf-bad-export-format", "ttl")
                .display()
                .to_string(),
            "--format".to_string(),
            "nq".to_string(),
        ]);
        assert_eq!(bad_export_format.exit_code, 2);
        assert!(bad_export_format.stderr.contains("invalid value"));

        let atomic_conflict = run(&vec![
            "import-rdf".to_string(),
            path.display().to_string(),
            no_ext_input.display().to_string(),
            "--atomic".to_string(),
            "--continue-on-error".to_string(),
        ]);
        assert_eq!(atomic_conflict.exit_code, 2);
        assert!(atomic_conflict.stderr.contains("cannot be used with"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
        fs::remove_file(no_ext_input).expect("cleanup no ext input");
    }

    #[test]
    fn shell_rejects_missing_mode() {
        let path = temp_db_path("shell-no-mode");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec!["shell".to_string(), path.display().to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("shell input produced zero executable queries"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_rejects_missing_path() {
        let out = run(&["shell".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn shell_rejects_missing_flag_value() {
        let path = temp_db_path("shell-missing-flag-value");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let commands_out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
        ]);
        assert_eq!(commands_out.exit_code, 2);
        assert!(commands_out.stderr.contains("--commands"));

        let script_out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--script".to_string(),
        ]);
        assert_eq!(script_out.exit_code, 2);
        assert!(script_out.stderr.contains("--script"));

        let format_out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "info".to_string(),
            "--format".to_string(),
        ]);
        assert_eq!(format_out.exit_code, 2);
        assert!(format_out.stderr.contains("--format"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn shell_rejects_unknown_flag_and_both_modes() {
        let path = temp_db_path("shell-unknown-flag");
        let script = temp_db_path("shell-both-script");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        fs::write(&script, "info\n").expect("write script");

        let unknown = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--bad".to_string(),
            "x".to_string(),
        ]);
        assert_eq!(unknown.exit_code, 2);
        assert!(unknown.stderr.contains("unexpected argument"));

        let both = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "info".to_string(),
            "--script".to_string(),
            script.display().to_string(),
        ]);
        assert_eq!(both.exit_code, 2);
        assert!(both
            .stderr
            .contains("choose either --commands or --script, not both"));

        let bad_format = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            "info".to_string(),
            "--format".to_string(),
            "xml".to_string(),
        ]);
        assert_eq!(bad_format.exit_code, 2);
        assert!(bad_format.stderr.contains("invalid value"));
        assert!(bad_format.stderr.contains("xml"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(script).expect("cleanup script");
    }

    #[test]
    fn shell_rejects_empty_command_input() {
        let path = temp_db_path("shell-empty-commands");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "shell".to_string(),
            path.display().to_string(),
            "--commands".to_string(),
            " ; ; ".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("shell input produced zero executable queries"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn create_node_add_edge_and_neighbors_commands_work() {
        let path = temp_db_path("graph-cli-flow");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let n0 = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let n1 = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let n2 = run(&vec!["create-node".to_string(), path.display().to_string()]);
        assert_eq!(n0.exit_code, 0);
        assert_eq!(n1.exit_code, 0);
        assert_eq!(n2.exit_code, 0);
        assert!(n0.stdout.contains("node_id=0"));
        assert!(n1.stdout.contains("node_id=1"));
        assert!(n2.stdout.contains("node_id=2"));

        let e0 = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        let e1 = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "2".to_string(),
        ]);
        assert_eq!(e0.exit_code, 0);
        assert_eq!(e1.exit_code, 0);
        assert!(e0.stdout.contains("edge_id=0"));
        assert!(e1.stdout.contains("edge_id=1"));

        let neighbors = run(&vec![
            "neighbors".to_string(),
            path.display().to_string(),
            "0".to_string(),
        ]);
        assert_eq!(neighbors.exit_code, 0);
        assert!(neighbors.stdout.contains("src=0"));
        assert!(neighbors.stdout.contains("count=2"));
        assert!(neighbors.stdout.contains("neighbors=1,2"));

        let info = run(&vec!["info".to_string(), path.display().to_string()]);
        assert_eq!(info.exit_code, 0);
        assert!(info.stdout.contains("node_count=3"));
        assert!(info.stdout.contains("edge_count=2"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn create_node_rejects_wrong_argument_count() {
        let out = run(&["create-node".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn add_edge_rejects_wrong_argument_count() {
        let out = run(&["add-edge".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb add-edge <path> <src> <dst>"));
    }

    #[test]
    fn add_edge_rejects_non_numeric_ids() {
        let path = temp_db_path("add-edge-non-numeric");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "abc".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("invalid value"));
        assert!(out.stderr.contains("src"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn add_edge_returns_runtime_error_for_unknown_nodes() {
        let path = temp_db_path("add-edge-unknown");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "99".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("unknown node id"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn create_node_and_add_edge_reject_property_flag_errors() {
        let path = temp_db_path("property-flag-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let create_missing_labels = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
        ]);
        assert_eq!(create_missing_labels.exit_code, 2);
        assert!(create_missing_labels.stderr.contains("--labels"));

        let create_missing_props = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--props".to_string(),
        ]);
        assert_eq!(create_missing_props.exit_code, 2);
        assert!(create_missing_props.stderr.contains("--props"));

        let create_unknown = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--bad".to_string(),
            "x".to_string(),
        ]);
        assert_eq!(create_unknown.exit_code, 2);
        assert!(create_unknown.stderr.contains("unexpected argument"));

        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let add_missing_type = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--type".to_string(),
        ]);
        assert_eq!(add_missing_type.exit_code, 2);
        assert!(add_missing_type.stderr.contains("--type"));

        let add_missing_props = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--props".to_string(),
        ]);
        assert_eq!(add_missing_props.exit_code, 2);
        assert!(add_missing_props.stderr.contains("--props"));

        let add_unknown = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--bad".to_string(),
            "x".to_string(),
        ]);
        assert_eq!(add_unknown.exit_code, 2);
        assert!(add_unknown.stderr.contains("unexpected argument"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn property_parser_helpers_cover_success_and_error_cases() {
        assert_eq!(
            parse_label_list(" Person,Employee ,,Admin "),
            vec![
                "Person".to_string(),
                "Employee".to_string(),
                "Admin".to_string()
            ]
        );

        assert_eq!(
            parse_property_value_literal("bool:true").expect("parse bool true"),
            PropertyValue::Bool(true)
        );
        assert_eq!(
            parse_property_value_literal("bool:false").expect("parse bool false"),
            PropertyValue::Bool(false)
        );
        assert_eq!(
            parse_property_value_literal("i64:-7").expect("parse i64"),
            PropertyValue::I64(-7)
        );
        assert_eq!(
            parse_property_value_literal("f64:3.5").expect("parse f64"),
            PropertyValue::F64(3.5)
        );
        assert_eq!(
            parse_property_value_literal("string:alice").expect("parse string"),
            PropertyValue::String("alice".to_string())
        );
        assert_eq!(
            parse_property_value_literal("bytes:00ff7a").expect("parse bytes"),
            PropertyValue::Bytes(vec![0x00, 0xff, 0x7a])
        );
        assert_eq!(
            parse_property_value_literal("vector:[1.0, 2.5, -3]").expect("parse vector"),
            PropertyValue::Vector(vec![1.0, 2.5, -3.0])
        );

        assert_eq!(
            format_property_value(&PropertyValue::Bool(true)),
            "bool:true".to_string()
        );
        assert_eq!(
            format_property_value(&PropertyValue::I64(9)),
            "i64:9".to_string()
        );
        assert_eq!(
            format_property_value(&PropertyValue::F64(1.25)),
            "f64:1.25".to_string()
        );
        assert_eq!(
            format_property_value(&PropertyValue::String("x".to_string())),
            "string:x".to_string()
        );
        assert_eq!(
            format_property_value(&PropertyValue::Bytes(vec![0x0a, 0xbc])),
            "bytes:0abc".to_string()
        );
        assert_eq!(
            format_property_value(&PropertyValue::Vector(vec![1.0, 2.5, -3.0])),
            "vector:[1,2.5,-3]".to_string()
        );

        let (key, value) = parse_property_assignment("age=i64:42").expect("parse assignment");
        assert_eq!(key, "age");
        assert_eq!(value, PropertyValue::I64(42));

        let assignments = parse_property_assignments("a=bool:true; b=i64:3 ; c=string:x ;")
            .expect("parse assignments");
        assert_eq!(assignments.get("a"), Some(&PropertyValue::Bool(true)));
        assert_eq!(assignments.get("b"), Some(&PropertyValue::I64(3)));
        assert_eq!(
            assignments.get("c"),
            Some(&PropertyValue::String("x".to_string()))
        );

        let literal_err =
            parse_property_value_literal("broken").expect_err("literal without type should fail");
        assert!(literal_err
            .to_string()
            .contains("invalid property value literal"));

        let bool_err = parse_property_value_literal("bool:maybe")
            .expect_err("invalid bool literal should fail");
        assert!(bool_err.to_string().contains("invalid bool property value"));

        let i64_err =
            parse_property_value_literal("i64:nope").expect_err("invalid i64 literal should fail");
        assert!(i64_err.to_string().contains("invalid i64 property value"));

        let f64_err =
            parse_property_value_literal("f64:nope").expect_err("invalid f64 literal should fail");
        assert!(f64_err.to_string().contains("invalid f64 property value"));

        let bytes_len_err =
            parse_property_value_literal("bytes:abc").expect_err("odd hex length should fail");
        assert!(bytes_len_err
            .to_string()
            .contains("expected even-length hex"));

        let bytes_hex_err = parse_property_value_literal("bytes:zz")
            .expect_err("non-hex bytes literal should fail");
        assert!(bytes_hex_err
            .to_string()
            .contains("expected hexadecimal digits"));

        let type_err = parse_property_value_literal("u32:1")
            .expect_err("unsupported property type should fail");
        assert!(type_err.to_string().contains("unsupported property type"));

        let vector_shape_err = parse_property_value_literal("vector:1,2")
            .expect_err("vector literal must use bracket syntax");
        assert!(vector_shape_err
            .to_string()
            .contains("invalid vector property value"));
        assert_eq!(
            parse_property_value_literal("vector:[]").expect("empty vector literal"),
            PropertyValue::Vector(Vec::new())
        );

        let assignment_err =
            parse_property_assignment("missing").expect_err("assignment without '=' should fail");
        assert!(assignment_err
            .to_string()
            .contains("invalid property assignment"));

        let empty_key_err = parse_property_assignment(" =i64:1")
            .expect_err("assignment with empty key should fail");
        assert!(empty_key_err.to_string().contains("empty key"));
    }

    #[test]
    fn import_export_helper_parsers_cover_error_paths() {
        assert_eq!(parse_batch_size("1").expect("batch size one"), 1);
        let batch_size_err = parse_batch_size("0").expect_err("zero batch size must fail");
        assert!(batch_size_err.contains(">= 1"));

        let parse_u64_err =
            parse_u64_import_field("x", "id", 7).expect_err("invalid import number must fail");
        assert!(parse_u64_err
            .to_string()
            .contains("invalid id value at line 7"));

        assert_eq!(
            graph_data_format_from_output_format(Some(QueryOutputFormat::Csv), "import")
                .expect("csv format"),
            Some(GraphDataFormat::Csv)
        );
        assert_eq!(
            graph_data_format_from_output_format(Some(QueryOutputFormat::Json), "import")
                .expect("json format"),
            Some(GraphDataFormat::Json)
        );
        assert_eq!(
            graph_data_format_from_output_format(Some(QueryOutputFormat::Jsonl), "import")
                .expect("jsonl format"),
            Some(GraphDataFormat::Jsonl)
        );
        let format_err =
            graph_data_format_from_output_format(Some(QueryOutputFormat::Table), "import")
                .expect_err("table format should fail for import");
        assert!(format_err
            .to_string()
            .contains("unsupported --format for import"));

        assert_eq!(
            detect_graph_data_format("data.ndjson"),
            Some(GraphDataFormat::Jsonl)
        );
        assert_eq!(detect_graph_data_format("data.unknown"), None);
        let detect_err = resolve_graph_data_format(None, "data.unknown", "import")
            .expect_err("unknown extension must fail");
        assert!(detect_err
            .to_string()
            .contains("unable to determine import format"));

        let dir = temp_file_path("csv-bundle-dir", "d");
        fs::create_dir(&dir).expect("create csv bundle dir");
        let from_dir = csv_bundle_paths(&dir);
        assert_eq!(from_dir.nodes_path, dir.join("nodes.csv"));
        assert_eq!(from_dir.edges_path, dir.join("edges.csv"));

        let nodes_named = PathBuf::from("/tmp/example.nodes.csv");
        let from_nodes = csv_bundle_paths(&nodes_named);
        assert_eq!(from_nodes.nodes_path, nodes_named);
        assert_eq!(
            from_nodes.edges_path,
            PathBuf::from("/tmp/example.edges.csv")
        );

        let edges_named = PathBuf::from("/tmp/example.edges.csv");
        let from_edges = csv_bundle_paths(&edges_named);
        assert_eq!(
            from_edges.nodes_path,
            PathBuf::from("/tmp/example.nodes.csv")
        );
        assert_eq!(from_edges.edges_path, edges_named);

        let base_csv = PathBuf::from("/tmp/example.csv");
        let from_base_csv = csv_bundle_paths(&base_csv);
        assert_eq!(
            from_base_csv.nodes_path,
            PathBuf::from("/tmp/example.nodes.csv")
        );
        assert_eq!(
            from_base_csv.edges_path,
            PathBuf::from("/tmp/example.edges.csv")
        );

        let base_other = PathBuf::from("/tmp/example.bundle");
        let from_base_other = csv_bundle_paths(&base_other);
        assert_eq!(
            from_base_other.nodes_path,
            PathBuf::from("/tmp/example.bundle.nodes.csv")
        );
        assert_eq!(
            from_base_other.edges_path,
            PathBuf::from("/tmp/example.bundle.edges.csv")
        );

        assert_eq!(
            coerce_csv_property_value("i64:9").expect("typed literal"),
            PropertyValue::I64(9)
        );
        assert_eq!(
            coerce_csv_property_value("true").expect("bool"),
            PropertyValue::Bool(true)
        );
        assert_eq!(
            coerce_csv_property_value("3.5").expect("f64"),
            PropertyValue::F64(3.5)
        );
        assert_eq!(
            coerce_csv_property_value("vector:[1,2,3]").expect("vector"),
            PropertyValue::Vector(vec![1.0, 2.0, 3.0])
        );
        assert_eq!(
            coerce_csv_property_value("foo:1").expect("unknown typed prefix fallback"),
            PropertyValue::String("foo:1".to_string())
        );
        assert_eq!(
            coerce_csv_property_value("nan").expect("nan fallback"),
            PropertyValue::String("nan".to_string())
        );

        assert_eq!(
            json_value_to_property_value(&serde_json::json!("bytes:0a")).expect("bytes"),
            PropertyValue::Bytes(vec![0x0a])
        );
        assert!(json_value_to_property_value(&serde_json::json!(null)).is_err());
        assert_eq!(
            json_value_to_property_value(&serde_json::json!([1, 2])).expect("vector array"),
            PropertyValue::Vector(vec![1.0, 2.0])
        );
        let array_entry_err = json_value_to_property_value(&serde_json::json!([1, "x"]))
            .expect_err("vector array with non-number must fail");
        assert!(array_entry_err
            .to_string()
            .contains("unsupported non-numeric vector property entry"));
        assert!(json_value_to_property_value(&serde_json::json!({"nested": 1})).is_err());
        assert_eq!(
            json_value_to_property_value(&serde_json::json!(3.25)).expect("f64 value"),
            PropertyValue::F64(3.25)
        );
        assert_eq!(
            json_value_to_property_value(&serde_json::json!(-7)).expect("negative i64"),
            PropertyValue::I64(-7)
        );
        let big_number = Value::Number(serde_json::Number::from(u64::MAX));
        let big_err = json_value_to_property_value(&big_number).expect_err("u64 overflow");
        assert!(big_err.to_string().contains("out of range for i64"));

        let mut object = Map::<String, Value>::new();
        object.insert("id".to_string(), Value::Number(0.into()));
        assert_eq!(
            json_object_u64_field(&object, "id", 3).expect("u64 field"),
            0
        );
        object.insert("id".to_string(), Value::Number((-1).into()));
        let id_err = json_object_u64_field(&object, "id", 3).expect_err("negative id");
        assert!(id_err.to_string().contains("must be an unsigned integer"));

        let empty_labels = json_object_labels_field(&Map::new(), 1).expect("no labels");
        assert!(empty_labels.is_empty());
        let mut bad_labels = Map::<String, Value>::new();
        bad_labels.insert("labels".to_string(), Value::String("Person".to_string()));
        assert!(json_object_labels_field(&bad_labels, 2).is_err());
        bad_labels.insert("labels".to_string(), serde_json::json!([1]));
        assert!(json_object_labels_field(&bad_labels, 3).is_err());

        let empty_props = json_object_properties_field(&Map::new(), 1).expect("no properties");
        assert!(empty_props.is_empty());
        let mut bad_props = Map::<String, Value>::new();
        bad_props.insert("properties".to_string(), Value::String("x".to_string()));
        assert!(json_object_properties_field(&bad_props, 4).is_err());

        assert_eq!(edge_type_normalized(Some("  ".to_string())), None);
        assert_eq!(
            edge_type_normalized(Some("KNOWS".to_string())),
            Some("KNOWS".to_string())
        );

        let jsonl_parse_err = parse_jsonl_import_record("{", 1).expect_err("bad json");
        assert!(jsonl_parse_err.to_string().contains("failed to parse json"));
        let jsonl_object_err = parse_jsonl_import_record("[]", 1).expect_err("non-object");
        assert!(jsonl_object_err
            .to_string()
            .contains("expected json object"));
        let jsonl_discriminator_err =
            parse_jsonl_import_record("{\"kind\":\"unknown\"}", 1).expect_err("unknown kind");
        assert!(jsonl_discriminator_err
            .to_string()
            .contains("missing node/edge discriminator"));

        let node_fallback = parse_jsonl_import_record("{\"id\":0}", 1).expect("node fallback");
        assert!(matches!(
            node_fallback,
            ImportRecord::Node(ImportNodeRecord { id: 0, .. })
        ));
        let edge_fallback =
            parse_jsonl_import_record("{\"src\":0,\"dst\":1}", 1).expect("edge fallback");
        assert!(matches!(
            edge_fallback,
            ImportRecord::Edge(ImportEdgeRecord { src: 0, dst: 1, .. })
        ));

        assert!(parse_node_id_range_filter("bad").is_err());
        assert!(parse_node_id_range_filter("a:2").is_err());
        assert!(parse_node_id_range_filter("1:b").is_err());
        assert!(parse_node_id_range_filter("2:1").is_err());

        let json_nan = property_value_to_export_json(&PropertyValue::F64(f64::NAN));
        assert!(json_nan
            .as_str()
            .expect("nan fallback string")
            .contains("NaN"));
        assert_eq!(
            property_value_to_export_json(&PropertyValue::Bool(true)),
            Value::Bool(true)
        );
        assert_eq!(
            property_value_to_export_json(&PropertyValue::Bytes(vec![0xab])),
            Value::String("bytes:ab".to_string())
        );
        assert_eq!(
            property_value_to_export_json(&PropertyValue::Vector(vec![1.0, 2.0])),
            serde_json::json!([1.0, 2.0])
        );
        assert_eq!(
            property_value_to_rdf_literal(&PropertyValue::Vector(vec![1.0, 2.0])),
            Literal::from("vector:[1,2]")
        );
        assert_eq!(
            property_value_to_export_csv(&PropertyValue::Bool(true)),
            "true".to_string()
        );
        assert_eq!(
            property_value_to_export_csv(&PropertyValue::Bytes(vec![0x01, 0x02])),
            "bytes:0102".to_string()
        );
        assert_eq!(
            property_value_to_export_csv(&PropertyValue::Vector(vec![1.0, 2.0])),
            "vector:[1,2]".to_string()
        );

        fs::remove_dir(&dir).expect("cleanup csv bundle dir");
    }

    #[test]
    fn stream_json_import_surfaces_edge_parse_errors_with_continue_mode() {
        let path = temp_db_path("json-import-edge-parse-error");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let payload_path = temp_file_path("json-import-edge-parse-error", "json");
        fs::write(
            &payload_path,
            r#"{"nodes":[{"id":0,"labels":["Doc"],"properties":{"name":"ok"}}],"edges":[{"src":0,"dst":0,"properties":{"weight":["bad"]}}]}"#,
        )
        .expect("write payload");

        let mut db = Database::open(&path).expect("open db");
        let mut batcher = ImportBatcher::new(&mut db, 16, true);
        stream_json_import(
            payload_path.to_str().expect("payload path utf8"),
            &mut batcher,
        )
        .expect("continue-on-error import should succeed");
        let progress = batcher.finish().expect("finish import");
        assert_eq!(progress.processed_records, 2);
        assert_eq!(progress.skipped_records, 1);
        assert_eq!(db.node_count(), 1);

        fs::remove_file(&payload_path).expect("cleanup payload");
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn import_batcher_and_stream_helpers_cover_flush_skip_and_fatal_paths() {
        let path = temp_db_path("import-batcher-helpers");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let mut db = Database::open(&path).expect("open db");

        {
            let mut batcher = ImportBatcher::new(&mut db, 4, false);
            batcher.flush().expect("empty flush should succeed");
        }

        {
            let mut batcher = ImportBatcher::new(&mut db, 1, false);
            let err = batcher
                .push(ImportRecord::Edge(ImportEdgeRecord {
                    src: 0,
                    dst: 0,
                    edge_type: Some("   ".to_string()),
                    properties: PropertyMap::new(),
                }))
                .expect_err("fatal import record should fail");
            assert!(err.to_string().contains("failed to import record"));
        }

        {
            let mut batcher = ImportBatcher::new(&mut db, 1, true);
            batcher
                .push(ImportRecord::Edge(ImportEdgeRecord {
                    src: 0,
                    dst: 0,
                    edge_type: Some("   ".to_string()),
                    properties: PropertyMap::new(),
                }))
                .expect("continue-on-error should skip invalid record");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.skipped_records, 1);
            assert_eq!(progress.committed_batches, 0);
        }

        {
            let mut batcher = ImportBatcher::new(&mut db, 4, true);
            handle_stream_parse_error(
                true,
                &mut batcher,
                CliError::Runtime("synthetic parse error".to_string()),
            )
            .expect("continue parse error");
            assert_eq!(batcher.progress.skipped_records, 1);
            let stop_err = handle_stream_parse_error(
                false,
                &mut batcher,
                CliError::Runtime("stop parse error".to_string()),
            )
            .expect_err("strict mode should stop");
            assert!(stop_err.to_string().contains("stop parse error"));
        }

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn parse_migration_script_parses_all_supported_directives() {
        let script = "ADD LABEL Person\nDROP LABEL Legacy\nADD EDGE_TYPE KNOWS\nDROP EDGE_TYPE OLD\nADD PROPERTY_KEY email\nDROP PROPERTY_KEY old_email\nADD INDEX ON :Person(name)\nDROP INDEX ON :Company(ticker)\n";
        let actions = parse_migration_script(script).expect("parse migration script");
        assert_eq!(actions.len(), 8);
        assert_eq!(actions[0], MigrationAction::AddLabel("Person".to_string()));
        assert_eq!(actions[1], MigrationAction::DropLabel("Legacy".to_string()));
        assert_eq!(
            actions[2],
            MigrationAction::AddEdgeType("KNOWS".to_string())
        );
        assert_eq!(actions[3], MigrationAction::DropEdgeType("OLD".to_string()));
        assert_eq!(
            actions[4],
            MigrationAction::AddPropertyKey("email".to_string())
        );
        assert_eq!(
            actions[5],
            MigrationAction::DropPropertyKey("old_email".to_string())
        );
        assert_eq!(
            actions[6],
            MigrationAction::AddIndex {
                label: "Person".to_string(),
                property_key: "name".to_string()
            }
        );
        assert_eq!(
            actions[7],
            MigrationAction::DropIndex {
                label: "Company".to_string(),
                property_key: "ticker".to_string()
            }
        );
    }

    #[test]
    fn parse_index_target_validates_expected_shape() {
        assert_eq!(
            parse_index_target(":Person(name)"),
            Some(("Person".to_string(), "name".to_string()))
        );
        assert_eq!(
            parse_index_target(": Person ( name )"),
            Some(("Person".to_string(), "name".to_string()))
        );
        assert_eq!(parse_index_target("Person(name)"), None);
        assert_eq!(parse_index_target(":()"), None);
        assert_eq!(parse_index_target(":(name)"), None);
        assert_eq!(parse_index_target(":Person()"), None);
    }

    #[test]
    fn csv_stream_helpers_cover_header_and_row_error_paths() {
        let path = temp_db_path("csv-stream-helpers");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let mut db = Database::open(&path).expect("open db");

        let bad_node_header = temp_file_path("csv-node-header", "csv");
        fs::write(&bad_node_header, "node_id,labels\n0,Person\n").expect("write bad node header");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            let err = stream_csv_nodes_file(&bad_node_header, &mut batcher)
                .expect_err("node header must fail");
            assert!(err.to_string().contains("invalid csv node header"));
        }

        let malformed_node_row = temp_file_path("csv-node-malformed", "csv");
        fs::write(&malformed_node_row, b"id,labels\n0,\xff\n").expect("write malformed node row");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_csv_nodes_file(&malformed_node_row, &mut batcher)
                .expect("continue mode should skip malformed csv row");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.skipped_records, 1);
        }

        let node_parse_errors = temp_file_path("csv-node-parse-errors", "csv");
        fs::write(
            &node_parse_errors,
            "id,labels,name\nx,Person,Alice\n1,Person,\n",
        )
        .expect("write node parse error rows");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_csv_nodes_file(&node_parse_errors, &mut batcher).expect("stream node rows");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.processed_records, 2);
            assert_eq!(progress.imported_nodes, 1);
            assert_eq!(progress.skipped_records, 1);
        }

        let bad_edge_header = temp_file_path("csv-edge-header", "csv");
        fs::write(&bad_edge_header, "source,dst\n0,1\n").expect("write bad edge header");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            let err = stream_csv_edges_file(&bad_edge_header, &mut batcher)
                .expect_err("edge header must fail");
            assert!(err.to_string().contains("invalid csv edge header"));
        }

        let malformed_edge_row = temp_file_path("csv-edge-malformed", "csv");
        fs::write(&malformed_edge_row, b"src,dst\n0,\xff\n").expect("write malformed edge row");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_csv_edges_file(&malformed_edge_row, &mut batcher)
                .expect("continue mode should skip malformed edge row");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.skipped_records, 1);
        }

        let edge_parse_errors = temp_file_path("csv-edge-parse-errors", "csv");
        fs::write(&edge_parse_errors, "src,dst,weight\nx,1,\n0,1,\n")
            .expect("write edge parse error rows");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_csv_edges_file(&edge_parse_errors, &mut batcher).expect("stream edge rows");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.processed_records, 2);
            assert_eq!(progress.imported_edges, 1);
            assert_eq!(progress.skipped_records, 1);
        }

        let csv_dir = temp_file_path("csv-stream-dir", "d");
        fs::create_dir(&csv_dir).expect("create csv dir");
        fs::write(csv_dir.join("nodes.csv"), "id,labels\n0,Person\n").expect("write nodes");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            stream_csv_import(csv_dir.to_str().expect("dir str"), &mut batcher)
                .expect("nodes-only bundle");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.imported_nodes, 1);
        }
        fs::write(csv_dir.join("edges.csv"), "src,dst\n0,0\n").expect("write edges");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            stream_csv_import(csv_dir.to_str().expect("dir str"), &mut batcher)
                .expect("nodes+edges bundle");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.imported_edges, 1);
        }

        let csv_edges_only_dir = temp_file_path("csv-stream-edges-only-dir", "d");
        fs::create_dir(&csv_edges_only_dir).expect("create edges-only csv dir");
        fs::write(csv_edges_only_dir.join("edges.csv"), "src,dst\n0,0\n").expect("write edges");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            stream_csv_import(csv_edges_only_dir.to_str().expect("dir str"), &mut batcher)
                .expect("edges-only bundle");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.imported_edges, 1);
        }

        fs::remove_file(&bad_node_header).expect("cleanup bad node header");
        fs::remove_file(&malformed_node_row).expect("cleanup malformed node row");
        fs::remove_file(&node_parse_errors).expect("cleanup node parse errors");
        fs::remove_file(&bad_edge_header).expect("cleanup bad edge header");
        fs::remove_file(&malformed_edge_row).expect("cleanup malformed edge row");
        fs::remove_file(&edge_parse_errors).expect("cleanup edge parse errors");
        fs::remove_file(csv_dir.join("nodes.csv")).expect("cleanup nodes csv");
        fs::remove_file(csv_dir.join("edges.csv")).expect("cleanup edges csv");
        fs::remove_dir(csv_dir).expect("cleanup csv dir");
        fs::remove_file(csv_edges_only_dir.join("edges.csv")).expect("cleanup edges-only csv");
        fs::remove_dir(csv_edges_only_dir).expect("cleanup edges-only dir");
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn json_stream_helpers_cover_legacy_and_skip_paths() {
        let path = temp_db_path("json-stream-helpers");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let mut db = Database::open(&path).expect("open db");

        let graph_payload = temp_file_path("json-stream-graph", "json");
        fs::write(
            &graph_payload,
            r#"{
  "nodes": [
    { "id": 0, "labels": ["Person"], "properties": { "bad": { "nested": 1 } } },
    { "id": 1, "labels": ["Person"], "properties": { "name": "Bob" } }
  ],
  "edges": [
    { "src": 0, "dst": 1, "type": "KNOWS", "properties": { "bad": [1,2] } },
    { "src": 1, "dst": 1, "type": "SELF", "properties": { "since": 2020 } }
  ]
}"#,
        )
        .expect("write graph payload");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_json_import(graph_payload.to_str().expect("json path"), &mut batcher)
                .expect("continue mode should skip bad graph records");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.processed_records, 4);
            assert_eq!(progress.imported_nodes, 1);
            assert_eq!(progress.imported_edges, 2);
            assert_eq!(progress.skipped_records, 1);
        }

        let legacy_payload = temp_file_path("json-stream-legacy", "json");
        fs::write(&legacy_payload, r#"[{"src":0,"dst":1}]"#).expect("write legacy payload");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, false);
            stream_json_import(legacy_payload.to_str().expect("json path"), &mut batcher)
                .expect("legacy edge list import");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.imported_edges, 1);
        }

        let jsonl_payload = temp_file_path("jsonl-stream-helpers", "jsonl");
        fs::write(
            &jsonl_payload,
            "\n{\"src\":0,\"dst\":0}\n{\"kind\":\"unknown\"}\n",
        )
        .expect("write jsonl payload");
        {
            let mut batcher = ImportBatcher::new(&mut db, 8, true);
            stream_jsonl_import(jsonl_payload.to_str().expect("jsonl path"), &mut batcher)
                .expect("jsonl import with skip");
            let progress = batcher.finish().expect("finish");
            assert_eq!(progress.processed_records, 2);
            assert_eq!(progress.imported_edges, 1);
            assert_eq!(progress.skipped_records, 1);
        }

        fs::remove_file(&graph_payload).expect("cleanup graph payload");
        fs::remove_file(&legacy_payload).expect("cleanup legacy payload");
        fs::remove_file(&jsonl_payload).expect("cleanup jsonl payload");
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn export_helpers_cover_filters_and_existing_destination_checks() {
        let path = temp_db_path("export-helper-coverage");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let mut db = Database::open(&path).expect("open db");
        let _ = db
            .create_node_with(&["Person".to_string()], &PropertyMap::new())
            .expect("n0");
        let _ = db
            .create_node_with(&["Person".to_string()], &PropertyMap::new())
            .expect("n1");
        let _ = db
            .add_typed_edge(0, 1, "WORKS_AT", &PropertyMap::new())
            .expect("e0");
        let _ = db
            .add_typed_edge(0, 0, "KNOWS", &PropertyMap::new())
            .expect("e1");

        let (nodes, edges) = collect_export_subset(
            &db,
            Some("Person"),
            Some("KNOWS"),
            Some(NodeIdRange { start: 0, end: 1 }),
        )
        .expect("collect subset");
        assert_eq!(nodes.len(), 2);
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].edge_type.as_deref(), Some("KNOWS"));

        let (company_nodes, company_edges) = collect_export_subset(
            &db,
            Some("Company"),
            None,
            Some(NodeIdRange { start: 0, end: 1 }),
        )
        .expect("collect subset with non-matching label");
        assert!(company_nodes.is_empty());
        assert!(company_edges.is_empty());

        let existing_csv_base = temp_file_path("export-helper-existing-csv", "csv");
        fs::write(&existing_csv_base, "taken").expect("write existing csv base");
        let csv_exists_err = write_export_csv_bundle(
            existing_csv_base.to_str().expect("csv base"),
            &nodes,
            &edges,
        )
        .expect_err("existing csv base should fail");
        assert!(csv_exists_err
            .to_string()
            .contains("export destination already exists"));

        let existing_jsonl = temp_file_path("export-helper-existing-jsonl", "jsonl");
        fs::write(&existing_jsonl, "taken").expect("write existing jsonl");
        let jsonl_exists_err =
            write_export_jsonl_file(existing_jsonl.to_str().expect("jsonl path"), &nodes, &edges)
                .expect_err("existing jsonl destination should fail");
        assert!(jsonl_exists_err
            .to_string()
            .contains("export destination already exists"));

        fs::remove_file(&existing_csv_base).expect("cleanup existing csv base");
        fs::remove_file(&existing_jsonl).expect("cleanup existing jsonl");
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn neighbors_rejects_wrong_argument_count() {
        let out = run(&["neighbors".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb neighbors <path> <src>"));
    }

    #[test]
    fn neighbors_rejects_non_numeric_source() {
        let path = temp_db_path("neighbors-bad-src");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "neighbors".to_string(),
            path.display().to_string(),
            "abc".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("invalid value"));
        assert!(out.stderr.contains("src"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn neighbors_returns_runtime_error_for_unknown_source() {
        let path = temp_db_path("neighbors-unknown-src");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "neighbors".to_string(),
            path.display().to_string(),
            "99".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("unknown node id"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn traversal_commands_support_machine_readable_formats() {
        let path = temp_db_path("traversal-formats");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "2".to_string(),
        ]);

        let neighbors_json = run(&vec![
            "neighbors".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "--format".to_string(),
            "json".to_string(),
        ]);
        assert_eq!(neighbors_json.exit_code, 0);
        let neighbors_value: serde_json::Value =
            serde_json::from_str(&neighbors_json.stdout).expect("valid neighbors json");
        assert_eq!(neighbors_value["row_count"], 1);
        assert_eq!(neighbors_value["rows"][0]["src"], "0");
        assert_eq!(neighbors_value["rows"][0]["dst"], "1");

        let incoming_tsv = run(&vec![
            "incoming".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "--format".to_string(),
            "tsv".to_string(),
        ]);
        assert_eq!(incoming_tsv.exit_code, 0);
        assert_eq!(incoming_tsv.stdout.trim(), "dst\tsrc\n1\t0");

        let hop_jsonl = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "2".to_string(),
            "--format".to_string(),
            "jsonl".to_string(),
        ]);
        assert_eq!(hop_jsonl.exit_code, 0);
        let hop_lines: Vec<&str> = hop_jsonl.stdout.lines().collect();
        assert_eq!(hop_lines.len(), 2);

        let hop_in_csv = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "2".to_string(),
            "2".to_string(),
            "--format".to_string(),
            "csv".to_string(),
        ]);
        assert_eq!(hop_in_csv.exit_code, 0);
        assert!(hop_in_csv
            .stdout
            .starts_with("dst,hops,level,node\n2,2,1,1\n2,2,2,0"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn traversal_commands_reject_bad_format_flags() {
        let path = temp_db_path("traversal-format-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let neighbors_bad = run(&vec![
            "neighbors".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "--format".to_string(),
            "xml".to_string(),
        ]);
        assert_eq!(neighbors_bad.exit_code, 2);
        assert!(neighbors_bad.stderr.contains("invalid value"));
        assert!(neighbors_bad.stderr.contains("xml"));

        let incoming_missing = run(&vec![
            "incoming".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "--format".to_string(),
        ]);
        assert_eq!(incoming_missing.exit_code, 2);
        assert!(incoming_missing.stderr.contains("--format"));

        let hop_unknown = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--x".to_string(),
        ]);
        assert_eq!(hop_unknown.exit_code, 2);
        assert!(hop_unknown.stderr.contains("unexpected argument"));

        let hop_in_unknown = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
            "--x".to_string(),
        ]);
        assert_eq!(hop_in_unknown.exit_code, 2);
        assert!(hop_in_unknown.stderr.contains("unexpected argument"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn incoming_command_returns_sources() {
        let path = temp_db_path("incoming-sources");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "2".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "2".to_string(),
        ]);

        let out = run(&vec![
            "incoming".to_string(),
            path.display().to_string(),
            "2".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("dst=2"));
        assert!(out.stdout.contains("count=2"));
        assert!(out.stdout.contains("incoming=0,1"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn incoming_rejects_wrong_argument_count() {
        let out = run(&["incoming".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb incoming <path> <dst>"));
    }

    #[test]
    fn incoming_rejects_non_numeric_destination() {
        let path = temp_db_path("incoming-bad-dst");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let out = run(&vec![
            "incoming".to_string(),
            path.display().to_string(),
            "abc".to_string(),
        ]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("invalid value"));
        assert!(out.stderr.contains("dst"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn incoming_returns_runtime_error_for_unknown_destination() {
        let path = temp_db_path("incoming-unknown-dst");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "incoming".to_string(),
            path.display().to_string(),
            "99".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("unknown node id"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_in_command_returns_breadth_first_levels() {
        let path = temp_db_path("hop-in-levels");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "3".to_string(),
            "2".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "2".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let out = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "2".to_string(),
            "3".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("dst=2"));
        assert!(out.stdout.contains("hops=3"));
        assert!(out.stdout.contains("reachable_count=3"));
        assert!(out.stdout.contains("level1=3,1"));
        assert!(out.stdout.contains("level2=0"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_in_rejects_wrong_argument_count() {
        let out = run(&["hop-in".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb hop-in <path> <dst> <hops>"));
    }

    #[test]
    fn hop_in_rejects_non_numeric_arguments() {
        let path = temp_db_path("hop-in-bad-args");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let bad_dst = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "x".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(bad_dst.exit_code, 2);
        assert!(bad_dst.stderr.contains("invalid value"));
        assert!(bad_dst.stderr.contains("dst"));

        let bad_hops = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "x".to_string(),
        ]);
        assert_eq!(bad_hops.exit_code, 2);
        assert!(bad_hops.stderr.contains("invalid value"));
        assert!(bad_hops.stderr.contains("hops"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_in_returns_runtime_error_for_unknown_destination() {
        let path = temp_db_path("hop-in-unknown-dst");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "hop-in".to_string(),
            path.display().to_string(),
            "99".to_string(),
            "2".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out
            .stderr
            .contains("unknown node id for incoming hop traversal"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_command_returns_breadth_first_levels() {
        let path = temp_db_path("hop-levels");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "2".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "1".to_string(),
            "3".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "2".to_string(),
            "3".to_string(),
        ]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "3".to_string(),
            "4".to_string(),
        ]);

        let out = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "3".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("src=0"));
        assert!(out.stdout.contains("hops=3"));
        assert!(out.stdout.contains("reachable_count=4"));
        assert!(out.stdout.contains("level1=1,2"));
        assert!(out.stdout.contains("level2=3"));
        assert!(out.stdout.contains("level3=4"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_command_returns_empty_for_zero_hops() {
        let path = temp_db_path("hop-zero");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(out.exit_code, 0);
        assert!(out.stdout.contains("reachable_count=0"));
        assert!(!out.stdout.contains("level1="));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_rejects_wrong_argument_count() {
        let out = run(&["hop".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out
            .stderr
            .contains("usage: opengraphdb hop <path> <src> <hops>"));
    }

    #[test]
    fn hop_rejects_non_numeric_arguments() {
        let path = temp_db_path("hop-bad-args");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let bad_src = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "x".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(bad_src.exit_code, 2);
        assert!(bad_src.stderr.contains("invalid value"));
        assert!(bad_src.stderr.contains("src"));

        let bad_hops = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "x".to_string(),
        ]);
        assert_eq!(bad_hops.exit_code, 2);
        assert!(bad_hops.stderr.contains("invalid value"));
        assert!(bad_hops.stderr.contains("hops"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn hop_returns_runtime_error_for_unknown_source() {
        let path = temp_db_path("hop-unknown-src");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);

        let out = run(&vec![
            "hop".to_string(),
            path.display().to_string(),
            "99".to_string(),
            "2".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("unknown node id for hop traversal"));

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn mcp_rejects_wrong_argument_shape() {
        let out = run(&["mcp".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert!(out.stderr.contains("usage: opengraphdb mcp"));
    }

    #[test]
    fn mcp_rejects_invalid_mode_combinations_and_stdio_flags() {
        let path = temp_db_path("mcp-mode-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let no_mode = run(&vec!["mcp".to_string(), path.display().to_string()]);
        assert_eq!(no_mode.exit_code, 2);
        assert!(no_mode.stderr.contains("--request"));
        assert!(no_mode.stderr.contains("--stdio"));

        let missing_db_path = run(&vec!["mcp".to_string(), "--db".to_string()]);
        assert_eq!(missing_db_path.exit_code, 2);
        assert!(missing_db_path.stderr.contains("--db"));

        let both_modes = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}".to_string(),
            "--stdio".to_string(),
        ]);
        assert_eq!(both_modes.exit_code, 2);
        assert!(both_modes.stderr.contains("--request"));
        assert!(both_modes.stderr.contains("--stdio"));

        let max_without_stdio = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}".to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(max_without_stdio.exit_code, 2);
        assert!(max_without_stdio
            .stderr
            .contains("--max-requests is only valid with --stdio"));

        let missing_request_value = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
        ]);
        assert_eq!(missing_request_value.exit_code, 2);
        assert!(missing_request_value.stderr.contains("--request"));

        let missing_max_value = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--stdio".to_string(),
            "--max-requests".to_string(),
        ]);
        assert_eq!(missing_max_value.exit_code, 2);
        assert!(missing_max_value.stderr.contains("--max-requests"));

        let invalid_max = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--stdio".to_string(),
            "--max-requests".to_string(),
            "abc".to_string(),
        ]);
        assert_eq!(invalid_max.exit_code, 2);
        assert!(invalid_max.stderr.contains("invalid value"));

        let zero_max = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--stdio".to_string(),
            "--max-requests".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(zero_max.exit_code, 2);
        assert!(zero_max.stderr.contains("--max-requests"));

        let unknown_flag = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--not-a-flag".to_string(),
        ]);
        assert_eq!(unknown_flag.exit_code, 2);
        assert!(unknown_flag.stderr.contains("unexpected argument"));

        let stdio_ok = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--stdio".to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(stdio_ok.exit_code, 0);
        assert!(stdio_ok
            .stdout
            .contains("mcp_stdio_stopped requests_processed=0"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_supports_initialize_and_tools_list() {
        let path = temp_db_path("mcp-init-tools");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let initialize = run(&vec![
            "mcp".to_string(),
            "--db".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}".to_string(),
        ]);
        assert_eq!(initialize.exit_code, 0);
        let initialize_json: serde_json::Value =
            serde_json::from_str(&initialize.stdout).expect("valid initialize response");
        assert_eq!(initialize_json["result"]["serverInfo"]["name"], APP_NAME);
        assert_eq!(initialize_json["result"]["capabilities"]["tools"], true);

        let tools_list = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}".to_string(),
        ]);
        assert_eq!(tools_list.exit_code, 0);
        let tools_json: serde_json::Value =
            serde_json::from_str(&tools_list.stdout).expect("valid tools/list response");
        assert_eq!(tools_json["result"]["tools"][0]["name"], "browse_schema");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_tools_call_executes_query_and_reports_param_errors() {
        let path = temp_db_path("mcp-tools-call");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let ok_default_format = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\"}}".to_string(),
        ]);
        assert_eq!(ok_default_format.exit_code, 0);
        let ok_default_json: serde_json::Value =
            serde_json::from_str(&ok_default_format.stdout).expect("valid tools/call response");
        assert_eq!(ok_default_json["result"]["format"], "json");
        assert!(ok_default_json["result"]["output"]
            .as_str()
            .expect("string output")
            .contains("\"row_count\": 1"));

        let ok_tsv = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\",\"format\":\"tsv\"}}".to_string(),
        ]);
        assert_eq!(ok_tsv.exit_code, 0);
        let ok_tsv_json: serde_json::Value =
            serde_json::from_str(&ok_tsv.stdout).expect("valid tsv tools/call response");
        assert_eq!(ok_tsv_json["result"]["format"], "tsv");
        assert!(ok_tsv_json["result"]["output"]
            .as_str()
            .expect("string output")
            .contains("src\tdst"));

        let bad_params_type = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":[]}".to_string(),
        ]);
        assert_eq!(bad_params_type.exit_code, 0);
        let bad_params_type_json: serde_json::Value =
            serde_json::from_str(&bad_params_type.stdout).expect("valid mcp error response");
        assert_eq!(bad_params_type_json["error"]["code"], -32602);
        assert!(bad_params_type_json["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("params must be an object"));

        let missing_query = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{}}".to_string(),
        ]);
        assert_eq!(missing_query.exit_code, 0);
        let missing_query_json: serde_json::Value =
            serde_json::from_str(&missing_query.stdout).expect("valid mcp error response");
        assert_eq!(missing_query_json["error"]["code"], -32602);
        assert!(missing_query_json["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("params.query must be a string"));

        let unsupported_format = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\",\"format\":\"xml\"}}".to_string(),
        ]);
        assert_eq!(unsupported_format.exit_code, 0);
        let unsupported_format_json: serde_json::Value =
            serde_json::from_str(&unsupported_format.stdout).expect("valid mcp error response");
        assert_eq!(unsupported_format_json["error"]["code"], -32602);
        assert!(unsupported_format_json["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("unsupported --format value"));

        let bad_query = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"query\":\"gibberish tokens\"}}".to_string(),
        ]);
        assert_eq!(bad_query.exit_code, 0);
        let bad_query_json: serde_json::Value =
            serde_json::from_str(&bad_query.stdout).expect("valid mcp error response");
        assert_eq!(bad_query_json["error"]["code"], -32602);
        assert!(bad_query_json["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("unsupported query"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_reports_jsonrpc_parse_protocol_and_method_errors() {
        let path = temp_db_path("mcp-errors");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let parse_error = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{".to_string(),
        ]);
        assert_eq!(parse_error.exit_code, 0);
        let parse_error_json: serde_json::Value =
            serde_json::from_str(&parse_error.stdout).expect("valid mcp parse-error response");
        assert_eq!(parse_error_json["error"]["code"], -32700);

        let invalid_jsonrpc = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"1.0\",\"id\":9,\"method\":\"tools/list\"}".to_string(),
        ]);
        assert_eq!(invalid_jsonrpc.exit_code, 0);
        let invalid_jsonrpc_json: serde_json::Value =
            serde_json::from_str(&invalid_jsonrpc.stdout).expect("valid mcp error response");
        assert_eq!(invalid_jsonrpc_json["error"]["code"], -32600);

        let method_not_found = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":10,\"method\":\"unknown/method\"}".to_string(),
        ]);
        assert_eq!(method_not_found.exit_code, 0);
        let method_not_found_json: serde_json::Value =
            serde_json::from_str(&method_not_found.stdout).expect("valid mcp error response");
        assert_eq!(method_not_found_json["error"]["code"], -32601);
        assert!(method_not_found_json["error"]["message"]
            .as_str()
            .expect("error message")
            .contains("method not found"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_stdio_session_processes_requests_and_respects_max_requests() {
        let path = temp_db_path("mcp-stdio-session");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let input = concat!(
            "\n",
            "{\"jsonrpc\":\"2.0\",\"id\":21,\"method\":\"tools/list\"}\n",
            "{\"jsonrpc\":\"2.0\",\"id\":22,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\"}}\n"
        );
        let mut reader = BufReader::new(input.as_bytes());
        let mut output = Vec::<u8>::new();
        let processed = run_mcp_stdio_session(
            &path.display().to_string(),
            &mut reader,
            &mut output,
            Some(1),
        )
        .expect("stdio session should succeed");
        assert_eq!(processed, 1);

        let rendered = String::from_utf8(output).expect("utf8 output");
        let lines: Vec<&str> = rendered.lines().collect();
        assert_eq!(lines.len(), 1);
        let first: serde_json::Value =
            serde_json::from_str(lines[0]).expect("valid compact json line");
        assert_eq!(first["id"], 21);
        assert!(first.get("result").is_some());

        let input_all = concat!(
            "{\"jsonrpc\":\"2.0\",\"id\":23,\"method\":\"tools/list\"}\n",
            "{\"jsonrpc\":\"2.0\",\"id\":24,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\",\"format\":\"csv\"}}\n",
            "{\n"
        );
        let mut reader_all = BufReader::new(input_all.as_bytes());
        let mut output_all = Vec::<u8>::new();
        let processed_all = run_mcp_stdio_session(
            &path.display().to_string(),
            &mut reader_all,
            &mut output_all,
            None,
        )
        .expect("stdio full session should succeed");
        assert_eq!(processed_all, 3);

        let rendered_all = String::from_utf8(output_all).expect("utf8 output");
        let lines_all: Vec<&str> = rendered_all.lines().collect();
        assert_eq!(lines_all.len(), 3);
        let list_resp: serde_json::Value =
            serde_json::from_str(lines_all[0]).expect("valid list response");
        assert_eq!(list_resp["id"], 23);
        let csv_resp: serde_json::Value =
            serde_json::from_str(lines_all[1]).expect("valid csv response");
        assert_eq!(csv_resp["id"], 24);
        assert_eq!(csv_resp["result"]["format"], "csv");
        let parse_err: serde_json::Value =
            serde_json::from_str(lines_all[2]).expect("valid parse error response");
        assert_eq!(parse_err["error"]["code"], -32700);

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_tools_list_includes_extended_graph_tools() {
        let path = temp_db_path("mcp-tools-extended-list");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let tools_list = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            "{\"jsonrpc\":\"2.0\",\"id\":41,\"method\":\"tools/list\"}".to_string(),
        ]);
        assert_eq!(tools_list.exit_code, 0);
        let tools_json: serde_json::Value =
            serde_json::from_str(&tools_list.stdout).expect("valid tools/list response");
        let names = tools_json["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert!(names.contains(&"query"));
        assert!(names.contains(&"schema"));
        assert!(names.contains(&"upsert_node"));
        assert!(names.contains(&"upsert_edge"));
        assert!(names.contains(&"subgraph"));
        assert!(names.contains(&"shortest_path"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_tools_list_includes_full_ai_agent_surface() {
        let path = temp_db_path("mcp-tools-ai-list");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let tools_list = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 401,
                "method": "tools/list"
            })
            .to_string(),
        ]);
        assert_eq!(tools_list.exit_code, 0);
        let tools_json: Value =
            serde_json::from_str(&tools_list.stdout).expect("valid tools/list response");
        let names = tools_json["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect::<Vec<_>>();

        assert!(names.contains(&"vector_search"));
        assert!(names.contains(&"text_search"));
        assert!(names.contains(&"temporal_diff"));
        assert!(names.contains(&"import_rdf"));
        assert!(names.contains(&"export_rdf"));
        assert!(names.contains(&"agent_store_episode"));
        assert!(names.contains(&"agent_recall"));
        assert!(names.contains(&"rag_build_summaries"));
        assert!(names.contains(&"rag_retrieve"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_extended_tools_round_trip_for_schema_upsert_and_path_queries() {
        let path = temp_db_path("mcp-tools-extended-roundtrip");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let upsert_n0 = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":42,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Alice","properties":{"age":30}}}}"#.to_string(),
        ]);
        assert_eq!(upsert_n0.exit_code, 0);
        let upsert_n0_json: serde_json::Value =
            serde_json::from_str(&upsert_n0.stdout).expect("valid upsert node response");
        assert_eq!(upsert_n0_json["result"]["node_id"], 0);
        assert_eq!(upsert_n0_json["result"]["created"], true);

        let upsert_n1 = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":43,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Bob","properties":{"age":32}}}}"#.to_string(),
        ]);
        assert_eq!(upsert_n1.exit_code, 0);
        let upsert_n1_json: serde_json::Value =
            serde_json::from_str(&upsert_n1.stdout).expect("valid second upsert node response");
        assert_eq!(upsert_n1_json["result"]["node_id"], 1);
        assert_eq!(upsert_n1_json["result"]["created"], true);

        let update_n0 = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":431,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Alice","properties":{"age":31}}}}"#.to_string(),
        ]);
        assert_eq!(update_n0.exit_code, 0);
        let update_n0_json: serde_json::Value =
            serde_json::from_str(&update_n0.stdout).expect("valid update node response");
        assert_eq!(update_n0_json["result"]["node_id"], 0);
        assert_eq!(update_n0_json["result"]["created"], false);

        let upsert_edge = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":44,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":1,"edge_type":"KNOWS","properties":{"since":2020}}}}"#.to_string(),
        ]);
        assert_eq!(upsert_edge.exit_code, 0);
        let upsert_edge_json: serde_json::Value =
            serde_json::from_str(&upsert_edge.stdout).expect("valid upsert edge response");
        assert_eq!(upsert_edge_json["result"]["created"], true);
        assert_eq!(upsert_edge_json["result"]["src"], 0);
        assert_eq!(upsert_edge_json["result"]["dst"], 1);

        let update_edge = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":441,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":1,"edge_type":"KNOWS","properties":{"since":2021}}}}"#.to_string(),
        ]);
        assert_eq!(update_edge.exit_code, 0);
        let update_edge_json: serde_json::Value =
            serde_json::from_str(&update_edge.stdout).expect("valid update edge response");
        assert_eq!(update_edge_json["result"]["created"], false);

        let schema = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":45,"method":"tools/call","params":{"name":"schema","arguments":{}}}"#.to_string(),
        ]);
        assert_eq!(schema.exit_code, 0);
        let schema_json: serde_json::Value =
            serde_json::from_str(&schema.stdout).expect("valid schema response");
        assert!(schema_json["result"]["labels"]
            .as_array()
            .expect("labels array")
            .iter()
            .any(|label| label == "Person"));
        assert!(schema_json["result"]["edge_types"]
            .as_array()
            .expect("edge types array")
            .iter()
            .any(|edge_type| edge_type == "KNOWS"));

        let subgraph = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":46,"method":"tools/call","params":{"name":"subgraph","arguments":{"node_id":0,"hops":1}}}"#.to_string(),
        ]);
        assert_eq!(subgraph.exit_code, 0);
        let subgraph_json: serde_json::Value =
            serde_json::from_str(&subgraph.stdout).expect("valid subgraph response");
        assert_eq!(subgraph_json["result"]["center"], 0);
        assert_eq!(
            subgraph_json["result"]["nodes"]
                .as_array()
                .expect("nodes array")
                .len(),
            2
        );
        assert_eq!(
            subgraph_json["result"]["edges"]
                .as_array()
                .expect("edges array")
                .len(),
            1
        );

        let shortest_path = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":47,"method":"tools/call","params":{"name":"shortest_path","arguments":{"src":0,"dst":1}}}"#.to_string(),
        ]);
        assert_eq!(shortest_path.exit_code, 0);
        let shortest_path_json: serde_json::Value =
            serde_json::from_str(&shortest_path.stdout).expect("valid shortest_path response");
        assert_eq!(shortest_path_json["result"]["found"], true);
        assert_eq!(shortest_path_json["result"]["length"], 1);
        let path_nodes = shortest_path_json["result"]["path"]
            .as_array()
            .expect("path array");
        assert_eq!(path_nodes, &vec![Value::from(0), Value::from(1)]);
        let edge_path = shortest_path_json["result"]["edge_path"]
            .as_array()
            .expect("edge_path array");
        assert_eq!(edge_path.len(), 1);
        assert_eq!(
            shortest_path_json["result"]["total_weight"],
            Value::from(1.0)
        );

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_full_ai_tools_round_trip_and_stdio_mode() {
        let path = temp_db_path("mcp-tools-ai-roundtrip");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        {
            let mut db = Database::open(&path).expect("open db for seed");
            let n0 = db
                .create_node_with(
                    &["Doc".to_string()],
                    &PropertyMap::from([
                        (
                            "content".to_string(),
                            PropertyValue::String("alpha retrieval memory".to_string()),
                        ),
                        (
                            "embedding".to_string(),
                            PropertyValue::Vector(vec![1.0, 0.0]),
                        ),
                    ]),
                )
                .expect("create n0");
            let n1 = db
                .create_node_with(
                    &["Doc".to_string()],
                    &PropertyMap::from([
                        (
                            "content".to_string(),
                            PropertyValue::String("beta retrieval memory".to_string()),
                        ),
                        (
                            "embedding".to_string(),
                            PropertyValue::Vector(vec![0.0, 1.0]),
                        ),
                    ]),
                )
                .expect("create n1");
            db.add_typed_edge(
                n0,
                n1,
                "LINK",
                &PropertyMap::from([
                    ("valid_from".to_string(), PropertyValue::I64(100)),
                    ("valid_to".to_string(), PropertyValue::I64(200)),
                ]),
            )
            .expect("create temporal edge");
            db.create_vector_index(
                "doc_embedding_idx",
                Some("Doc"),
                "embedding",
                2,
                VectorDistanceMetric::Cosine,
            )
            .expect("create vector index");
            db.create_fulltext_index("doc_text_idx", Some("Doc"), &["content".to_string()])
                .expect("create fulltext index");
        }

        let call_tool = |id: i64, name: &str, arguments: Value| -> Value {
            let request = serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": "tools/call",
                "params": {
                    "name": name,
                    "arguments": arguments,
                }
            });
            let out = run(&vec![
                "mcp".to_string(),
                path.display().to_string(),
                "--request".to_string(),
                request.to_string(),
            ]);
            assert_eq!(out.exit_code, 0);
            serde_json::from_str(&out.stdout).expect("valid mcp tool response")
        };

        let vector_search = call_tool(
            402,
            "vector_search",
            serde_json::json!({
                "index_name": "doc_embedding_idx",
                "query_vector": [1.0, 0.0],
                "k": 2
            }),
        );
        assert!(
            vector_search["result"]["results"]
                .as_array()
                .expect("vector results array")
                .len()
                >= 1
        );

        let text_search = call_tool(
            403,
            "text_search",
            serde_json::json!({
                "index_name": "doc_text_idx",
                "query_text": "alpha",
                "k": 2
            }),
        );
        assert!(
            text_search["result"]["results"]
                .as_array()
                .expect("text results array")
                .len()
                >= 1
        );

        let temporal_diff = call_tool(
            404,
            "temporal_diff",
            serde_json::json!({
                "timestamp_a": 150,
                "timestamp_b": 250
            }),
        );
        assert_eq!(temporal_diff["result"]["snapshot_a"]["edge_count"], 1);
        assert_eq!(temporal_diff["result"]["snapshot_b"]["edge_count"], 0);

        let store_episode = call_tool(
            405,
            "agent_store_episode",
            serde_json::json!({
                "agent_id": "agent-a",
                "session_id": "s-1",
                "content": "alpha memory",
                "embedding": [1.0, 0.0],
                "timestamp": 123,
                "metadata": {"source": "mcp"}
            }),
        );
        assert!(store_episode["result"]["episode_id"].as_u64().is_some());

        let recall_episode = call_tool(
            406,
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "k": 5
            }),
        );
        assert!(!recall_episode["result"]["episodes"]
            .as_array()
            .expect("episode recall array")
            .is_empty());

        let rag_summaries = call_tool(
            407,
            "rag_build_summaries",
            serde_json::json!({
                "resolution": 1.0
            }),
        );
        assert!(!rag_summaries["result"]["summaries"]
            .as_array()
            .expect("rag summaries array")
            .is_empty());

        let rag_retrieve = call_tool(
            408,
            "rag_retrieve",
            serde_json::json!({
                "query_embedding": [1.0, 0.0],
                "query_text": "alpha",
                "k": 3,
                "alpha": 0.5
            }),
        );
        assert!(!rag_retrieve["result"]["results"]
            .as_array()
            .expect("rag results array")
            .is_empty());

        let rdf_input = temp_file_path("mcp-tools-ai-import", "ttl");
        let rdf_output = temp_file_path("mcp-tools-ai-export", "ttl");
        fs::write(
            &rdf_input,
            "@prefix ex: <http://example.com/> .\nex:a ex:knows ex:b .\n",
        )
        .expect("write rdf input");

        let import_rdf = call_tool(
            409,
            "import_rdf",
            serde_json::json!({
                "src_path": rdf_input.display().to_string(),
                "format": "ttl"
            }),
        );
        assert!(
            import_rdf["result"]["imported_nodes"]
                .as_u64()
                .expect("imported_nodes")
                >= 1
        );

        let export_rdf = call_tool(
            410,
            "export_rdf",
            serde_json::json!({
                "dst_path": rdf_output.display().to_string(),
                "format": "ttl"
            }),
        );
        assert!(
            export_rdf["result"]["exported_triples"]
                .as_u64()
                .expect("exported_triples")
                >= 1
        );
        assert!(rdf_output.exists());

        let stdio_input = format!(
            "{}\n{}\n",
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 411,
                "method": "tools/call",
                "params": {
                    "name": "agent_recall",
                    "arguments": {
                        "agent_id": "agent-a",
                        "query_embedding": [1.0, 0.0],
                        "k": 1
                    }
                }
            }),
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 412,
                "method": "tools/call",
                "params": {
                    "name": "rag_retrieve",
                    "arguments": {
                        "query_embedding": [1.0, 0.0],
                        "query_text": "alpha",
                        "k": 2,
                        "alpha": 0.5
                    }
                }
            })
        );
        let mut reader = BufReader::new(stdio_input.as_bytes());
        let mut output = Vec::<u8>::new();
        let processed = run_mcp_stdio_session(
            &path.display().to_string(),
            &mut reader,
            &mut output,
            Some(2),
        )
        .expect("mcp stdio ai tools session");
        assert_eq!(processed, 2);
        let rendered = String::from_utf8(output).expect("utf8 stdio output");
        let lines = rendered.lines().collect::<Vec<_>>();
        assert_eq!(lines.len(), 2);
        let first: Value = serde_json::from_str(lines[0]).expect("first stdio response");
        let second: Value = serde_json::from_str(lines[1]).expect("second stdio response");
        assert_eq!(first["id"], 411);
        assert_eq!(second["id"], 412);
        assert!(first["result"].is_object());
        assert!(second["result"].is_object());

        fs::remove_file(&rdf_input).expect("cleanup rdf input");
        fs::remove_file(&rdf_output).expect("cleanup rdf output");
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_ai_argument_helpers_cover_parser_and_validation_branches() {
        let path = temp_db_path("mcp-ai-arg-branches");
        let db_path = path.display().to_string();
        let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared db");
        shared
            .with_write(|db| {
                let n0 = db
                    .create_node_with(
                        &["Doc".to_string()],
                        &PropertyMap::from([
                            (
                                "content".to_string(),
                                PropertyValue::String("alpha retrieval memory".to_string()),
                            ),
                            (
                                "embedding".to_string(),
                                PropertyValue::Vector(vec![1.0, 0.0]),
                            ),
                        ]),
                    )
                    .expect("create n0");
                let n1 = db
                    .create_node_with(
                        &["Doc".to_string()],
                        &PropertyMap::from([
                            (
                                "content".to_string(),
                                PropertyValue::String("beta retrieval memory".to_string()),
                            ),
                            (
                                "embedding".to_string(),
                                PropertyValue::Vector(vec![0.0, 1.0]),
                            ),
                        ]),
                    )
                    .expect("create n1");
                db.add_typed_edge(n0, n1, "LINK", &PropertyMap::new())
                    .expect("add edge n0->n1");
                db.add_typed_edge(n1, n0, "LINK", &PropertyMap::new())
                    .expect("add edge n1->n0");
                db.create_vector_index(
                    "doc_embedding_idx",
                    Some("Doc"),
                    "embedding",
                    2,
                    VectorDistanceMetric::Cosine,
                )
                .expect("create vector index");
                db.create_fulltext_index("doc_text_idx", Some("Doc"), &["content".to_string()])
                    .expect("create fulltext index");
                db.store_episode("agent-a", "s-1", "alpha memory", &[1.0, 0.0], 10, "{}")
                    .expect("seed episode");
                Ok(())
            })
            .expect("seed data");

        let call = |name: &str, arguments: Value| {
            execute_mcp_tools_call(
                &db_path,
                Some(serde_json::json!({
                    "name": name,
                    "arguments": arguments
                })),
            )
        };

        for metric in ["cosine", "euclidean", "dot_product"] {
            let result = call(
                "vector_search",
                serde_json::json!({
                    "index_name": "doc_embedding_idx",
                    "query_vector": [1.0, 0.0],
                    "k": 2,
                    "metric": metric
                }),
            )
            .expect("metric variant should succeed");
            assert!(result["results"].is_array());
        }

        let bad_metric_err = call(
            "vector_search",
            serde_json::json!({
                "index_name": "doc_embedding_idx",
                "query_vector": [1.0, 0.0],
                "metric": "bad"
            }),
        )
        .expect_err("invalid metric should fail");
        assert!(bad_metric_err.contains("must be one of cosine|euclidean|dot"));

        let empty_vector_err = call(
            "vector_search",
            serde_json::json!({
                "index_name": "doc_embedding_idx",
                "query_vector": []
            }),
        )
        .expect_err("empty query vector should fail");
        assert!(empty_vector_err.contains("must include at least one number"));

        let non_numeric_vector_err = call(
            "vector_search",
            serde_json::json!({
                "index_name": "doc_embedding_idx",
                "query_vector": [1.0, "x"]
            }),
        )
        .expect_err("non-numeric query vector should fail");
        assert!(non_numeric_vector_err.contains("must be an array of numbers"));

        let rag_default_alpha = call(
            "rag_retrieve",
            serde_json::json!({
                "query_embedding": [1.0, 0.0],
                "query_text": "alpha",
                "k": 2
            }),
        )
        .expect("rag default alpha should succeed");
        assert!(rag_default_alpha["results"].is_array());

        let rag_with_community = call(
            "rag_retrieve",
            serde_json::json!({
                "query_embedding": [1.0, 0.0],
                "query_text": "alpha",
                "k": 2,
                "alpha": 0.5,
                "community_id": 0
            }),
        )
        .expect("rag with community_id should succeed");
        assert!(rag_with_community["results"].is_array());

        let bad_alpha_err = call(
            "rag_retrieve",
            serde_json::json!({
                "query_embedding": [1.0, 0.0],
                "query_text": "alpha",
                "alpha": 1.5
            }),
        )
        .expect_err("alpha outside range should fail");
        assert!(bad_alpha_err.contains("arguments.alpha must be between 0.0 and 1.0"));

        let bad_community_err = call(
            "rag_retrieve",
            serde_json::json!({
                "query_embedding": [1.0, 0.0],
                "query_text": "alpha",
                "community_id": "x"
            }),
        )
        .expect_err("community_id must be u64");
        assert!(bad_community_err.contains("arguments.community_id must be an unsigned integer"));

        let recall_array_range = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": [0, 100]
            }),
        )
        .expect("array time range should succeed");
        assert!(recall_array_range["episodes"].is_array());

        let recall_object_range = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": {"start": 0, "end": 100}
            }),
        )
        .expect("object time range should succeed");
        assert!(recall_object_range["episodes"].is_array());

        let short_range_err = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": [0]
            }),
        )
        .expect_err("short time_range should fail");
        assert!(short_range_err.contains("must be [start,end] or {start,end}"));

        let inverted_range_err = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": {"start": 100, "end": 0}
            }),
        )
        .expect_err("inverted time_range should fail");
        assert!(inverted_range_err.contains("arguments.time_range.start must be <="));

        let wrong_shape_range_err = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": "bad"
            }),
        )
        .expect_err("string time_range should fail");
        assert!(wrong_shape_range_err.contains("must be [start,end] or {start,end}"));

        let huge_start_range_err = call(
            "agent_recall",
            serde_json::json!({
                "agent_id": "agent-a",
                "query_embedding": [1.0, 0.0],
                "time_range": {"start": 9223372036854775808u64, "end": 9223372036854775808u64}
            }),
        )
        .expect_err("time_range.start outside i64 should fail");
        assert!(huge_start_range_err.contains("arguments.time_range.start must be an integer"));

        let batch_size_zero_err = call(
            "import_rdf",
            serde_json::json!({
                "src_path": "/tmp/does-not-matter.ttl",
                "batch_size": 0
            }),
        )
        .expect_err("batch_size=0 should fail before reading source");
        assert!(batch_size_zero_err.contains("arguments.batch_size must be > 0"));

        let store_default_metadata = call(
            "agent_store_episode",
            serde_json::json!({
                "agent_id": "agent-a",
                "session_id": "s-2",
                "content": "without metadata",
                "embedding": [1.0, 0.0],
                "timestamp": 20
            }),
        )
        .expect("default metadata branch should succeed");
        assert!(store_default_metadata["episode_id"].is_u64());

        let store_string_metadata = call(
            "agent_store_episode",
            serde_json::json!({
                "agent_id": "agent-a",
                "session_id": "s-3",
                "content": "string metadata",
                "embedding": [1.0, 0.0],
                "timestamp": 30,
                "metadata": "{\"source\":\"string\"}"
            }),
        )
        .expect("string metadata branch should succeed");
        assert!(store_string_metadata["episode_id"].is_u64());

        assert!(matches!(
            mcp_parse_rdf_import_format("nt"),
            Ok(RdfImportFormatArg::Nt)
        ));
        assert!(matches!(
            mcp_parse_rdf_import_format("rdf"),
            Ok(RdfImportFormatArg::Xml)
        ));
        assert!(matches!(
            mcp_parse_rdf_import_format("json"),
            Ok(RdfImportFormatArg::Jsonld)
        ));
        assert!(matches!(
            mcp_parse_rdf_import_format("nq"),
            Ok(RdfImportFormatArg::Nq)
        ));
        assert!(mcp_parse_rdf_import_format("bad").is_err());

        assert!(matches!(
            mcp_parse_rdf_export_format("nt"),
            Ok(RdfExportFormatArg::Nt)
        ));
        assert!(matches!(
            mcp_parse_rdf_export_format("rdf"),
            Ok(RdfExportFormatArg::Xml)
        ));
        assert!(matches!(
            mcp_parse_rdf_export_format("json"),
            Ok(RdfExportFormatArg::Jsonld)
        ));
        assert!(mcp_parse_rdf_export_format("bad").is_err());

        let key_value = mcp_parse_key_value_output(
            "enabled=true\nready=false\ncount=7\nbig=18446744073709551615\nratio=3.5\n",
        );
        assert_eq!(key_value["enabled"], Value::Bool(true));
        assert_eq!(key_value["ready"], Value::Bool(false));
        assert_eq!(key_value["count"], Value::from(7));
        assert_eq!(key_value["big"], Value::from(18446744073709551615u64));
        assert_eq!(key_value["ratio"], Value::from(3.5));

        let fallback = mcp_parse_key_value_output("raw output");
        assert_eq!(fallback["output"], Value::String("raw output".to_string()));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_upsert_edge_merges_properties_for_existing_edge() {
        let path = temp_db_path("mcp-upsert-edge-merge");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        {
            let mut db = Database::open(&path).expect("open db for seed");
            let _ = db.create_node().expect("seed node");
        }

        let create_edge = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":48,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":0,"edge_type":"SELF","properties":{"since":2020}}}}"#.to_string(),
        ]);
        assert_eq!(create_edge.exit_code, 0);
        let create_edge_json: Value =
            serde_json::from_str(&create_edge.stdout).expect("create edge response json");
        assert_eq!(create_edge_json["result"]["created"], true);

        let update_edge = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":49,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":0,"edge_type":"SELF","properties":{"since":2021,"strength":9}}}}"#.to_string(),
        ]);
        assert_eq!(update_edge.exit_code, 0);
        let update_edge_json: Value =
            serde_json::from_str(&update_edge.stdout).expect("update edge response json");
        assert_eq!(update_edge_json["result"]["created"], false);

        let db = Database::open(&path).expect("open db");
        let props = db.edge_properties(0).expect("edge properties");
        assert_eq!(props.get("since"), Some(&PropertyValue::I64(2021)));
        assert_eq!(props.get("strength"), Some(&PropertyValue::I64(9)));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn execute_mcp_upsert_edge_tool_updates_existing_edge_directly() {
        let path = temp_db_path("mcp-upsert-edge-direct");
        let mut db = Database::init(&path, Header::default_v1()).expect("init db");
        let _ = db.create_node().expect("node 0");
        let _ = db.create_node().expect("node 1");
        let _ = db
            .add_typed_edge(0, 1, "KNOWS", &PropertyMap::new())
            .expect("seed typed edge");
        drop(db);

        let args = serde_json::json!({
            "src": 0,
            "dst": 1,
            "edge_type": "KNOWS",
            "properties": {
                "since": 2022,
                "strength": 8
            }
        });
        let args_object = args.as_object().expect("args object").clone();

        let result = execute_mcp_upsert_edge_tool(&path.display().to_string(), &args_object)
            .expect("upsert edge direct");
        assert_eq!(result["created"], false);
        assert_eq!(result["edge_type"], "KNOWS");

        let empty_args = serde_json::json!({
            "src": 0,
            "dst": 1,
            "edge_type": "KNOWS"
        });
        let empty_args_object = empty_args.as_object().expect("empty args object").clone();
        let empty_update =
            execute_mcp_upsert_edge_tool(&path.display().to_string(), &empty_args_object)
                .expect("upsert existing edge without properties");
        assert_eq!(empty_update["created"], false);

        let db = Database::open(&path).expect("open db");
        let props = db.edge_properties(0).expect("edge props");
        assert_eq!(props.get("since"), Some(&PropertyValue::I64(2022)));
        assert_eq!(props.get("strength"), Some(&PropertyValue::I64(8)));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn mcp_extended_tools_cover_validation_and_untyped_edge_paths() {
        let path = temp_db_path("mcp-tools-extended-validation");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let schema_no_args = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":51,"method":"tools/call","params":{"name":"schema"}}"#
                .to_string(),
        ]);
        assert_eq!(schema_no_args.exit_code, 0);
        let schema_no_args_json: serde_json::Value =
            serde_json::from_str(&schema_no_args.stdout).expect("schema without args response");
        assert!(schema_no_args_json.get("result").is_some());

        let unknown_tool = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":52,"method":"tools/call","params":{"name":"unknown_tool","arguments":{}}}"#.to_string(),
        ]);
        assert_eq!(unknown_tool.exit_code, 0);
        let unknown_tool_json: serde_json::Value =
            serde_json::from_str(&unknown_tool.stdout).expect("unknown tool response");
        assert_eq!(unknown_tool_json["error"]["code"], -32602);
        assert!(unknown_tool_json["error"]["message"]
            .as_str()
            .expect("unknown tool error text")
            .contains("unknown tool"));

        let empty_label = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":53,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":" ","match_key":"name","match_value":"Alice"}}}"#.to_string(),
        ]);
        assert_eq!(empty_label.exit_code, 0);
        let empty_label_json: serde_json::Value =
            serde_json::from_str(&empty_label.stdout).expect("empty label response");
        assert_eq!(empty_label_json["error"]["code"], -32602);
        assert!(empty_label_json["error"]["message"]
            .as_str()
            .expect("empty label error text")
            .contains("cannot be empty"));

        let bad_edge_props = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":54,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":0,"properties":"not-an-object"}}}"#.to_string(),
        ]);
        assert_eq!(bad_edge_props.exit_code, 0);
        let bad_edge_props_json: serde_json::Value =
            serde_json::from_str(&bad_edge_props.stdout).expect("bad edge props response");
        assert_eq!(bad_edge_props_json["error"]["code"], -32602);
        assert!(bad_edge_props_json["error"]["message"]
            .as_str()
            .expect("bad edge props error text")
            .contains("properties must be an object"));

        let _ = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":55,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Alice"}}}"#.to_string(),
        ]);
        let _ = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":56,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Bob"}}}"#.to_string(),
        ]);
        let _ = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":57,"method":"tools/call","params":{"name":"upsert_node","arguments":{"label":"Person","match_key":"name","match_value":"Carol"}}}"#.to_string(),
        ]);

        let untyped_edge_no_props = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":58,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":0,"dst":1}}}"#.to_string(),
        ]);
        assert_eq!(untyped_edge_no_props.exit_code, 0);
        let untyped_edge_no_props_json: serde_json::Value =
            serde_json::from_str(&untyped_edge_no_props.stdout).expect("untyped edge response");
        assert_eq!(untyped_edge_no_props_json["result"]["created"], true);

        let untyped_edge_with_props = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":59,"method":"tools/call","params":{"name":"upsert_edge","arguments":{"src":1,"dst":2,"properties":{"weight":1.5}}}}"#.to_string(),
        ]);
        assert_eq!(untyped_edge_with_props.exit_code, 0);
        let untyped_edge_with_props_json: serde_json::Value =
            serde_json::from_str(&untyped_edge_with_props.stdout).expect("untyped edge+props");
        assert_eq!(untyped_edge_with_props_json["result"]["created"], true);

        let missing_path = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"shortest_path","arguments":{"src":2,"dst":0}}}"#.to_string(),
        ]);
        assert_eq!(missing_path.exit_code, 0);
        let missing_path_json: serde_json::Value =
            serde_json::from_str(&missing_path.stdout).expect("missing shortest path response");
        assert_eq!(missing_path_json["result"]["found"], false);
        assert_eq!(missing_path_json["result"]["length"], 0);

        let max_hops_overflow = run(&vec![
            "mcp".to_string(),
            path.display().to_string(),
            "--request".to_string(),
            r#"{"jsonrpc":"2.0","id":601,"method":"tools/call","params":{"name":"shortest_path","arguments":{"src":0,"dst":1,"max_hops":4294967296}}}"#.to_string(),
        ]);
        assert_eq!(max_hops_overflow.exit_code, 0);
        let max_hops_overflow_json: serde_json::Value =
            serde_json::from_str(&max_hops_overflow.stdout).expect("max_hops overflow response");
        assert_eq!(max_hops_overflow_json["error"]["code"], -32602);
        assert!(max_hops_overflow_json["error"]["message"]
            .as_str()
            .expect("max_hops overflow error text")
            .contains("arguments.max_hops must fit in u32"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_rejects_usage_and_bad_flags() {
        let missing = run(&["serve".to_string()]);
        assert_eq!(missing.exit_code, 2);
        assert_eq!(
            missing.stderr,
            "database path required: provide <path> or --db"
        );

        let missing_db_path = run(&vec!["serve".to_string(), "--db".to_string()]);
        assert_eq!(missing_db_path.exit_code, 2);
        assert!(missing_db_path.stderr.contains("--db"));

        let missing_bind_value = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--bind".to_string(),
        ]);
        assert_eq!(missing_bind_value.exit_code, 2);
        assert!(missing_bind_value.stderr.contains("--bind"));

        let missing_max_value = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--max-requests".to_string(),
        ]);
        assert_eq!(missing_max_value.exit_code, 2);
        assert!(missing_max_value.stderr.contains("--max-requests"));

        let missing_port_value = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--port".to_string(),
        ]);
        assert_eq!(missing_port_value.exit_code, 2);
        assert!(missing_port_value.stderr.contains("--port"));

        let non_numeric_max = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--max-requests".to_string(),
            "abc".to_string(),
        ]);
        assert_eq!(non_numeric_max.exit_code, 2);
        assert!(non_numeric_max.stderr.contains("invalid value"));

        let zero_max = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--max-requests".to_string(),
            "0".to_string(),
        ]);
        assert_eq!(zero_max.exit_code, 2);
        assert!(zero_max.stderr.contains("--max-requests"));

        let unknown_flag = run(&vec![
            "serve".to_string(),
            "x.ogdb".to_string(),
            "--unknown".to_string(),
        ]);
        assert_eq!(unknown_flag.exit_code, 2);
        assert!(unknown_flag.stderr.contains("unexpected argument"));
    }

    #[test]
    fn resolve_serve_bind_addr_defaults_and_port_override() {
        assert_eq!(
            resolve_serve_bind_addr(None, None, ServeProtocol::Mcp),
            "127.0.0.1:7687"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, None, ServeProtocol::Bolt),
            "0.0.0.0:7687"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, None, ServeProtocol::Http),
            "127.0.0.1:8080"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, None, ServeProtocol::Grpc),
            "0.0.0.0:7689"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, Some(17687), ServeProtocol::Mcp),
            "127.0.0.1:17687"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, Some(17688), ServeProtocol::Bolt),
            "0.0.0.0:17688"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, Some(18092), ServeProtocol::Http),
            "127.0.0.1:18092"
        );
        assert_eq!(
            resolve_serve_bind_addr(None, Some(17689), ServeProtocol::Grpc),
            "0.0.0.0:17689"
        );
        assert_eq!(
            resolve_serve_bind_addr(Some("0.0.0.0:7000"), Some(18092), ServeProtocol::Http),
            "0.0.0.0:7000"
        );
    }

    #[cfg(not(feature = "grpc"))]
    #[test]
    fn serve_grpc_mode_reports_feature_gate_when_disabled() {
        let missing_path = temp_db_path("serve-grpc-disabled");
        let out = run(&vec![
            "serve".to_string(),
            missing_path.display().to_string(),
            "--grpc".to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("gRPC support is not enabled"));
    }

    #[test]
    fn serve_returns_runtime_error_for_missing_database() {
        let path = temp_db_path("serve-missing-db");
        let out = run(&vec![
            "serve".to_string(),
            path.display().to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("io error"));
    }

    #[test]
    fn serve_accepts_http_port_flag() {
        // HTTP mode auto-creates the database on missing path, so the
        // original "missing DB + io error" shape no longer errors out — the
        // serve loop would bind the port and block on accept forever,
        // wedging CI. Rewritten to spawn-serve-then-kill: open an ephemeral
        // port, boot serve with --port, send one health GET to trip
        // max-requests=1, and join the serve thread through an mpsc channel
        // bounded by a timeout so a future regression (e.g. serve ignoring
        // --max-requests) fails fast instead of hanging the suite.
        use std::sync::mpsc;

        let path = temp_db_path("serve-accepts-http-port");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let requested_port = probe.local_addr().expect("probe local addr").port();
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--port".to_string(),
            requested_port.to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ];
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let _ = tx.send(run(&serve_args));
        });
        let addr = format!("127.0.0.1:{requested_port}");

        let (health_status, _health_type, _health_body) =
            send_http_request(&addr, "GET", "/health", &[], &[]);
        assert_eq!(health_status, 200);

        let serve_result = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("serve thread must exit within 10s after max-requests=1 is satisfied");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result
            .stdout
            .contains("listening on http://127.0.0.1:"));
        assert!(serve_result.stdout.contains(&addr));
        assert!(serve_result.stdout.contains("requests_processed=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_returns_runtime_error_when_bind_address_is_in_use() {
        let path = temp_db_path("serve-bind-in-use");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let guard = TcpListener::bind("127.0.0.1:0").expect("bind guard listener");
        let addr = guard.local_addr().expect("guard local addr");
        let out = run(&vec![
            "serve".to_string(),
            path.display().to_string(),
            "--bind".to_string(),
            addr.to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ]);
        assert_eq!(out.exit_code, 1);
        assert!(out.stderr.contains("failed to bind"));

        drop(guard);
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_processes_single_tcp_request_when_max_requests_is_set() {
        let path = temp_db_path("serve-one-request");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            "--db".to_string(),
            path.display().to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));

        let mut stream = connect_with_retry(&bind_addr.to_string());
        stream
            .write_all(
                b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\",\"format\":\"jsonl\"}}\n",
            )
            .expect("write request");
        stream.flush().expect("flush request");

        let mut line = String::new();
        let mut reader = BufReader::new(stream);
        reader.read_line(&mut line).expect("read response line");
        let response_json: serde_json::Value =
            serde_json::from_str(line.trim()).expect("valid json response");
        assert_eq!(response_json["id"], 1);
        assert_eq!(response_json["result"]["format"], "jsonl");
        let output = response_json["result"]["output"]
            .as_str()
            .expect("query output as string");
        let output_row: serde_json::Value =
            serde_json::from_str(output.trim()).expect("valid jsonl row");
        assert_eq!(output_row["src"], "0");
        assert_eq!(output_row["dst"], "1");

        let serve_result = handle.join().expect("join serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("listening on mcp://"));
        assert!(serve_result.stdout.contains(&bind_addr.to_string()));
        assert!(serve_result.stdout.contains("serve_stopped"));
        assert!(serve_result.stdout.contains("requests_processed=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_handles_empty_lines_and_connection_rollover_before_max() {
        let path = temp_db_path("serve-empty-and-rollover");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec!["create-node".to_string(), path.display().to_string()]);
        let _ = run(&vec![
            "add-edge".to_string(),
            path.display().to_string(),
            "0".to_string(),
            "1".to_string(),
        ]);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "2".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));

        let mut stream1 = connect_with_retry(&bind_addr.to_string());
        stream1.write_all(b"\n").expect("write empty line");
        stream1
            .write_all(
                b"{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\"}}\n",
            )
            .expect("write first request");
        stream1.flush().expect("flush first request");
        let mut response1 = String::new();
        let mut reader1 = BufReader::new(stream1);
        reader1
            .read_line(&mut response1)
            .expect("read first response");
        let response1_json: serde_json::Value =
            serde_json::from_str(response1.trim()).expect("valid first response");
        assert_eq!(response1_json["id"], 11);

        drop(reader1);

        let mut stream2 = connect_with_retry(&bind_addr.to_string());
        stream2
            .write_all(
                b"{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"tools/call\",\"params\":{\"query\":\"neighbors 0\",\"format\":\"csv\"}}\n",
            )
            .expect("write second request");
        stream2.flush().expect("flush second request");
        let mut response2 = String::new();
        let mut reader2 = BufReader::new(stream2);
        reader2
            .read_line(&mut response2)
            .expect("read second response");
        let response2_json: serde_json::Value =
            serde_json::from_str(response2.trim()).expect("valid second response");
        assert_eq!(response2_json["id"], 12);
        assert_eq!(response2_json["result"]["format"], "csv");

        let serve_result = handle.join().expect("join serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("requests_processed=2"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_bolt_handshake_and_query_round_trip() {
        let path = temp_db_path("serve-bolt-roundtrip");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let seeded = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person".to_string(),
            "--props".to_string(),
            "name=string:Alice".to_string(),
        ]);
        assert_eq!(seeded.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--bolt".to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));

        let mut stream = connect_with_retry_timeout(&bind_addr.to_string(), Duration::from_secs(2));
        stream
            .write_all(&[
                0x60, 0x60, 0xB0, 0x17, // magic
                0x00, 0x00, 0x00, 0x01, // v1
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
                0x00, 0x00, 0x00, 0x00, // v0
            ])
            .expect("write handshake");
        stream.flush().expect("flush handshake");

        let mut negotiated = [0u8; 4];
        stream
            .read_exact(&mut negotiated)
            .expect("read negotiated version");
        assert_eq!(u32::from_be_bytes(negotiated), 1);

        let init_message = bolt_pack_struct(
            0x01,
            &[
                bolt_pack_value_string("ogdb-test"),
                bolt_pack_value_string(""),
            ],
        );
        bolt_write_message(&mut stream, &init_message);
        let init_response = bolt_read_message(&mut stream);
        assert_eq!(bolt_message_signature(&init_response), 0x70);

        let run_message = bolt_pack_struct(
            0x10,
            &[
                bolt_pack_value_string("MATCH (n:Person) RETURN n.name AS name"),
                bolt_pack_value_map(&[]),
            ],
        );
        bolt_write_message(&mut stream, &run_message);
        let run_response = bolt_read_message(&mut stream);
        assert_eq!(bolt_message_signature(&run_response), 0x70);

        let pull_message = bolt_pack_struct(0x3F, &[]);
        bolt_write_message(&mut stream, &pull_message);

        let record_response = bolt_read_message(&mut stream);
        assert_eq!(bolt_message_signature(&record_response), 0x71);
        assert!(
            record_response
                .windows("Alice".len())
                .any(|window| window == b"Alice"),
            "record payload should contain returned value"
        );

        let pull_success = bolt_read_message(&mut stream);
        assert_eq!(bolt_message_signature(&pull_success), 0x70);

        let serve_result = handle.join().expect("join bolt serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("listening on bolt://"));
        assert!(serve_result.stdout.contains(&bind_addr.to_string()));
        assert!(serve_result.stdout.contains("serve_stopped"));
        assert!(serve_result.stdout.contains("requests_processed=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_http_supports_query_health_and_csv_negotiation() {
        let path = temp_db_path("serve-http-roundtrip");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);
        let seeded = run(&vec![
            "create-node".to_string(),
            path.display().to_string(),
            "--labels".to_string(),
            "Person".to_string(),
            "--props".to_string(),
            "name=string:Alice".to_string(),
        ]);
        assert_eq!(seeded.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "4".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));
        let addr = bind_addr.to_string();

        let (health_status, health_type, health_body) =
            send_http_request(&addr, "GET", "/health", &[], &[]);
        assert_eq!(health_status, 200);
        assert!(health_type.starts_with("application/json"));
        let health_json: serde_json::Value =
            serde_json::from_slice(&health_body).expect("health body json");
        assert_eq!(health_json["status"], "ok");

        let query_payload = br#"{"query":"MATCH (n:Person) RETURN n.name AS name"}"#;
        let (query_status, query_type, query_body) = send_http_request(
            &addr,
            "POST",
            "/query",
            &[
                ("Content-Type", "application/json"),
                ("Accept", "application/json"),
            ],
            query_payload,
        );
        assert_eq!(query_status, 200);
        assert!(query_type.starts_with("application/json"));
        let query_json: serde_json::Value =
            serde_json::from_slice(&query_body).expect("query body json");
        assert_eq!(query_json["row_count"], 1);

        let (csv_status, csv_type, csv_body) = send_http_request(
            &addr,
            "POST",
            "/query",
            &[("Content-Type", "application/json"), ("Accept", "text/csv")],
            br#"{"query":"MATCH (n:Person) RETURN n.name AS name"}"#,
        );
        assert_eq!(csv_status, 200);
        assert!(csv_type.starts_with("text/csv"));
        let csv_text = String::from_utf8(csv_body).expect("csv response utf8");
        assert!(csv_text.contains("name"));
        assert!(csv_text.contains("Alice"));

        let (schema_status, schema_type, schema_body) =
            send_http_request(&addr, "GET", "/schema", &[], &[]);
        assert_eq!(schema_status, 200);
        assert!(schema_type.starts_with("application/json"));
        let schema_json: serde_json::Value =
            serde_json::from_slice(&schema_body).expect("schema response json");
        assert!(schema_json["labels"]
            .as_array()
            .expect("labels array")
            .iter()
            .any(|value| value == "Person"));

        let serve_result = handle.join().expect("join http serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("listening on http://"));
        assert!(serve_result.stdout.contains(&bind_addr.to_string()));
        assert!(serve_result.stdout.contains("requests_processed=4"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_http_port_flag_binds_loopback_with_requested_port() {
        let path = temp_db_path("serve-http-port-loopback");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let requested_port = probe.local_addr().expect("probe local addr").port();
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--port".to_string(),
            requested_port.to_string(),
            "--max-requests".to_string(),
            "1".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));
        let addr = format!("127.0.0.1:{requested_port}");

        let (health_status, _health_type, _health_body) =
            send_http_request(&addr, "GET", "/health", &[], &[]);
        assert_eq!(health_status, 200);

        let serve_result = handle.join().expect("join http serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result
            .stdout
            .contains("listening on http://127.0.0.1:"));
        assert!(serve_result.stdout.contains(&addr));
        assert!(serve_result.stdout.contains("requests_processed=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    // Regression: POST /query used to run synchronously with no execution
    // budget, so a single pathological query (e.g. Cartesian product over a
    // huge graph) would pin the accept loop and starve every other client.
    // The handler now caps each query at http_query_exec_timeout() and
    // returns 504 on expiry while keeping the server up. We validate the
    // contract by driving a fast query past a deliberately tiny budget via
    // the OGDB_HTTP_QUERY_TIMEOUT_MS / OGDB_TEST_QUERY_DELAY_MS env hooks.
    #[test]
    fn serve_http_enforces_per_query_execution_timeout() {
        let path = temp_db_path("serve-http-query-timeout");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        // Inject: query budget 80ms, simulated per-query delay 800ms. Forces
        // a timeout on the server side without depending on query complexity.
        // Env must be set in the parent before the serve thread reads it.
        env::set_var("OGDB_HTTP_QUERY_TIMEOUT_MS", "80");
        env::set_var("OGDB_TEST_QUERY_DELAY_MS", "800");

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "2".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));
        let addr = bind_addr.to_string();

        // First request: slow query → 504 after budget elapses.
        let (slow_status, _slow_type, slow_body) = send_http_request(
            &addr,
            "POST",
            "/query",
            &[("Content-Type", "application/json")],
            br#"{"query":"MATCH (n) RETURN n"}"#,
        );
        assert_eq!(
            slow_status, 504,
            "expected 504 Gateway Timeout, got {slow_status} body={:?}",
            String::from_utf8_lossy(&slow_body)
        );
        let slow_text = String::from_utf8_lossy(&slow_body);
        assert!(
            slow_text.contains("exceeded") && slow_text.contains("80"),
            "timeout body must cite the budget: {slow_text}"
        );

        // Clear the injected delay so we can confirm the server kept serving.
        env::set_var("OGDB_TEST_QUERY_DELAY_MS", "0");
        let (fast_status, _fast_type, _fast_body) = send_http_request(
            &addr,
            "GET",
            "/health",
            &[],
            &[],
        );
        assert_eq!(
            fast_status, 200,
            "server must stay up after a timed-out query"
        );

        env::remove_var("OGDB_HTTP_QUERY_TIMEOUT_MS");
        env::remove_var("OGDB_TEST_QUERY_DELAY_MS");

        let serve_result = handle.join().expect("join http serve thread");
        assert_eq!(serve_result.exit_code, 0);
        // The eprintln cancellation log goes to the test harness (captured by
        // cargo's stderr), not via CliResult. The 504 body + serve-up probe
        // above already prove the budget kicked in; serve_result asserts the
        // loop kept serving both requests after the timeout.
        assert!(serve_result.stdout.contains("requests_processed=2"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_http_processes_concurrent_requests() {
        let path = temp_db_path("serve-http-concurrency");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "6".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));
        let addr = bind_addr.to_string();

        let mut workers = Vec::<thread::JoinHandle<(u16, String)>>::new();
        for _ in 0..6 {
            let addr_clone = addr.clone();
            workers.push(thread::spawn(move || {
                let (status, _content_type, body) = send_http_request(
                    &addr_clone,
                    "POST",
                    "/query",
                    &[("Content-Type", "application/json")],
                    br#"{"query":"RETURN 1 AS one"}"#,
                );
                (status, String::from_utf8(body).expect("utf8 body"))
            }));
        }

        for worker in workers {
            let (status, body) = worker.join().expect("join worker");
            assert_eq!(status, 200);
            assert!(body.contains("\"row_count\""));
        }

        let serve_result = handle.join().expect("join http serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("requests_processed=6"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_http_import_and_export_endpoints_round_trip() {
        let path = temp_db_path("serve-http-import-export");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let bind_addr = probe.local_addr().expect("probe local addr");
        drop(probe);

        let serve_args = vec![
            "serve".to_string(),
            path.display().to_string(),
            "--http".to_string(),
            "--bind".to_string(),
            bind_addr.to_string(),
            "--max-requests".to_string(),
            "2".to_string(),
        ];
        let handle = thread::spawn(move || run(&serve_args));
        let addr = bind_addr.to_string();

        let import_payload = br#"{"nodes":[{"id":0,"labels":["Person"],"properties":{"name":"Alice"}}],"edges":[{"src":0,"dst":0,"type":"KNOWS","properties":{"since":2020}}]}"#;
        let (import_status, import_type, import_body) = send_http_request(
            &addr,
            "POST",
            "/import",
            &[
                ("Content-Type", "application/json"),
                ("Accept", "application/json"),
            ],
            import_payload,
        );
        assert_eq!(import_status, 200);
        assert!(import_type.starts_with("application/json"));
        let import_json: serde_json::Value =
            serde_json::from_slice(&import_body).expect("import response json");
        assert_eq!(import_json["status"], "ok");
        assert_eq!(import_json["imported_nodes"], 1);
        assert_eq!(import_json["imported_edges"], 1);

        let (export_status, export_type, export_body) =
            send_http_request(&addr, "POST", "/export", &[("Accept", "text/csv")], &[]);
        assert_eq!(export_status, 200);
        assert!(export_type.starts_with("text/csv"));
        let export_csv = String::from_utf8(export_body).expect("export csv utf8");
        assert!(export_csv.contains("kind,id,src,dst,type,labels,properties"));
        assert!(export_csv.contains("node"));
        assert!(export_csv.contains("Alice"));

        let serve_result = handle.join().expect("join http serve thread");
        assert_eq!(serve_result.exit_code, 0);
        assert!(serve_result.stdout.contains("requests_processed=2"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn http_dispatch_helpers_cover_remaining_paths() {
        let path = temp_db_path("http-dispatch-helpers");
        let shared = SharedDatabase::init(&path, Header::default_v1()).expect("init shared");
        let db_path = path.to_str().expect("utf8 path");
        shared
            .with_write(|db| {
                let alice = db
                    .create_node_with(
                        &["Person".to_string()],
                        &PropertyMap::from([(
                            "name".to_string(),
                            PropertyValue::String("Alice".to_string()),
                        )]),
                    )
                    .expect("seed alice");
                let bob = db
                    .create_node_with(
                        &["Person".to_string()],
                        &PropertyMap::from([(
                            "name".to_string(),
                            PropertyValue::String("Bob".to_string()),
                        )]),
                    )
                    .expect("seed bob");
                let _ = db
                    .add_typed_edge(
                        alice,
                        bob,
                        "KNOWS",
                        &PropertyMap::from([("since".to_string(), PropertyValue::I64(2020))]),
                    )
                    .expect("seed edge");
                let _ = db
                    .create_node_with(
                        &["Person".to_string()],
                        &PropertyMap::from([(
                            "name".to_string(),
                            PropertyValue::String("Charlie".to_string()),
                        )]),
                    )
                    .expect("seed charlie");
                Ok(())
            })
            .expect("seed shared");
        shared
            .with_write(|db| {
                db.create_user("api", Some("token-api"))?;
                db.grant_role("api", DbRole::ReadWrite)?;
                Ok(())
            })
            .expect("seed user");

        let metrics = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "GET".to_string(),
                path: "/metrics".to_string(),
                headers: HashMap::new(),
                body: Vec::new(),
            },
        )
        .expect("metrics response");
        assert_eq!(metrics.status, 200);
        assert!(metrics.content_type.starts_with("text/plain"));

        let ok_query = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/query".to_string(),
                headers: HashMap::from([(
                    "content-type".to_string(),
                    "application/json".to_string(),
                )]),
                body: br#"{"query":"RETURN 1 AS one"}"#.to_vec(),
            },
        )
        .expect("query response");
        assert_eq!(ok_query.status, 200);

        let prometheus = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "GET".to_string(),
                path: "/metrics/prometheus".to_string(),
                headers: HashMap::new(),
                body: Vec::new(),
            },
        )
        .expect("prometheus response");
        assert_eq!(prometheus.status, 200);
        assert!(prometheus.content_type.starts_with("text/plain"));
        let prometheus_body = String::from_utf8(prometheus.body).expect("prometheus utf8");
        assert!(prometheus_body.contains("ogdb_node_count "));
        assert!(prometheus_body.contains("ogdb_query_count_total "));
        assert!(prometheus_body.contains("ogdb_query_duration_seconds_total "));

        let unauthorized = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/query".to_string(),
                headers: HashMap::from([
                    ("content-type".to_string(), "application/json".to_string()),
                    ("authorization".to_string(), "Bearer bad-token".to_string()),
                ]),
                body: br#"{"query":"RETURN 1 AS one"}"#.to_vec(),
            },
        )
        .expect("unauthorized response");
        assert_eq!(unauthorized.status, 401);

        let authorized = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/query".to_string(),
                headers: HashMap::from([
                    ("content-type".to_string(), "application/json".to_string()),
                    ("authorization".to_string(), "Bearer token-api".to_string()),
                ]),
                body: br#"{"query":"RETURN 1 AS one"}"#.to_vec(),
            },
        )
        .expect("authorized response");
        assert_eq!(authorized.status, 200);

        // Post-M2 (audit 2026-04-23b): missing-query is a client error, so
        // /query returns `Ok(http_error(400, ...))` instead of bubbling up
        // as a `CliError::Runtime` that the caller-generic wrapper would
        // surface as 500.
        let bad_query = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/query".to_string(),
                headers: HashMap::from([(
                    "content-type".to_string(),
                    "application/json".to_string(),
                )]),
                body: br#"{}"#.to_vec(),
            },
        )
        .expect("missing query returns formed response");
        assert_eq!(bad_query.status, 400);
        let bad_query_body = String::from_utf8(bad_query.body).expect("body utf8");
        assert!(
            bad_query_body.contains("query payload"),
            "body should mention payload: {bad_query_body}"
        );

        let unsupported_import = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/import".to_string(),
                headers: HashMap::from([
                    (
                        "content-type".to_string(),
                        "application/octet-stream".to_string(),
                    ),
                    (
                        "authorization".to_string(),
                        "Bearer token-api".to_string(),
                    ),
                ]),
                body: Vec::new(),
            },
        )
        .expect("unsupported import content type should be handled");
        assert_eq!(unsupported_import.status, 415);

        let unsupported_export = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/export".to_string(),
                headers: HashMap::from([
                    ("content-type".to_string(), "text/plain".to_string()),
                    (
                        "authorization".to_string(),
                        "Bearer token-api".to_string(),
                    ),
                ]),
                body: br#"{"label":"Person"}"#.to_vec(),
            },
        )
        .expect("unsupported export content type should be handled");
        assert_eq!(unsupported_export.status, 415);

        let export_json = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/export".to_string(),
                headers: HashMap::from([(
                    "authorization".to_string(),
                    "Bearer token-api".to_string(),
                )]),
                body: br#"{"label":"Person","edge_type":"KNOWS","node_id_range":"0:0"}"#.to_vec(),
            },
        )
        .expect("export json response");
        assert_eq!(export_json.status, 200);
        assert!(export_json.content_type.starts_with("application/json"));
        let filtered_export_payload: Value =
            serde_json::from_slice(&export_json.body).expect("filtered export payload json");
        assert!(filtered_export_payload["nodes"].is_array());
        assert!(filtered_export_payload["edges"].is_array());

        let export_with_edges = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/export".to_string(),
                headers: HashMap::from([(
                    "authorization".to_string(),
                    "Bearer token-api".to_string(),
                )]),
                body: Vec::new(),
            },
        )
        .expect("full export response");
        assert_eq!(export_with_edges.status, 200);
        let full_export_payload: Value =
            serde_json::from_slice(&export_with_edges.body).expect("full export payload json");
        let edges = full_export_payload["edges"]
            .as_array()
            .expect("edges array in full export");
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0]["src"], 0);
        assert_eq!(edges[0]["dst"], 1);
        assert_eq!(edges[0]["type"], "KNOWS");
        assert_eq!(edges[0]["properties"]["since"], 2020);

        let bad_export_payload = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "POST".to_string(),
                path: "/export".to_string(),
                headers: HashMap::from([(
                    "authorization".to_string(),
                    "Bearer token-api".to_string(),
                )]),
                body: br#"[]"#.to_vec(),
            },
        )
        .expect_err("non-object export payload should error");
        assert!(bad_export_payload
            .to_string()
            .contains("export payload must be a json object"));

        let unknown = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "GET".to_string(),
                path: "/missing-endpoint".to_string(),
                headers: HashMap::new(),
                body: Vec::new(),
            },
        )
        .expect("unknown endpoint response");
        assert_eq!(unknown.status, 404);

        let method_not_allowed = dispatch_http_request(
            &shared,
            db_path,
            HttpRequestMessage {
                method: "PUT".to_string(),
                path: "/health".to_string(),
                headers: HashMap::new(),
                body: Vec::new(),
            },
        )
        .expect("method not allowed response");
        assert_eq!(method_not_allowed.status, 405);

        let json_err = http_error(400, "Bad Request", "bad");
        assert_eq!(json_err.status, 400);
        assert!(json_err.content_type.starts_with("application/json"));

        let legacy_records = parse_http_json_import_records(br#"[{"src":0,"dst":0}]"#)
            .expect("legacy json import parse");
        assert_eq!(legacy_records.len(), 1);

        let csv_nodes = "id,labels,name,age\n0,Person|Admin,Alice,42\n";
        let node_records =
            parse_http_csv_import_records(csv_nodes.as_bytes()).expect("csv node records parse");
        assert_eq!(node_records.len(), 1);
        let csv_nodes_with_empty_header = "id,labels,name,\n0,Person,Alice,\n";
        let node_records_with_empty_header =
            parse_http_csv_import_records(csv_nodes_with_empty_header.as_bytes())
                .expect("csv node records with empty header parse");
        assert_eq!(node_records_with_empty_header.len(), 1);
        let csv_nodes_with_empty_property = "id,labels,name\n0,Person,\n";
        let empty_property_node_records =
            parse_http_csv_import_records(csv_nodes_with_empty_property.as_bytes())
                .expect("csv node records with empty property parse");
        assert!(matches!(
            &empty_property_node_records[0],
            ImportRecord::Node(node) if !node.properties.contains_key("name")
        ));
        let malformed_node_csv =
            parse_http_csv_import_records("id,labels,name\n0,Person,Alice,extra\n".as_bytes())
                .expect_err("malformed node csv row should fail");
        assert!(malformed_node_csv
            .to_string()
            .contains("invalid csv node row at line 2"));

        let csv_edges = "src,dst,type,weight\n0,1,KNOWS,1.25\n";
        let edge_records =
            parse_http_csv_import_records(csv_edges.as_bytes()).expect("csv edge records parse");
        assert_eq!(edge_records.len(), 1);
        let csv_edges_with_empty_header = "src,dst,type,\n0,1,KNOWS,\n";
        let edge_records_with_empty_header =
            parse_http_csv_import_records(csv_edges_with_empty_header.as_bytes())
                .expect("csv edge records with empty header parse");
        assert_eq!(edge_records_with_empty_header.len(), 1);
        let csv_edges_with_empty_property = "src,dst,type,weight\n0,1,KNOWS,\n";
        let edge_records_with_empty_property =
            parse_http_csv_import_records(csv_edges_with_empty_property.as_bytes())
                .expect("csv edge records with empty property parse");
        assert!(matches!(
            &edge_records_with_empty_property[0],
            ImportRecord::Edge(edge) if !edge.properties.contains_key("weight")
        ));
        let malformed_edge_csv =
            parse_http_csv_import_records("src,dst,type,weight\n0,1,KNOWS,1.25,extra\n".as_bytes())
                .expect_err("malformed edge csv row should fail");
        assert!(malformed_edge_csv
            .to_string()
            .contains("invalid csv edge row at line 2"));

        let csv_missing_headers = parse_http_csv_import_records("x,y\n1,2\n".as_bytes())
            .expect_err("csv missing headers should fail");
        assert!(csv_missing_headers
            .to_string()
            .contains("src+dst (edges) columns"));

        let export_csv = render_http_export_csv(
            &[ExportNode {
                id: 0,
                labels: vec!["Person".to_string()],
                properties: PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("Alice".to_string()),
                )]),
            }],
            &[ExportEdge {
                id: 0,
                src: 0,
                dst: 0,
                edge_type: Some("KNOWS".to_string()),
                properties: PropertyMap::new(),
                valid_from: None,
                valid_to: None,
                transaction_time_millis: 0,
            }],
        )
        .expect("render export csv");
        assert!(export_csv.contains("kind,id,src,dst,type,labels,properties"));
        assert!(export_csv.contains("KNOWS"));

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind http helper listener");
        let addr = listener.local_addr().expect("listener addr");
        let writer_thread = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let response = HttpResponseMessage {
                status: 200,
                reason: "OK",
                content_type: "application/json".to_string(),
                body: b"{}".to_vec(),
            };
            write_http_response(&mut stream, response).expect("write http response");
        });
        let stream = TcpStream::connect(addr).expect("connect helper listener");
        let _ = read_http_response(stream);
        writer_thread.join().expect("join writer thread");

        let listener_unknown_header =
            TcpListener::bind("127.0.0.1:0").expect("bind unknown-header listener");
        let addr_unknown_header = listener_unknown_header
            .local_addr()
            .expect("unknown-header listener addr");
        let unknown_header_thread = thread::spawn(move || {
            let (mut stream, _) = listener_unknown_header
                .accept()
                .expect("accept unknown-header");
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nX-No-Colon\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
                )
                .expect("write unknown-header response");
            stream.flush().expect("flush unknown-header response");
        });
        let unknown_header_stream =
            TcpStream::connect(addr_unknown_header).expect("connect unknown-header listener");
        let (unknown_status, unknown_type, unknown_body) =
            read_http_response(unknown_header_stream);
        assert_eq!(unknown_status, 200);
        assert!(unknown_type.starts_with("application/json"));
        assert_eq!(unknown_body, b"{}".to_vec());
        unknown_header_thread
            .join()
            .expect("join unknown-header thread");

        let listener_empty = TcpListener::bind("127.0.0.1:0").expect("bind empty http listener");
        let addr_empty = listener_empty.local_addr().expect("empty listener addr");
        let empty_thread = thread::spawn(move || {
            let (mut stream, _) = listener_empty.accept().expect("accept empty");
            stream.write_all(b"\r\n").expect("write blank line");
            stream.flush().expect("flush blank line");
        });
        let mut client = TcpStream::connect(addr_empty).expect("connect empty listener");
        let parsed = read_http_request(&mut client).expect("read blank request");
        assert!(matches!(parsed, HttpReadOutcome::Closed));
        empty_thread.join().expect("join empty thread");

        let listener_eof = TcpListener::bind("127.0.0.1:0").expect("bind eof listener");
        let addr_eof = listener_eof.local_addr().expect("eof listener addr");
        let eof_thread = thread::spawn(move || {
            let (_stream, _) = listener_eof.accept().expect("accept eof");
        });
        let mut eof_client = TcpStream::connect(addr_eof).expect("connect eof listener");
        let eof_request = read_http_request(&mut eof_client).expect("read eof request");
        assert!(matches!(eof_request, HttpReadOutcome::Closed));
        eof_thread.join().expect("join eof thread");

        let listener_header_eof =
            TcpListener::bind("127.0.0.1:0").expect("bind header-eof listener");
        let addr_header_eof = listener_header_eof
            .local_addr()
            .expect("header-eof listener addr");
        let header_eof_thread = thread::spawn(move || {
            let (mut stream, _) = listener_header_eof.accept().expect("accept header-eof");
            stream
                .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n")
                .expect("write header-only request");
            stream.flush().expect("flush header-only request");
        });
        let mut header_eof_client =
            TcpStream::connect(addr_header_eof).expect("connect header-eof listener");
        let header_eof_request = read_http_request(&mut header_eof_client)
            .expect("read header-eof request");
        let message = match header_eof_request {
            HttpReadOutcome::Request(msg) => msg,
            other => panic!("expected parsed header-eof request, got {other:?}"),
        };
        assert_eq!(message.method, "GET");
        assert_eq!(message.path, "/health");
        header_eof_thread.join().expect("join header-eof thread");

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn http_request_and_response_io_error_paths_are_reported() {
        let listener_bad_request =
            TcpListener::bind("127.0.0.1:0").expect("bind bad-request listener");
        let addr_bad_request = listener_bad_request
            .local_addr()
            .expect("bad-request listener addr");
        let bad_request_thread = thread::spawn(move || {
            let (mut stream, _) = listener_bad_request.accept().expect("accept bad-request");
            stream
                .write_all(&[0xFF, b'\n'])
                .expect("write invalid request bytes");
            stream.flush().expect("flush invalid request bytes");
        });
        let mut bad_request_client =
            TcpStream::connect(addr_bad_request).expect("connect bad-request listener");
        let bad_request_err = read_http_request(&mut bad_request_client)
            .expect_err("invalid request line should fail");
        assert!(bad_request_err
            .to_string()
            .contains("failed to read request line"));
        bad_request_thread.join().expect("join bad-request thread");

        let listener_bad_header =
            TcpListener::bind("127.0.0.1:0").expect("bind bad-header listener");
        let addr_bad_header = listener_bad_header
            .local_addr()
            .expect("bad-header listener addr");
        let bad_header_thread = thread::spawn(move || {
            let (mut stream, _) = listener_bad_header.accept().expect("accept bad-header");
            stream
                .write_all(b"GET /health HTTP/1.1\r\n")
                .expect("write valid request line");
            stream
                .write_all(&[0xFF, b'\r', b'\n'])
                .expect("write invalid header bytes");
            stream.flush().expect("flush invalid header bytes");
        });
        let mut bad_header_client =
            TcpStream::connect(addr_bad_header).expect("connect bad-header listener");
        let bad_header_err =
            read_http_request(&mut bad_header_client).expect_err("invalid header line should fail");
        assert!(bad_header_err
            .to_string()
            .contains("failed to read request header line"));
        bad_header_thread.join().expect("join bad-header thread");

        let listener_write_error =
            TcpListener::bind("127.0.0.1:0").expect("bind write-error listener");
        let addr_write_error = listener_write_error
            .local_addr()
            .expect("write-error listener addr");
        let write_error_thread = thread::spawn(move || {
            let (_stream, _) = listener_write_error.accept().expect("accept write-error");
            thread::sleep(Duration::from_millis(25));
        });
        let mut write_error_client =
            TcpStream::connect(addr_write_error).expect("connect write-error listener");
        write_error_client
            .shutdown(std::net::Shutdown::Write)
            .expect("shutdown client write half");
        let write_err = write_http_response(
            &mut write_error_client,
            HttpResponseMessage {
                status: 200,
                reason: "OK",
                content_type: "application/json".to_string(),
                body: b"{}".to_vec(),
            },
        )
        .expect_err("writing on a shut down stream should fail");
        assert!(write_err
            .to_string()
            .contains("failed to write http response"));
        write_error_thread.join().expect("join write-error thread");
    }

    #[test]
    fn http_serve_reports_bind_errors_and_timeout_helper_panics() {
        let path = temp_db_path("http-bind-error");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let guard = TcpListener::bind("127.0.0.1:0").expect("bind guard");
        let addr = guard.local_addr().expect("guard addr");
        let bind_err = handle_serve_http(&path.display().to_string(), &addr.to_string(), Some(1))
            .expect_err("bind in use should fail");
        assert!(bind_err.to_string().contains("failed to bind"));

        let timeout_panic = std::panic::catch_unwind(|| {
            let _ = connect_with_retry_timeout("127.0.0.1:0", Duration::from_millis(5));
        });
        assert!(timeout_panic.is_err());

        drop(guard);
        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn serve_http_handles_internal_errors_and_empty_connections() {
        let path = temp_db_path("http-internal-error");
        let init = run(&vec!["init".to_string(), path.display().to_string()]);
        assert_eq!(init.exit_code, 0);

        let probe = TcpListener::bind("127.0.0.1:0").expect("bind probe listener");
        let addr = probe.local_addr().expect("probe addr");
        drop(probe);

        let addr_string = addr.to_string();
        let path_for_thread = path.display().to_string();
        let bind_for_thread = addr_string.clone();
        let handle =
            thread::spawn(move || handle_serve_http(&path_for_thread, &bind_for_thread, Some(1)));

        let empty_connection = connect_with_retry_timeout(&addr_string, Duration::from_secs(2));
        drop(empty_connection);

        let (status, content_type, body) =
            send_http_request(&addr_string, "POST", "/export", &[], br#"[]"#);
        assert_eq!(status, 500);
        assert!(content_type.starts_with("application/json"));
        let body_json: Value = serde_json::from_slice(&body).expect("internal error response json");
        assert!(body_json["error"]
            .as_str()
            .expect("error string")
            .contains("json object"));

        let serve_result = handle.join().expect("join internal-error serve thread");
        let serve_output = serve_result.expect("serve should stop cleanly");
        assert!(serve_output.contains("requests_processed=1"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
    }

    #[test]
    fn info_rejects_wrong_argument_count() {
        let out = run(&["info".to_string()]);
        assert_eq!(out.exit_code, 2);
        assert_eq!(out.stderr, "database path required: provide <path> or --db");
    }

    #[test]
    fn error_display_is_human_readable() {
        let usage_err = CliError::Usage("usage error".to_string());
        let runtime_err = CliError::Runtime("runtime error".to_string());
        assert_eq!(usage_err.to_string(), "usage error");
        assert_eq!(runtime_err.to_string(), "runtime error");
    }

    #[test]
    fn query_rows_render_helpers_cover_all_formats() {
        let rows = QueryRows {
            columns: vec!["a".to_string(), "b".to_string()],
            rows: vec![vec!["1".to_string(), "x,y".to_string()]],
        };

        let json_text = rows.render(QueryOutputFormat::Json);
        assert!(json_text.contains("\"columns\""));
        let jsonl_text = rows.render(QueryOutputFormat::Jsonl);
        assert!(jsonl_text.contains("\"a\":\"1\""));
        let csv_text = rows.render(QueryOutputFormat::Csv);
        assert_eq!(csv_text, "a,b\n1,\"x,y\"");
        let tsv_text = rows.render(QueryOutputFormat::Tsv);
        assert_eq!(tsv_text, "a\tb\n1\tx,y");
        let table_text = rows.render(QueryOutputFormat::Table);
        assert!(table_text.is_empty());
    }

    #[test]
    fn escape_delimited_cell_quotes_when_needed() {
        assert_eq!(escape_delimited_cell("plain", ','), "plain");
        assert_eq!(escape_delimited_cell("a,b", ','), "\"a,b\"");
        assert_eq!(escape_delimited_cell("a\"b", ','), "\"a\"\"b\"");
        assert_eq!(escape_delimited_cell("a\nb", ','), "\"a\nb\"");
    }

    #[test]
    fn parse_query_plan_rejects_empty_string() {
        let err = parse_query_plan("").expect_err("empty query should be rejected");
        assert!(matches!(err, CliError::Usage(_)));
        assert!(err.to_string().contains("empty query string"));
    }

    #[test]
    fn execute_legacy_query_covers_find_property_and_label_paths() {
        let path = temp_db_path("legacy-find-coverage");
        let mut db = Database::init(&path, Header::default_v1()).expect("init");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("alice".to_string()),
                )]),
            )
            .expect("node 0");
        let _ = db
            .create_node_with(
                &["Person".to_string()],
                &PropertyMap::from([(
                    "name".to_string(),
                    PropertyValue::String("alice".to_string()),
                )]),
            )
            .expect("node 1");
        drop(db);

        let property =
            execute_legacy_query(&path.display().to_string(), "find nodes name=string:alice")
                .expect("find property");
        assert!(property.contains("property_key=name"));
        assert!(property.contains("count=2"));

        let label = execute_legacy_query(&path.display().to_string(), "find nodes label Person")
            .expect("find label");
        assert!(label.contains("label=Person"));
        assert!(label.contains("count=2"));

        fs::remove_file(&path).expect("cleanup db");
        fs::remove_file(wal_path(&path)).expect("cleanup wal");
        fs::remove_file(meta_path(&path)).expect("cleanup meta");
    }

    #[test]
    fn render_rows_table_returns_row_count_for_empty_columns() {
        let rows = QueryRows {
            columns: Vec::new(),
            rows: vec![vec!["value".to_string()]],
        };
        assert_eq!(render_rows_table(&rows), "row_count=1");
    }
}
