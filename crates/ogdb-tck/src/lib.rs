use cucumber::gherkin;
use ogdb_core::{Database, Header, QueryError};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};
use tempfile::TempDir;
use walkdir::WalkDir;

const TIER1_CATEGORIES: [&str; 6] = ["MATCH", "RETURN", "WHERE", "CREATE", "DELETE", "SET"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScenarioStatus {
    Passed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScenarioResult {
    pub feature_path: PathBuf,
    pub feature_name: String,
    pub scenario_name: String,
    pub category: String,
    pub status: ScenarioStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct CategoryCoverage {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TckRunReport {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub tier1_total: usize,
    pub tier1_passed: usize,
    pub tier1_pass_rate: f64,
    pub category_coverage: BTreeMap<String, CategoryCoverage>,
    pub scenarios: Vec<ScenarioResult>,
}

impl TckRunReport {
    pub fn meets_tier1_floor(&self, floor: f64) -> bool {
        self.tier1_pass_rate >= floor
    }
}

#[derive(Debug)]
pub enum TckError {
    Io(std::io::Error),
    Walkdir(walkdir::Error),
    Gherkin(String),
    Db(ogdb_core::DbError),
}

impl Display for TckError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "io error: {err}"),
            Self::Walkdir(err) => write!(f, "walkdir error: {err}"),
            Self::Gherkin(err) => write!(f, "gherkin parse error: {err}"),
            Self::Db(err) => write!(f, "database error: {err}"),
        }
    }
}

impl std::error::Error for TckError {}

impl From<std::io::Error> for TckError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<walkdir::Error> for TckError {
    fn from(value: walkdir::Error) -> Self {
        Self::Walkdir(value)
    }
}

impl From<ogdb_core::DbError> for TckError {
    fn from(value: ogdb_core::DbError) -> Self {
        Self::Db(value)
    }
}

pub fn discover_feature_files(root: &Path) -> Result<Vec<PathBuf>, TckError> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root) {
        let entry = entry?;
        if entry.file_type().is_file()
            && entry.path().extension().is_some_and(|ext| ext == "feature")
        {
            files.push(entry.path().to_path_buf());
        }
    }
    files.sort();
    Ok(files)
}

pub fn run_tck_suite(feature_root: &Path) -> Result<TckRunReport, TckError> {
    let feature_files = discover_feature_files(feature_root)?;
    let mut scenario_results = Vec::new();

    for feature_path in feature_files {
        let feature = gherkin::Feature::parse_path(&feature_path, gherkin::GherkinEnv::default())
            .map_err(|e| TckError::Gherkin(e.to_string()))?;
        let category = infer_category(&feature_path);
        for scenario in &feature.scenarios {
            scenario_results.push(run_scenario(&feature_path, &feature, scenario, &category)?);
        }
        for rule in &feature.rules {
            for scenario in &rule.scenarios {
                scenario_results.push(run_scenario(&feature_path, &feature, scenario, &category)?);
            }
        }
    }

    Ok(summarize_report(scenario_results))
}

fn run_scenario(
    feature_path: &Path,
    feature: &gherkin::Feature,
    scenario: &gherkin::Scenario,
    category: &str,
) -> Result<ScenarioResult, TckError> {
    let scenario_name = scenario.name.clone();
    if should_skip_scenario(feature, scenario) {
        return Ok(ScenarioResult {
            feature_path: feature_path.to_path_buf(),
            feature_name: feature.name.clone(),
            scenario_name,
            category: category.to_string(),
            status: ScenarioStatus::Skipped,
            reason: Some("unsupported feature".to_string()),
        });
    }

    let temp = TempDir::new()?;
    let db_path = temp.path().join("scenario.ogdb");
    let mut db = Database::init(&db_path, Header::default_v1())?;

    let mut first_error: Option<String> = None;
    for step in &scenario.steps {
        if let Some(query) = extract_query_from_step(step) {
            if let Err(err) = db.query(&query) {
                first_error = Some(query_error_to_string(err));
                break;
            }
        } else if is_empty_graph_step(step) {
            db = Database::init(&db_path, Header::default_v1())
                .or_else(|_| Database::open(&db_path))?;
        }
    }

    let (status, reason) = match first_error {
        Some(err) => (ScenarioStatus::Failed, Some(err)),
        None => (ScenarioStatus::Passed, None),
    };

    Ok(ScenarioResult {
        feature_path: feature_path.to_path_buf(),
        feature_name: feature.name.clone(),
        scenario_name,
        category: category.to_string(),
        status,
        reason,
    })
}

fn query_error_to_string(err: QueryError) -> String {
    err.to_string()
}

fn extract_query_from_step(step: &gherkin::Step) -> Option<String> {
    let value = step.value.trim();
    let lower = value.to_ascii_lowercase();
    let query_trigger = lower.contains("having executed") || lower.contains("executing query");
    if !query_trigger {
        return None;
    }

    if let Some(docstring) = &step.docstring {
        let trimmed = docstring.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(start) = value.find('`') {
        if let Some(end) = value[start + 1..].find('`') {
            let query = value[start + 1..start + 1 + end].trim();
            if !query.is_empty() {
                return Some(query.to_string());
            }
        }
    }

    None
}

fn is_empty_graph_step(step: &gherkin::Step) -> bool {
    step.value.to_ascii_lowercase().contains("an empty graph")
}

fn should_skip_scenario(feature: &gherkin::Feature, scenario: &gherkin::Scenario) -> bool {
    let mut text = String::new();
    text.push_str(&feature.name);
    text.push(' ');
    text.push_str(&scenario.name);
    text.push(' ');
    for step in &scenario.steps {
        text.push_str(&step.value);
        text.push(' ');
        if let Some(docstring) = &step.docstring {
            text.push_str(docstring);
            text.push(' ');
        }
    }
    let upper = text.to_ascii_uppercase();
    ["LOAD CSV", "SHORTESTPATH", "CALL ", "YIELD"]
        .iter()
        .any(|needle| upper.contains(needle))
}

fn infer_category(path: &Path) -> String {
    let components = path
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_ascii_uppercase())
        .collect::<Vec<_>>();
    for category in TIER1_CATEGORIES {
        if components.iter().any(|component| component == category) {
            return category.to_string();
        }
    }

    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_ascii_uppercase())
        .unwrap_or_else(|| "OTHER".to_string());
    for category in TIER1_CATEGORIES {
        if stem.contains(category) {
            return category.to_string();
        }
    }
    "OTHER".to_string()
}

fn summarize_report(scenarios: Vec<ScenarioResult>) -> TckRunReport {
    let tier1_set = TIER1_CATEGORIES
        .iter()
        .map(|value| value.to_string())
        .collect::<BTreeSet<_>>();

    let mut category_coverage = BTreeMap::<String, CategoryCoverage>::new();
    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let mut tier1_total = 0usize;
    let mut tier1_passed = 0usize;

    for scenario in &scenarios {
        let entry = category_coverage
            .entry(scenario.category.clone())
            .or_default();
        entry.total += 1;
        match scenario.status {
            ScenarioStatus::Passed => {
                passed += 1;
                entry.passed += 1;
            }
            ScenarioStatus::Failed => {
                failed += 1;
                entry.failed += 1;
            }
            ScenarioStatus::Skipped => {
                skipped += 1;
                entry.skipped += 1;
            }
        }

        if tier1_set.contains(&scenario.category) {
            tier1_total += 1;
            if scenario.status == ScenarioStatus::Passed {
                tier1_passed += 1;
            }
        }
    }

    let tier1_pass_rate = if tier1_total == 0 {
        0.0
    } else {
        tier1_passed as f64 / tier1_total as f64
    };

    TckRunReport {
        total: scenarios.len(),
        passed,
        failed,
        skipped,
        tier1_total,
        tier1_passed,
        tier1_pass_rate,
        category_coverage,
        scenarios,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
    }

    #[test]
    fn discover_feature_files_finds_recursive_features() {
        let root = fixture_root();
        let features = discover_feature_files(&root).expect("discover features");
        assert!(features.len() >= 2);
        assert!(features
            .iter()
            .all(|path| path.extension().is_some_and(|ext| ext == "feature")));
    }

    #[test]
    fn run_tck_suite_reports_pass_fail_skip_and_category_coverage() {
        let root = fixture_root();
        let report = run_tck_suite(&root).expect("run tck suite");

        assert!(report.total >= 4);
        assert!(report.passed >= 2);
        assert!(report.category_coverage.contains_key("MATCH"));
        assert!(report.category_coverage.contains_key("CREATE"));
        assert!(report.category_coverage.contains_key("SET"));
    }

    #[test]
    fn tier1_floor_is_reported_for_fixture_suite() {
        let root = fixture_root();
        let report = run_tck_suite(&root).expect("run tck suite");

        assert!(report.tier1_total >= 4);
        assert!(report.tier1_pass_rate >= 0.50);
        assert!(report.meets_tier1_floor(0.50));
    }

    #[test]
    fn report_can_be_serialized_for_ci_artifacts() {
        let root = fixture_root();
        let report = run_tck_suite(&root).expect("run tck suite");
        let json = serde_json::to_string_pretty(&report).expect("serialize report");
        assert!(json.contains("tier1_pass_rate"));

        let output = TempDir::new().expect("temp output dir");
        let output_path = output.path().join("tck-report.json");
        fs::write(&output_path, json).expect("write report");
        assert!(output_path.exists());
    }
}
