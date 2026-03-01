use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("resolve repository root")
}

fn unique_test_dir(tag: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before unix epoch")
        .as_nanos();
    path.push(format!("ogdb-demo-{tag}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&path).expect("create test directory");
    path
}

fn read_dataset(path: &Path) -> Value {
    let content = fs::read_to_string(path)
        .unwrap_or_else(|err| panic!("read dataset {} failed: {err}", path.display()));
    serde_json::from_str(&content)
        .unwrap_or_else(|err| panic!("parse dataset {} failed: {err}", path.display()))
}

fn as_u64(value: &Value, context: &str) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| panic!("{context} must be an unsigned integer"))
}

fn as_f64(value: &Value, context: &str) -> f64 {
    value
        .as_f64()
        .unwrap_or_else(|| panic!("{context} must be a number"))
}

fn as_str<'a>(value: &'a Value, context: &str) -> &'a str {
    value
        .as_str()
        .unwrap_or_else(|| panic!("{context} must be a string"))
}

fn nodes(dataset: &Value) -> &[Value] {
    dataset
        .get("nodes")
        .and_then(Value::as_array)
        .expect("dataset.nodes must be an array")
}

fn edges(dataset: &Value) -> &[Value] {
    dataset
        .get("edges")
        .and_then(Value::as_array)
        .expect("dataset.edges must be an array")
}

fn node_has_label(node: &Value, label: &str) -> bool {
    node.get("labels")
        .and_then(Value::as_array)
        .map(|labels| labels.iter().any(|value| value.as_str() == Some(label)))
        .unwrap_or(false)
}

fn node_props(node: &Value) -> &serde_json::Map<String, Value> {
    node.get("properties")
        .and_then(Value::as_object)
        .expect("node.properties must be an object")
}

fn parse_info_count(stdout: &str, key: &str) -> u64 {
    stdout
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{key}=")))
        .unwrap_or_else(|| panic!("missing {key} in info output: {stdout}"))
        .parse::<u64>()
        .unwrap_or_else(|err| panic!("invalid {key} value: {err}"))
}

#[test]
fn datasets_have_numeric_ids_non_overlap_and_sequential_ranges() {
    let root = repo_root();
    let datasets = [
        (
            "movies",
            root.join("datasets/movies.json"),
            0u64,
            261u64,
            200usize,
        ),
        (
            "social",
            root.join("datasets/social.json"),
            500u64,
            779u64,
            200usize,
        ),
        (
            "fraud",
            root.join("datasets/fraud.json"),
            1000u64,
            1314u64,
            100usize,
        ),
    ];

    let mut all_ids = HashSet::<u64>::new();
    for (name, path, min_id, max_id, min_nodes) in datasets {
        let dataset = read_dataset(&path);
        let dataset_nodes = nodes(&dataset);
        let dataset_edges = edges(&dataset);
        assert!(
            dataset_nodes.len() >= min_nodes,
            "{name} dataset should have at least {min_nodes} nodes"
        );
        assert!(
            !dataset_edges.is_empty(),
            "{name} dataset must include edges"
        );

        let mut ids = Vec::<u64>::with_capacity(dataset_nodes.len());
        let mut id_set = HashSet::<u64>::new();
        for node in dataset_nodes {
            let id = as_u64(node.get("id").expect("node.id"), "node.id");
            assert!(
                (min_id..=max_id).contains(&id),
                "{name} node id {id} out of expected range {min_id}..={max_id}"
            );
            assert!(id_set.insert(id), "{name} node id {id} is duplicated");
            assert!(
                all_ids.insert(id),
                "node id {id} overlaps across dataset files"
            );
            ids.push(id);
        }

        ids.sort_unstable();
        for pair in ids.windows(2) {
            assert!(
                pair[1] > pair[0],
                "{name} node ids must be strictly increasing"
            );
        }

        for edge in dataset_edges {
            let src = as_u64(edge.get("src").expect("edge.src"), "edge.src");
            let dst = as_u64(edge.get("dst").expect("edge.dst"), "edge.dst");
            assert!(
                id_set.contains(&src),
                "{name} edge source id {src} is not a valid node id"
            );
            assert!(
                id_set.contains(&dst),
                "{name} edge destination id {dst} is not a valid node id"
            );
            let edge_type = as_str(edge.get("type").expect("edge.type"), "edge.type");
            assert!(!edge_type.is_empty(), "{name} edge.type must be non-empty");
        }
    }
}

#[test]
fn movies_dataset_meets_flagship_requirements() {
    let dataset = read_dataset(&repo_root().join("datasets/movies.json"));
    let dataset_nodes = nodes(&dataset);
    let dataset_edges = edges(&dataset);
    assert!(
        dataset_nodes.len() >= 200,
        "movies dataset should be >=200 nodes"
    );

    let mut movie_ids = HashSet::<u64>::new();
    let mut person_ids = HashSet::<u64>::new();
    let mut genre_ids = HashSet::<u64>::new();
    let mut movie_title_to_id = HashMap::<String, u64>::new();
    let mut person_name_to_id = HashMap::<String, u64>::new();

    for node in dataset_nodes {
        let id = as_u64(node.get("id").expect("node.id"), "node.id");
        let props = node_props(node);
        if node_has_label(node, "Movie") {
            movie_ids.insert(id);
            movie_title_to_id.insert(
                as_str(props.get("title").expect("movie title"), "movie title").to_string(),
                id,
            );
            let released = as_u64(props.get("released").expect("movie released"), "released");
            assert!(
                (1900..=2030).contains(&released),
                "movie release year should be reasonable"
            );
            assert_eq!(
                as_str(
                    props.get("_dataset").expect("movie _dataset"),
                    "movie _dataset"
                ),
                "movies"
            );
        }
        if node_has_label(node, "Person") {
            person_ids.insert(id);
            person_name_to_id.insert(
                as_str(props.get("name").expect("person name"), "person name").to_string(),
                id,
            );
            assert!(
                props.contains_key("born"),
                "person nodes should include a born property"
            );
        }
        if node_has_label(node, "Genre") {
            genre_ids.insert(id);
            assert_eq!(
                as_str(
                    props.get("_dataset").expect("genre _dataset"),
                    "genre _dataset"
                ),
                "movies"
            );
        }
    }

    assert!(movie_ids.len() >= 40, "expected at least 40 movie nodes");
    assert!(
        person_ids.len() >= 120,
        "expected rich person cast/crew coverage"
    );
    assert!(genre_ids.len() >= 8, "expected multiple genres");

    let required_titles = [
        "The Matrix",
        "The Matrix Reloaded",
        "The Matrix Revolutions",
        "The Godfather",
        "The Godfather Part II",
        "Pulp Fiction",
        "The Dark Knight",
        "Batman Begins",
        "Inception",
        "Interstellar",
        "Forrest Gump",
        "The Shawshank Redemption",
        "Jurassic Park",
        "The Lost World: Jurassic Park",
        "Titanic",
        "Schindler's List",
        "Good Will Hunting",
        "The Silence of the Lambs",
        "Fight Club",
        "Top Gun",
        "Top Gun: Maverick",
        "Cast Away",
        "Philadelphia",
        "Saving Private Ryan",
        "A Beautiful Mind",
        "Gladiator",
        "The Lord of the Rings: The Fellowship of the Ring",
        "Harry Potter and the Sorcerer's Stone",
        "Spider-Man",
        "The Avengers",
        "Iron Man",
        "Star Wars: A New Hope",
        "Goodfellas",
        "Braveheart",
        "Jerry Maguire",
        "A Few Good Men",
        "As Good as It Gets",
        "Rain Man",
        "Tootsie",
        "The Truman Show",
        "The Green Mile",
        "Big",
        "You've Got Mail",
        "Sleepless in Seattle",
    ];
    for title in required_titles {
        assert!(
            movie_title_to_id.contains_key(title),
            "required movie missing: {title}"
        );
    }

    let mut directed_movies = HashSet::<u64>::new();
    let mut genre_movies = HashSet::<u64>::new();
    let mut edge_types = HashSet::<String>::new();
    let mut acted_in_per_movie = HashMap::<u64, usize>::new();
    for edge in dataset_edges {
        let src = as_u64(edge.get("src").expect("edge.src"), "edge.src");
        let dst = as_u64(edge.get("dst").expect("edge.dst"), "edge.dst");
        let edge_type = as_str(edge.get("type").expect("edge.type"), "edge.type");
        edge_types.insert(edge_type.to_string());
        match edge_type {
            "ACTED_IN" => {
                assert!(
                    person_ids.contains(&src),
                    "ACTED_IN source should be person"
                );
                assert!(
                    movie_ids.contains(&dst),
                    "ACTED_IN destination should be movie"
                );
                *acted_in_per_movie.entry(dst).or_insert(0) += 1;
            }
            "DIRECTED" | "WROTE" => {
                assert!(
                    person_ids.contains(&src),
                    "{edge_type} source should be person"
                );
                assert!(
                    movie_ids.contains(&dst),
                    "{edge_type} destination should be movie"
                );
                if edge_type == "DIRECTED" {
                    directed_movies.insert(dst);
                }
            }
            "IN_GENRE" => {
                assert!(movie_ids.contains(&src), "IN_GENRE source should be movie");
                assert!(
                    genre_ids.contains(&dst),
                    "IN_GENRE destination should be genre"
                );
                genre_movies.insert(src);
            }
            other => panic!("unexpected movie edge type: {other}"),
        }
    }

    for expected in ["ACTED_IN", "DIRECTED", "WROTE", "IN_GENRE"] {
        assert!(
            edge_types.contains(expected),
            "missing required movie edge type {expected}"
        );
    }

    for movie_id in &movie_ids {
        assert!(
            directed_movies.contains(movie_id),
            "movie {movie_id} must have at least one DIRECTED relationship"
        );
        assert!(
            genre_movies.contains(movie_id),
            "movie {movie_id} must have at least one IN_GENRE relationship"
        );
    }

    let matrix_ids = [
        *movie_title_to_id
            .get("The Matrix")
            .expect("The Matrix node id"),
        *movie_title_to_id
            .get("The Matrix Reloaded")
            .expect("The Matrix Reloaded node id"),
        *movie_title_to_id
            .get("The Matrix Revolutions")
            .expect("The Matrix Revolutions node id"),
    ];
    let keanu_id = *person_name_to_id
        .get("Keanu Reeves")
        .expect("Keanu Reeves person id");
    let acted_edges = dataset_edges
        .iter()
        .filter(|edge| {
            as_str(edge.get("type").expect("edge.type"), "edge.type") == "ACTED_IN"
                && as_u64(edge.get("src").expect("edge.src"), "edge.src") == keanu_id
        })
        .map(|edge| as_u64(edge.get("dst").expect("edge.dst"), "edge.dst"))
        .collect::<HashSet<_>>();
    for matrix_id in matrix_ids {
        assert!(
            acted_edges.contains(&matrix_id),
            "Keanu Reeves should be connected to the full Matrix trilogy"
        );
    }

    let movies_with_2_plus_actors = acted_in_per_movie
        .values()
        .filter(|count| **count >= 2)
        .count();
    assert!(
        movies_with_2_plus_actors * 2 >= movie_ids.len(),
        "most movies should have 2+ ACTED_IN edges"
    );
}

#[test]
fn social_and_fraud_datasets_meet_domain_constraints() {
    let root = repo_root();
    let social = read_dataset(&root.join("datasets/social.json"));
    let fraud = read_dataset(&root.join("datasets/fraud.json"));

    let social_nodes = nodes(&social);
    let social_edges = edges(&social);
    assert!(
        social_nodes.len() >= 200,
        "social dataset should be >=200 nodes"
    );
    assert!(
        !social_edges.is_empty(),
        "social dataset should include edges"
    );

    let mut user_ids = HashSet::<u64>::new();
    let mut post_ids = HashSet::<u64>::new();
    let mut group_ids = HashSet::<u64>::new();
    let mut follows = HashMap::<u64, HashSet<u64>>::new();
    let mut social_types = HashSet::<String>::new();
    let mut social_names = HashSet::<String>::new();

    for node in social_nodes {
        let id = as_u64(node.get("id").expect("node.id"), "node.id");
        let props = node_props(node);
        if node_has_label(node, "User") {
            assert!((500..=699).contains(&id), "user id out of range: {id}");
            user_ids.insert(id);
            social_names
                .insert(as_str(props.get("name").expect("user name"), "user name").to_string());
        } else if node_has_label(node, "Post") {
            assert!((700..=759).contains(&id), "post id out of range: {id}");
            post_ids.insert(id);
            assert!(props.contains_key("title"), "post title is required");
        } else if node_has_label(node, "Group") {
            assert!((760..=779).contains(&id), "group id out of range: {id}");
            group_ids.insert(id);
            assert!(props.contains_key("category"), "group category is required");
        } else {
            panic!("social node must be User, Post, or Group");
        }
        assert_eq!(
            as_str(props.get("_dataset").expect("_dataset"), "_dataset"),
            "social"
        );
    }

    assert!(
        user_ids.len() >= 60,
        "social dataset should have >=60 users"
    );
    assert!(
        post_ids.len() >= 30,
        "social dataset should have >=30 posts"
    );
    assert!(
        group_ids.len() >= 15,
        "social dataset should have >=15 groups"
    );

    for expected in [
        "Alice Chen",
        "Bob Martinez",
        "Carol Johnson",
        "David Kim",
        "Eva Williams",
        "Grace Lee",
        "Henry Zhang",
        "Priya Sharma",
        "Yuki Tanaka",
        "Zahra Ahmed",
    ] {
        assert!(
            social_names.contains(expected),
            "required social user missing: {expected}"
        );
    }

    for edge in social_edges {
        let src = as_u64(edge.get("src").expect("edge.src"), "edge.src");
        let dst = as_u64(edge.get("dst").expect("edge.dst"), "edge.dst");
        let edge_type = as_str(edge.get("type").expect("edge.type"), "edge.type");
        social_types.insert(edge_type.to_string());
        match edge_type {
            "FOLLOWS" => {
                assert!(user_ids.contains(&src), "FOLLOWS source must be user");
                assert!(user_ids.contains(&dst), "FOLLOWS destination must be user");
                follows.entry(src).or_default().insert(dst);
            }
            "CREATED" | "LIKED" => {
                assert!(user_ids.contains(&src), "{edge_type} source must be user");
                assert!(
                    post_ids.contains(&dst),
                    "{edge_type} destination must be post"
                );
            }
            "POSTED_IN" => {
                assert!(post_ids.contains(&src), "POSTED_IN source must be post");
                assert!(
                    group_ids.contains(&dst),
                    "POSTED_IN destination must be group"
                );
            }
            "MEMBER_OF" => {
                assert!(user_ids.contains(&src), "MEMBER_OF source must be user");
                assert!(
                    group_ids.contains(&dst),
                    "MEMBER_OF destination must be group"
                );
            }
            other => panic!("unexpected social edge type: {other}"),
        }
    }

    for required in ["FOLLOWS", "CREATED", "LIKED", "POSTED_IN", "MEMBER_OF"] {
        assert!(
            social_types.contains(required),
            "missing social edge type {required}"
        );
    }

    // Confirm at least one follows chain with 3+ hops (u1 -> u2 -> u3 -> u4).
    let mut has_depth_3_chain = false;
    for src in &user_ids {
        let mut depth1 = HashSet::<u64>::new();
        if let Some(next_hop) = follows.get(src) {
            depth1.extend(next_hop.iter().copied());
        }
        for n1 in depth1 {
            if let Some(depth2) = follows.get(&n1) {
                for n2 in depth2 {
                    if let Some(depth3) = follows.get(n2) {
                        if depth3.iter().any(|n3| n3 != src) {
                            has_depth_3_chain = true;
                            break;
                        }
                    }
                }
            }
            if has_depth_3_chain {
                break;
            }
        }
        if has_depth_3_chain {
            break;
        }
    }
    assert!(
        has_depth_3_chain,
        "social dataset should contain follows chains with length >=3"
    );

    let fraud_nodes = nodes(&fraud);
    let fraud_edges = edges(&fraud);
    assert!(
        fraud_nodes.len() >= 100,
        "fraud dataset should be >=100 nodes"
    );
    assert!(
        !fraud_edges.is_empty(),
        "fraud dataset should include edges"
    );

    let mut account_ids = HashSet::<u64>::new();
    let mut transaction_ids = HashSet::<u64>::new();
    let mut device_ids = HashSet::<u64>::new();
    let mut ip_ids = HashSet::<u64>::new();
    let mut high_risk_accounts = HashSet::<u64>::new();
    let mut tx_status = HashMap::<u64, String>::new();
    let mut tx_amount = HashMap::<u64, f64>::new();
    let mut ip_country = HashMap::<u64, String>::new();

    for node in fraud_nodes {
        let id = as_u64(node.get("id").expect("node.id"), "node.id");
        let props = node_props(node);
        assert_eq!(
            as_str(props.get("_dataset").expect("_dataset"), "_dataset"),
            "fraud"
        );
        if node_has_label(node, "Account") {
            assert!((1000..=1059).contains(&id), "account id out of range: {id}");
            account_ids.insert(id);
            let risk = as_f64(
                props.get("riskScore").expect("account riskScore"),
                "riskScore",
            );
            if risk > 0.7 {
                high_risk_accounts.insert(id);
            }
        } else if node_has_label(node, "Transaction") {
            assert!(
                (1100..=1149).contains(&id),
                "transaction id out of range: {id}"
            );
            transaction_ids.insert(id);
            tx_status.insert(
                id,
                as_str(props.get("status").expect("tx status"), "tx status").to_string(),
            );
            tx_amount.insert(
                id,
                as_f64(props.get("amount").expect("tx amount"), "tx amount"),
            );
        } else if node_has_label(node, "Device") {
            assert!((1200..=1214).contains(&id), "device id out of range: {id}");
            device_ids.insert(id);
        } else if node_has_label(node, "IP") {
            assert!((1300..=1314).contains(&id), "ip id out of range: {id}");
            ip_ids.insert(id);
            ip_country.insert(
                id,
                as_str(props.get("country").expect("ip country"), "ip country").to_string(),
            );
        } else {
            panic!("fraud node must be Account, Transaction, Device, or IP");
        }
    }

    assert!(
        account_ids.len() >= 40,
        "fraud dataset should have >=40 accounts"
    );
    assert!(
        transaction_ids.len() >= 30,
        "fraud dataset should have >=30 transactions"
    );
    assert!(
        device_ids.len() >= 10,
        "fraud dataset should have >=10 devices"
    );
    assert!(
        ip_ids.len() >= 10,
        "fraud dataset should have >=10 ip nodes"
    );

    let mut sent_or_received_by_tx = HashMap::<u64, HashSet<u64>>::new();
    let mut device_accounts = HashMap::<u64, HashSet<u64>>::new();
    let mut ip_accounts = HashMap::<u64, HashSet<u64>>::new();
    let mut flagged_targets = HashSet::<u64>::new();
    let mut flagged_transactions = HashSet::<u64>::new();
    for edge in fraud_edges {
        let src = as_u64(edge.get("src").expect("edge.src"), "edge.src");
        let dst = as_u64(edge.get("dst").expect("edge.dst"), "edge.dst");
        let edge_type = as_str(edge.get("type").expect("edge.type"), "edge.type");
        match edge_type {
            "SENT_TO" | "RECEIVED" => {
                assert!(
                    account_ids.contains(&src),
                    "{edge_type} source should be account"
                );
                assert!(
                    transaction_ids.contains(&dst),
                    "{edge_type} destination should be transaction"
                );
                sent_or_received_by_tx.entry(dst).or_default().insert(src);
            }
            "USED_DEVICE" => {
                assert!(
                    account_ids.contains(&src),
                    "USED_DEVICE source should be account"
                );
                assert!(
                    device_ids.contains(&dst),
                    "USED_DEVICE destination should be device"
                );
                device_accounts.entry(dst).or_default().insert(src);
            }
            "LOGGED_FROM" => {
                assert!(
                    account_ids.contains(&src),
                    "LOGGED_FROM source should be account"
                );
                assert!(
                    ip_ids.contains(&dst),
                    "LOGGED_FROM destination should be ip"
                );
                ip_accounts.entry(dst).or_default().insert(src);
            }
            "FLAGGED" => {
                assert!(
                    transaction_ids.contains(&src),
                    "FLAGGED source should be transaction"
                );
                assert!(
                    account_ids.contains(&dst),
                    "FLAGGED destination should be account"
                );
                flagged_transactions.insert(src);
                flagged_targets.insert(dst);
            }
            other => panic!("unexpected fraud edge type: {other}"),
        }
    }

    assert!(
        !flagged_transactions.is_empty(),
        "fraud dataset should include flagged transactions"
    );
    for tx in flagged_transactions {
        let status = tx_status
            .get(&tx)
            .unwrap_or_else(|| panic!("missing status for flagged tx {tx}"));
        let amount = tx_amount
            .get(&tx)
            .unwrap_or_else(|| panic!("missing amount for flagged tx {tx}"));
        assert_eq!(status, "flagged", "flagged edge must target flagged tx");
        assert!(
            *amount > 2000.0,
            "flagged tx {tx} must have amount > 2000, got {amount}"
        );
        let related_accounts = sent_or_received_by_tx
            .get(&tx)
            .unwrap_or_else(|| panic!("flagged tx {tx} should be linked to accounts"));
        assert!(
            related_accounts
                .iter()
                .any(|account| high_risk_accounts.contains(account)),
            "flagged tx {tx} should involve at least one high-risk account"
        );
    }
    assert!(
        flagged_targets
            .iter()
            .all(|account| high_risk_accounts.contains(account)),
        "FLAGGED edges should target high-risk accounts"
    );

    let shared_device_pairs = device_accounts
        .values()
        .filter(|accounts| accounts.len() >= 2)
        .count();
    assert!(
        shared_device_pairs >= 3,
        "expected at least 3 shared-device account clusters"
    );

    let foreign_codes = ["RU", "CN", "NG"];
    let shared_foreign_ip_pairs = ip_accounts
        .iter()
        .filter(|(ip, accounts)| {
            accounts.len() >= 2
                && ip_country
                    .get(ip)
                    .map(|country| foreign_codes.contains(&country.as_str()))
                    .unwrap_or(false)
        })
        .count();
    assert!(
        shared_foreign_ip_pairs >= 2,
        "expected at least 2 shared foreign-ip account clusters"
    );
}

#[test]
fn seed_demo_script_is_executable_and_idempotent() {
    let root = repo_root();
    let script_path = root.join("scripts/seed-demo.sh");
    let metadata = fs::metadata(&script_path)
        .unwrap_or_else(|err| panic!("seed script missing at {}: {err}", script_path.display()));
    let mode = metadata.permissions().mode();
    assert_ne!(
        mode & 0o111,
        0,
        "seed script must be executable by user/group/other"
    );

    let temp_dir = unique_test_dir("seed-script");
    let db_path = temp_dir.join("demo.ogdb");
    let ogdb_bin = env!("CARGO_BIN_EXE_ogdb");

    for run_index in 1..=2 {
        let output = Command::new("bash")
            .arg(&script_path)
            .current_dir(&root)
            .env("OGDB_BIN", ogdb_bin)
            .env("OGDB_DEMO_DB", &db_path)
            .output()
            .expect("run seed-demo script");
        assert!(
            output.status.success(),
            "seed run #{run_index} failed\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            db_path.exists(),
            "database file should exist after seed run"
        );
    }

    let info_output = Command::new(ogdb_bin)
        .arg("info")
        .arg(&db_path)
        .output()
        .expect("run ogdb info");
    assert!(
        info_output.status.success(),
        "ogdb info should succeed after seeding"
    );
    let stdout = String::from_utf8_lossy(&info_output.stdout);
    let node_count = parse_info_count(&stdout, "node_count");
    let edge_count = parse_info_count(&stdout, "edge_count");
    assert!(
        node_count >= 400,
        "expected rich seeded node count, got {node_count}"
    );
    assert!(
        edge_count >= 700,
        "expected rich seeded edge count, got {edge_count}"
    );
}
