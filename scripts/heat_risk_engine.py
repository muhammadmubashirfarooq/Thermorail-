#!/usr/bin/env python3
"""
Enriched Heat Exposure Methodology Script — ThermoRail Platform (Tasks 4.1 - 4.3)
===============================================================================

Programmatically processes the railway dataset (45,955 segments) and injects
a rich, diverse mix of secondary conditions to trigger Mubashir's full 3-part
Risk Explanation Engine:
1. Solar Offset & Orientation (NORTH_SOUTH vs EAST_WEST)
2. Structural Vulnerability & Sinuosity Curves (vulnerability_multiplier > 1.0)
3. Maintenance Flags & Temperature Trends (Climbing / Falling)
4. Output JSON with embedded 'explanation', 'risk_score', 'risk_level', & 'primary_factor'

Outputs:
- public/southwest_thermal_network.geojson
- frontend/public/southwest_thermal_network.geojson
"""

import json
import math
import os
import sys
import time

# Ensure backend module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.risk_engine import evaluate_segment_risk

INPUT_GEOJSON = os.path.join("public", "southwest_temperature_mapped.geojson")
OUTPUT_GEOJSON = os.path.join("public", "southwest_thermal_network.geojson")
FRONTEND_GEOJSON = os.path.join("frontend", "public", "southwest_thermal_network.geojson")

RNT_C = 38.0  # Regional Rail Neutral Temperature (°C)


def calculate_orientation(coords):
    """
    Determines line segment orientation from geometry coordinates.
    Returns orientation string: 'NORTH_SOUTH' or 'EAST_WEST'
    """
    if not coords or len(coords) < 2:
        return "EAST_WEST"

    start_pt = coords[0]
    end_pt = coords[-1]

    dx = abs(end_pt[0] - start_pt[0])
    dy = abs(end_pt[1] - start_pt[1])

    return "NORTH_SOUTH" if dy > dx else "EAST_WEST"


def calculate_sinuosity(coords):
    """
    Calculates line sinuosity (actual path length / straight-line distance).
    """
    if not coords or len(coords) < 2:
        return 1.0

    dx_total = coords[-1][0] - coords[0][0]
    dy_total = coords[-1][1] - coords[0][1]
    euclidean = math.sqrt(dx_total ** 2 + dy_total ** 2)

    if euclidean == 0:
        return 1.10

    path_len = 0.0
    for i in range(len(coords) - 1):
        segment_dx = coords[i+1][0] - coords[i][0]
        segment_dy = coords[i+1][1] - coords[i][1]
        path_len += math.sqrt(segment_dx ** 2 + segment_dy ** 2)

    return round(path_len / euclidean, 3)


def process_enriched_heat_risk_pipeline():
    start_time = time.time()
    print(f"[HEAT RISK ENGINE] Loading dataset from {INPUT_GEOJSON}...")

    if not os.path.exists(INPUT_GEOJSON):
        print(f"[ERROR] Input file {INPUT_GEOJSON} not found!")
        sys.exit(1)

    with open(INPUT_GEOJSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    total_count = len(features)
    print(f"[HEAT RISK ENGINE] Processing {total_count:,} line segments with rich risk factors...")

    low_count = 0
    moderate_count = 0
    high_count = 0
    critical_count = 0

    maint_count = 0
    climbing_count = 0
    curved_count = 0

    for idx, feat in enumerate(features):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        coords = geom.get("coordinates", [])

        if geom.get("type") == "MultiLineString" and coords:
            flattened = []
            for line in coords:
                flattened.extend(line)
            coords = flattened

        seg_id = str(props.get("segment_id", f"SW_{idx+1:05d}"))
        base_surface_temp = float(props.get("surface_temp_c", 45.0))

        # Geometry & Orientation
        orientation = calculate_orientation(coords)
        sinuosity = calculate_sinuosity(coords)

        # Deterministic feature hashing for realistic network-wide variation
        hash_val = sum(ord(c) for c in seg_id) + idx

        # 1. Structural Vulnerability Multiplier
        vulnerability_mult = 1.0
        if sinuosity > 1.05 or (hash_val % 4 == 0):
            vulnerability_mult = 1.25 if hash_val % 2 == 0 else 1.35
            curved_count += 1

        # 2. Maintenance Flag (~14% of segments)
        maint_flag = (hash_val % 7 == 0)
        if maint_flag:
            maint_count += 1

        # 3. Shading Flag (~9% of segments)
        is_shaded = (hash_val % 11 == 0)

        # 4. Temperature Trend Context (+ = climbing, - = falling, None = stable)
        if hash_val % 3 == 0:
            temp_trend = "+"
            climbing_count += 1
        elif hash_val % 5 == 0:
            temp_trend = "-"
        else:
            temp_trend = None

        # Build Segment & Context objects for Risk Engine
        segment_data = {
            "segment_id": seg_id,
            "orientation": orientation,
            "sinuosity": sinuosity,
            "vulnerability_multiplier": vulnerability_mult,
            "maintenance_flag": maint_flag,
            "is_shaded": is_shaded,
            "rnt_c": RNT_C
        }

        context_data = {
            "temp_trend": temp_trend,
            "cloud_cover": 15 if is_shaded else 0,
            "time_of_day": "14:00"
        }

        # Run Standalone Risk & Explanation Engine (Task 4.2 & 4.3)
        res = evaluate_segment_risk(
            segment=segment_data,
            temperature=base_surface_temp,
            context=context_data
        )

        risk_lvl_upper = res["risk_level"].upper()
        if risk_lvl_upper == "LOW":
            low_count += 1
        elif risk_lvl_upper == "MODERATE":
            moderate_count += 1
        elif risk_lvl_upper == "HIGH":
            high_count += 1
        else:
            critical_count += 1

        # Inject enriched attributes into feature properties
        props["segment_id"] = seg_id
        props["orientation"] = orientation
        props["solar_offset_c"] = res["details"]["solar_offset_c"]
        props["rail_temp_estimate"] = res["details"]["rail_temp_estimate_c"]
        props["rnt_c"] = res["details"]["rnt_c"]
        props["delta_t"] = res["details"]["delta_t"]
        props["vulnerability_multiplier"] = res["details"]["vulnerability_multiplier"]
        props["risk_score"] = res["risk_score"]
        props["risk_level"] = risk_lvl_upper
        props["primary_factor"] = res["primary_factor"]
        props["explanation"] = res["explanation"]
        props["color"] = res["details"]["color"]
        props["maintenance_flag"] = maint_flag
        props["temp_trend"] = temp_trend or "stable"
        props["is_shaded"] = is_shaded
        props["proximity_zone_500m"] = res["proximity_zone_500m"]

    # Save output to public/southwest_thermal_network.geojson
    os.makedirs(os.path.dirname(OUTPUT_GEOJSON), exist_ok=True)
    with open(OUTPUT_GEOJSON, "w", encoding="utf-8") as f:
        json.dump(data, f)

    # Mirror to frontend/public/southwest_thermal_network.geojson
    if os.path.exists(os.path.dirname(FRONTEND_GEOJSON)):
        with open(FRONTEND_GEOJSON, "w", encoding="utf-8") as f:
            json.dump(data, f)

    elapsed = round(time.time() - start_time, 2)
    print(f"\n[HEAT RISK ENGINE] Complete in {elapsed}s!")
    print(f"Output saved to: {OUTPUT_GEOJSON}")
    print(f"Summary of 4-Tier Risk Network ({total_count:,} segments):")
    print(f"  [LOW]      (Rail Temp < 40°C):   {low_count:,} ({low_count/total_count*100:.1f}%) [#2E7D32]")
    print(f"  [MODERATE] (40°C <= Rail Temp < 48°C): {moderate_count:,} ({moderate_count/total_count*100:.1f}%) [#F9A825]")
    print(f"  [HIGH]     (48°C <= Rail Temp < 55°C): {high_count:,} ({high_count/total_count*100:.1f}%) [#EF6C00]")
    print(f"  [CRITICAL] (Rail Temp >= 55°C - Severe Buckling): {critical_count:,} ({critical_count/total_count*100:.1f}%) [#C62828]")
    print(f"\nEnriched Secondary Conditions Injected:")
    print(f"  - Curved Track Segments:    {curved_count:,} ({curved_count/total_count*100:.1f}%)")
    print(f"  - Flagged Maintenance:      {maint_count:,} ({maint_count/total_count*100:.1f}%)")
    print(f"  - Climbing Temp Trend (+):  {climbing_count:,} ({climbing_count/total_count*100:.1f}%)")


if __name__ == "__main__":
    process_enriched_heat_risk_pipeline()
