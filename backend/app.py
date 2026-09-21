#!/usr/bin/env python3
"""
ThermoRail Track Intelligence API Endpoint Server (Task 5.1)
===========================================================

Provides high-performance RESTful API endpoints for rail track intelligence,
segment lookup, and real-time thermal risk evaluation.

Endpoint:
- GET /api/track/<segment_id>
"""

import json
import os
import sys
from flask import Flask, jsonify, request

# Add parent directory to path for backend module imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.risk_engine import evaluate_segment_risk

app = Flask(__name__)

# Candidate GeoJSON dataset paths
GEOJSON_PATHS = [
    os.path.join(os.path.dirname(__file__), "..", "public", "southwest_thermal_network.geojson"),
    os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "southwest_thermal_network.geojson"),
    os.path.join(os.path.dirname(__file__), "..", "public", "southwest_temperature_mapped.geojson"),
]

SEGMENT_INDEX = {}
TOTAL_SEGMENTS = 0


def load_segment_dataset():
    global SEGMENT_INDEX, TOTAL_SEGMENTS
    dataset_path = None
    for p in GEOJSON_PATHS:
        if os.path.exists(p):
            dataset_path = os.path.abspath(p)
            break

    if not dataset_path:
        print("[WARNING] Could not locate southwest_thermal_network.geojson")
        return

    print(f"[API SERVER] Loading segment dataset from {dataset_path}...")
    try:
        with open(dataset_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        features = data.get("features", [])
        index = {}
        for feat in features:
            props = feat.get("properties", {})
            seg_id = str(props.get("segment_id", "")).strip()
            if seg_id:
                index[seg_id.upper()] = {
                    "feature": feat,
                    "properties": props
                }

        SEGMENT_INDEX = index
        TOTAL_SEGMENTS = len(index)
        print(f"[API SERVER] Successfully indexed {TOTAL_SEGMENTS:,} segments.")
    except Exception as e:
        print(f"[ERROR] Failed to load segment dataset: {e}")


# Load dataset during module initialization
load_segment_dataset()


@app.route("/api/track/<segment_id>", methods=["GET"])
def get_track_segment_intelligence(segment_id: str):
    """
    Task 5.1 — GET /api/track/<segment_id>
    Looks up segment from thermal network dataset, retrieves/evaluates its full payload,
    and returns it instantly as a JSON response.
    """
    clean_id = segment_id.strip().upper()
    entry = SEGMENT_INDEX.get(clean_id)

    if not entry:
        return jsonify({
            "status": "error",
            "code": "SEGMENT_NOT_FOUND",
            "message": f"Track segment ID '{segment_id}' was not found in the thermal network dataset.",
            "available_segments_count": TOTAL_SEGMENTS
        }), 404

    props = entry["properties"]
    
    # Extract properties
    surface_temp = float(props.get("surface_temp_c", 45.0))
    rail_temp_estimate = float(props.get("rail_temp_estimate", props.get("rail_temp_estimate_c", surface_temp + float(props.get("solar_offset_c", 3.0)))))
    rnt_c = float(props.get("rnt_c", 38.0))
    delta_t = float(props.get("delta_t", round(rail_temp_estimate - rnt_c, 2)))
    vulnerability_multiplier = float(props.get("vulnerability_multiplier", 1.0))
    risk_score = int(props.get("risk_score", 0))
    risk_level = str(props.get("risk_level", "LOW")).upper()
    primary_factor = str(props.get("primary_factor", "normal"))
    explanation = str(props.get("explanation", ""))
    color = str(props.get("color", "#2E7D32"))
    orientation = str(props.get("orientation", "EAST_WEST"))
    maintenance_flag = bool(props.get("maintenance_flag", False))
    temp_trend = str(props.get("temp_trend", "stable"))
    is_shaded = bool(props.get("is_shaded", False))

    # Extract or compute 500m proximity zone intelligence
    proximity_zone_500m = props.get("proximity_zone_500m")
    if not proximity_zone_500m or not isinstance(proximity_zone_500m, dict):
        from backend.risk_engine import calculate_proximity_zone_500m
        segment_data = {
            "segment_id": props.get("segment_id", segment_id),
            "orientation": orientation,
            "vulnerability_multiplier": vulnerability_multiplier,
            "is_shaded": is_shaded
        }
        proximity_zone_500m = calculate_proximity_zone_500m(segment_data)

    payload = {
        "status": "success",
        "segment_id": props.get("segment_id", segment_id),
        "data": {
            "segment_id": props.get("segment_id", segment_id),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "primary_factor": primary_factor,
            "explanation": explanation,
            "surface_temp_c": surface_temp,
            "rail_temp_estimate": rail_temp_estimate,
            "rnt_c": rnt_c,
            "delta_t": delta_t,
            "vulnerability_multiplier": vulnerability_multiplier,
            "color": color,
            "proximity_zone_500m": proximity_zone_500m,
            "details": {
                "segment_id": props.get("segment_id", segment_id),
                "orientation": orientation,
                "surface_temp_c": surface_temp,
                "rail_temp_estimate_c": rail_temp_estimate,
                "rnt_c": rnt_c,
                "delta_t": delta_t,
                "solar_offset_c": float(props.get("solar_offset_c", round(rail_temp_estimate - surface_temp, 2))),
                "vulnerability_multiplier": vulnerability_multiplier,
                "maintenance_flag": maintenance_flag,
                "temp_trend": temp_trend,
                "is_shaded": is_shaded,
                "proximity_zone_500m": proximity_zone_500m,
                "color": color
            }
        }
    }

    return jsonify(payload), 200


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "ThermoRail Track Intelligence API",
        "indexed_segments": TOTAL_SEGMENTS
    }), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
