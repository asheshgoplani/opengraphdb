# Data Quality Validation Rules

Run these validation checks on source data before generating any import Cypher. Report all warnings to the user as part of the pre-import summary. Never silently skip problematic data.

## Validation Checks

### 1. Schema Compatibility

Call `browse_schema` and compare the proposed import schema against existing database state:
- **Label conflicts**: If a label already exists, check that the proposed properties are compatible (same types, no naming collisions).
- **Relationship type conflicts**: If a relationship type already exists, verify it connects the same label pairs.
- **Property type mismatches**: If a property key exists with a different type than proposed, warn the user. Example: existing `age` is Integer but import has `age` as String.

Report: "Label :Person already exists with properties [name: String, age: Integer]. Import adds email: String. No conflicts detected."

### 2. Uniqueness Check

For each column designated as a merge key:
- Count distinct values vs total rows.
- If distinct count < total rows, there are duplicates.
- Report: "Merge key 'id' has 1,247 rows but only 1,200 unique values. 47 duplicate IDs detected."
- List the first 5 duplicate values so the user can investigate.

Duplicates in merge keys are not blocking but require user awareness since MERGE will update existing nodes.

### 3. Type Consistency

For each column, verify that all non-null values share the same type:
- If a column has 1,000 integers and 3 strings, report: "Column 'age' is mostly Integer (99.7%) but has 3 String values: ['unknown', 'N/A', 'thirty']. Recommend: clean to Integer or import as String."
- Mixed type columns default to String unless the user specifies otherwise.
- Flag columns where >5% of values differ from the majority type.

### 4. Null Value Analysis

For each column, count null/empty values:
- **0% nulls**: No warning needed.
- **1-20% nulls**: Informational note: "Column 'email' has 45 null values (3.6%). These will import as null properties."
- **20-50% nulls**: Warning: "Column 'phone' is 35% null. Consider whether this property is meaningful."
- **50%+ nulls**: Strong warning: "Column 'middle_name' is 72% null. This property may not be useful in the graph."

Null values are valid in OpenGraphDB. Never skip rows with null values unless the null is in the merge key column.

### 5. String Length Check

For each String column, check maximum value length:
- Warn if any value exceeds 10,000 characters: "Column 'description' has 3 values exceeding 10,000 characters (max: 45,230). Long strings impact query performance."
- Warn if any value is empty string (`""`) as opposed to null. Empty strings are valid but may indicate data quality issues.

### 6. Relationship Endpoint Validity

For relationship imports, verify that both source and target nodes exist or will be created:
- Check if the foreign key values in the relationship column match IDs in the node data.
- Report orphaned references: "Column 'department_id' has 12 values that don't match any Department node ID. These relationships will fail to create."
- Suggest importing the missing nodes first or skipping the orphaned relationships.

### 7. Encoding Validation

Check for encoding issues in string values:
- **Non-UTF-8 bytes**: Flag and report the affected rows.
- **Control characters**: Characters with code points 0x00-0x1F (except tab 0x09 and newline 0x0A) are suspicious. Report: "Row 45 contains control character 0x03 in column 'name'."
- **BOM**: Byte Order Mark at file start. Strip before processing and warn.
- **Mojibake**: Common patterns like `Ã©` (UTF-8 bytes interpreted as Latin-1) suggest encoding mismatch.

### 8. Duplicate Row Detection

Check for fully identical rows (all columns match):
- Report: "Found 15 duplicate rows (exact matches across all columns). MERGE will handle these correctly, but they may indicate a data quality issue."
- List the first 3 duplicate rows for inspection.

Partial duplicates (same merge key, different other columns) are handled by MERGE's ON MATCH SET behavior. Report these as "merge key collisions with differing data."

### 9. Date and Time Format Consistency

For columns detected as Date or DateTime:
- Verify all values use the same format. Mixed formats like `2024-01-15` and `01/15/2024` in the same column should trigger a warning.
- Preferred format: ISO 8601 (`YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:MM:SS` for datetimes).
- If non-ISO formats are detected, suggest conversion: "Column 'created_at' uses format MM/DD/YYYY. Convert to ISO 8601 (YYYY-MM-DD) before import."
- Check for invalid dates: February 30, month 13, etc.

### 10. Numeric Range Check

For Integer and Float columns:
- Report the min and max values.
- Warn about extreme values that may indicate errors: "Column 'age' has min=-1, max=999. Values -1 and 999 may be sentinel values, not real ages."
- Check for consistent precision in Float columns. Mixed precision (some values 2 decimal places, some 10) may indicate data issues.

## Pre-Import Checklist

Before executing any import, present this summary to the user and wait for confirmation:

```
Import Summary:
  Source: employees.csv (1,247 rows)
  Format: CSV (comma-delimited, UTF-8)

  Will Create:
    Nodes:  1,200 :Employee nodes (after dedup on 'id')
    Nodes:  25 :Department nodes
    Edges:  1,180 :WORKS_IN relationships
    Edges:  1,100 :REPORTS_TO relationships

  Cypher Statements: ~4,505 (12 UNWIND batches of ~100 + relationship batches)

  Warnings:
    - 47 duplicate IDs in 'id' column (will MERGE, not duplicate)
    - Column 'phone' is 35% null
    - 12 orphaned 'department_id' values (relationships will be skipped)

  Proceed with import? [Awaiting confirmation]
```

Do NOT execute any Cypher until the user confirms.

## Post-Import Verification

After import completes, always run these verification steps:

### Step 1: Count Verification
```cypher
MATCH (n) RETURN labels(n) AS label, count(n) AS count
```
Compare actual counts against expected counts from the import summary.

### Step 2: Relationship Verification
```cypher
MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count
```
Verify relationship counts match expectations.

### Step 3: Sample Data Check
Run a sample query for each imported label to verify data is accessible:
```cypher
MATCH (e:Employee) RETURN e.name, e.age, e.email LIMIT 5
```

### Step 4: Report Results
Present the verification results:
```
Import Complete:
  Nodes created: 1,225 (expected 1,225)
  Relationships created: 2,280 (expected 2,280)

  Breakdown:
    :Employee - 1,200 nodes
    :Department - 25 nodes
    :WORKS_IN - 1,180 relationships
    :REPORTS_TO - 1,100 relationships

  Sample data verified for all labels.
  Status: SUCCESS
```

If counts do not match, report the discrepancy and suggest investigation steps.
