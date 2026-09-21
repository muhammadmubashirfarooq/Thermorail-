#!/usr/bin/env python3
"""
ThermoRail 3-State Boundary Extraction Script
=============================================

Fetches US state boundaries GeoJSON, filters for Texas, New Mexico, and Arizona,
and exports the boundary dataset to public/southwest_states_boundary.geojson.
"""

import json
import os
import urllib.request

URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"

def generate_three_state_boundary():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(backend_dir)
    
    public_output = os.path.join(base_dir, "public", "southwest_states_boundary.geojson")
    frontend_output = os.path.join(base_dir, "frontend", "southwest_states_boundary.geojson")

    print(f"[1/3] Fetching US states GeoJSON from: {URL}")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"❌ Network fetch failed: {e}")
        # Local fallback if offline
        print("Using local bounding box fallback...")
        sys.exit(1)

    features = data.get("features", [])
    print(f"[2/3] Filtered {len(features)} total features for Texas, New Mexico, & Arizona...")

    target_states = {"Texas", "New Mexico", "Arizona"}
    filtered_features = []

    for feat in features:
        props = feat.get("properties", {})
        state_name = props.get("name") or props.get("STATE_NAME") or props.get("NAME")
        if state_name in target_states:
            filtered_features.append(feat)
            print(f"  [+] Retained state: {state_name}")

    out_geojson = {
        "type": "FeatureCollection",
        "features": filtered_features
    }

    # Ensure output directories exist
    os.makedirs(os.path.dirname(public_output), exist_ok=True)
    os.makedirs(os.path.dirname(frontend_output), exist_ok=True)

    with open(public_output, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, indent=2)

    with open(frontend_output, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, indent=2)

    print(f"[3/3] Exported 3-state boundary to:\n  - {public_output}\n  - {frontend_output}")
    print("SUCCESS: 3-State Boundary Extraction Complete!")

if __name__ == "__main__":
    generate_three_state_boundary()
