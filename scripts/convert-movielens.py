#!/usr/bin/env python3
"""Convert MovieLens ml-25m dataset to OpenGraphDB JSON import format.

Node IDs: 0-99999
Edge IDs: 0-99999
"""

import csv
import json
import os
import re
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(ROOT_DIR, "data", "cache", "ml-25m")
OUT_PATH = os.path.join(ROOT_DIR, "datasets", "movielens.json")

# ID range: 0–99999 for nodes, 0–99999 for edges
NODE_ID_BASE = 0
EDGE_ID_BASE = 0

TOP_N_MOVIES = 8000


def parse_year(title):
    """Extract year from 'Movie Title (YYYY)' format."""
    m = re.search(r'\((\d{4})\)\s*$', title)
    if m:
        return int(m.group(1))
    return None


def clean_title(title):
    """Remove year suffix from title."""
    return re.sub(r'\s*\(\d{4}\)\s*$', '', title).strip()


def main():
    movies_path = os.path.join(CACHE_DIR, "movies.csv")
    ratings_path = os.path.join(CACHE_DIR, "ratings.csv")

    if not os.path.exists(movies_path):
        print(f"ERROR: {movies_path} not found. Run: bash scripts/download-movielens.sh")
        raise SystemExit(1)
    if not os.path.exists(ratings_path):
        print(f"ERROR: {ratings_path} not found. Run: bash scripts/download-movielens.sh")
        raise SystemExit(1)

    print("Reading ratings.csv (this may take a moment)...")
    rating_sum = defaultdict(float)
    rating_count = defaultdict(int)

    with open(ratings_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            movie_id = int(row['movieId'])
            rating_sum[movie_id] += float(row['rating'])
            rating_count[movie_id] += 1

    print(f"Read ratings for {len(rating_count)} movies.")

    print("Reading movies.csv...")
    all_movies = {}
    with open(movies_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            movie_id = int(row['movieId'])
            all_movies[movie_id] = {
                'title': row['title'],
                'genres': row['genres'],
            }

    # Select top N movies by rating count
    top_movie_ids = sorted(
        [mid for mid in all_movies if mid in rating_count],
        key=lambda mid: rating_count[mid],
        reverse=True
    )[:TOP_N_MOVIES]

    print(f"Selected top {len(top_movie_ids)} movies by rating count.")

    nodes = []
    edges = []

    node_id_counter = NODE_ID_BASE
    edge_id_counter = EDGE_ID_BASE

    # Track genre -> node_id mapping
    genre_node_ids = {}

    # Build movie nodes
    movie_node_ids = {}
    for movie_id in top_movie_ids:
        info = all_movies[movie_id]
        raw_genres = info['genres']
        genres_list = raw_genres.split('|') if raw_genres and raw_genres != '(no genres listed)' else []
        first_genre = genres_list[0] if genres_list else 'Unknown'

        count = rating_count[movie_id]
        avg = rating_sum[movie_id] / count if count > 0 else 0.0

        node = {
            "id": node_id_counter,
            "labels": ["Movie"],
            "properties": {
                "title": clean_title(info['title']),
                "released": parse_year(info['title']),
                "genres": first_genre,
                "avgRating": round(avg, 2),
                "ratingCount": count,
                "_label": "Movie",
                "_dataset": "movielens",
            }
        }
        movie_node_ids[movie_id] = node_id_counter
        node_id_counter += 1
        nodes.append(node)

        # Register genres
        for genre in genres_list:
            if genre not in genre_node_ids:
                genre_node_ids[genre] = None  # Will assign ID later

    # Build genre nodes
    for genre in sorted(genre_node_ids.keys()):
        genre_node_ids[genre] = node_id_counter
        nodes.append({
            "id": node_id_counter,
            "labels": ["Genre"],
            "properties": {
                "name": genre,
                "_label": "Genre",
                "_dataset": "movielens",
            }
        })
        node_id_counter += 1

    # Build IN_GENRE edges
    for movie_id in top_movie_ids:
        info = all_movies[movie_id]
        raw_genres = info['genres']
        genres_list = raw_genres.split('|') if raw_genres and raw_genres != '(no genres listed)' else []

        for genre in genres_list:
            if genre in genre_node_ids and genre_node_ids[genre] is not None:
                edges.append({
                    "id": edge_id_counter,
                    "type": "IN_GENRE",
                    "startNode": movie_node_ids[movie_id],
                    "endNode": genre_node_ids[genre],
                    "properties": {}
                })
                edge_id_counter += 1

    result = {"nodes": nodes, "edges": edges}

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    print(f"\nWrote: {OUT_PATH}")
    print(f"  Nodes: {len(nodes)} ({len(movie_node_ids)} movies, {len(genre_node_ids)} genres)")
    print(f"  Edges: {len(edges)} (IN_GENRE)")
    print(f"  Node ID range: {NODE_ID_BASE} to {node_id_counter - 1}")
    print(f"  Edge ID range: {EDGE_ID_BASE} to {edge_id_counter - 1}")


if __name__ == "__main__":
    main()
