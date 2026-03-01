#!/usr/bin/env python3
"""Convert Air Routes dataset to OpenGraphDB JSON import format.

Node IDs: 1_000_000+
Edge IDs: 1_000_000+

Source: https://github.com/krlawrence/graph/tree/master/sample-data

Column names in CSV use typed suffixes, e.g. lat:double, code:string, runways:int.
"""

import csv
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(ROOT_DIR, "data", "cache")
OUT_PATH = os.path.join(ROOT_DIR, "datasets", "airroutes.json")

NODE_ID_BASE = 1_000_000
EDGE_ID_BASE = 1_000_000


def get_col(row, *names, default=''):
    """Try multiple possible column name variants (with or without type suffix)."""
    for name in names:
        if name in row and row[name] is not None and row[name].strip():
            return row[name].strip()
    return default


def main():
    nodes_path = os.path.join(CACHE_DIR, "air-routes-latest-nodes.csv")
    edges_path = os.path.join(CACHE_DIR, "air-routes-latest-edges.csv")

    if not os.path.exists(nodes_path):
        print(f"ERROR: {nodes_path} not found. Run: bash scripts/download-airroutes.sh")
        raise SystemExit(1)
    if not os.path.exists(edges_path):
        print(f"ERROR: {edges_path} not found. Run: bash scripts/download-airroutes.sh")
        raise SystemExit(1)

    nodes = []
    edges = []
    node_id_counter = NODE_ID_BASE
    edge_id_counter = EDGE_ID_BASE

    # Map from original graph id (~id column) to our new node id
    original_to_new = {}

    airport_count = 0
    country_count = 0
    continent_count = 0

    print("Reading air-routes-latest-nodes.csv...")
    with open(nodes_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = get_col(row, '~label')

            # Skip version metadata row
            if label == 'version' or label == '':
                continue

            orig_id = get_col(row, '~id')
            if not orig_id:
                continue

            if label == 'airport':
                # lat:double and lon:double are the actual column names
                try:
                    lat = float(row.get('lat:double', '0') or '0')
                except (ValueError, TypeError):
                    lat = 0.0
                try:
                    lon = float(row.get('lon:double', '0') or '0')
                except (ValueError, TypeError):
                    lon = 0.0

                try:
                    runways = int(row.get('runways:int', '0') or '0')
                except (ValueError, TypeError):
                    runways = 0

                try:
                    elev = int(row.get('elev:int', '0') or '0')
                except (ValueError, TypeError):
                    elev = 0

                node = {
                    "id": node_id_counter,
                    "labels": ["Airport"],
                    "properties": {
                        "code": get_col(row, 'code:string'),
                        "icao": get_col(row, 'icao:string'),
                        "name": get_col(row, 'desc:string'),
                        "city": get_col(row, 'city:string'),
                        "country": get_col(row, 'country:string'),
                        "region": get_col(row, 'region:string'),
                        "lat": lat,
                        "lon": lon,
                        "runways": runways,
                        "elev": elev,
                        "_label": "Airport",
                        "_dataset": "airroutes",
                    }
                }
                original_to_new[orig_id] = node_id_counter
                node_id_counter += 1
                nodes.append(node)
                airport_count += 1

            elif label == 'country':
                code = get_col(row, 'code:string')
                node = {
                    "id": node_id_counter,
                    "labels": ["Country"],
                    "properties": {
                        "code": code,
                        "name": get_col(row, 'desc:string'),
                        "_label": "Country",
                        "_dataset": "airroutes",
                    }
                }
                original_to_new[orig_id] = node_id_counter
                node_id_counter += 1
                nodes.append(node)
                country_count += 1

            elif label == 'continent':
                code = get_col(row, 'code:string')
                node = {
                    "id": node_id_counter,
                    "labels": ["Continent"],
                    "properties": {
                        "code": code,
                        "name": get_col(row, 'desc:string'),
                        "_label": "Continent",
                        "_dataset": "airroutes",
                    }
                }
                original_to_new[orig_id] = node_id_counter
                node_id_counter += 1
                nodes.append(node)
                continent_count += 1

    print(f"Read {airport_count} airports, {country_count} countries, {continent_count} continents.")

    print("Reading air-routes-latest-edges.csv...")
    route_count = 0
    contains_count = 0

    with open(edges_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = get_col(row, '~label')
            from_id = get_col(row, '~from')
            to_id = get_col(row, '~to')

            if not from_id or not to_id:
                continue
            if from_id not in original_to_new or to_id not in original_to_new:
                continue

            if label == 'route':
                try:
                    dist = int(row.get('dist:int', '0') or '0')
                except (ValueError, TypeError):
                    dist = 0

                edges.append({
                    "id": edge_id_counter,
                    "type": "route",
                    "startNode": original_to_new[from_id],
                    "endNode": original_to_new[to_id],
                    "properties": {
                        "dist": dist,
                    }
                })
                edge_id_counter += 1
                route_count += 1

            elif label == 'contains':
                edges.append({
                    "id": edge_id_counter,
                    "type": "contains",
                    "startNode": original_to_new[from_id],
                    "endNode": original_to_new[to_id],
                    "properties": {}
                })
                edge_id_counter += 1
                contains_count += 1

    result = {"nodes": nodes, "edges": edges}

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    print(f"\nWrote: {OUT_PATH}")
    print(f"  Nodes: {len(nodes)} ({airport_count} airports, {country_count} countries, {continent_count} continents)")
    print(f"  Edges: {len(edges)} ({route_count} routes, {contains_count} contains)")
    print(f"  Node ID range: {NODE_ID_BASE} to {node_id_counter - 1}")
    print(f"  Edge ID range: {EDGE_ID_BASE} to {edge_id_counter - 1}")


if __name__ == "__main__":
    main()
