#!/usr/bin/env sh
# ogdb-import-rdf.sh — import an RDF file (turtle, n-triples, jsonld, rdfxml)
# into an OGDB database.
#
# Usage: ogdb-import-rdf.sh <db-path> <rdf-file> [--format turtle|nt|jsonld|rdfxml]
set -eu

usage() {
  cat <<EOF
Usage: $0 <db-path> <rdf-file> [--format <fmt>]
  fmt: turtle (default), nt, jsonld, rdfxml — auto-detected from extension if omitted.
EOF
  exit 2
}

[ $# -lt 2 ] && usage

DB="$1"; shift
SRC="$1"; shift

FMT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --format) FMT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

if [ -z "$FMT" ]; then
  case "$SRC" in
    *.ttl)        FMT="turtle" ;;
    *.nt)         FMT="nt" ;;
    *.jsonld|*.json) FMT="jsonld" ;;
    *.rdf|*.xml)  FMT="rdfxml" ;;
    *) echo "could not infer format from extension; pass --format" >&2; exit 2 ;;
  esac
fi

if [ ! -f "$DB" ]; then
  ogdb init "$DB"
fi

ogdb import-rdf "$DB" "$SRC" --rdf-format "$FMT"
echo "imported $SRC into $DB ($FMT)"
ogdb stats "$DB"
