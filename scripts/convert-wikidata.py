#!/usr/bin/env python3
"""Convert Nobel Prize laureates to OpenGraphDB JSON import format.

Node IDs: 3_000_000+
Edge IDs: 3_000_000+

Source: https://api.nobelprize.org/2.1/laureates
"""

import json
import os
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(ROOT_DIR, "data", "cache")
OUT_PATH = os.path.join(ROOT_DIR, "datasets", "wikidata.json")

NODE_ID_BASE = 3_000_000
EDGE_ID_BASE = 3_000_000

TOP_N_INSTITUTIONS = 50


def get_en(field, default=''):
    """Extract English value from multilingual dict or return string directly."""
    if field is None:
        return default
    if isinstance(field, dict):
        return field.get('en', default)
    if isinstance(field, str):
        return field
    return default


def main():
    laureates_path = os.path.join(CACHE_DIR, "nobel-laureates.json")

    if not os.path.exists(laureates_path):
        print(f"ERROR: {laureates_path} not found. Run: bash scripts/download-wikidata.sh")
        raise SystemExit(1)

    print("Reading Nobel Prize laureates JSON...")
    with open(laureates_path, encoding='utf-8') as f:
        data = json.load(f)

    laureates_raw = data.get('laureates', [])
    print(f"Found {len(laureates_raw)} laureates.")

    nodes = []
    edges = []
    node_id_counter = NODE_ID_BASE
    edge_id_counter = EDGE_ID_BASE

    # Nobel Prize categories (6 categories from the data)
    # category field is {"en": "Economic Sciences", ...}
    # We'll discover them from data and also define the 6 known ones
    known_categories = {
        'Chemistry': 'che',
        'Economic Sciences': 'eco',
        'Literature': 'lit',
        'Physiology or Medicine': 'med',
        'Peace': 'pea',
        'Physics': 'phy',
    }
    category_node_ids = {}  # category name -> node_id
    for cat_name, cat_short in known_categories.items():
        category_node_ids[cat_name] = node_id_counter
        nodes.append({
            "id": node_id_counter,
            "labels": ["Category"],
            "properties": {
                "code": cat_short,
                "name": cat_name,
                "_label": "Category",
                "_dataset": "wikidata",
            }
        })
        node_id_counter += 1

    # Collect affiliation counts for top-N institutions
    # affiliation.name is {"en": "Stanford University", ...}
    affiliation_counts = defaultdict(int)
    laureate_affiliations_list = []  # parallel list of affiliation name sets per laureate

    for laureate in laureates_raw:
        prizes = laureate.get('nobelPrizes', [])
        aff_names = set()
        for prize in prizes:
            for aff in prize.get('affiliations', []):
                name = get_en(aff.get('name'), '')
                if name:
                    affiliation_counts[name] += 1
                    aff_names.add(name)
        laureate_affiliations_list.append(aff_names)

    top_institutions = sorted(affiliation_counts.items(), key=lambda x: x[1], reverse=True)[:TOP_N_INSTITUTIONS]
    top_institution_names = {name for name, _ in top_institutions}

    institution_node_ids = {}  # name -> node_id
    for inst_name, count in top_institutions:
        institution_node_ids[inst_name] = node_id_counter
        nodes.append({
            "id": node_id_counter,
            "labels": ["Institution"],
            "properties": {
                "name": inst_name,
                "_label": "Institution",
                "_dataset": "wikidata",
            }
        })
        node_id_counter += 1

    print(f"Created {len(institution_node_ids)} institution nodes.")

    # Country nodes (deduplicated by name)
    country_node_ids = {}  # country_name -> node_id

    # Build laureate nodes and edges
    for i, laureate in enumerate(laureates_raw):
        # Name: fullName, knownName, orgName are all dicts with 'en' key
        full_name = get_en(laureate.get('fullName'), '')
        if not full_name:
            full_name = get_en(laureate.get('knownName'), '')
        if not full_name:
            full_name = get_en(laureate.get('orgName'), '')
        if not full_name:
            full_name = f"Laureate-{laureate.get('id', i)}"

        gender = laureate.get('gender', '')
        wikidata_id = ''
        wikidata_field = laureate.get('wikidata', {})
        if isinstance(wikidata_field, dict):
            wikidata_id = wikidata_field.get('id', '')

        # Birth year and country
        birth_year = None
        birth_country = ''
        birth_data = laureate.get('birth', {})
        if isinstance(birth_data, dict):
            # Year directly on birth object
            year_str = birth_data.get('year', '')
            if year_str:
                try:
                    birth_year = int(year_str[:4])
                except (ValueError, TypeError):
                    pass

            place = birth_data.get('place', {})
            if isinstance(place, dict):
                # countryNow is the current country (dict with 'en' key)
                country_now = place.get('countryNow', {})
                birth_country = get_en(country_now, '')
                if not birth_country:
                    # Fall back to country field
                    birth_country = get_en(place.get('country', {}), '')

        laureate_node_id = node_id_counter
        nodes.append({
            "id": node_id_counter,
            "labels": ["Laureate"],
            "properties": {
                "name": full_name,
                "gender": gender,
                "birthYear": birth_year,
                "birthCountry": birth_country,
                "wikidataId": wikidata_id,
                "_label": "Laureate",
                "_dataset": "wikidata",
            }
        })
        node_id_counter += 1

        # BORN_IN edge to Country
        if birth_country:
            if birth_country not in country_node_ids:
                country_node_ids[birth_country] = node_id_counter
                nodes.append({
                    "id": node_id_counter,
                    "labels": ["Country"],
                    "properties": {
                        "name": birth_country,
                        "_label": "Country",
                        "_dataset": "wikidata",
                    }
                })
                node_id_counter += 1

            edges.append({
                "id": edge_id_counter,
                "type": "BORN_IN",
                "startNode": laureate_node_id,
                "endNode": country_node_ids[birth_country],
                "properties": {}
            })
            edge_id_counter += 1

        # WON_PRIZE_IN edges
        prizes = laureate.get('nobelPrizes', [])
        for prize in prizes:
            # category is {"en": "Economic Sciences", ...}
            cat_name = get_en(prize.get('category'), '')

            prize_year_str = prize.get('awardYear', '')
            try:
                prize_year = int(prize_year_str)
            except (ValueError, TypeError):
                prize_year = None

            if cat_name and cat_name in category_node_ids:
                edges.append({
                    "id": edge_id_counter,
                    "type": "WON_PRIZE_IN",
                    "startNode": laureate_node_id,
                    "endNode": category_node_ids[cat_name],
                    "properties": {
                        "year": prize_year,
                    }
                })
                edge_id_counter += 1

        # AFFILIATED_WITH edges (for top institutions)
        for aff_name in laureate_affiliations_list[i]:
            if aff_name in top_institution_names:
                edges.append({
                    "id": edge_id_counter,
                    "type": "AFFILIATED_WITH",
                    "startNode": laureate_node_id,
                    "endNode": institution_node_ids[aff_name],
                    "properties": {}
                })
                edge_id_counter += 1

    result = {"nodes": nodes, "edges": edges}

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    laureate_count = len(laureates_raw)
    country_count = len(country_node_ids)
    institution_count = len(institution_node_ids)
    category_count = len(category_node_ids)

    print(f"\nWrote: {OUT_PATH}")
    print(f"  Nodes: {len(nodes)} ({laureate_count} laureates, {category_count} categories, {country_count} countries, {institution_count} institutions)")
    print(f"  Edges: {len(edges)}")
    print(f"  Node ID range: {NODE_ID_BASE} to {node_id_counter - 1}")
    print(f"  Edge ID range: {EDGE_ID_BASE} to {edge_id_counter - 1}")


if __name__ == "__main__":
    main()
