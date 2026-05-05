#!/usr/bin/env bash
# EVAL-PERF-RELEASE-CYCLE28 F01+F02+F03 regression gate: lock § 3
# methodology disclosure + § 2 verdict-cell multipliers to the same
# numerical truth as the § 2 OpenGraphDB-column headline values.
#
# Bug class this gate closes: cycle-15 cf97159 / cycle-16 f72f7cd
# rebaselined § 2 to 0.4.0 N=5 medians but only partially swept the
# document. Three values stayed pinned to the retired 0.3.0 N=5 baseline:
#   • Row 7 § 3 enrichment p95 = "45.4 ms"  (cell now 46.7 ms)
#   • Row 13 § 3 scaling tier  = "27 MB / 0.29 s / 0.26 μs"  (cell now 28.0 MB / 0.32 s / 0.38 μs)
#   • Row 10 § 2 verdict cell  = "1.88 μs is 91 000× faster ... 27 000× under"
#                                (cell now 1.34 μs ⇒ ratios 128 000× / 37 000×)
# Cycle-28 F01-F03 audited the drift; cycles 16-25+27 each missed it
# because the existing version gate only diffs headline-vs-§2-column-header,
# not § 3-vs-§ 2 or verdict-cell-vs-row-headline.
#
# What this gate validates:
#   A. Every unit-bearing numeric token in a § 3 "Row N — …" bullet whose
#      unit also appears in § 2 row N's OpenGraphDB cell must match a
#      cell value within 2 % (or 0.05 absolute, whichever is larger). A
#      § 3 token whose unit is absent from the cell (e.g. a "171.5 ms"
#      Cohere citation in a Row 10 μs row) is skipped — it's a competitor
#      reference, not an OGDB self-claim.
#   B. Every § 2 verdict cell with an explicit
#         "<X.Y unit_a> … <N>× faster|under|behind … <R unit_b>"
#      shape must (b1) have its operand X.Y match a value in the row's
#      OGDB cell unit_a tokens (within 2 %), and (b2) divide cleanly:
#      ref ÷ operand ≈ N within 10 %. Operand-not-in-headline catches
#      F03 directly (1.88 μs not in [1.28, 1.34, 1.62]); the divide-cleanly
#      check catches the converse (right operand, wrong multiplier).
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "[check-benchmarks-cell-internal-consistency] python3 unavailable; skipping." >&2
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCHMARKS_MD="${1:-$REPO_ROOT/documentation/BENCHMARKS.md}"

if [[ ! -f "$BENCHMARKS_MD" ]]; then
  echo "[check-benchmarks-cell-internal-consistency] missing $BENCHMARKS_MD" >&2
  exit 2
fi

python3 - "$BENCHMARKS_MD" <<'PY'
import re
import sys

path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    text = f.read()

# Canonicalize the two micro-signs that print the same: U+00B5 µ (legacy
# micro sign) and U+03BC μ (Greek mu). Existing prose uses both; treat
# them as a single unit.
text = text.replace('µ', 'μ')

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

# § 2 table data rows: 8-cell markdown rows whose first cell is an integer.
# (The deltas table inside § "Scope and honesty policy" has 5 cells, so
# the cell-count guard isolates § 2.)
rows = {}
for line in text.splitlines():
    if not line.startswith('| '):
        continue
    cells = [c.strip() for c in line.split('|')[1:-1]]
    if len(cells) < 8:
        continue
    if not re.match(r'^\d+$', cells[0]):
        continue
    rows[int(cells[0])] = {
        'ogdb': cells[2],
        'verdict': cells[-1],
    }

# § 3 bullets: lines starting with "- **Row N ".
bullets = []
for line in text.splitlines():
    m = re.match(r'^- \*\*Row (\d+) ', line)
    if m:
        bullets.append({'num': int(m.group(1)), 'text': line})

errors = []

# ---------- CHECK A: § 3 numbers must match § 2 row OGDB cell ----------
for b in bullets:
    row = rows.get(b['num'])
    if not row:
        continue
    cell_by_unit = {}
    for v, u, _ in find_tokens(row['ogdb']):
        cell_by_unit.setdefault(u, []).append(v)
    for v, u, raw in find_tokens(b['text']):
        if u not in cell_by_unit:
            # Different unit ⇒ likely competitor citation (e.g. Cohere
            # 171.5 ms in a μs row). Skip; not an OGDB self-claim.
            continue
        candidates = cell_by_unit[u]
        if not any(abs(cv - v) <= max(abs(cv) * 0.02, 0.01) for cv in candidates):
            errors.append(
                f'§ 3 row {b["num"]}: token "{raw.strip()}" — § 2 row '
                f'{b["num"]} OGDB cell {u} values are {candidates} '
                f'(no match within 2 % tolerance). '
                f'Looks like a stale 0.3.0 carry-forward.'
            )

# ---------- CHECK B: verdict-cell multiplier consistency ----------
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

for num, row in rows.items():
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
                f'Row {num} verdict: multiplier {int(mult)}× claims '
                f'{ref}{ref_unit} ÷ {op}{op_unit}, but actual ratio is '
                f'≈ {expected:.0f}× (off by {rel*100:.1f} %, > 10 % tolerance). '
                f'Either the operand or the multiplier is stale.'
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
                f'Row {num} verdict: multiplier operand "{op}{op_unit}" '
                f'is not present in § 2 row {num} OGDB cell '
                f'(headline values: {cell_summary}). '
                f'Verdict math is grounded on a stale or out-of-row value.'
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
