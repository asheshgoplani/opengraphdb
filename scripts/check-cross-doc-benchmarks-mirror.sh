#!/usr/bin/env bash
# EVAL-DOCS-CYCLE32 H1 + H2 + H3 — cross-doc benchmarks-mirror gate.
#
# Bug class this gate closes: BENCHMARKS.md § 2 row table is the canonical
# source-of-truth for OGDB benchmark numbers. Two sister docs cite specific
# BENCHMARKS rows verbatim:
#
#   • `documentation/COOKBOOK.md` "How to verify and cite" sentences shaped
#     `From \`documentation/BENCHMARKS.md\` row N: …` (Recipes 2 + 3).
#   • `documentation/MIGRATION-FROM-NEO4J.md` § 5 "Numbers below are verbatim
#     from documentation/BENCHMARKS.md Section 2" `- **Row N** — …` bullets.
#
# Cycle-31 added `scripts/check-benchmarks-cell-internal-consistency.sh` which
# scans BENCHMARKS / SKILL / benchmarks-snapshot / MIGRATION at 2 % tolerance
# but (a) does NOT scan COOKBOOK, and (b) the 2 % window is wide enough that
# H3 (256 → 251 nodes/s = 1.99 % off) slipped through. Cycle-32 H1+H2 caught
# COOKBOOK Recipes 2 + 3 carrying pre-2026-05-02 baseline numbers, and H3
# caught MIGRATION row 1 carrying the older `auto-summary.md` 256 nodes/s
# instead of the BENCHMARKS row-1 251 nodes/s.
#
# What this gate validates:
#   COOKBOOK: For every "From `documentation/BENCHMARKS.md` row N:" citation,
#   take the citation paragraph (until next blank line) and assert every
#   unit-bearing numeric token matches some value present in canonical row N
#   (any cell — OGDB headline, spec target, or verdict prose), with unit
#   normalization (μs ↔ ms ↔ s) and 1 % tolerance (tighter than the existing
#   gate's 2 %, so the ~2 % H3 drift fails).
#
#   MIGRATION: Find the "verbatim from … BENCHMARKS.md" header, then for
#   every `- **Row N** …` bullet (with continuation lines) below it, run the
#   same canonical-row-text comparison.
#
# Permissive fallback: tokens whose unit is absent from the canonical row's
# tokens are skipped — those are typically competitor citations (e.g. a
# `1 150×` ratio in nodes/s prose, or a path/timestamp). Multipliers without
# a latency unit are not benchmark cell values and are skipped.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-cross-doc-benchmarks-mirror] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -eq 0 ]]; then
  CANONICAL="$REPO_ROOT/documentation/BENCHMARKS.md"
  COOKBOOK="$REPO_ROOT/documentation/COOKBOOK.md"
  MIGRATION="$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"
elif [[ $# -eq 3 ]]; then
  CANONICAL="$1"
  COOKBOOK="$2"
  MIGRATION="$3"
else
  echo "usage: $0 [CANONICAL COOKBOOK MIGRATION]" >&2
  exit 2
fi

for f in "$CANONICAL" "$COOKBOOK" "$MIGRATION"; do
  if [[ ! -f "$f" ]]; then
    echo "[check-cross-doc-benchmarks-mirror] missing $f" >&2
    exit 2
  fi
done

python3 - "$CANONICAL" "$COOKBOOK" "$MIGRATION" <<'PY'
import re
import sys

canonical_path, cookbook_path, migration_path = sys.argv[1], sys.argv[2], sys.argv[3]

UNIT_TO_US = {
    'μs': 1.0,
    'us': 1.0,
    'ms': 1000.0,
    's':  1_000_000.0,
}

NUMERIC = re.compile(
    r'(?<![\w.])'
    r'(\d{1,3}(?:[ ,]\d{3})+|\d+)(\.\d+)?\s*'
    r'(μs|us|ms|s|MB|GB|nodes/s|ops/s|qps|commits/s)\b'
)

SLASH_LIST = re.compile(
    r'((?:\d+(?:\.\d+)?\s*/\s*)+)(\d+(?:\.\d+)?)\s*(μs|us|ms|s|MB|GB)\b'
)

VERDICT_MARKERS = ('✅', '❌', '🟡', '⚠️', 'WIN', 'LOSS', 'NOVEL', 'DIRECTIONAL')

# 1 % tolerance — tighter than the cell-internal-consistency gate's 2 %
# so that ~2 % verbatim drift (cycle-32 H3: 251 → 256 nodes/s) trips this
# gate. Sub-percent rounding in unit conversion (e.g. 233 μs → 0.23 ms)
# stays under the threshold.
TOL = 0.01

def normalize(s):
    return s.replace('µ', 'μ')

def parse_value(int_part, dec_part):
    raw = int_part.replace(' ', '').replace(',', '')
    if dec_part:
        raw += dec_part
    return float(raw)

def find_tokens(s):
    consumed = []
    for m in SLASH_LIST.finditer(s):
        prefix, last, unit = m.group(1), m.group(2), m.group(3)
        for n in re.findall(r'\d+(?:\.\d+)?', prefix):
            yield float(n), unit, f'{n} {unit}'
        yield float(last), unit, f'{last} {unit}'
        consumed.append((m.start(), m.end()))
    for m in NUMERIC.finditer(s):
        if any(start <= m.start() < end for start, end in consumed):
            continue
        yield parse_value(m.group(1), m.group(2) or ''), m.group(3), m.group(0)

def parse_rows(text):
    rows = {}
    for line in text.splitlines():
        if not line.startswith('| '):
            continue
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if len(cells) < 5:
            continue
        if not re.match(r'^\d+$', cells[0]):
            continue
        verdict = cells[-1]
        if not any(m in verdict for m in VERDICT_MARKERS):
            continue
        rows[int(cells[0])] = {
            'ogdb': cells[2],
            'all_cells_text': ' '.join(cells),
        }
    return rows

def collect_units(s):
    by_unit = {}
    us_values = []
    for v, u, _ in find_tokens(s):
        by_unit.setdefault(u, []).append(v)
        if u in UNIT_TO_US:
            us_values.append(v * UNIT_TO_US[u])
    return by_unit, us_values

def matches(v, candidates):
    return any(abs(c - v) <= max(abs(c) * TOL, 0.01) for c in candidates)

with open(canonical_path, encoding='utf-8') as f:
    canonical_rows = parse_rows(normalize(f.read()))

errors = []

# ---------- COOKBOOK: "From `documentation/BENCHMARKS.md` row N:" sentences ----------
COOKBOOK_CITE = re.compile(
    r'From\s+`?documentation/BENCHMARKS\.md`?\s+row\s+(\d+)\b',
    re.IGNORECASE,
)

def extract_cite_block(text, start):
    end = text.find('\n\n', start)
    if end == -1:
        end = len(text)
    return text[start:end]

with open(cookbook_path, encoding='utf-8') as f:
    cookbook_text = normalize(f.read())

for m in COOKBOOK_CITE.finditer(cookbook_text):
    row_num = int(m.group(1))
    crow = canonical_rows.get(row_num)
    if not crow:
        errors.append(
            f'{cookbook_path}: cites BENCHMARKS row {row_num} but '
            f'canonical § 2 has no such row.'
        )
        continue
    block = extract_cite_block(cookbook_text, m.start())
    row_by_unit, row_us_values = collect_units(crow['all_cells_text'])
    for v, u, raw in find_tokens(block):
        if u in UNIT_TO_US:
            v_us = v * UNIT_TO_US[u]
            if matches(v_us, row_us_values):
                continue
            errors.append(
                f'{cookbook_path}: "From … row {row_num}" cite — token '
                f'"{raw.strip()}" does not match any value in canonical '
                f'§ 2 row {row_num} cells within {TOL*100:.0f}% tolerance. '
                f'Looks like a stale carry-forward of a pre-rebaseline number.'
            )
        else:
            if u not in row_by_unit:
                continue
            if matches(v, row_by_unit[u]):
                continue
            errors.append(
                f'{cookbook_path}: "From … row {row_num}" cite — token '
                f'"{raw.strip()}" does not match any {u} value in canonical '
                f'§ 2 row {row_num} cells (values: {row_by_unit[u]}) '
                f'within {TOL*100:.0f}% tolerance.'
            )

# ---------- MIGRATION § 5 "verbatim from BENCHMARKS" bullets ----------
VERBATIM_HEADER = re.compile(
    r'verbatim from \[?`?documentation/BENCHMARKS\.md`?\]?',
    re.IGNORECASE,
)
BULLET_RE = re.compile(r'^- \*\*Row (\d+)\b')

def parse_section_bullets(text, start_offset):
    bullets = []
    cur = None
    for line in text[start_offset:].splitlines():
        m = BULLET_RE.match(line)
        if m:
            if cur is not None:
                bullets.append(cur)
            cur = {'num': int(m.group(1)), 'text': line}
        elif cur is not None:
            if line.strip() == '' or not line.startswith((' ', '\t')):
                bullets.append(cur)
                cur = None
            else:
                cur['text'] += '\n' + line
    if cur is not None:
        bullets.append(cur)
    return bullets

with open(migration_path, encoding='utf-8') as f:
    migration_text = normalize(f.read())

hdr = VERBATIM_HEADER.search(migration_text)
if not hdr:
    errors.append(
        f'{migration_path}: missing "verbatim from documentation/BENCHMARKS.md" '
        f'§ 5 header — gate cannot scope its mirror check.'
    )
else:
    for b in parse_section_bullets(migration_text, hdr.start()):
        crow = canonical_rows.get(b['num'])
        if not crow:
            continue
        row_by_unit, row_us_values = collect_units(crow['all_cells_text'])
        for v, u, raw in find_tokens(b['text']):
            if u in UNIT_TO_US:
                v_us = v * UNIT_TO_US[u]
                if matches(v_us, row_us_values):
                    continue
                errors.append(
                    f'{migration_path}: § 5 Row {b["num"]} verbatim bullet — '
                    f'token "{raw.strip()}" does not match any value in '
                    f'canonical § 2 row {b["num"]} cells within '
                    f'{TOL*100:.0f}% tolerance. Looks like a stale '
                    f'carry-forward of a pre-rebaseline number.'
                )
            else:
                if u not in row_by_unit:
                    continue
                if matches(v, row_by_unit[u]):
                    continue
                errors.append(
                    f'{migration_path}: § 5 Row {b["num"]} verbatim bullet — '
                    f'token "{raw.strip()}" does not match any {u} value in '
                    f'canonical § 2 row {b["num"]} cells '
                    f'(values: {row_by_unit[u]}) within {TOL*100:.0f}% tolerance.'
                )

if errors:
    print('check-cross-doc-benchmarks-mirror: FAIL', file=sys.stderr)
    for e in errors:
        print('  - ' + e, file=sys.stderr)
    print('', file=sys.stderr)
    print(
        'Sister docs that mirror BENCHMARKS rows verbatim (COOKBOOK "How to '
        'verify and cite", MIGRATION § 5) must reuse the canonical row N '
        "tokens within 1 % tolerance. If the value is intentionally a "
        "historical citation, move it out of the verbatim-cite sentence.",
        file=sys.stderr,
    )
    sys.exit(1)

print('check-cross-doc-benchmarks-mirror: ok')
PY
