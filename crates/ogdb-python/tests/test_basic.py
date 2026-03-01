import json
from pathlib import Path

import opengraphdb


def test_python_binding_smoke(tmp_path: Path) -> None:
    db_path = tmp_path / "python-smoke.ogdb"
    db = opengraphdb.Database.init(str(db_path))
    a = db.create_node(["Person"], {"name": "Alice", "age": 30})
    b = db.create_node(["Person"], {"name": "Bob", "age": 28})
    assert a == 0
    assert b == 1

    edge_id = db.add_edge(a, b, "KNOWS", {"since": 2024})
    assert edge_id == 0

    rows = db.query("MATCH (n:Person) RETURN n ORDER BY n")
    assert rows == [{"n": 0}, {"n": 1}]

    metrics = db.metrics()
    assert metrics["node_count"] == 2
    assert metrics["edge_count"] == 1

    export_path = tmp_path / "graph.json"
    db.export(str(export_path), "json")
    payload = json.loads(export_path.read_text())
    assert "nodes" in payload
    assert "edges" in payload

    db.close()
