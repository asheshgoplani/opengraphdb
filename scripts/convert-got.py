#!/usr/bin/env python3
"""Convert Game of Thrones dataset to OpenGraphDB JSON import format.

Node IDs: 2_000_000+
Edge IDs: 2_000_000+

Source: https://github.com/mathbeveridge/gameofthrones
"""

import csv
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(ROOT_DIR, "data", "cache")
OUT_PATH = os.path.join(ROOT_DIR, "datasets", "got.json")

NODE_ID_BASE = 2_000_000
EDGE_ID_BASE = 2_000_000


def main():
    nodes = []
    edges = []
    node_id_counter = NODE_ID_BASE
    edge_id_counter = EDGE_ID_BASE

    # Deduplicate characters: character_id (from Id column) -> node_id
    character_to_node = {}   # character_id_str -> node_id
    character_to_name = {}   # character_id_str -> name

    # Track which seasons each character appears in
    character_seasons = {}   # character_id_str -> set of season numbers

    # Collect all interaction edges per season
    interaction_edges_raw = []  # list of (from_char_id, to_char_id, weight, season)

    print("Reading Game of Thrones season files...")

    for season in range(1, 9):
        nodes_file = os.path.join(CACHE_DIR, f"got-s{season}-nodes.csv")
        edges_file = os.path.join(CACHE_DIR, f"got-s{season}-edges.csv")

        if not os.path.exists(nodes_file):
            print(f"  WARNING: {nodes_file} not found, skipping season {season}")
            continue
        if not os.path.exists(edges_file):
            print(f"  WARNING: {edges_file} not found, skipping season {season}")
            continue

        season_char_count = 0
        with open(nodes_file, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                char_id = row.get('Id', '').strip()
                char_name = row.get('Label', row.get('label', char_id)).strip()

                if not char_id:
                    continue

                if char_id not in character_to_node:
                    character_to_node[char_id] = node_id_counter
                    character_to_name[char_id] = char_name
                    node_id_counter += 1
                    character_seasons[char_id] = set()

                character_seasons[char_id].add(season)
                season_char_count += 1

        edge_count = 0
        with open(edges_file, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                from_id = row.get('Source', '').strip()
                to_id = row.get('Target', '').strip()
                weight_str = row.get('Weight', row.get('weight', '1')).strip()

                if not from_id or not to_id:
                    continue

                try:
                    weight = int(float(weight_str))
                except (ValueError, TypeError):
                    weight = 1

                interaction_edges_raw.append((from_id, to_id, weight, season))
                edge_count += 1

        print(f"  Season {season}: {season_char_count} characters, {edge_count} interactions")

    total_characters = len(character_to_node)
    print(f"\nTotal unique characters: {total_characters}")

    # Build character nodes
    for char_id, node_id in character_to_node.items():
        nodes.append({
            "id": node_id,
            "labels": ["Character"],
            "properties": {
                "name": character_to_name[char_id],
                "characterId": char_id,
                "_label": "Character",
                "_dataset": "got",
            }
        })

    # Build season nodes
    season_node_ids = {}
    for season in range(1, 9):
        season_node_ids[season] = node_id_counter
        nodes.append({
            "id": node_id_counter,
            "labels": ["Season"],
            "properties": {
                "number": season,
                "name": f"Season {season}",
                "_label": "Season",
                "_dataset": "got",
            }
        })
        node_id_counter += 1

    # Build APPEARS_IN edges (character -> season)
    for char_id, seasons in character_seasons.items():
        char_node_id = character_to_node[char_id]
        for season in sorted(seasons):
            edges.append({
                "id": edge_id_counter,
                "type": "APPEARS_IN",
                "startNode": char_node_id,
                "endNode": season_node_ids[season],
                "properties": {
                    "season": season,
                }
            })
            edge_id_counter += 1

    # Build INTERACTS edges
    for from_id, to_id, weight, season in interaction_edges_raw:
        if from_id not in character_to_node or to_id not in character_to_node:
            continue
        edges.append({
            "id": edge_id_counter,
            "type": "INTERACTS",
            "startNode": character_to_node[from_id],
            "endNode": character_to_node[to_id],
            "properties": {
                "weight": weight,
                "season": season,
            }
        })
        edge_id_counter += 1

    result = {"nodes": nodes, "edges": edges}

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    appears_in_count = sum(len(s) for s in character_seasons.values())
    interacts_count = len(interaction_edges_raw)

    print(f"\nWrote: {OUT_PATH}")
    print(f"  Nodes: {len(nodes)} ({total_characters} characters, 8 seasons)")
    print(f"  Edges: {len(edges)} ({appears_in_count} APPEARS_IN, {interacts_count} INTERACTS)")
    print(f"  Node ID range: {NODE_ID_BASE} to {node_id_counter - 1}")
    print(f"  Edge ID range: {EDGE_ID_BASE} to {edge_id_counter - 1}")


if __name__ == "__main__":
    main()
