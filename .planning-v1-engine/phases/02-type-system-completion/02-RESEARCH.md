# Phase 2: Type System Completion - Research

**Researched:** 2026-02-27
**Domain:** Rust property value types, Cypher temporal/collection type semantics, openCypher ISO 8601 parsing
**Confidence:** HIGH

---

## Summary

Phase 2 extends the existing `PropertyValue` enum (which today has only `Bool`, `I64`, `F64`, `String`, `Bytes`, `Vector`) with five new types: `Date`, `DateTime`, `Duration`, `List`, and `Map`. The codebase is a single large Rust file (`crates/ogdb-core/src/lib.rs`, ~33K lines) — all parser, executor, storage, and runtime logic lives in one module. There is no dedicated temporal library currently imported as a direct dependency of `ogdb-core`; `std::time::Duration` and `SystemTime` are the only time types used.

The storage layer (the `NodePropertyStore`) serializes `PropertyMap` using `serde_json::to_vec` and deserializes with `serde_json::from_slice`. This means all new types must round-trip through `serde_json`, requiring either tagged-string serialization (e.g., `{"$date": "2026-01-15"}`) or a custom `Serialize`/`Deserialize` implementation on the extended `PropertyValue` enum. The DESIGN.md specifies a binary on-disk `DatumTag` format, but the actual code uses JSON serialization — these must be reconciled. The practical path is to extend the `serde_json` round-trip with type-tagged objects rather than migrating to binary datum encoding in this phase.

The parser (`CypherParser::parse_postfix_expression`) currently only handles dot-notation property access. It does not handle subscript access (`expr[index]`, `expr[from..to]`). Similarly, map projection syntax (`n.meta{key}`) is not yet parsed as a postfix operator. The function dispatch (`evaluate_expression` → `FunctionCall` match) only handles `TOUPPER`, `TOLOWER`, and `COALESCE` — `date()`, `datetime()`, `duration()` functions return `RuntimeValue::Null` because they fall into the `_ => Ok(RuntimeValue::Null)` catch-all.

**Primary recommendation:** Implement all five types as variants of `PropertyValue`, use type-tagged JSON serialization for storage, wire `date()`/`datetime()`/`duration()` in the evaluator, add `[index]` and `[start..end]` subscript AST nodes with evaluation, and implement map key access and projection via the `PropertyAccess` pattern and a new `MapProjection` AST node.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Engine supports `date` property type with Cypher literal parsing, storage serialization, and query comparison | `date()` function dispatch + `PropertyValue::Date(i32)` + ISO 8601 date parser + comparison via days-since-epoch i32 ordering |
| DATA-02 | Engine supports `datetime` property type with timezone handling, Cypher literal parsing, storage serialization, and query comparison | `datetime()` function dispatch + `PropertyValue::DateTime(i64, i16)` (micros + tz_offset) + ISO 8601 datetime parser + comparison via microseconds-since-epoch |
| DATA-03 | Engine supports `duration` property type with Cypher literal parsing, storage serialization, and arithmetic operations | `duration()` function dispatch + `PropertyValue::Duration {months, days, nanos}` + ISO 8601 duration parser + BinaryOp::Add/Subtract dispatch for duration operands |
| DATA-04 | Engine supports `list<T>` property type with heterogeneous element storage, Cypher list operations (indexing, slicing, comprehensions), and serialization | `PropertyValue::List(Vec<PropertyValue>)` + subscript AST node + `parse_postfix_expression` extension for `[i]` and `[i..j]` + evaluator subscript dispatch |
| DATA-05 | Engine supports `map<string, T>` property type with nested access, Cypher map operations (projection, key access), and serialization | `PropertyValue::Map(BTreeMap<String, PropertyValue>)` + `PropertyAccess` on maps in evaluator + new `MapProjection` AST node for `n.meta{key}` syntax |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `serde` + `serde_json` | 1.x (already in Cargo.toml) | PropertyValue serialization/deserialization for storage | Already in use for all PropertyMap round-trips; extending it avoids a storage format migration |
| `std` (no external crate) | Rust stdlib | ISO 8601 parsing via hand-rolled parser | The date/duration formats needed (`date('2026-01-15')`, `duration('P1Y2M3DT4H5M6S')`) are subsets of ISO 8601 that can be parsed with a focused hand-rolled parser in ~100 lines, avoiding a new crate dependency |
| `winnow` | 0.6 (already in Cargo.toml) | Cypher parser extensions for subscript and map projection syntax | Already the project's parser combinator; all parser work stays in `CypherParser` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `time` | 0.3.47 (already in Cargo.lock transitively) | Could provide `Date`, `OffsetDateTime`, `Duration` primitives | Only if hand-rolled ISO 8601 parsing proves error-prone for edge cases. Cost: adds a direct dependency. The `time` crate is already in the lock file (pulled in by another crate), so adding it as a direct dep to `ogdb-core` has zero new download cost. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Type-tagged JSON serialization | Binary DatumTag format (as in DESIGN.md) | Binary format is more compact but requires migrating ALL existing property storage; JSON-tagged works without migration and is the practical choice for this phase |
| Hand-rolled ISO 8601 parser | `time` crate parsing (`time::Date::parse`) | `time` has format strings and handles edge cases; hand-rolled is simpler to review and avoids a new explicit dependency |
| Extend `PropertyValue` enum | Separate `TemporalValue` enum | Single enum keeps all match arms co-located; avoids wrapping/unwrapping layers |
| Custom `MapProjection` AST node | Reuse `FunctionCall` for map projection | `FunctionCall` is wrong semantically; a dedicated AST node keeps the evaluator clean |

**Installation:**
```bash
# No new crates required if hand-rolled ISO 8601 parsing is used
# If `time` is chosen as direct dep:
# Add to crates/ogdb-core/Cargo.toml:
# time = { version = "0.3", features = ["formatting", "parsing"] }
```

---

## Architecture Patterns

### Recommended Project Structure

All changes live in `crates/ogdb-core/src/lib.rs` (the project's monolithic module). Changes touch these logical layers in order:

```
crates/ogdb-core/src/lib.rs
├── PropertyValue enum          ← Add 5 new variants
├── Serialization layer         ← Extend serde_json custom impl
├── Comparison/ordering         ← Extend Ord/PartialOrd, compare_property_values
├── CypherLiteral / CypherExpression AST  ← No new literal kinds; date/datetime/duration are FunctionCall nodes
├── CypherExpression AST        ← Add ListSubscript and MapProjection variants
├── CypherParser                ← Extend parse_postfix_expression for [index]/[range]/{projection}
├── Semantic analysis           ← Add SemanticType::Date, ::DateTime, ::Duration
├── evaluate_expression         ← Wire date(), datetime(), duration() + subscript + map access
├── runtime_value_key           ← Extend for new types (for hashing/dedup)
├── format_property_value       ← Extend for display
├── property_value_to_json      ← Extend for output
└── json_value_to_property_value ← Extend for import
```

### Pattern 1: PropertyValue Enum Extension

**What:** Add five new variants to `PropertyValue` in a backward-compatible way.
**When to use:** For any new first-class property type.
**Example:**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "$type", content = "$value")]
pub enum PropertyValue {
    Bool(bool),
    I64(i64),
    F64(f64),
    String(String),
    Bytes(Vec<u8>),
    Vector(Vec<f32>),
    // New variants:
    Date(i32),                              // days since Unix epoch (1970-01-01)
    DateTime { micros: i64, tz_offset_minutes: i16 },  // micros since epoch + tz offset
    Duration { months: i64, days: i64, nanos: i64 },   // ISO 8601 duration components
    List(Vec<PropertyValue>),               // heterogeneous ordered list
    Map(std::collections::BTreeMap<std::string::String, PropertyValue>), // ordered map
}
```

**Serialization strategy:** Use a type-tagged JSON wrapper so existing data (untagged JSON booleans, numbers, strings) remains compatible:

```rust
// Existing storage: {"name": "Alice", "age": 30}
// New storage for date: {"ts": {"$type": "Date", "$value": 20469}}
// serde_json with the above enum handles this automatically with the tag attribute
```

WARNING: The current `PropertyValue` uses `#[derive(Serialize, Deserialize)]` without custom tags. If we add `#[serde(tag = "$type")]`, ALL serialized values change format. The safer approach is a custom `Serialize`/`Deserialize` that preserves backward compat:
- Primitives: serialize as raw JSON (backward compat)
- New types: serialize as tagged objects `{"$date": 20469}`, `{"$datetime": [micros, tz]}`, etc.

### Pattern 2: AST Extension for Subscript Access

**What:** Add `ListSubscript` and optionally `MapProjection` to `CypherExpression`.
**When to use:** `n.tags[1]`, `n.tags[0..2]`, `n.meta{key}`.

```rust
pub enum CypherExpression {
    // ... existing variants ...

    // n.tags[1] or n.tags[0..2]
    Subscript {
        base: Box<CypherExpression>,
        index: Box<CypherExpression>,     // integer index OR range start
        end: Option<Box<CypherExpression>>,  // None = single index, Some = range end
    },

    // n.meta{key} — map projection (key subset)
    MapProjection {
        base: Box<CypherExpression>,
        keys: Vec<String>,
    },
}
```

### Pattern 3: Parser Postfix Extension

**What:** Extend `parse_postfix_expression` to handle `[...]` after any expression.
**When to use:** List indexing/slicing and map subscript access.

```rust
fn parse_postfix_expression(&mut self) -> Result<CypherExpression, ParseError> {
    let mut expr = self.parse_primary_expression()?;
    loop {
        if self.match_punctuation(CypherPunctuation::Dot) {
            let property = self.parse_identifier("for property access")?;
            expr = CypherExpression::PropertyAccess {
                target: Box::new(expr),
                property,
            };
        } else if self.match_punctuation(CypherPunctuation::LeftBracket) {
            // Parse index or range: expr[n] or expr[n..m]
            let index = self.parse_expression()?;
            let end = if self.match_operator(CypherOperator::Range) {
                // ".." token — need to add this operator to the lexer
                Some(Box::new(self.parse_expression()?))
            } else {
                None
            };
            self.expect_punctuation(CypherPunctuation::RightBracket)?;
            expr = CypherExpression::Subscript {
                base: Box::new(expr),
                index: Box::new(index),
                end,
            };
        } else if self.check_punctuation(CypherPunctuation::LeftBrace) {
            // Map projection: n.meta{key1, key2}
            let keys = self.parse_map_projection_keys()?;
            expr = CypherExpression::MapProjection {
                base: Box::new(expr),
                keys,
            };
        } else {
            break;
        }
    }
    Ok(expr)
}
```

**NOTE:** The `..` range operator needs to be added to the lexer token set (`CypherOperator::Range` or handled as two dots). Check `CypherOperator` enum — currently the lexer handles `.` as `CypherPunctuation::Dot` and there is no `..` token.

### Pattern 4: Evaluator Dispatch for Temporal Functions

**What:** Wire `date()`, `datetime()`, `duration()` in `evaluate_expression`.
**When to use:** Processing `date('2026-01-15')` literals.

```rust
"DATE" => {
    let arg = arguments.first()
        .map(|a| self.evaluate_expression(a, row, snapshot_txn_id))
        .transpose()?
        .unwrap_or(RuntimeValue::Null);
    match arg {
        RuntimeValue::Property(PropertyValue::String(s)) => {
            parse_date_literal(&s)
                .map(|days| RuntimeValue::Property(PropertyValue::Date(days)))
                .ok_or_else(|| QueryError::new(&format!("invalid date: {s}")))
        }
        _ => Ok(RuntimeValue::Null),
    }
}
"DATETIME" => { /* similar, parse_datetime_literal -> DateTime{micros, tz_offset_minutes} */ }
"DURATION" => { /* similar, parse_duration_literal -> Duration{months, days, nanos} */ }
```

### Pattern 5: ISO 8601 Parsing Functions

**What:** Dedicated parsing functions for date, datetime, duration ISO 8601 strings.

```rust
/// Parses "2026-01-15" -> days since 1970-01-01
fn parse_date_literal(s: &str) -> Option<i32> {
    // Format: YYYY-MM-DD (10 chars minimum)
    // Handle leap years, month lengths
}

/// Parses "2026-01-15T09:00:00Z" or "...+05:30" -> (micros_since_epoch, tz_offset_minutes)
fn parse_datetime_literal(s: &str) -> Option<(i64, i16)> {
    // Split on T, parse date + time, handle Z/+HH:MM/−HH:MM tz suffix
}

/// Parses "P1Y2M3DT4H5M6S" -> (months, days, nanos)
fn parse_duration_literal(s: &str) -> Option<(i64, i64, i64)> {
    // ISO 8601 duration: P[n]Y[n]M[n]DT[n]H[n]M[n]S
    // months = years*12 + months; days = days; nanos from H/M/S
}
```

### Pattern 6: Arithmetic with Duration

**What:** Extend `BinaryOp::Add` / `BinaryOp::Subtract` in `evaluate_expression` to handle duration + duration and date + duration.

```rust
// In the Add/Subtract arm of evaluate_expression:
// Check if either operand is a temporal type before falling through to numeric path
(RuntimeValue::Property(PropertyValue::Duration { .. }), RuntimeValue::Property(PropertyValue::Duration { .. })) => {
    // Add months, days, nanos; no calendar normalization needed (openCypher spec)
}
(RuntimeValue::Property(PropertyValue::Date(days)), RuntimeValue::Property(PropertyValue::Duration { months, days: d, .. })) => {
    // date + duration: approximate by adding days (months approximated as 30 days for date arithmetic)
    // Note: Full calendar arithmetic (correct month-length handling) is complex
}
```

### Anti-Patterns to Avoid

- **Using `String` as a proxy for temporal types:** The current `json_value_to_property_value` falls back to `PropertyValue::String(other.to_string())` for unknown JSON. Don't rely on this for stored dates.
- **Storing lists as serialized strings:** `ListLiteral` currently renders to a string like `"[key1, key2, key3]"`. This is for display only and does not support indexing/slicing.
- **Conflating `RuntimeValue` and `PropertyValue`:** New temporal/collection types must be added to both `PropertyValue` (storage/query results) and properly handled wherever `runtime_to_property_value` converts `RuntimeValue::Property(...)` to a `PropertyValue`.
- **Skipping `Ord`/comparison extension:** `compare_property_values` currently returns `None` for cross-type comparisons. New temporal types must define comparison semantics (dates compare as i32, datetimes as i64, durations partially ordered by total approximate nanos).
- **Not extending `property_value_variant_rank`:** The `Ord` impl uses `property_value_variant_rank` for cross-type ordering. New variants must be assigned ranks.
- **Map projection in postfix position creating ambiguity:** `n.meta{key}` uses `{` which is also a `MapLiteral` in primary expression position. The postfix parser must only treat `{` after an expression as map projection, not re-parse it as a new literal.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gregorian leap year / month-length arithmetic | Custom calendar math | `time` crate 0.3 (`time::Date::from_calendar_date`) | Gregorian rules have many edge cases (century years, tz offset DST) |
| ISO 8601 duration regex | Custom regex-based parser | A focused `winnow` combinator or `time`'s parsing | Duration grammar has optional-parts combinations that are error-prone manually |
| IANA timezone database | Custom tz name→offset map | Cypher only needs fixed UTC offset (`+05:30`), not IANA names, so manual parsing of `±HH:MM` is sufficient | openCypher `datetime()` accepts string with fixed offsets, not IANA names |

**Key insight:** The Cypher temporal type specification (openCypher) uses ISO 8601 with a manageable subset. A ~200-line parser covering dates, datetimes with UTC offset, and durations is feasible without a crate, but the `time` 0.3 crate (already transitive in the lock file) would handle all edge cases with one `cargo add` line to `ogdb-core/Cargo.toml`.

---

## Common Pitfalls

### Pitfall 1: Serde Backward Compatibility Break

**What goes wrong:** Adding `#[serde(tag = "$type")]` to `PropertyValue` changes serialization for ALL existing values (including `Bool`, `I64`, `String`). Existing `.ogdb` files become unreadable.

**Why it happens:** Serde's tag-based enum serialization rewrites the representation of every variant, not just new ones.

**How to avoid:** Write a custom `Serialize`/`Deserialize` implementation where primitives serialze as bare JSON values (matching current behavior) and new types serialize as `{"$date": 20469}` etc. The deserializer checks for `$date`/`$datetime`/`$duration`/`$list`/`$map` keys; if absent, falls back to current behavior.

**Warning signs:** Existing e2e tests fail to open databases created before the change.

### Pitfall 2: `runtime_value_key` Hashing Collision

**What goes wrong:** `runtime_value_key` is used for deduplication (GROUP BY, DISTINCT, IN operator). If two different values produce the same key string, semantics are silently wrong.

**Why it happens:** The current implementation formats values as `"i64:42"`, `"string:42"` etc. New types must use distinct prefixes: `"date:20469"`, `"datetime:1736935200000000+0"` etc.

**How to avoid:** Add `Date`, `DateTime`, `Duration`, `List`, `Map` arms to `runtime_value_key` with unique, lossless string representations.

**Warning signs:** `MATCH (n) WHERE n.ts = datetime('...') RETURN n` returns wrong results when multiple temporal values are present.

### Pitfall 3: Subscript Parsing Ambiguity with List Literal

**What goes wrong:** `n.tags[1]` is parsed, but `[1, 2, 3][0]` needs to work too. The postfix `[...]` must handle the case where the base expression is itself a list literal.

**Why it happens:** `parse_list_expression` is called from `parse_primary_expression` when `[` is encountered. After parsing the list literal, control returns to `parse_postfix_expression` which must then see the second `[0]` and handle it.

**How to avoid:** The postfix loop in `parse_postfix_expression` must check for `[` AFTER parsing any primary expression including list literals. The current code only handles `.` in the postfix loop — extend it to also handle `[`.

**Warning signs:** `RETURN ['a','b','c'][1]` fails to parse or returns wrong value.

### Pitfall 4: Duration Arithmetic Semantic Contract

**What goes wrong:** `duration('P1Y2M') + duration('P3D')` must return a duration with `months=14, days=3`, not normalize to total days. The openCypher spec keeps year/month and day/time components separate in duration arithmetic.

**Why it happens:** ISO 8601 durations have two separate component groups (Y/M and D/T) that don't directly interconvert (a month is not a fixed number of days).

**How to avoid:** Store `Duration` as `{months: i64, days: i64, nanos: i64}` (matching the DESIGN.md datum spec). Duration addition is `months_a + months_b`, `days_a + days_b`, `nanos_a + nanos_b` — no calendar normalization.

**Warning signs:** `duration('P1Y') + duration('P365D')` produces a different result than expected.

### Pitfall 5: Map Property Access vs. Map Projection Confusion

**What goes wrong:** `n.meta.key` (dot access on a map property) and `n.meta{key}` (map projection, returns a map with subset of keys) are different operations. The evaluator must handle both.

**Why it happens:** `PropertyAccess` is currently handled for `Node` and `Edge` targets only. When the target is a `RuntimeValue::Property(PropertyValue::Map(...))`, it should support key access.

**How to avoid:** In the `PropertyAccess` evaluator arm, check if the target is a `PropertyValue::Map` and look up the key. Add a new `MapProjection` evaluator arm for `{key}` projection syntax.

**Warning signs:** `RETURN n.meta.key` returns `null` even when the property exists and contains the key.

### Pitfall 6: List Comprehension Not Yet Implemented

**What goes wrong:** The AST node `ListComprehension` already exists (parsed), but the evaluator returns `RuntimeValue::Null` for it (`CypherExpression::ListComprehension { .. } => Ok(RuntimeValue::Null)`).

**Why it happens:** List comprehension requires evaluating a predicate and projection over a list — it was deferred.

**How to avoid:** Implementing list comprehension is part of DATA-04. The plan must include a task to implement the evaluator arm for `ListComprehension`, not just `Subscript`.

**Warning signs:** `[x IN n.tags WHERE x STARTS WITH 'a']` returns null.

---

## Code Examples

Verified patterns from codebase inspection:

### Current PropertyValue Enum (to be extended)

```rust
// Source: crates/ogdb-core/src/lib.rs line 450
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PropertyValue {
    Bool(bool),
    I64(i64),
    F64(f64),
    String(String),
    Bytes(Vec<u8>),
    Vector(Vec<f32>),
    // Phase 2 adds: Date, DateTime, Duration, List, Map
}
```

### Current Storage Serialization (JSON round-trip)

```rust
// Source: crates/ogdb-core/src/lib.rs line 9573
serde_json::from_slice::<PropertyMap>(&serialized)

// Source: line 9579
let serialized = serde_json::to_vec(properties).expect("known-serializable type");
```

### Current FunctionCall Evaluator (catch-all to extend)

```rust
// Source: crates/ogdb-core/src/lib.rs line 12673
CypherExpression::FunctionCall { name, arguments, .. } => match name.to_ascii_uppercase().as_str() {
    "TOUPPER" => { /* ... */ }
    "TOLOWER" => { /* ... */ }
    "COALESCE" => { /* ... */ }
    _ => Ok(RuntimeValue::Null),  // ← date/datetime/duration fall here; must be wired
},
```

### Current ListLiteral Evaluator (renders to string — must be replaced for proper List support)

```rust
// Source: crates/ogdb-core/src/lib.rs line 12862
CypherExpression::ListLiteral(values) => {
    let rendered = values.iter()
        .map(|value| self.evaluate_expression(value, row, snapshot_txn_id))
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .map(runtime_value_key)
        .collect::<Vec<_>>()
        .join(", ");
    Ok(RuntimeValue::Property(PropertyValue::String(format!("[{rendered}]"))))
    // ↑ This must become PropertyValue::List(Vec<PropertyValue>) for DATA-04
},
```

### DESIGN.md On-Disk Datum Format (reference, not yet implemented)

```rust
// Source: DESIGN.md Section 14
enum DatumTag {
    Date     = 0x06,   // tag + i32 (days since epoch)
    DateTime = 0x07,   // tag + i64 (microseconds since epoch) + i16 (tz offset minutes)
    Duration = 0x08,   // tag + i64 months + i64 days + i64 nanos
    List     = 0x09,   // tag + u32 count + Datum elements
    Map      = 0x0A,   // tag + u32 count + (String key, Datum value) pairs
}
```

### ISO 8601 Duration Format (openCypher)

```
P[n]Y[n]M[n]DT[n]H[n]M[n]S
P1Y2M         = 14 months, 0 days, 0 nanos
P3D           = 0 months, 3 days, 0 nanos
PT4H30M       = 0 months, 0 days, 16200_000_000_000 nanos (4.5 hours)
P1Y2M3DT4H    = 14 months, 3 days, 14400_000_000_000 nanos
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String proxy for all types | Typed `PropertyValue` enum | Phase 2 (now) | First-class temporal/collection semantics |
| `evaluate_expression` returning Null for unknown functions | Wired `date()`, `datetime()`, `duration()` dispatch | Phase 2 (now) | Temporal literals stop silently returning null |
| `ListLiteral` rendered as string | `ListLiteral` produces `PropertyValue::List(...)` | Phase 2 (now) | Indexing and slicing become possible |
| `MapLiteral` rendered as string | `MapLiteral` produces `PropertyValue::Map(...)` | Phase 2 (now) | Map key access and projection become possible |
| No subscript in postfix parser | `parse_postfix_expression` handles `[i]` and `[i..j]` | Phase 2 (now) | `n.tags[0]` and `n.tags[1..3]` parse correctly |

**Deprecated/outdated:**
- Relying on `PropertyValue::String` to proxy-represent structured values: replaced by typed variants.
- `json_value_to_property_value` fallback to String for unrecognized JSON: must be updated to recognize tagged objects.

---

## Open Questions

1. **Backward compatibility for existing `.ogdb` files with new PropertyValue serialization**
   - What we know: current storage uses raw `serde_json` with no type tags; existing databases contain `{"key": "value", "count": 42}` etc.
   - What's unclear: whether any existing database is expected to survive a schema migration, or whether the project is pre-production enough that a clean-break is acceptable.
   - Recommendation: Use custom Serialize/Deserialize that writes primitives as bare JSON (backward compat) and new types as tagged objects (`{"$date": 20469}`). This preserves all existing data.

2. **`..` range operator in the lexer**
   - What we know: `CypherOperator` and `CypherPunctuation` enums don't have a `..` or `Range` token; the lexer's `lex_operator` function handles single-char operators.
   - What's unclear: how `n.tags[0..2]` should be tokenized — as `[`, `0`, `..`, `2`, `]` or as `[`, integer `0`, `.`, `.`, integer `2`, `]`.
   - Recommendation: Add a `DotDot` or `Range` punctuation token to the lexer (check for two consecutive dots before accepting single dot as punctuation). Wire into `parse_postfix_expression` subscript handling.

3. **Map projection `{key}` vs. property inline `{key: expr}` disambiguation**
   - What we know: `{key: expr}` is a `MapLiteral` (parsed in `parse_primary_expression` when `{` is seen). Map projection `n.meta{key}` would use `{` as a postfix operator.
   - What's unclear: whether a bare identifier inside `{...}` after a base expression is unambiguously a projection (no `:` follows) vs. a map literal with shorthand syntax.
   - Recommendation: In `parse_postfix_expression`, after parsing any primary expression, check if the next token is `{`. If so, peek ahead: if the token sequence inside is `identifier}` or `identifier, identifier}` (no colons), treat it as map projection. Otherwise don't consume the `{` (leave it for the next statement).

4. **`ListComprehension` evaluator implementation scope**
   - What we know: `CypherExpression::ListComprehension` AST node exists and is parsed, but evaluator returns `Null`.
   - What's unclear: whether list comprehensions are strictly required by DATA-04 or if basic indexing/slicing is sufficient.
   - Recommendation: DATA-04 says "comprehensions" explicitly. Implement the `ListComprehension` evaluator in plan 02-03. It requires iterating over a `PropertyValue::List`, binding each element to the variable, evaluating the predicate, and collecting projection results into a new `PropertyValue::List`.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `crates/ogdb-core/src/lib.rs` lines 448–512 (PropertyValue), 1267–1319 (AST), 5915–5983 (parser postfix), 9551–9603 (storage), 12625–12933 (evaluator) — direct code reading
- `DESIGN.md` Section 14 (Type System & Serialization) — on-disk DatumTag spec
- `Cargo.toml` (workspace) and `crates/ogdb-core/Cargo.toml` — current dependencies
- `Cargo.lock` — transitive dependency versions (`time = 0.3.47` already present)
- `ARCHITECTURE.md` Section 3 — canonical type list
- `SPEC.md` Section 4.3 — supported property types
- `.planning/REQUIREMENTS.md` — DATA-01 through DATA-05 definitions

### Secondary (MEDIUM confidence)

- openCypher specification temporal type semantics: ISO 8601 date/datetime/duration formats as used in Neo4j/openCypher are well-established; `date('YYYY-MM-DD')`, `datetime('...T...Z')`, `duration('PnYnMnDTnHnMnS')` are the canonical forms.
- `DESIGN.md` DatumTag section: architecture intention for binary storage (not yet implemented in code; JSON is the actual current path).

### Tertiary (LOW confidence)

- `time` crate 0.3 API for parsing dates: consistent with known API but not verified via Context7 against version 0.3.47 specifics.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct Cargo.toml and lock file inspection; no new crates required
- Architecture: HIGH — code was directly read; all touch points identified
- Pitfalls: HIGH — derived from direct code inspection of current behavior (what falls to `_ => Ok(RuntimeValue::Null)`, what serializes as string, where serde tag would break compat)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain; valid until next major codebase restructure)
