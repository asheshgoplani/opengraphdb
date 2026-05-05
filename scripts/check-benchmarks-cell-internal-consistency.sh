#!/usr/bin/env bash
# EVAL-PERF-RELEASE-CYCLE28 F01+F02+F03 + cycle-29 F01 + cycle-30 F01+F02
# regression gate: lock § 3 methodology disclosure + § 2 verdict-cell
# multipliers (and their cross-file mirrors) to the same numerical truth as
# the § 2 OpenGraphDB-column headline values in
# `documentation/BENCHMARKS.md`.
#
# Bug class this gate closes: cycle-15 cf97159 / cycle-16 f72f7cd
# rebaselined § 2 to 0.4.0 N=5 medians but only partially swept the
# document. Three values stayed pinned to the retired 0.3.0 N=5 baseline:
#   • Row 7 § 3 enrichment p95 = "45.4 ms"  (cell now 46.7 ms)
#   • Row 13 § 3 scaling tier  = "27 MB / 0.29 s / 0.26 μs"  (cell now 28.0 MB / 0.32 s / 0.38 μs)
#   • Row 10 § 2 verdict cell  = "1.88 μs is 91 000× faster ... 27 000× under"
#                                (cell now 1.34 μs ⇒ ratios 128 000× / 37 000×)
# Cycle-28 F01-F03 audited the drift inside BENCHMARKS.md; cycle-29 F01
# caught a stale back-reference ("the headline 91 000× ratio") in the same
# file. Cycle-30 F01+F02 caught the *same* partial-sweep bug class
# replayed inside the sister mirror files
# (`skills/opengraphdb/references/benchmarks-snapshot.md`,
# `documentation/MIGRATION-FROM-NEO4J.md`) that the cycle-30 single-file
# gate had no scope over.
#
# What this gate validates (per file):
#   A. Every unit-bearing numeric token in a § 3 "Row N — …" bullet whose
#      unit also appears in canonical § 2 row N's OpenGraphDB cell must
#      match a cell value within 2 % (or 0.05 absolute, whichever is
#      larger). A § 3 token whose unit is absent from the cell (e.g. a
#      "171.5 ms" Cohere citation in a Row 10 μs row) is skipped — it's a
#      competitor reference, not an OGDB self-claim.
#   B. Every § 2 verdict cell with an explicit
#         "<X.Y unit_a> … <N>× faster|under|behind … <R unit_b>"
#      shape must (b1) have its operand X.Y match a value in the row's
#      OGDB cell unit_a tokens (within 2 %), and (b2) divide cleanly:
#      ref ÷ operand ≈ N within 10 %.
#   C. Within a single § 2 verdict cell, any back-reference of the form
#         "<N>× ratio|multiplier|speedup|advantage|figure" or
#         "headline <N>× …"
#      must equal one of the cell's primary
#      "<N>× faster|under|behind|over|above|below|slower" multipliers.
#
# Canonical row-table source is `documentation/BENCHMARKS.md` (the live
# baseline that mirror files snapshot from). When invoked with no args,
# all four mirror files are scanned: BENCHMARKS.md, SKILL.md,
# benchmarks-snapshot.md, MIGRATION-FROM-NEO4J.md (same FILES list as
# `scripts/check-benchmarks-vocabulary-mirror.sh`). When invoked with
# args, the first arg is also used as the canonical row source — this
# preserves single-arg backward-compat for the BENCHMARKS-only meta-test
# fixtures, since planting a stale token in BENCHMARKS.md leaves the row
# table unchanged and CHECK A still detects the bullet drift.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-benchmarks-cell-internal-consistency] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -eq 0 ]]; then
  CANONICAL="$REPO_ROOT/documentation/BENCHMARKS.md"
  SCAN=(
    "$REPO_ROOT/documentation/BENCHMARKS.md"
    "$REPO_ROOT/skills/opengraphdb/SKILL.md"
    "$REPO_ROOT/skills/opengraphdb/references/benchmarks-snapshot.md"
    "$REPO_ROOT/documentation/MIGRATION-FROM-NEO4J.md"
  )
else
  CANONICAL="$1"
  SCAN=("$@")
fi

for f in "$CANONICAL" "${SCAN[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "[check-benchmarks-cell-internal-consistency] missing $f" >&2
    exit 2
  fi
done

python3 - "$CANONICAL" "${SCAN[@]}" <<'PY'
import re
import sys

canonical_path = sys.argv[1]
scan_paths = sys.argv[2:]

UNIT_TO_US = {
    'μs': 1.0,
    'us': 1.0,
    'ms': 1000.0,
    's':  1_000_000.0,
}

NUMERIC = re.compile(
    r'(?<![\w.])'
    r'(\d{1,3}(?:[ ,]\d{3})+|\d+)(\.\d+)?\s*'
    r'(μs|us|ms|s|MB|GB|nodes/s|ops/s|qps|commits/s|kHz|MHz)\b'
)

# Slash-separated numeric list with a trailing unit applied to every entry,
# e.g. "**38.8 / 46.7 / 112.6 ms**" or "**1.28 / 1.34 / 1.62 μs**". Restrict
# the unit alphabet to time/size scalars — `nodes/s` etc. already contain a
# slash and would tangle with the list separator.
SLASH_LIST = re.compile(
    r'((?:\d+(?:\.\d+)?\s*/\s*)+)(\d+(?:\.\d+)?)\s*(μs|us|ms|s|MB|GB)\b'
)

VERDICT_MARKERS = ('✅', '❌', '🟡', '⚠️', 'WIN', 'LOSS', 'NOVEL', 'DIRECTIONAL')

def normalize(s):
    # Canonicalize the two micro-signs that print the same: U+00B5 µ
    # (legacy micro sign) and U+03BC μ (Greek mu). Existing prose uses
    # both; treat them as a single unit.
    return s.replace('µ', 'μ')

def parse_value(int_part, dec_part):
    raw = int_part.replace(' ', '').replace(',', '')
    if dec_part:
        raw += dec_part
    return float(raw)

def find_tokens(s):
    """Yield (value, unit, raw_str) for every unit-bearing measurement,
    expanding slash-lists so the trailing unit attributes to every entry."""
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
        int_part = m.group(1)
        dec_part = m.group(2) or ''
        unit = m.group(3)
        yield parse_value(int_part, dec_part), unit, m.group(0)

def parse_rows(text):
    """Parse benchmark-row tables.

    Accepts both the 8-cell BENCHMARKS § 2 schema and the 5-cell snapshot
    schema. The deltas table inside § "Scope and honesty policy" uses the
    `> | … |` blockquote prefix and is excluded by the `startswith('| ')`
    guard. Other 5-cell tables (e.g. § 2.1 scorecard) are excluded by the
    cells[0]-must-be-int guard combined with the verdict-marker check.

    cells[2] is the OGDB headline cell and cells[-1] is the verdict cell
    in both schemas, so the index lookup is schema-agnostic.
    """
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
            'verdict': verdict,
            # Joined text of every cell in the row, used by CHECK A as a
            # permissive fallback so a bullet's continuation lines may cite
            # spec-target / competitive-threshold values (e.g. "the 150 ms
            # competitive threshold") without false-positiving.
            'all_cells_text': ' '.join(cells),
        }
    return rows

# Bullets allow both `- **Row 7 — Enrichment p95 …**` (BENCHMARKS § 3)
# and `- **Row 13** — read p95 …` (MIGRATION). Word-boundary after the
# digit covers both.
BULLET_RE = re.compile(r'^- \*\*Row (\d+)\b')

def parse_bullets(text):
    """Parse `- **Row N** …` bullets, accumulating wrapped continuation lines.

    Cycle-31 F01: MIGRATION-FROM-NEO4J.md uses multi-line bullets where the
    headline numbers (e.g. Row 7's `**38.8 / 46.7 / 112.6 ms**`) and the
    cycle-29-class back-reference (Row 10's `headline 128 000× ratio …`)
    live on *continuation* lines. Without accumulation, CHECK A only sees
    the bullet header line and silently misses partial-sweep drift on the
    wrapped lines. A continuation line is any indented (space- or
    tab-prefixed) non-empty line; a blank line or a non-indented line ends
    the current bullet.
    """
    bullets = []
    cur = None
    for line in text.splitlines():
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

# Cycle-31 F02: SKILL.md ships zero numbered row tables and zero `Row N`
# bullets, so parse_rows + parse_bullets both return empty for it. The
# substantive perf surface lives in a labeled "Performance you can expect"
# pipe-table (lines 281-285) whose first cell is a human label, not a row
# number. Map known label keywords to canonical BENCHMARKS row numbers so
# CHECK D can run the same OGDB-cell token comparison as CHECK A.
SKILL_LABEL_TO_ROW = [
    ('neighbors()', 3),
    ('LDBC SNB IS-1', 5),
    ('Enrichment round-trip', 7),
    ('Hybrid retrieval (vector kNN', 8),
    ('Graph-feature rerank batch', 10),
]

def parse_perf_table(text):
    """Parse SKILL.md-style labeled perf-table rows.

    Format: `| <label> | **<OGDB value>** | <spec target> | <verdict> |`
    where cells[0] is a human label (skipped by parse_rows because it isn't
    an integer) and cells[1] is the OGDB column. Returns rows whose label
    contains a known keyword anchor mapping to a canonical BENCHMARKS row.
    """
    rows = []
    for line in text.splitlines():
        if not line.startswith('| '):
            continue
        cells = [c.strip() for c in line.split('|')[1:-1]]
        if len(cells) < 2:
            continue
        if re.match(r'^\d+$', cells[0]):
            # Already covered by parse_rows.
            continue
        for keyword, num in SKILL_LABEL_TO_ROW:
            if keyword in cells[0]:
                rows.append({'num': num, 'ogdb': cells[1], 'label': cells[0]})
                break
    return rows

# Pattern: <op_value op_unit> <gap> [≈|~]? <N×> <faster|under|behind> <gap> <ref_value ref_unit>
MULT_PATTERN = re.compile(
    r'(\d+(?:\.\d+)?)\s*(μs|us|ms|s)\b'
    r'[^|]{0,200}?'
    r'(?:[≈~]\s*)?'
    r'(\d{1,3}(?:[ ,]\d{3})*)\s*[×x]'
    r'\s+(?:faster|under|behind)'
    r'[^|]{0,200}?'
    r'(\d+(?:\.\d+)?)\s*(μs|us|ms|s)\b'
)

PRIMARY_MULT_PATTERN = re.compile(
    r'(\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?)\s*[×x]'
    r'\s+(?:faster|under|behind|over|above|below|slower)\b'
)
BACKREF_MULT_PATTERN = re.compile(
    r'(\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?)\s*[×x]'
    r'\s+(?:ratio|multiplier|speedup|advantage|figure|headline)\b'
    r'|'
    r'\bheadline\s+(\d{1,3}(?:[ ,]\d{3})*(?:\.\d+)?)\s*[×x]'
)

def _parse_mult(s):
    return float(s.replace(' ', '').replace(',', ''))

with open(canonical_path, encoding='utf-8') as f:
    canonical_text = normalize(f.read())
canonical_rows = parse_rows(canonical_text)

errors = []

for path in scan_paths:
    with open(path, encoding='utf-8') as f:
        text = normalize(f.read())
    file_rows = parse_rows(text)
    bullets = parse_bullets(text)

    # ---------- CHECK A: bullet tokens vs canonical row OGDB cell ----------
    # Multi-line bullet support (cycle-31 F01): bullets now accumulate
    # continuation lines, which legitimately cite spec-target /
    # competitive-threshold values (e.g. Row 7 wraps "150 ms competitive
    # threshold; misses the 40 ms best-in-class bar by 7 ms" — none of
    # which are OGDB self-claims, but all live in the canonical row's
    # other cells). Permissive fallback: if a token doesn't match the
    # OGDB cell but does match *some* cell in the same canonical row,
    # treat it as a legitimate citation rather than stale carry-forward.
    for b in bullets:
        row = canonical_rows.get(b['num'])
        if not row:
            continue
        cell_by_unit = {}
        for v, u, _ in find_tokens(row['ogdb']):
            cell_by_unit.setdefault(u, []).append(v)
        row_by_unit = {}
        for v, u, _ in find_tokens(row['all_cells_text']):
            row_by_unit.setdefault(u, []).append(v)
        for v, u, raw in find_tokens(b['text']):
            if u not in cell_by_unit:
                # Different unit ⇒ likely competitor citation (e.g. Cohere
                # 171.5 ms in a μs row). Skip; not an OGDB self-claim.
                continue
            candidates = cell_by_unit[u]
            if any(abs(cv - v) <= max(abs(cv) * 0.02, 0.01) for cv in candidates):
                continue
            if any(abs(cv - v) <= max(abs(cv) * 0.02, 0.01) for cv in row_by_unit.get(u, [])):
                continue
            errors.append(
                f'{path}: § 3 row {b["num"]}: token "{raw.strip()}" — '
                f'canonical § 2 row {b["num"]} OGDB cell {u} values '
                f'are {candidates} (no match within 2 % tolerance). '
                f'Looks like a stale 0.3.0 carry-forward.'
            )

    # ---------- CHECK B: verdict-cell multiplier consistency ----------
    for num, row in file_rows.items():
        verdict = row['verdict']
        cell_by_unit = {}
        for v, u, _ in find_tokens(row['ogdb']):
            cell_by_unit.setdefault(u, []).append(v)
        for m in MULT_PATTERN.finditer(verdict):
            op_str, op_unit, mult_str, ref_str, ref_unit = m.groups()
            try:
                op = float(op_str)
                ref = float(ref_str)
                mult = float(mult_str.replace(' ', '').replace(',', ''))
            except ValueError:
                continue
            if op_unit not in UNIT_TO_US or ref_unit not in UNIT_TO_US:
                continue
            op_us  = op  * UNIT_TO_US[op_unit]
            ref_us = ref * UNIT_TO_US[ref_unit]
            if op_us == 0:
                continue
            expected = ref_us / op_us
            rel = abs(expected - mult) / max(abs(mult), 1.0)
            if rel > 0.10:
                errors.append(
                    f'{path}: Row {num} verdict: multiplier {int(mult)}× '
                    f'claims {ref}{ref_unit} ÷ {op}{op_unit}, but actual '
                    f'ratio is ≈ {expected:.0f}× (off by {rel*100:.1f} %, '
                    f'> 10 % tolerance). Either the operand or the '
                    f'multiplier is stale.'
                )
            # (b1) operand must appear in the row's OGDB cell, with unit
            # normalization (e.g. verdict "0.23 ms" matches OGDB-cell "233 μs").
            op_us_val = op * UNIT_TO_US[op_unit]
            all_us_candidates = []
            for cu, cvs in cell_by_unit.items():
                if cu in UNIT_TO_US:
                    for cv in cvs:
                        all_us_candidates.append((cu, cv, cv * UNIT_TO_US[cu]))
            if all_us_candidates and not any(
                abs(cu_us - op_us_val) <= max(abs(cu_us) * 0.02, 0.01)
                for _, _, cu_us in all_us_candidates
            ):
                cell_summary = ', '.join(f'{cv}{cu}' for cu, cv, _ in all_us_candidates)
                errors.append(
                    f'{path}: Row {num} verdict: multiplier operand '
                    f'"{op}{op_unit}" is not present in § 2 row {num} '
                    f'OGDB cell (headline values: {cell_summary}). '
                    f'Verdict math is grounded on a stale or out-of-row value.'
                )

    # ---------- CHECK C: verdict back-reference multiplier consistency ----------
    for num, row in file_rows.items():
        verdict = row['verdict']
        primary_mults = []
        for m in PRIMARY_MULT_PATTERN.finditer(verdict):
            try:
                primary_mults.append(_parse_mult(m.group(1)))
            except ValueError:
                continue
        if not primary_mults:
            continue
        seen_backrefs = set()
        for m in BACKREF_MULT_PATTERN.finditer(verdict):
            mstr = m.group(1) or m.group(2)
            if not mstr:
                continue
            key = mstr.replace(' ', '').replace(',', '')
            if key in seen_backrefs:
                continue
            seen_backrefs.add(key)
            try:
                mult = _parse_mult(mstr)
            except ValueError:
                continue
            if not any(abs(pm - mult) <= max(abs(pm) * 0.02, 1.0) for pm in primary_mults):
                primaries_fmt = sorted({int(pm) if pm.is_integer() else pm for pm in primary_mults})
                errors.append(
                    f'{path}: Row {num} verdict: back-reference multiplier '
                    f'"{mstr}×" does not match any primary multiplier in '
                    f'the same cell (primaries: {primaries_fmt}). '
                    f'Looks like a stale partial-sweep — the headline was '
                    f'updated but the back-reference was not.'
                )

    # ---------- CHECK C-bullets: bullet back-reference vs canonical row verdict ----------
    # Cycle-31 F01: MIGRATION-FROM-NEO4J.md Row 10 wraps "the headline
    # 128 000× ratio against Cohere Rerank 3.5" onto a continuation line.
    # CHECK C only operates on `file_rows` (numbered tables), and MIGRATION
    # ships none — so a stale back-reference (e.g. cycle-29 91 000× replay)
    # in a bullet escapes. Now that parse_bullets accumulates continuations,
    # scan each bullet for back-reference multipliers and require them to
    # match the canonical row's verdict-cell primary multipliers.
    for b in bullets:
        row = canonical_rows.get(b['num'])
        if not row:
            continue
        primaries = []
        for m in PRIMARY_MULT_PATTERN.finditer(row['verdict']):
            try:
                primaries.append(_parse_mult(m.group(1)))
            except ValueError:
                continue
        if not primaries:
            continue
        seen = set()
        for m in BACKREF_MULT_PATTERN.finditer(b['text']):
            mstr = m.group(1) or m.group(2)
            if not mstr:
                continue
            key = mstr.replace(' ', '').replace(',', '')
            if key in seen:
                continue
            seen.add(key)
            try:
                mult = _parse_mult(mstr)
            except ValueError:
                continue
            if not any(abs(pm - mult) <= max(abs(pm) * 0.02, 1.0) for pm in primaries):
                primaries_fmt = sorted({int(pm) if pm.is_integer() else pm for pm in primaries})
                errors.append(
                    f'{path}: § 3 row {b["num"]} bullet: back-reference '
                    f'multiplier "{mstr}×" does not match any canonical § 2 '
                    f'row {b["num"]} verdict primary multiplier '
                    f'(primaries: {primaries_fmt}). Looks like a stale '
                    f'partial-sweep — the headline was updated but the '
                    f'back-reference was not.'
                )

    # ---------- CHECK D: SKILL.md-style labeled perf-table tokens vs canonical row ----------
    # Cycle-31 F02: SKILL.md's "Performance you can expect" pipe-table
    # uses human labels (no row numbers, no `- **Row N**` bullets), so
    # CHECKS A/B/C return empty for it. Map known label keywords to
    # canonical BENCHMARKS row numbers (SKILL_LABEL_TO_ROW) and run a
    # CHECK-A-style ±2 % token comparison on the OGDB column. Same
    # permissive row-wide fallback as CHECK A.
    perf_table_rows = parse_perf_table(text)
    for pr in perf_table_rows:
        crow = canonical_rows.get(pr['num'])
        if not crow:
            continue
        cell_by_unit = {}
        for v, u, _ in find_tokens(crow['ogdb']):
            cell_by_unit.setdefault(u, []).append(v)
        row_by_unit = {}
        for v, u, _ in find_tokens(crow['all_cells_text']):
            row_by_unit.setdefault(u, []).append(v)
        for v, u, raw in find_tokens(pr['ogdb']):
            if u not in cell_by_unit:
                continue
            candidates = cell_by_unit[u]
            if any(abs(cv - v) <= max(abs(cv) * 0.02, 0.01) for cv in candidates):
                continue
            if any(abs(cv - v) <= max(abs(cv) * 0.02, 0.01) for cv in row_by_unit.get(u, [])):
                continue
            errors.append(
                f'{path}: perf-table label "{pr["label"]}" → canonical '
                f'§ 2 row {pr["num"]}: token "{raw.strip()}" — canonical '
                f'OGDB cell {u} values are {candidates} (no match within '
                f'2 % tolerance). Looks like a stale 0.3.0 carry-forward.'
            )

if errors:
    print('check-benchmarks-cell-internal-consistency: FAIL', file=sys.stderr)
    for e in errors:
        print('  - ' + e, file=sys.stderr)
    print('', file=sys.stderr)
    print(
        'Cycle-15 cf97159 / cycle-16 f72f7cd rebaselined § 2 to 0.4.0 N=5 but',
        file=sys.stderr,
    )
    print(
        'partial-swept § 3 + verdict cells. Update each flagged value to match',
        file=sys.stderr,
    )
    print(
        '§ 2, OR — if the value is intentionally a historical citation — move',
        file=sys.stderr,
    )
    print(
        'it out of the "Row N" prose so this gate skips it.',
        file=sys.stderr,
    )
    sys.exit(1)

print('check-benchmarks-cell-internal-consistency: ok')
PY
