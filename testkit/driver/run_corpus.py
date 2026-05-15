#!/usr/bin/env python3
"""TestKit cross-binding parity harness — Phase 1 driver.

Runs every YAML corpus entry through every requested surface (CLI, HTTP, MCP)
and reports parity per surface against the entry's `expect` block.

Phase 1 surfaces: cli, http, mcp. Bolt/Python/Node/FFI bindings land in Phase 2.

Usage:
    python3 driver/run_corpus.py --surfaces cli,http --corpus corpus/v1/
    python3 driver/run_corpus.py --surfaces cli,http,mcp --corpus corpus/v1/ --strict
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("error: PyYAML not installed. Run: pip install pyyaml\n")
    sys.exit(2)


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OGDB = os.environ.get(
    "OGDB_BIN",
    str(REPO_ROOT / "target" / "release" / "ogdb"),
)
TYPED_PREFIX_RE = re.compile(
    r"^(i64|i32|u64|u32|f64|f32|str|string|bool):(.*)$", re.DOTALL
)


@dataclass
class Result:
    columns: list[str]
    rows: list[list[Any]]
    raw: Any = None
    error: str | None = None


@dataclass
class TestCase:
    path: Path
    id: str
    description: str
    fixture: str
    cypher: str
    expect: dict
    tags: list[str] = field(default_factory=list)
    skip: dict = field(default_factory=dict)
    known_drift: dict = field(default_factory=dict)


def load_corpus(corpus_dir: Path) -> list[TestCase]:
    cases: list[TestCase] = []
    for path in sorted(corpus_dir.glob("*.yaml")):
        with path.open() as f:
            data = yaml.safe_load(f)
        cases.append(
            TestCase(
                path=path,
                id=data["id"],
                description=data.get("description", ""),
                fixture=data.get("fixture", "") or "",
                cypher=data["cypher"],
                expect=data.get("expect", {}),
                tags=data.get("tags", []) or [],
                skip=data.get("skip", {}) or {},
                known_drift=data.get("known_drift", {}) or {},
            )
        )
    return cases


def split_statements(text: str) -> list[str]:
    out = []
    for line in text.split(";"):
        stmt = line.strip()
        if stmt:
            out.append(stmt)
    return out


def strip_typed_prefix(value: Any) -> Any:
    if isinstance(value, str):
        m = TYPED_PREFIX_RE.match(value)
        if not m:
            return value
        kind, payload = m.group(1), m.group(2)
        if kind in ("i64", "i32", "u64", "u32"):
            try:
                return int(payload)
            except ValueError:
                return value
        if kind in ("f64", "f32"):
            try:
                return float(payload)
            except ValueError:
                return value
        if kind == "bool":
            return payload.lower() == "true"
        if kind in ("str", "string"):
            return payload
        return value
    if isinstance(value, list):
        return [strip_typed_prefix(v) for v in value]
    if isinstance(value, dict):
        return {k: strip_typed_prefix(v) for k, v in value.items()}
    return value


def normalize_rows(columns: list[str], raw_rows: list) -> list[list[Any]]:
    """Convert wire-shaped rows to canonical list[list[Any]] form.

    Both CLI --json and HTTP /query return rows as list[dict[col, value]];
    we project them through `columns` to get a deterministic shape, then
    strip CLI typed-prefix encodings so int 1 == "i64:1".
    """
    out: list[list[Any]] = []
    for row in raw_rows:
        if isinstance(row, dict):
            out.append([strip_typed_prefix(row.get(c)) for c in columns])
        elif isinstance(row, list):
            out.append([strip_typed_prefix(v) for v in row])
        else:
            out.append([strip_typed_prefix(row)])
    return out


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class CliAdapter:
    name = "cli"

    def __init__(self, ogdb_bin: str):
        self.ogdb_bin = ogdb_bin
        self.workdir: Path | None = None
        self.db_path: Path | None = None

    def setup(self, fixture_cypher: str) -> None:
        self.workdir = Path(tempfile.mkdtemp(prefix="testkit-cli-"))
        self.db_path = self.workdir / "test.ogdb"
        subprocess.run(
            [self.ogdb_bin, "init", str(self.db_path)],
            check=True, capture_output=True,
        )
        for stmt in split_statements(fixture_cypher):
            subprocess.run(
                [self.ogdb_bin, "query", str(self.db_path), stmt, "--json"],
                check=True, capture_output=True,
            )

    def run(self, cypher: str) -> Result:
        proc = subprocess.run(
            [self.ogdb_bin, "query", str(self.db_path), cypher, "--json"],
            capture_output=True, text=True,
        )
        if proc.returncode != 0:
            return Result(columns=[], rows=[], raw=proc.stderr, error=proc.stderr.strip())
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            return Result(columns=[], rows=[], raw=proc.stdout, error=f"json decode: {e}")
        cols = payload.get("columns", [])
        rows = payload.get("rows", [])
        return Result(columns=cols, rows=normalize_rows(cols, rows), raw=payload)

    def teardown(self) -> None:
        if self.workdir and self.workdir.exists():
            shutil.rmtree(self.workdir, ignore_errors=True)


class HttpAdapter:
    name = "http"

    def __init__(self, ogdb_bin: str):
        self.ogdb_bin = ogdb_bin
        self.workdir: Path | None = None
        self.db_path: Path | None = None
        self.proc: subprocess.Popen | None = None
        self.port: int | None = None

    def setup(self, fixture_cypher: str) -> None:
        self.workdir = Path(tempfile.mkdtemp(prefix="testkit-http-"))
        self.db_path = self.workdir / "test.ogdb"
        subprocess.run(
            [self.ogdb_bin, "init", str(self.db_path)],
            check=True, capture_output=True,
        )
        for stmt in split_statements(fixture_cypher):
            subprocess.run(
                [self.ogdb_bin, "query", str(self.db_path), stmt, "--json"],
                check=True, capture_output=True,
            )
        self.port = find_free_port()
        self.proc = subprocess.Popen(
            [self.ogdb_bin, "serve", "--http",
             "--bind", f"127.0.0.1:{self.port}", str(self.db_path)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self._wait_ready(timeout=5.0)

    def _wait_ready(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.2):
                    return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError(f"http server did not bind on port {self.port}")

    def run(self, cypher: str) -> Result:
        url = f"http://127.0.0.1:{self.port}/query"
        body = json.dumps({"query": cypher}).encode()
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            payload = e.read().decode()
            return Result(columns=[], rows=[], raw=payload, error=payload.strip())
        except Exception as e:
            return Result(columns=[], rows=[], raw=None, error=str(e))
        if "error" in raw:
            return Result(columns=[], rows=[], raw=raw, error=str(raw["error"]))
        cols = raw.get("columns", [])
        rows = raw.get("rows", [])
        return Result(columns=cols, rows=normalize_rows(cols, rows), raw=raw)

    def teardown(self) -> None:
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.proc = None
        if self.workdir and self.workdir.exists():
            shutil.rmtree(self.workdir, ignore_errors=True)


class McpAdapter:
    """MCP stdio adapter — Phase 1 placeholder.

    Wire framing for `ogdb mcp serve` is finalized in Phase 2 (per the
    8-step rollout). For now the adapter participates in the run but
    reports every test as skipped with a structured reason so the diff
    matrix still shows three columns.
    """
    name = "mcp"

    def setup(self, fixture_cypher: str) -> None:
        pass

    def run(self, cypher: str) -> Result:
        return Result(
            columns=[], rows=[], raw=None,
            error="mcp adapter not wired in Phase 1 — see testkit-harness-v1 issue",
        )

    def teardown(self) -> None:
        pass


ADAPTERS = {
    "cli": lambda: CliAdapter(DEFAULT_OGDB),
    "http": lambda: HttpAdapter(DEFAULT_OGDB),
    "mcp": lambda: McpAdapter(),
}


def rows_equal(expected: list, actual: list, ordered: bool) -> bool:
    if ordered:
        return _normalize_for_compare(expected) == _normalize_for_compare(actual)
    return sorted(_normalize_for_compare(expected), key=repr) == sorted(
        _normalize_for_compare(actual), key=repr
    )


def _normalize_for_compare(rows: list) -> list[list[Any]]:
    out = []
    for row in rows:
        if isinstance(row, list):
            out.append([_coerce_scalar(v) for v in row])
        else:
            out.append([_coerce_scalar(row)])
    return out


def _coerce_scalar(v: Any) -> Any:
    if isinstance(v, float):
        return round(v, 6)
    return v


def evaluate(case: TestCase, surface: str, result: Result) -> tuple[str, str]:
    """Return (status, detail). status ∈ {pass, fail, skip, error}."""
    if surface in case.skip:
        return "skip", str(case.skip[surface].get("reason", "skip"))
    if result.error:
        return "error", result.error[:200]
    expect = case.expect or {}
    exp_cols = expect.get("columns", [])
    exp_rows = expect.get("rows", [])
    ordered = bool(expect.get("ordered", False))
    if exp_cols and list(result.columns) != list(exp_cols):
        return "fail", f"columns {result.columns} != expected {exp_cols}"
    if not rows_equal(exp_rows, result.rows, ordered):
        return "fail", f"rows mismatch: got {result.rows} expected {exp_rows}"
    return "pass", "ok"


def run(surfaces: list[str], corpus_dir: Path, strict: bool) -> int:
    cases = load_corpus(corpus_dir)
    if not cases:
        print(f"no corpus entries found in {corpus_dir}", file=sys.stderr)
        return 1

    print(f"TestKit driver — {len(cases)} entries × {len(surfaces)} surfaces")
    print(f"corpus: {corpus_dir}")
    print(f"ogdb:   {DEFAULT_OGDB}")
    print()

    summary: dict[str, dict[str, int]] = {
        s: {"pass": 0, "fail": 0, "skip": 0, "error": 0} for s in surfaces
    }
    failures: list[str] = []

    for case in cases:
        print(f"== {case.id}")
        for surface in surfaces:
            adapter = ADAPTERS[surface]()
            if surface in case.skip:
                summary[surface]["skip"] += 1
                print(f"  [{surface}] SKIP  {case.skip[surface].get('reason', '')}")
                continue
            try:
                adapter.setup(case.fixture)
                result = adapter.run(case.cypher)
            except Exception as e:
                summary[surface]["error"] += 1
                print(f"  [{surface}] ERROR {e}")
                failures.append(f"{case.id}/{surface}: {e}")
                try:
                    adapter.teardown()
                except Exception:
                    pass
                continue
            finally:
                pass
            status, detail = evaluate(case, surface, result)
            summary[surface][status] += 1
            tag = {"pass": "PASS ", "fail": "FAIL ", "skip": "SKIP ", "error": "ERROR"}[status]
            print(f"  [{surface}] {tag} {detail}")
            if status in ("fail", "error"):
                failures.append(f"{case.id}/{surface}: {detail}")
            try:
                adapter.teardown()
            except Exception:
                pass

    print()
    print("Summary:")
    for surface in surfaces:
        s = summary[surface]
        print(f"  {surface:6s} pass={s['pass']:3d} fail={s['fail']:3d} "
              f"skip={s['skip']:3d} error={s['error']:3d}")

    if failures and strict:
        print(f"\n{len(failures)} failure(s); exiting non-zero (--strict)")
        return 1
    if failures:
        print(f"\n{len(failures)} non-pass result(s); soft exit 0 (Phase 1 soak)")
    else:
        print("\nall surfaces parity-clean")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TestKit cross-binding parity driver")
    parser.add_argument("--surfaces", default="cli,http",
                        help="comma-separated surfaces (cli, http, mcp)")
    parser.add_argument("--corpus", default="corpus/v1",
                        help="path to a corpus directory of *.yaml entries")
    parser.add_argument("--strict", action="store_true",
                        help="exit non-zero on any fail or error (default: soft)")
    args = parser.parse_args(argv)

    surfaces = [s.strip() for s in args.surfaces.split(",") if s.strip()]
    for s in surfaces:
        if s not in ADAPTERS:
            print(f"unknown surface: {s} (known: {sorted(ADAPTERS)})", file=sys.stderr)
            return 2

    corpus_dir = Path(args.corpus)
    if not corpus_dir.is_absolute():
        corpus_dir = (Path.cwd() / corpus_dir).resolve()
    if not corpus_dir.is_dir():
        print(f"corpus dir not found: {corpus_dir}", file=sys.stderr)
        return 2

    if not Path(DEFAULT_OGDB).exists():
        print(f"warning: ogdb binary not found at {DEFAULT_OGDB}", file=sys.stderr)
        print("set OGDB_BIN env or build with `cargo build --release -p ogdb-cli`", file=sys.stderr)

    return run(surfaces, corpus_dir, strict=args.strict)


if __name__ == "__main__":
    sys.exit(main())
